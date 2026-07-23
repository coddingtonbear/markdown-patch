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
 * Reduce a caller-supplied fragment to trimmed, canonical form: leading blank
 * lines and all trailing whitespace are dropped, and a non-empty fragment ends
 * with exactly one line ending.  Interior lines — including first-line
 * indentation — are untouched.  This is what makes leading/trailing newlines in
 * caller content meaningless: separators are the library's job, not a channel
 * for the caller to steer.
 */
export const canonicalFragment = (text: string, ending: LineEnding): string => {
  const stripped = text
    .replace(/^(?:[^\S\r\n]*(?:\r\n|\r|\n))+/, "")
    .replace(/\s+$/, "");
  return stripped.length === 0 ? "" : stripped + ending;
};

/** Line endings (a `\r\n` pair counts as one) immediately before `at`, up to 2. */
const eolsBefore = (document: string, at: number): number => {
  let count = 0;
  let i = at;
  while (count < 2 && i > 0) {
    if (document[i - 1] === "\n") {
      i -= document[i - 2] === "\r" ? 2 : 1;
    } else if (document[i - 1] === "\r") {
      i -= 1;
    } else {
      break;
    }
    count += 1;
  }
  return count;
};

/**
 * The blank-line separators the library owes around a block-level fragment
 * spliced over `range` (a collapsed range for a pure insertion).  A non-empty
 * fragment always ends in a single line ending, so on each side the fragment
 * must be separated from whatever survives there by a blank line: a document
 * edge needs nothing, an existing blank line suffices, and flush text gets
 * exactly the endings required.  Separators are only ever added — existing
 * gap bytes are never rewritten.
 */
export const ownedGaps = (
  document: string,
  range: { start: number; end: number },
  ending: LineEnding
): { before: string; after: string } => {
  const before =
    range.start === 0 ? "" : ending.repeat(Math.max(0, 2 - eolsBefore(document, range.start)));
  const after =
    range.end === document.length ||
    document[range.end] === "\n" ||
    document[range.end] === "\r"
      ? ""
      : ending;
  return { before, after };
};

/**
 * Turn a relative heading-bearing fragment into the exact bytes to splice in:
 * rebase its `#`-levels by `baseline`, re-apply the document's line ending, and
 * reduce it to canonical form (blank edges trimmed, single terminator).
 */
export const sectionFragment = (
  value: string,
  baseline: number,
  ending: LineEnding
): { text: string; warnings: Warning[] } => {
  const rebased = rebaseHeadings(value, baseline);
  return {
    text: canonicalFragment(toLineEnding(rebased.text, ending), ending),
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
