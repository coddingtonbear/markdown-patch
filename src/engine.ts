/**
 * The 2.0 patch engine: `patch(document, instruction)` builds the model,
 * validates the requested cell of the algebra, checks the `ifMatch`
 * precondition, resolves the target node, and dispatches to the handler for the
 * requested operation×scope.  Every mutation is expressed as a set of
 * non-overlapping byte-range edits and applied in one splice, so regions
 * outside the edit are byte-preserved.
 *
 * This module covers the plain-string *write* cells (`replace`/`prepend`/
 * `append`) for heading and block targets.  Structural cells (move, dissolve,
 * delete), frontmatter cells, and target creation are layered on in sibling
 * modules and later increments; until then those cells raise a clear error.
 */

import { buildModel, DocumentModel, SectionNode, BlockNode, BodyChild } from "./model.js";
import { resolveTarget } from "./resolve.js";
import { Edit } from "./splice.js";
import {
  headingMarkerRange,
  headingContentRange,
  subtreeContentRange,
  subtreeEnd,
  blockFullRange,
} from "./ranges.js";
import { toLineEnding, sectionFragment, ownedGaps, lineStartGap, splice } from "./text.js";
import { rebaseHeadings } from "./levels.js";
import { structuralHeading, deleteBlock, consumeTrailingBlank } from "./engine/structural.js";
import { patchFrontmatter } from "./engine/frontmatter.js";
import { createHeading, createBlock } from "./engine/create.js";
import { patchTableRows } from "./engine/table.js";
import {
  Instruction,
  InstructionInput,
  HeadingInstruction,
  HeadingWithinInstruction,
  BlockInstruction,
  PatchResult,
  EngineError,
  PreconditionFailedError,
  TargetNotFoundError,
  ContentPreexistsError,
  InvalidInstructionError,
  assertValidCell,
  withDefaultScope,
  isBlockTableRowInstruction,
  isWithinInstruction,
} from "./instructions.js";
import { InstructionInputSchema } from "./schema.js";
import { ResolvedTarget } from "./resolve.js";

/** The subset of an instruction {@link assertValidCell} inspects. */
const cellOf = (instruction: Instruction) => ({
  targetType: instruction.targetType,
  operation: instruction.operation,
  scope: instruction.scope,
});

/** The parent's source heading level, or 0 when the parent is the root. */
const parentLevel = (section: SectionNode): number =>
  section.parent?.heading?.level ?? 0;

/**
 * The current text of the span a write targets, for the `rejectIfContentPreexists`
 * idempotency guard.  Returns `null` when the notion does not apply (frontmatter,
 * or a heading marker on the markerless root).
 */
const scopeSpanText = (
  document: string,
  resolved: ResolvedTarget,
  scope: string
): string | null => {
  if (resolved.kind === "heading") {
    const section = resolved.section;
    const range =
      scope === "content"
        ? headingContentRange(section)
        : scope === "marker"
          ? section.marker
          : subtreeContentRange(section);
    return range ? document.slice(range.start, range.end) : null;
  }
  if (resolved.kind === "block") {
    const block = resolved.block;
    const range =
      scope === "content"
        ? block.content
        : scope === "marker"
          ? block.marker
          : blockFullRange(block);
    return document.slice(range.start, range.end);
  }
  if (resolved.kind === "headingChild") {
    // `content`: the addressed block itself.  `markerAndContent` (sibling
    // insert): the whole section body, so a retried insert is still refused
    // even though the new block lands outside the addressed child.
    const range =
      scope === "content"
        ? resolved.child.range
        : headingContentRange(resolved.section);
    return document.slice(range.start, range.end);
  }
  return null;
};

/**
 * The text to search for within {@link scopeSpanText} when checking
 * `rejectIfContentPreexists`.  The span is always absolute-level document
 * text, but a heading write's `content` carries levels *relative* to the
 * edited span (see `levels.ts`) — so a naive substring check against the raw
 * caller value never matches content containing `#` headings, silently
 * defeating the idempotency guard. Rebasing the value the same way the write
 * path would (before splicing it in) keeps the comparison apples-to-apples.
 * `marker` scope and non-heading targets carry no heading semantics, so the
 * value is compared as-is.
 */
const preexistsProbe = (
  content: string,
  resolved: ResolvedTarget,
  scope: string
): string => {
  if (resolved.kind === "headingChild") {
    // A content-scope within write is a literal splice (never rebased); a
    // markerAndContent sibling insert splices a fragment rebased to the
    // section's level, so compare what the write path would produce.
    return scope === "markerAndContent"
      ? rebaseHeadings(content, resolved.section.heading?.level ?? 0).text
      : content;
  }
  if (resolved.kind !== "heading") {
    return content;
  }
  if (scope === "content") {
    return rebaseHeadings(content, resolved.section.heading?.level ?? 0).text;
  }
  if (scope === "markerAndContent") {
    return rebaseHeadings(content, parentLevel(resolved.section)).text;
  }
  return content;
};

