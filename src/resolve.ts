/**
 * Turn a public target address back into the model node it names.  Headings are
 * matched by their containment path (see {@link headingPath}) — the ancestor
 * heading texts from the top level down, ignoring source depth — so a skipped
 * level needs no annotation.  A duplicate sibling heading no longer collides
 * with an earlier one: {@link headingPath} disambiguates each occurrence past
 * the first, so every heading-bearing section has its own unique address and
 * `.find()` below matches at most one. The `ifMatch` precondition still guards
 * against staleness between reading a target and applying an edit.
 */

import {
  BlockNode,
  BodyChild,
  DocumentModel,
  FrontmatterEntry,
  SectionNode,
  eachSection,
} from "./model.js";
import { allBlocksInOrder, disambiguatedBlockId, headingPath } from "./projection.js";
import {
  HeadingAddress,
  InvalidInstructionError,
  TargetNotFoundError,
  TargetType,
} from "./instructions.js";

export type ResolvedTarget =
  | { kind: "heading"; section: SectionNode }
  | { kind: "headingChild"; section: SectionNode; child: BodyChild; index: number }
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
  // its section even across a skipped heading level. Disambiguated addresses
  // make every section's path unique, so `.find()` matches at most one.
  const match = sections.find((section) =>
    arrayEquals(headingPath(section), target)
  );
  return match ? { kind: "heading", section: match } : null;
};

/**
 * Resolve a block address to its block node, or `null`. Mirrors
 * resolveHeading: a duplicate id's later occurrence is disambiguated (see
 * {@link disambiguatedBlockId}), so recomputing every block's address and
 * matching by plain string equality resolves at most one candidate.
 */
export const resolveBlock = (
  model: DocumentModel,
  id: string
): { kind: "block"; block: BlockNode } | null => {
  const blocks = allBlocksInOrder(model.root);
  const match = blocks.find((block) => disambiguatedBlockId(block, blocks) === id);
  return match ? { kind: "block", block: match } : null;
};

/** Resolve a frontmatter key to its entry, or `null`. */
export const resolveFrontmatter = (
  model: DocumentModel,
  key: string
): { kind: "frontmatter"; entry: FrontmatterEntry } | null => {
  const entry = model.frontmatter.entries.find((candidate) => candidate.key === key);
  return entry ? { kind: "frontmatter", entry } : null;
};

/**
 * Refine a resolved section to one of its direct body's top-level blocks by
 * position (negative counts from the end).  Out-of-range throws
 * {@link TargetNotFoundError} — the address names a block that does not exist,
 * distinct from the `null` a missing *heading* returns so that
 * `createTargetIfMissing` heading semantics stay untouched.
 */
export const resolveWithin = (
  section: SectionNode,
  within: number
): Extract<ResolvedTarget, { kind: "headingChild" }> => {
  if (!Number.isInteger(within)) {
    // The schema rejects this before patch() ever resolves; guard direct
    // resolver/readTarget callers too.
    throw new InvalidInstructionError(
      `\`within\` must be an integer; got ${JSON.stringify(within)}`
    );
  }
  const children = section.bodyChildren;
  const index = within < 0 ? children.length + within : within;
  if (index < 0 || index >= children.length) {
    const sectionName = section.heading
      ? JSON.stringify(headingPath(section))
      : "the document root";
    throw new TargetNotFoundError(
      `\`within\` index ${within} is out of range: ${sectionName} has ${children.length} top-level block${children.length === 1 ? "" : "s"}`
    );
  }
  return { kind: "headingChild", section, child: children[index], index };
};

/** The addressing subset of an instruction the resolver needs. */
export type Addressed =
  | { targetType: "heading"; target: HeadingAddress; within?: number }
  | { targetType: "block"; target: string }
  | { targetType: "frontmatter"; target: string };

/** Dispatch to the target-type-specific resolver. */
export const resolveTarget = (
  model: DocumentModel,
  instruction: Addressed
): ResolvedTarget | null => {
  switch (instruction.targetType) {
    case "heading": {
      const resolved = resolveHeading(model, instruction.target);
      if (resolved && instruction.within !== undefined) {
        return resolveWithin(resolved.section, instruction.within);
      }
      return resolved;
    }
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
