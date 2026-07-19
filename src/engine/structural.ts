/**
 * The structural cells of the algebra — the ones that reshape the tree rather
 * than just rewrite a span:
 *
 * - `replace @ parent` (move): relocate a section's subtree beneath a new
 *   parent, re-levelling every heading in it by the same delta so its internal
 *   nesting is preserved.
 * - `delete @ marker` (dissolve): remove a heading line.  If a same-level
 *   sibling already precedes the target, its orphaned body/children are simply
 *   absorbed by the preceding text; if it is the first at its level, its
 *   children are promoted to its parent and re-levelled up one.
 * - `delete @ content` / `delete @ markerAndContent`: empty the section's body
 *   (its subtree below the heading line), or remove the whole subtree — heading
 *   line included — plus its trailing gap.
 * - block deletes: empty a block's text, detach its `^id`, or remove the whole
 *   block plus the blank line that separated it.
 */

import { DocumentModel, SectionNode, BlockNode } from "../model.js";
import { resolveHeading } from "../resolve.js";
import { Edit } from "../splice.js";
import {
  headingMarkerRange,
  headingContentRange,
  subtreeContentRange,
  subtreeEnd,
  blockFullRange,
} from "../ranges.js";
import { relevelText, endWithSingleEol, splice } from "../text.js";
import {
  HeadingInstruction,
  HeadingMoveInstruction,
  BlockDeleteInstruction,
  Place,
  PatchResult,
  EngineError,
  TargetNotFoundError,
} from "../instructions.js";

/** The subtree's first byte: a section's own marker, or its body for the root. */
const subtreeStart = (section: SectionNode): number =>
  section.marker ? section.marker.start : section.content.start;

// --- Move ----------------------------------------------------------------

/** Reject moving a section beneath itself or one of its own descendants. */
const assertNoCycle = (section: SectionNode, newParent: SectionNode): void => {
  let node: SectionNode | null = newParent;
  while (node) {
    if (node === section) {
      throw new EngineError(
        "cannot move a section beneath itself or one of its descendants"
      );
    }
    node = node.parent;
  }
};

/** The byte offset at which a new child should be inserted under `newParent`. */
const childInsertOffset = (
  model: DocumentModel,
  newParent: SectionNode,
  place: Place
): number => {
  const children = newParent.children;
  if (place === "first") {
    return children.length ? subtreeStart(children[0]) : newParent.content.end;
  }
  if (place === "last") {
    return children.length
      ? subtreeEnd(children[children.length - 1])
      : newParent.content.end;
  }
  const addr = "before" in place ? place.before : place.after;
  const sibling = resolveHeading(model, addr)?.section;
  if (!sibling || sibling.parent !== newParent) {
    throw new TargetNotFoundError(
      `place anchor ${JSON.stringify(addr)} is not a child of the new parent`
    );
  }
  return "before" in place ? subtreeStart(sibling) : subtreeEnd(sibling);
};

const moveSection = (
  document: string,
  model: DocumentModel,
  instruction: HeadingMoveInstruction,
  section: SectionNode
): PatchResult => {
  if (!section.heading) {
    throw new EngineError("the document root cannot be moved");
  }
  const resolvedParent = resolveHeading(model, instruction.destination.parent);
  if (!resolvedParent) {
    throw new TargetNotFoundError(
      `could not resolve new parent ${JSON.stringify(instruction.destination.parent)}`
    );
  }
  const newParent = resolvedParent.section;
  assertNoCycle(section, newParent);

  // Re-level the whole subtree so the moved section sits at (new parent + 1),
  // shifting every descendant by the same delta to preserve internal nesting.
  const newParentLevel = newParent.heading?.level ?? 0;
  const delta = newParentLevel + 1 - section.heading.level;
  const source = subtreeContentRange(section);
  const releveled = relevelText(
    document.slice(source.start, source.end),
    delta,
    model.lineEnding
  );
  const movedText = endWithSingleEol(releveled.text, model.lineEnding);

  const removal: Edit = {
    range: { start: subtreeStart(section), end: subtreeEnd(section) },
    text: "",
  };
  const at = childInsertOffset(model, newParent, instruction.destination.place);
  const insertion: Edit = { range: { start: at, end: at }, text: movedText };

  return splice(document, [removal, insertion], releveled.warnings);
};

