/**
 * Turn a public target address back into the model node it names.  Headings are
 * matched by their null-padded address (see {@link headingPath}); a target with
 * explicit levels wins over a level-agnostic collapsed one, and a collapsed
 * address falls back to matching by nesting so the common "the section named X"
 * case needs no level annotation.  Duplicates resolve to the first match in
 * document order; the `ifMatch` precondition guards against staleness.
 */

import {
  BlockNode,
  DocumentModel,
  FrontmatterEntry,
  SectionNode,
  eachSection,
} from "./model.js";
import { headingPath } from "./projection.js";
import { HeadingAddress, TargetType } from "./instructions.js";

export type ResolvedTarget =
  | { kind: "heading"; section: SectionNode }
  | { kind: "block"; block: BlockNode }
  | { kind: "frontmatter"; entry: FrontmatterEntry };

const arrayEquals = (a: (string | null)[], b: (string | null)[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

/** Drop skipped levels, keeping empty-text (`""`) segments. */
const collapse = (path: (string | null)[]): (string | null)[] =>
  path.filter((segment) => segment !== null);

/** Every heading-bearing section, in document order. */
const headingSections = (model: DocumentModel): SectionNode[] => {
  const sections: SectionNode[] = [];
  eachSection(model.root, (node) => {
    if (node.heading) {
      sections.push(node);
    }
  });
  return sections;
};

/** Resolve a heading address to its section (root for `null`/`[]`), or `null`. */
export const resolveHeading = (
  model: DocumentModel,
  address: HeadingAddress
): { kind: "heading"; section: SectionNode } | null => {
  const target = address ?? [];
  if (target.length === 0) {
    return { kind: "heading", section: model.root };
  }
  const sections = headingSections(model);

  // Exact tier: the node's padded address equals the target as written, so an
  // explicitly levelled address (`["A", null, "B"]`) selects a precise depth.
  const exact = sections.find((section) =>
    arrayEquals(headingPath(section), target)
  );
  if (exact) {
    return { kind: "heading", section: exact };
  }

  // Collapsed tier: match by nesting, ignoring levels, so a plain path still
  // finds a section reached across a skipped heading level.
  const wanted = collapse(target);
  const collapsed = sections.find((section) =>
    arrayEquals(collapse(headingPath(section)), wanted)
  );
  return collapsed ? { kind: "heading", section: collapsed } : null;
};

/** Resolve a bare block id to its block node, or `null`. */
export const resolveBlock = (
  model: DocumentModel,
  id: string
): { kind: "block"; block: BlockNode } | null => {
  let found: BlockNode | null = null;
  eachSection(model.root, (node) => {
    if (found) {
      return;
    }
    const block = node.blocks.find((candidate) => candidate.id === id);
    if (block) {
      found = block;
    }
  });
  return found ? { kind: "block", block: found } : null;
};

/** Resolve a frontmatter key to its entry, or `null`. */
export const resolveFrontmatter = (
  model: DocumentModel,
  key: string
): { kind: "frontmatter"; entry: FrontmatterEntry } | null => {
  const entry = model.frontmatter.entries.find((candidate) => candidate.key === key);
  return entry ? { kind: "frontmatter", entry } : null;
};

/** The addressing subset of an instruction the resolver needs. */
export type Addressed =
  | { targetType: "heading"; target: HeadingAddress }
  | { targetType: "block"; target: string }
  | { targetType: "frontmatter"; target: string };

/** Dispatch to the target-type-specific resolver. */
export const resolveTarget = (
  model: DocumentModel,
  instruction: Addressed
): ResolvedTarget | null => {
  switch (instruction.targetType) {
    case "heading":
      return resolveHeading(model, instruction.target);
    case "block":
      return resolveBlock(model, instruction.target);
    case "frontmatter":
      return resolveFrontmatter(model, instruction.target);
  }
};

/** The target types the resolver understands (kept in sync with the union). */
export const RESOLVABLE_TARGET_TYPES: readonly TargetType[] = [
  "heading",
  "block",
  "frontmatter",
];
