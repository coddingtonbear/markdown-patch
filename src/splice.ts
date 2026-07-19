/**
 * The one primitive that mutates a document: apply a set of non-overlapping
 * range replacements in a single pass.  Because the model owns whitespace via
 * `trailingGap`, every edit here is an exact byte-range replacement — there are
 * no newline heuristics.  Callers decide the ranges and text; this just stitches
 * the untouched spans back together, so regions outside an edit are unchanged.
 */

import { DocumentRange } from "./types.js";

export interface Edit {
  range: DocumentRange;
  text: string;
}

export class OverlappingEditsError extends Error {}

/**
 * Apply `edits` to `document`.  Edits may be given in any order and may be
 * insertions (`start === end`); they must not overlap.  Returns the new
 * document.
 */
export const applyEdits = (document: string, edits: Edit[]): string => {
  // Sort by start, breaking ties so a zero-length insertion precedes a
  // same-start replacement/deletion (its text lands just before the region).
  // This lets a move express "insert here" and "delete the old span" as two
  // edits that share a boundary without spuriously overlapping.
  const sorted = [...edits].sort(
    (a, b) =>
      a.range.start - b.range.start ||
      (a.range.end - a.range.start) - (b.range.end - b.range.start)
  );
  const parts: string[] = [];
  let cursor = 0;
  for (const { range, text } of sorted) {
    if (range.end < range.start) {
      throw new OverlappingEditsError(
        `inverted range [${range.start}, ${range.end})`
      );
    }
    if (range.start < cursor) {
      throw new OverlappingEditsError(
        `edit at [${range.start}, ${range.end}) overlaps a preceding edit ending at ${cursor}`
      );
    }
    parts.push(document.slice(cursor, range.start), text);
    cursor = range.end;
  }
  parts.push(document.slice(cursor));
  return parts.join("");
};

/** Replace a single range's text. */
export const spliceRange = (
  document: string,
  range: DocumentRange,
  text: string
): string => applyEdits(document, [{ range, text }]);