// --- Heading handlers ----------------------------------------------------

const patchHeading = (
  document: string,
  model: DocumentModel,
  // `within` instructions resolve to a headingChild and dispatch to
  // patchHeadingChild instead; excluding them here keeps the write-narrowing
  // below (to HeadingWriteInstruction) sound.
  instruction: Exclude<HeadingInstruction, HeadingWithinInstruction>,
  section: SectionNode
): PatchResult => {
  if (instruction.operation === "delete" || instruction.scope === "parent") {
    return structuralHeading(document, model, instruction, section);
  }
  // Excluding delete and parent narrows to HeadingWriteInstruction.
  const { operation, scope, content: value } = instruction;

  if (scope === "content") {
    const fragment = sectionFragment(value, section.heading?.level ?? 0, model.lineEnding);
    const content = headingContentRange(section);
    const empty = content.start === content.end;
    // The blank-line run between the marker and the first body text is a
    // library-owned separator: replace swaps the value and leaves it standing,
    // prepend inserts below it.  (An empty replacement is a body delete and
    // clears the full span, separator included.)
    const bodyStart = fragment.text
      ? bodyStartPast(document, content)
      : content.start;
    switch (operation) {
      case "replace":
        return splice(
          document,
          [{ range: { start: bodyStart, end: content.end }, text: fragment.text }],
          fragment.warnings
        );
      case "prepend":
        // The inserted block faces body text below: the library owes the
        // blank line that keeps it a separate block.
        return splice(
          document,
          [
            blockEdit(document, model, { start: bodyStart, end: bodyStart }, fragment.text, {
              padBefore: false,
              padAfter: !empty,
            }),
          ],
          fragment.warnings
        );
      case "append":
        // Mirror image: the joint above faces the body's last line.  Below is
        // the owned trailing gap (or the next marker/EOF), never body text.
        return splice(
          document,
          [
            blockEdit(document, model, { start: content.end, end: content.end }, fragment.text, {
              padBefore: !empty,
              padAfter: false,
            }),
          ],
          fragment.warnings
        );
    }
  }

  if (scope === "marker") {
    return splice(document, [markerRenameEdit(document, model, section, operation, value)], []);
  }

  // markerAndContent: the whole subtree, rebased to the parent's level.  The
  // joint below a subtree edit is always a heading marker, a gap, or EOF —
  // self-delimiting, so no separator is owed there.  Above, a separator is
  // owed only when the fragment itself does not open with a heading line
  // (a heading interrupts a paragraph; plain text does not).
  const fragment = sectionFragment(value, parentLevel(section), model.lineEnding);
  const padBefore = !/^#{1,6} /.test(fragment.text);
  if (operation === "replace") {
    return splice(
      document,
      [
        blockEdit(document, model, subtreeContentRange(section), fragment.text, {
          padBefore,
          padAfter: false,
        }),
      ],
      fragment.warnings
    );
  }
  if (!section.heading) {
    throw new EngineError(
      "cannot insert a sibling of the document root"
    );
  }
  // Sibling insert: before the subtree (prepend) or after it, past its gap
  // (append), so the target keeps its separator from what already surrounds it.
  const at =
    operation === "prepend"
      ? subtreeContentRange(section).start
      : subtreeEnd(section);
  return splice(
    document,
    [
      blockEdit(document, model, { start: at, end: at }, fragment.text, {
        padBefore,
        padAfter: false,
      }),
    ],
    fragment.warnings
  );
};

/** The offset of the first body text in `content`, past any leading blank run. */
const bodyStartPast = (
  document: string,
  content: { start: number; end: number }
): number => {
  const leading = /^(?:[^\S\r\n]*(?:\r\n|\r|\n))+/.exec(
    document.slice(content.start, content.end)
  );
  return content.start + (leading ? leading[0].length : 0);
};

/**
 * Build the edit for a `content`-scope write on a block's literal text span.
 * Block content is spliced exactly as given — the caller owns the joint — since
 * this is the documented contract for inline edits within a `^id` block.
 */
const contentEdit = (
  content: { start: number; end: number },
  operation: "replace" | "prepend" | "append",
  text: string
): Edit => {
  switch (operation) {
    case "replace":
      return { range: content, text };
    case "prepend":
      return { range: { start: content.start, end: content.start }, text };
    case "append":
      return { range: { start: content.end, end: content.end }, text };
  }
};

