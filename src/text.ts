/**
 * Text helpers shared by the engine's write and structural handlers: line-ending
 * normalization and relative→absolute heading fragment preparation.  Kept in
 * their own module so `engine.ts` and `engine/structural.ts` can share them
 * without a circular import.
 */

import { rebaseHeadings } from "./levels.js";
import { applyEdits, Edit } from "./splice.js";
import { PatchResult, Warning } from "./instructions.js";

export type LineEnding = "\n" | "\r\n";

/** Apply `edits` to `document` and package the result with its `warnings`. */
export const splice = (
  document: string,
  edits: Edit[],
  warnings: Warning[]
): PatchResult => ({ document: applyEdits(document, edits), warnings });

const normalizeToLf = (text: string): string =>
  text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

/** Re-express `text` using the document's line ending. */
export const toLineEnding = (text: string, ending: LineEnding): string =>
  ending === "\n"
    ? normalizeToLf(text)
    : normalizeToLf(text).replace(/\n/g, "\r\n");

/**
 * Normalize an inserted body/section fragment to end with exactly one line
 * ending (or empty for an empty value), matching the model's invariant that a
 * non-empty content span ends with a single terminator and the library owns the
 * blank-line gap that follows.
 */
export const endWithSingleEol = (text: string, ending: LineEnding): string => {
  const stripped = text.replace(/(?:\r\n|\r|\n)+$/, "");
  return stripped.length === 0 ? "" : stripped + ending;
};

/**
 * Turn a relative heading-bearing fragment into the exact bytes to splice in:
 * rebase its `#`-levels by `baseline`, re-apply the document's line ending, and
 * terminate it with a single ending.
 */
export const sectionFragment = (
  value: string,
  baseline: number,
  ending: LineEnding
): { text: string; warnings: Warning[] } => {
  const rebased = rebaseHeadings(value, baseline);
  return {
    text: endWithSingleEol(toLineEnding(rebased.text, ending), ending),
    warnings: rebased.warnings,
  };
};

/**
 * Re-level an already-placed heading fragment by `delta`, preserving its own
 * trailing structure (no single-eol normalization).  Used by move and dissolve
 * to shift a contiguous subtree's `#`-levels in place.  Returns `null` edits
 * when `delta` is 0.
 */
export const relevelText = (
  slice: string,
  delta: number,
  ending: LineEnding
): { text: string; warnings: Warning[] } => {
  const rebased = rebaseHeadings(slice, delta);
  return { text: toLineEnding(rebased.text, ending), warnings: rebased.warnings };
};
