/**
 * Targeted reads over the 2.0 model.  The mirror image of {@link patch}: an
 * address (the same `(targetType, target)` pair a patch instruction carries)
 * resolves to a node, and the node's addressable value comes back.  Headings and
 * blocks yield their content as a string; frontmatter yields the parsed value.
 */

import { buildModel } from "./model.js";
import { resolveTarget, Addressed } from "./resolve.js";
import { headingContentRange, blockContentRange } from "./ranges.js";
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
      return { kind: "heading", content: document.slice(range.start, range.end) };
    }
    case "block": {
      const range = blockContentRange(resolved.block);
      return { kind: "block", content: document.slice(range.start, range.end) };
    }
    case "frontmatter":
      return { kind: "frontmatter", value: resolved.entry.value };
  }
};
