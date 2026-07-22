import { BlockNode, DocumentModel, SectionNode } from "./model.js";
import { DUPLICATE_DIGITS, DUPLICATE_MARKER } from "./constants.js";

/**
 * A nested map of heading text to its child headings, mirroring the document's
 * section nesting.  A leaf heading maps to an empty object.  The tree carries no
 * heading levels: nesting is by containment, so a level skipped in the source
 * (an `h1` followed directly by an `h3`) does not appear as a hole — the engine
 * owns depth and a consumer never needs it.
 *
 * Sibling headings are keyed by text, and every occurrence gets its own key: a
 * repeated sibling name is not merged. The first occurrence keeps its plain
 * text; each later occurrence's key has a {@link disambiguatedHeadingText}
 * suffix appended, so no two sections ever share an address. For
 * `## Log / ### Monday` followed by `## Log / ### Tuesday`, the tree is
 * `{ Log: { Monday: {} }, "Log<marker>": { Tuesday: {} } }`: both "Log"s, and
 * both children, are separately addressable.
 *
 * The tree therefore enumerates exactly the addresses the resolver accepts —
 * see {@link headingTreePaths}.
 */
export interface HeadingTree {
  [headingText: string]: HeadingTree;
}

/** Encode a 0-based occurrence index as hex, one reserved digit per hex character. */
const encodeOccurrenceSuffix = (occurrenceIndex: number): string =>
  occurrenceIndex
    .toString(16)
    .split("")
    .map((hexChar) => DUPLICATE_DIGITS[parseInt(hexChar, 16)])
    .join("");

/**
 * The text a heading-bearing section is keyed/addressed by: its raw heading
 * text for the first occurrence among same-text siblings under the same
 * parent, or that text plus a reserved-codepoint suffix for each later
 * occurrence (in document order). This is the single source of truth both
 * {@link headingPath} (resolution) and {@link projectMap} (the map a caller
 * reads) derive from, so the two can never drift apart — an address is always
 * matched by plain string equality against a freshly recomputed value, never
 * decoded. Keys produced here are guaranteed unique among a parent's children
 * as long as no raw heading text already collides with a synthesized suffix,
 * which {@link buildModel} guards against.
 */
export const disambiguatedHeadingText = (node: SectionNode): string => {
  const heading = node.heading;
  if (!heading) {
    return "";
  }
  if (!node.parent) {
    return heading.text;
  }
  const siblings = node.parent.children.filter(
    (sibling) => sibling.heading?.text === heading.text
  );
  const occurrence = siblings.indexOf(node);
  return occurrence <= 0
    ? heading.text
    : heading.text + DUPLICATE_MARKER + encodeOccurrenceSuffix(occurrence - 1);
};

/**
 * Every block in the document, in document order (a pre-order walk of the
 * section tree). Blocks are addressed globally by id, not scoped to a parent
 * the way headings are scoped to sibling groups, so disambiguating a
 * duplicate id needs this full document-order list rather than a single
 * node's local neighbors.
 */
export const allBlocksInOrder = (root: SectionNode): BlockNode[] => {
  const blocks: BlockNode[] = [];
  const walk = (node: SectionNode): void => {
    blocks.push(...node.blocks);
    for (const child of node.children) {
      walk(child);
    }
  };
  walk(root);
  return blocks;
};

/**
 * The id a block is keyed/addressed by: its raw id for the first occurrence
 * among every block in the document sharing that id, or that id plus a
 * reserved-codepoint suffix for each later occurrence (in document order).
 * Mirrors {@link disambiguatedHeadingText}'s role for headings — both
 * {@link projectMap} and the resolver derive from this one function, so an
 * address is always matched by plain string equality, never decoded. A raw
 * block id cannot itself collide with a synthesized suffix: block ids are
 * constrained to `[a-zA-Z0-9_-]+` by {@link BLOCK_REFERENCE_REGEX} in
 * model.ts, which cannot contain these (astral, non-ASCII) codepoints, so no
 * buildModel-time guard is needed here the way there is for headings.
 */
