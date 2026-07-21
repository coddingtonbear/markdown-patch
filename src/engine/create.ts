/**
 * Target creation for `createTargetIfMissing`.  Only value-writing operations
 * create — you cannot rename, move, or delete something that does not exist.
 *
 * - Headings: create the missing trailing segments of the address as a nested
 *   chain under the deepest existing ancestor, with levels running from that
 *   ancestor's *actual* level + 1 (so a skipped level in the address never
 *   leaves a hole — the 1.x skipped-depth bug), then place the content in the
 *   deepest new section.  A created level past h6 still writes but warns.
 * - Blocks: mint `content ^id` as a new paragraph at the end of the document.
 */

import { DocumentModel } from "../model.js";
import { resolveHeading } from "../resolve.js";
import { subtreeEnd } from "../ranges.js";
import { sectionFragment, toLineEnding, splice } from "../text.js";
import {
  HeadingInstruction,
  BlockInstruction,
  PatchResult,
  Warning,
  EngineError,
  TargetNotFoundError,
} from "../instructions.js";

const MAX_HEADING_LEVEL = 6;

/** Create a missing heading (and any missing ancestors) and place content in it. */
export const createHeading = (
  document: string,
  model: DocumentModel,
  instruction: HeadingInstruction
): PatchResult => {
  if (instruction.operation === "delete" || instruction.scope === "parent") {
    throw new TargetNotFoundError(
      "cannot create a heading for a delete or move instruction"
    );
  }
  if (instruction.scope !== "content") {
    throw new EngineError(
      "createTargetIfMissing for headings supports content-scope writes only"
    );
  }
  const path = instruction.target ?? [];
  if (path.length === 0) {
    throw new EngineError("the document root cannot be created");
  }

  // Find the deepest existing ancestor prefix; the remaining segments are new.
  let ancestor = model.root;
  let matched = 0;
  for (let length = path.length - 1; length >= 1; length--) {
    const resolved = resolveHeading(model, path.slice(0, length));
    if (resolved) {
      ancestor = resolved.section;
      matched = length;
      break;
    }
  }
  const toCreate = path.slice(matched);

  const warnings: Warning[] = [];
  const parts: string[] = [];
  let level = ancestor.heading?.level ?? 0;
  for (const segment of toCreate) {
    level += 1;
    if (level > MAX_HEADING_LEVEL) {
      warnings.push({
        code: "heading-depth-overflow",
        message: `Created heading "${segment}" resolves to level ${level}, beyond Markdown's maximum of ${MAX_HEADING_LEVEL}; it will not be structurally addressable.`,
      });
    }
    parts.push("#".repeat(level) + " " + segment + model.lineEnding);
  }

  // The content lands in the deepest new section, at its level baseline.
  const body = sectionFragment(instruction.content, level, model.lineEnding);
  if (body.text) {
    parts.push(body.text);
  }
  warnings.push(...body.warnings);

  const at = subtreeEnd(ancestor);
  return splice(
    document,
    [{ range: { start: at, end: at }, text: parts.join("") }],
    warnings
  );
};

/** Mint a new `content ^id` block at the end of the document. */
export const createBlock = (
  document: string,
  model: DocumentModel,
  instruction: BlockInstruction
): PatchResult => {
  if (instruction.operation === "delete" || instruction.scope !== "content") {
    throw new EngineError(
      "createTargetIfMissing for blocks supports content-scope writes only"
    );
  }
  const value = toLineEnding(instruction.content, model.lineEnding);
  const blockText = `${value} ^${instruction.target}`;
  const le = model.lineEnding;
  const separator =
    document.length === 0
      ? ""
      : document.endsWith(le + le)
        ? ""
        : document.endsWith(le)
          ? le
          : le + le;
  const at = document.length;
  return splice(
    document,
    [{ range: { start: at, end: at }, text: separator + blockText + le }],
    []
  );
};
