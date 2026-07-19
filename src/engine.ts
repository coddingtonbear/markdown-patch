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

import { buildModel, DocumentModel, SectionNode, BlockNode } from "./model.js";
import { resolveTarget } from "./resolve.js";
import { Edit } from "./splice.js";
import {
  headingMarkerRange,
  subtreeContentRange,
  subtreeEnd,
  blockFullRange,
} from "./ranges.js";
import { toLineEnding, sectionFragment, splice } from "./text.js";
import { structuralHeading, deleteBlock } from "./engine/structural.js";
import { patchFrontmatter } from "./engine/frontmatter.js";
import { createHeading, createBlock } from "./engine/create.js";
import {
  Instruction,
  HeadingInstruction,
  BlockInstruction,
  PatchResult,
  EngineError,
  PreconditionFailedError,
  TargetNotFoundError,
  assertValidCell,
} from "./instructions.js";

/** The subset of an instruction {@link assertValidCell} inspects. */
const cellOf = (instruction: Instruction) => ({
  targetType: instruction.targetType,
  operation: instruction.operation,
  scope: instruction.scope,
});

/** The parent's source heading level, or 0 when the parent is the root. */
const parentLevel = (section: SectionNode): number =>
  section.parent?.heading?.level ?? 0;

// --- Heading handlers ----------------------------------------------------

const patchHeading = (
  document: string,
  model: DocumentModel,
  instruction: HeadingInstruction,
  section: SectionNode
): PatchResult => {
  if (instruction.operation === "delete" || instruction.scope === "parent") {
    return structuralHeading(document, model, instruction, section);
  }
  // Excluding delete and parent narrows to HeadingWriteInstruction.
  const { operation, scope, content: value } = instruction;

  if (scope === "content") {
    const fragment = sectionFragment(value, section.heading?.level ?? 0, model.lineEnding);
    const edit = contentEdit(section.content, operation, fragment.text);
    return splice(document, [edit], fragment.warnings);
  }

  if (scope === "marker") {
    return splice(document, [markerRenameEdit(document, model, section, operation, value)], []);
  }

  // markerAndContent: the whole subtree, rebased to the parent's level.
  const fragment = sectionFragment(value, parentLevel(section), model.lineEnding);
  if (operation === "replace") {
    return splice(
      document,
      [{ range: subtreeContentRange(section), text: fragment.text }],
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
    [{ range: { start: at, end: at }, text: fragment.text }],
    fragment.warnings
  );
};

/** Build the edit for a `content`-scope write on a body range. */
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
  // Excluding delete narrows to BlockWrite | BlockMarkerReplace; both carry a
  // string `content`.  Block content and ids are literal, never rebased.
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
 * Apply a single {@link Instruction} to `document`, returning the new document
 * and any warnings.  Throws {@link PreconditionFailedError} on an `ifMatch`
 * mismatch, {@link TargetNotFoundError} when the target does not resolve, and
 * {@link InvalidCellError} for a combination outside the algebra.
 */
export const patch = (
  document: string,
  instruction: Instruction
): PatchResult => {
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

  // `resolveTarget` dispatches on `targetType`, so the resolved kind always
  // matches the instruction; narrow explicitly for the type system.
  if (instruction.targetType === "heading" && resolved.kind === "heading") {
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
