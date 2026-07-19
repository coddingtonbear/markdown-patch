/**
 * Relative heading levels.  A section value carries heading `#`-counts relative
 * to the container of the span being written; on write they are rebased to
 * absolute by adding a baseline:
 *
 * - `content` scope → baseline = the target section's own level (`#` = a direct
 *   child).
 * - `markerAndContent` / sibling insert → baseline = the *parent's* level
 *   (`# Title` = a section at the target's own level).
 * - document root → baseline 0, so relative == absolute and whole-document
 *   writes are byte-identical.
 *
 * This is well-founded because a section can never contain a heading at or above
 * its own level, so stripping the container's level on read and re-adding it on
 * write round-trips losslessly.  A rebased level past h6 is still written (the
 * `#`s go in verbatim) but is reported as a warning, since the "heading" will
 * not be structurally addressable in the next map.
 *
 * The value is normalized to LF here; the engine re-applies the document's line
 * ending when it splices the result in.
 */

import * as marked from "marked";

import { applyEdits, Edit } from "./splice.js";
import { Warning } from "./instructions.js";

const MAX_HEADING_LEVEL = 6;
const LEADING_HASHES = /^([ \t]{0,3})(#{1,})/;

export interface RebaseResult {
  text: string;
  warnings: Warning[];
}

/**
 * Rewrite each top-level heading's `#`-count in `value` by adding `baseline`,
 * leaving `#` lines inside fenced code (and all other content) untouched.
 */
export const rebaseHeadings = (value: string, baseline: number): RebaseResult => {
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (baseline === 0) {
    // Nothing to shift; relative already equals absolute.
    return { text: normalized, warnings: [] };
  }

  const tokens = new marked.Lexer().lex(normalized);
  const edits: Edit[] = [];
  const warnings: Warning[] = [];
  let offset = 0;
  for (const token of tokens) {
    if (token.type === "heading") {
      const match = LEADING_HASHES.exec(token.raw);
      if (match) {
        const hashStart = offset + match[1].length;
        const hashEnd = hashStart + match[2].length;
        const absoluteLevel = match[2].length + baseline;
        edits.push({
          range: { start: hashStart, end: hashEnd },
          text: "#".repeat(absoluteLevel),
        });
        if (absoluteLevel > MAX_HEADING_LEVEL) {
          const heading = token as marked.Tokens.Heading;
          warnings.push({
            code: "heading-depth-overflow",
            message: `Heading "${heading.text.trim()}" resolves to level ${absoluteLevel}, beyond Markdown's maximum of ${MAX_HEADING_LEVEL}; it will not be structurally addressable.`,
          });
        }
      }
    }
    offset += token.raw.length;
  }

  return { text: applyEdits(normalized, edits), warnings };
};
