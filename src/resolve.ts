/**
 * Turn a public target address back into the model node it names.  Headings are
 * matched by their containment path (see {@link headingPath}) — the ancestor
 * heading texts from the top level down, ignoring source depth — so a skipped
 * level needs no annotation.  Duplicates resolve to the first match in document
 * order; the `ifMatch` precondition guards against staleness.
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

const arrayEquals = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

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

  // Match by containment path, ignoring source depth, so a plain address finds
  // its section even across a skipped heading level.  The first match in
  // document order wins, so a repeated heading resolves to its first occurrence.
  const match = sections.find((section) =>
    arrayEquals(headingPath(section), target)
  );
  return match ? { kind: "heading", section: match } : null;
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