export const disambiguatedBlockId = (
  block: BlockNode,
  allBlocks: readonly BlockNode[]
): string => {
  const sameId = allBlocks.filter((candidate) => candidate.id === block.id);
  const occurrence = sameId.indexOf(block);
  return occurrence <= 0
    ? block.id
    : block.id + DUPLICATE_MARKER + encodeOccurrenceSuffix(occurrence - 1);
};

/**
 * The terse, context-cheap public view of a document, derived from the
 * {@link DocumentModel}.  It carries no in-band grammar: headings nest by
 * containment in a {@link HeadingTree} and block references are bare ids.
 */
export interface PublicMap {
  /** Content-hash token; pass back as an `ifMatch` precondition. */
  version: string;
  /** Top-level frontmatter field names, in document order. */
  frontmatterFields: string[];
  /** Headings nested by containment; see {@link HeadingTree}. */
  headings: HeadingTree;
  /**
   * Block reference ids, bare (no `^`), in document order. A duplicate id
   * gets its own entry per occurrence: the first keeps its bare id, and each
   * later occurrence's entry has a {@link disambiguatedBlockId} suffix
   * appended, so no two entries are ever the same string.
   */
  blocks: string[];
}

/**
 * The containment path of a heading-bearing section: the ancestor heading texts
 * from the top level down to this node (e.g. `["Overview", "Details"]`), one
 * entry per heading on the path regardless of source level.  This is exactly the
 * address a consumer sends back as a heading target.  Shared with the resolver
 * so map addresses and target matching use one definition.
 */
export const headingPath = (node: SectionNode): string[] => {
  const path: string[] = [];
  let current: SectionNode | null = node;
  while (current && current.heading) {
    path.push(disambiguatedHeadingText(current));
    current = current.parent;
  }
  return path.reverse();
};

/** Project the internal model into the public map consumers receive. */
export const projectMap = (model: DocumentModel): PublicMap => {
  // Null-prototype: a heading literally named "__proto__" must become a real
  // own key. On an ordinary object literal, `into[text] = subtree` for that
  // text invokes Object.prototype's `__proto__` setter instead, silently
  // discarding the heading.
  const headings: HeadingTree = Object.create(null) as HeadingTree;

  // Blocks are addressed globally by (possibly disambiguated) id, so every
  // block is listed in document order — including any under a heading
  // shadowed by a duplicate.
  const allBlocks = allBlocksInOrder(model.root);
  const blocks = allBlocks.map((block) => disambiguatedBlockId(block, allBlocks));

  // Headings nest by containment. Every occurrence of a repeated sibling name
  // gets its own key via disambiguatedHeadingText, so — given buildModel's
  // collision guard — keys are unique by construction and no merge is needed.
  const buildTree = (node: SectionNode, into: HeadingTree): void => {
    for (const child of node.children) {
      if (!child.heading) {
        continue;
      }
      const key = disambiguatedHeadingText(child);
      const subtree: HeadingTree = Object.create(null) as HeadingTree;
      into[key] = subtree;
      buildTree(child, subtree);
    }
  };
  buildTree(model.root, headings);

  return {
    version: model.version,
    frontmatterFields: model.frontmatter.entries.map((entry) => entry.key),
    headings,
    blocks,
  };
};

/**
 * Enumerate every addressable heading in a {@link HeadingTree} as its
 * containment-path target, in document order.  This is the walk a consumer runs
 * to turn a map into the list of heading addresses it can patch.
 */
export const headingTreePaths = (tree: HeadingTree): string[][] => {
  const paths: string[][] = [];
  const walk = (node: HeadingTree, prefix: string[]): void => {
    for (const [text, children] of Object.entries(node)) {
      const path = [...prefix, text];
      paths.push(path);
      walk(children, path);
    }
  };
  walk(tree, []);
  return paths;
};