/**
 * Build the edit splicing a canonical fragment over `range`, adding the
 * blank-line separators the library owes on the sides where the caller says a
 * separator is due (`padBefore`/`padAfter`).  On a due side, `ownedGaps`
 * contributes only what is missing: an existing blank line or a document edge
 * needs nothing.  A side owing no blank line still owes a *line start* — a
 * flush joint against a terminator-less last line gets the single ending that
 * keeps the fragment off that line.  An empty fragment clears the range
 * without separators (empty replacement is deletion; an empty insert is a
 * no-op).
 */
const blockEdit = (
  document: string,
  model: DocumentModel,
  range: { start: number; end: number },
  text: string,
  pads: { padBefore: boolean; padAfter: boolean }
): Edit => {
  if (!text) {
    return { range, text };
  }
  const gaps = ownedGaps(document, range, model.lineEnding);
  const before = pads.padBefore
    ? gaps.before
    : lineStartGap(document, range.start, model.lineEnding);
  return {
    range,
    text: before + text + (pads.padAfter ? gaps.after : ""),
  };
};

/** Rebuild a heading line with renamed/prefixed/suffixed label text. */
const markerRenameEdit = (
  document: string,
  model: DocumentModel,
  section: SectionNode,
  operation: "replace" | "prepend" | "append",
  value: string
): Edit => {
  const range = headingMarkerRange(section); // throws for the root
  const markerText = document.slice(range.start, range.end);
  const hasEol = /(?:\r\n|\r|\n)$/.test(markerText);
  const eol = hasEol ? model.lineEnding : "";
  const oldText = section.heading?.text ?? "";
  const newText =
    operation === "replace"
      ? value
      : operation === "prepend"
        ? value + oldText
        : oldText + value;
  const level = section.heading?.level ?? 1;
  return { range, text: "#".repeat(level) + " " + newText + eol };
};

// --- Heading body-block (within) handlers --------------------------------

/**
 * Apply a `within`-refined heading instruction to one top-level block of the
 * section's direct body.  `content`-scope writes are literal splices — the
 * caller owns the joint, exactly the `^id` block contract, which is what lets
 * an `append` *continue* an existing paragraph or list — and `content`-scope
 * delete removes the block plus its separator.  `markerAndContent`
 * `prepend`/`append` insert a *new* block beside the addressed one, with the
 * library-owned separators every new-block insertion gets.
 */
const patchHeadingChild = (
  document: string,
  model: DocumentModel,
  instruction: HeadingWithinInstruction,
  section: SectionNode,
  child: BodyChild,
  index: number
): PatchResult => {
  if (instruction.scope === "markerAndContent") {
    // Sibling insert.  Levels in the fragment are relative to the section,
    // the same baseline as a content-scope write into the same body.
    const fragment = sectionFragment(
      instruction.content,
      section.heading?.level ?? 0,
      model.lineEnding
    );
    // "append after child k" ≡ "insert before child k+1" (or at the body end
    // for the last child): anchoring on the next sibling keeps the insert
    // *past* any isolated `^id` marker line annotating the addressed child,
    // so the marker stays bound to its block.
    const siblings = section.bodyChildren;
    const at =
      instruction.operation === "prepend"
        ? child.range.start
        : index + 1 < siblings.length
          ? siblings[index + 1].range.start
          : section.body.end;
    return splice(
      document,
      [
        blockEdit(document, model, { start: at, end: at }, fragment.text, {
          // The heading line above the body start, and the owned trailing
          // gap / next marker / EOF below the body end, are self-delimiting.
          padBefore: at !== section.body.start,
          padAfter: at !== section.body.end,
        }),
      ],
      fragment.warnings
    );
  }
  if (instruction.operation === "delete") {
    const end = consumeTrailingBlank(document, child.range.end);
    return splice(
      document,
      [{ range: { start: child.range.start, end }, text: "" }],
      []
    );
  }
  // Literal splice on the block's own span; only line endings are normalized.
  const value = toLineEnding(instruction.content, model.lineEnding);
  return splice(document, [contentEdit(child.range, instruction.operation, value)], []);
};

// --- Block handlers ------------------------------------------------------

