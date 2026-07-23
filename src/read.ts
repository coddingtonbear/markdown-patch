/**
 * Targeted reads over the 2.0 model.  The mirror image of {@link patch}: an
 * address (the same `(targetType, target)` pair a patch instruction carries)
 * resolves to a node, and the node's addressable value comes back.  An optional
 * `scope` mirrors the patch scopes, with one invariant tying the two together:
 * *read @ scope S, then `replace` @ scope S with the value unchanged, is a
 * no-op.*
 *
 * - `content` (the default): a heading's body de-levelled by the target's own
 *   level, a block's literal text, a frontmatter key's parsed value.
 * - `marker`: the node's label — a heading's raw text (no `#`s, and no
 *   duplicate-disambiguation suffix), a block's bare id, a frontmatter key.
 * - `markerAndContent`: the whole node — a heading's subtree re-levelled to
 *   its *parent's* baseline (its own heading line reads as `# Title`, exactly
 *   the shape a `markerAndContent` replace consumes), a block's full span
 *   including its `^id`, a frontmatter entry as a single-key object.
 *
 * The frontmatter `markerAndContent` read is the one deviation from the
 * round-trip invariant: it returns the entry as `{key: value}` — the shape a
 * `markerAndContent` *prepend/append* consumes — because on the write side a
 * frontmatter `replace` carries a plain value at either scope, so a strict
 * mirror would just duplicate the `content` read.
 *
 * A heading's `content` is de-levelled by the target's own level, mirroring
 * the baseline a `content`-scope write rebases *up* by (see `levels.ts`).
 * Without this, a heading's content round-trips through a content-scope write
 * at the wrong depth: reading section "# Overview"'s "## Details" child and
 * writing it straight back would rebase it to "### Details".
 */

import { buildModel } from "./model.js";
import { resolveTarget, Addressed } from "./resolve.js";
import {
  headingContentRange,
  blockContentRange,
  blockFullRange,
  subtreeContentRange,
} from "./ranges.js";
import { relevelText } from "./text.js";
import { InvalidInstructionError, TargetNotFoundError } from "./instructions.js";

/** The scopes a read supports — the value-bearing subset of the patch scopes. */
export type ReadScope = "content" | "marker" | "markerAndContent";

/** The address of a read: the addressing subset a patch instruction uses,
 *  plus an optional {@link ReadScope} (default `content`). */
export type ReadTarget = Addressed & { scope?: ReadScope };

/** The result of {@link readTarget}: markdown text, or a parsed frontmatter value. */
export type ReadResult =
  | { kind: "heading" | "block"; content: string }
  | { kind: "frontmatter"; value: unknown };

/**
 * Resolve `target` against `document` and return the addressed value at the
 * requested scope (default `content`).  Throws {@link TargetNotFoundError}
 * when the address does not resolve — or for a `marker` read of the markerless
 * document root — and {@link InvalidInstructionError} for a `within` read at a
 * non-`content` scope (a positional body block has no marker of its own; its
 * `markerAndContent` cells are insert-only on the write side).
 */
const READ_SCOPES: readonly ReadScope[] = [
  "content",
  "marker",
  "markerAndContent",
];

export const readTarget = (document: string, target: ReadTarget): ReadResult => {
  const scope: ReadScope = target.scope ?? "content";
  if (!READ_SCOPES.includes(scope)) {
    // Untyped callers (the CLI, HTTP layers) pass scope through as a string;
    // an unrecognized one must not silently read as `content`.
    throw new InvalidInstructionError(
      `invalid read scope ${JSON.stringify(scope)}; expected one of ${READ_SCOPES.join(", ")}`
    );
  }
  const model = buildModel(document);
  const resolved = resolveTarget(model, target);
  if (!resolved) {
    throw new TargetNotFoundError(
      `Target not found: ${target.targetType} ${JSON.stringify(target.target)}`
    );
  }
  switch (resolved.kind) {
    case "heading": {
      const section = resolved.section;
      if (scope === "marker") {
        if (!section.heading) {
          throw new TargetNotFoundError(
            "the document root has no marker to read"
          );
        }
        return { kind: "heading", content: section.heading.text };
      }
      if (scope === "markerAndContent") {
        const range = subtreeContentRange(section);
        const raw = document.slice(range.start, range.end);
        // The parent's level is the baseline a markerAndContent write rebases
        // up by, so the section's own heading reads as `# Title`.
        const baseline = section.parent?.heading?.level ?? 0;
        const content =
          baseline === 0 ? raw : relevelText(raw, -baseline, model.lineEnding).text;
        return { kind: "heading", content };
      }
      const range = headingContentRange(section);
      const raw = document.slice(range.start, range.end);
      const baseline = section.heading?.level ?? 0;
      // Baseline 0 (the document root) needs no releveling; skip it so a root
      // read stays a byte-identical slice rather than a normalize/reapply round
      // trip through relevelText.
      const content =
        baseline === 0 ? raw : relevelText(raw, -baseline, model.lineEnding).text;
      return { kind: "heading", content };
    }
    case "headingChild": {
      if (scope !== "content") {
        throw new InvalidInstructionError(
          "a `within` read supports only the `content` scope: a positional body block has no marker of its own"
        );
      }
      // A body child can contain no heading (headings are structure, not
      // children), so the slice is returned literally — no releveling.
      const { start, end } = resolved.child.range;
      return { kind: "heading", content: document.slice(start, end) };
    }
    case "block": {
      const block = resolved.block;
      if (scope === "marker") {
        return { kind: "block", content: block.id };
      }
      const range =
        scope === "markerAndContent"
          ? blockFullRange(block)
          : blockContentRange(block);
      return { kind: "block", content: document.slice(range.start, range.end) };
    }
    case "frontmatter": {
      const entry = resolved.entry;
      if (scope === "marker") {
        return { kind: "frontmatter", value: entry.key };
      }
      if (scope === "markerAndContent") {
        return { kind: "frontmatter", value: { [entry.key]: entry.value } };
      }
      return { kind: "frontmatter", value: entry.value };
    }
  }
};