// --- Dissolve ------------------------------------------------------------

const dissolveHeading = (
  document: string,
  model: DocumentModel,
  section: SectionNode
): PatchResult => {
  const markerRange = headingMarkerRange(section); // throws for the root
  const parent = section.parent!;
  const index = parent.children.indexOf(section);
  const hasPrecedingSameLevel = parent.children
    .slice(0, index)
    .some((sibling) => sibling.heading!.level === section.heading!.level);

  const edits: Edit[] = [{ range: markerRange, text: "" }];
  let warnings: PatchResult["warnings"] = [];

  // First at its level: its children have nothing to nest under once the
  // heading is gone, so promote them to the parent by re-levelling up one.
  if (!hasPrecedingSameLevel && section.children.length > 0) {
    const start = subtreeStart(section.children[0]);
    const end = subtreeContentRange(section).end;
    const releveled = relevelText(document.slice(start, end), -1, model.lineEnding);
    edits.push({ range: { start, end }, text: releveled.text });
    warnings = releveled.warnings;
  }

  return splice(document, edits, warnings);
};

// --- Heading delete dispatch ---------------------------------------------

/** Handle the structural heading cells (`delete @ *`, `replace @ parent`). */
export const structuralHeading = (
  document: string,
  model: DocumentModel,
  instruction: HeadingInstruction,
  section: SectionNode
): PatchResult => {
  if (instruction.scope === "parent") {
    return moveSection(document, model, instruction, section);
  }
  // Only delete instructions reach here (writes are handled in engine.ts).
  if (instruction.operation !== "delete") {
    throw new EngineError(
      `structuralHeading received a non-structural instruction (${instruction.operation} @ ${instruction.scope})`
    );
  }
  switch (instruction.scope) {
    case "content":
      return splice(document, [{ range: headingContentRange(section), text: "" }], []);
    case "markerAndContent":
      return splice(
        document,
        [
          {
            range: { start: subtreeStart(section), end: subtreeEnd(section) },
            text: "",
          },
        ],
        []
      );
    case "marker":
      return dissolveHeading(document, model, section);
  }
};

// --- Block delete --------------------------------------------------------

/**
 * Consume the block's line terminator and, if one follows, a single blank-line
 * separator, so removing a block does not leave a dangling gap.
 */
const consumeTrailingBlank = (document: string, from: number): number => {
  let i = from;
  const eatEol = (): boolean => {
    if (document[i] === "\r" && document[i + 1] === "\n") {
      i += 2;
      return true;
    }
    if (document[i] === "\n" || document[i] === "\r") {
      i += 1;
      return true;
    }
    return false;
  };
  eatEol(); // the terminator ending the block's line
  eatEol(); // one following blank line, if present
  return i;
};

/** Handle the block delete cells (`delete @ content|marker|markerAndContent`). */
export const deleteBlock = (
  document: string,
  _model: DocumentModel,
  instruction: BlockDeleteInstruction,
  block: BlockNode
): PatchResult => {
  switch (instruction.scope) {
    case "content":
      return splice(document, [{ range: block.content, text: "" }], []);
    case "marker":
      // Detach the id, keeping the content (the marker span includes any
      // leading whitespace before `^`).
      return splice(document, [{ range: block.marker, text: "" }], []);
    case "markerAndContent": {
      const full = blockFullRange(block);
      const end = consumeTrailingBlank(document, full.end);
      return splice(document, [{ range: { start: full.start, end }, text: "" }], []);
    }
  }
};
