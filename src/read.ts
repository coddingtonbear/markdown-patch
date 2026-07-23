/**
 * Targeted reads over the 2.0 model.  The mirror image of {@link patch}: an
 * address (the same `(targetType, target)` pair a patch instruction carries)
 * resolves to a node, and the node's addressable value comes back.  Headings and
 * blocks yield their content as a string; frontmatter yields the parsed value.
 *
 * A heading's content is de-levelled by the target's own level before it is
 * returned, mirroring the baseline a `content`-scope write rebases *up* by (see
 * `levels.ts`).  Without this, a heading's content round-trips through a
 * content-scope write at the wrong depth: reading section "# Overview"'s
 * "## Details" child and writing it straight back would rebase it to "### Details".
 */

import { buildModel } from "./model.js";
import { resolveTarget, Addressed } from "./resolve.js";
import { headingContentRange, blockContentRange } from "./ranges.js";
import { relevelText } from "./text.js";
import { TargetNotFoundError } from "./instructions.js";

/** The address of a read: the same addressing subset a patch instruction uses. */
export type ReadTarget = Addressed;

/** The result of {@link readTarget}: markdown text, or a parsed frontmatter value. */
export type ReadResult =
  | { kind: "heading" | "block"; content: string }
  | { kind: "frontmatter"; value: unknown };

/**
 * Resolve `target` against `document` and return the addressed value.  For a
 * heading the content span is the whole section body (subsections included),
 * matching {@link headingContentRange}; for a block it is the block's text; for
 * frontmatter it is the parsed value of the key.  Throws {@link TargetNotFoundError}
 * when the address does not resolve.
 */
export const readTarget = (document: string, target: ReadTarget): ReadResult => {
  const model = buildModel(document);
  const resolved = resolveTarget(model, target);
  if (!resolved) {
    throw new TargetNotFoundError(
      `Target not found: ${target.targetType} ${JSON.stringify(target.target)}`
    );
  }
  switch (resolved.kind) {
    case "heading": {
      const range = headingContentRange(resolved.section);
      const raw = document.slice(range.start, range.end);
      const baseline = resolved.section.heading?.level ?? 0;
      // Baseline 0 (the document root) needs no releveling; skip it so a root
      // read stays a byte-identical slice rather than a normalize/reapply round
      // trip through relevelText.
      const content =
        baseline === 0 ? raw : relevelText(raw, -baseline, model.lineEnding).text;
      return { kind: "heading", content };
    }
    case "headingChild": {
      // A body child can contain no heading (headings are structure, not
      // children), so the slice is returned literally — no releveling.
      const { start, end } = resolved.child.range;
      return { kind: "heading", content: document.slice(start, end) };
    }
    case "block": {
      const range = blockContentRange(resolved.block);
      return { kind: "block", content: document.slice(range.start, range.end) };
    }
    case "frontmatter":
      return { kind: "frontmatter", value: resolved.entry.value };
  }
};