const patchBlock = (
  document: string,
  model: DocumentModel,
  instruction: BlockInstruction,
  block: BlockNode
): PatchResult => {
  if (instruction.operation === "delete") {
    return deleteBlock(document, model, instruction, block);
  }
  if (isBlockTableRowInstruction(instruction)) {
    return patchTableRows(document, model, instruction, block);
  }
  // Excluding delete and table rows narrows to BlockWrite | BlockMarkerReplace;
  // both carry a string `content`.  Block content and ids are literal, never
  // rebased.
  const { operation, scope } = instruction;
  const value = toLineEnding(instruction.content, model.lineEnding);

  if (scope === "content") {
    return splice(document, [contentEdit(block.content, operation, value)], []);
  }

  if (scope === "marker") {
    // replace only (guaranteed by the cell matrix): swap the id, keeping any
    // surrounding whitespace and the `^` sigil.
    const markerText = document.slice(block.marker.start, block.marker.end);
    const text = markerText.replace(/\^[A-Za-z0-9_-]+/, "^" + instruction.content);
    return splice(document, [{ range: block.marker, text }], []);
  }

  // markerAndContent: the whole block.
  const full = blockFullRange(block);
  if (operation === "replace") {
    return splice(document, [{ range: full, text: value }], []);
  }
  // Sibling block insert, separated by a blank line (markdown block boundary).
  const separator = model.lineEnding + model.lineEnding;
  if (operation === "prepend") {
    return splice(
      document,
      [{ range: { start: full.start, end: full.start }, text: value + separator }],
      []
    );
  }
  return splice(
    document,
    [{ range: { start: full.end, end: full.end }, text: separator + value }],
    []
  );
};

// --- Entry point ---------------------------------------------------------

/**
 * Apply a single instruction to `document`, returning the new document and any
 * warnings.  Accepts an {@link InstructionInput}: an omitted `scope` defaults to
 * `content` before anything inspects the instruction.  Throws
 * {@link PreconditionFailedError} on an `ifMatch` mismatch,
 * {@link TargetNotFoundError} when the target does not resolve, and
 * {@link InvalidCellError} for a combination outside the algebra.
 */
export const patch = (
  document: string,
  input: InstructionInput
): PatchResult => {
  // Validate the whole instruction at the boundary: field shapes, the target
  // shape for its type, cell validity, and the carrier the cell expects. A
  // failure here means the caller sent a malformed instruction, so surface it
  // as one typed error rather than letting a handler misread an absent field.
  const parsed = InstructionInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new InvalidInstructionError(
      parsed.error.issues
        .map((issue) =>
          issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message
        )
        .join("; ")
    );
  }

  const instruction = withDefaultScope(input);
  const model = buildModel(document);
  assertValidCell(cellOf(instruction));

  if (instruction.ifMatch !== undefined && instruction.ifMatch !== model.version) {
    throw new PreconditionFailedError(
      `ifMatch precondition failed: expected version ${instruction.ifMatch}, document is at ${model.version}`
    );
  }

  const resolved = resolveTarget(model, instruction);
  if (!resolved) {
    if (instruction.createTargetIfMissing) {
      switch (instruction.targetType) {
        case "heading":
          return createHeading(document, model, instruction);
        case "block":
          return createBlock(document, model, instruction);
        case "frontmatter":
          // patchFrontmatter creates the key itself when it is missing.
          return patchFrontmatter(document, model, instruction);
      }
    }
    throw new TargetNotFoundError(
      `could not resolve ${instruction.targetType} target ${JSON.stringify(
        instruction.target
      )}`
    );
  }

  // rejectIfContentPreexists keeps prepend/append idempotent: refuse to insert
  // string content that already appears in the target's current span.  As in
  // 1.x this applies to heading and block writes only, not frontmatter.
  if (
    instruction.rejectIfContentPreexists &&
    (instruction.operation === "prepend" || instruction.operation === "append") &&
    "content" in instruction &&
    typeof instruction.content === "string" &&
    instruction.content.trim().length > 0
  ) {
    const span = scopeSpanText(document, resolved, instruction.scope);
    const probe = preexistsProbe(instruction.content, resolved, instruction.scope);
    if (span !== null && span.includes(probe.trim())) {
      throw new ContentPreexistsError(
        `the target already contains the content to ${instruction.operation}`
      );
    }
  }

  // `resolveTarget` dispatches on `targetType`, so the resolved kind always
  // matches the instruction; narrow explicitly for the type system.  A
  // `within` instruction resolves to a headingChild and only ever reaches
  // patchHeadingChild — patchHeading never sees one.
  if (instruction.targetType === "heading" && resolved.kind === "headingChild") {
    if (!isWithinInstruction(instruction)) {
      throw new EngineError(
        "resolved a headingChild for an instruction without `within`"
      );
    }
    return patchHeadingChild(
      document,
      model,
      instruction,
      resolved.section,
      resolved.child,
      resolved.index
    );
  }
  if (
    instruction.targetType === "heading" &&
    resolved.kind === "heading" &&
    !isWithinInstruction(instruction)
  ) {
    return patchHeading(document, model, instruction, resolved.section);
  }
  if (instruction.targetType === "block" && resolved.kind === "block") {
    return patchBlock(document, model, instruction, resolved.block);
  }
  if (instruction.targetType === "frontmatter" && resolved.kind === "frontmatter") {
    return patchFrontmatter(document, model, instruction);
  }
  throw new EngineError(
    `resolved ${resolved.kind} does not match ${instruction.targetType} target`
  );
};
