import { DocumentModel, SectionNode } from "./model.js";

/**
 * A nested map of heading text to its child headings, mirroring the document's
 * section nesting.  A leaf heading maps to an empty object.  The tree carries no
 * heading levels: nesting is by containment, so a level skipped in the source
 * (an `h1` followed directly by an `h3`) does not appear as a hole — the engine
 * owns depth and a consumer never needs it.
 *
 * Sibling headings are keyed by text, so a repeated sibling name cannot appear
 * twice: the **first** occurrence in document order wins and later same-name
 * siblings (with their subtrees) are omitted, matching the resolver, which
 * resolves an address to the first match in document order.  To reach a heading
 * shadowed by an earlier duplicate, target the next-higher heading or the
 * document as a whole.
 *
 * future: surface shadowed duplicate headings (e.g. under a reserved section of
 * the map) so they are visible and addressable rather than silently omitted.
 */
export interface HeadingTree {
  [headingText: string]: HeadingTree;
}

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
  /** Block reference ids, bare (no `^`), in document order. */
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
    path.push(current.heading.text);
    current = current.parent;
  }
  return path.reverse();
};

/** Project the internal model into the public map consumers receive. */
export const projectMap = (model: DocumentModel): PublicMap => {
  const headings: HeadingTree = {};
  const blocks: string[] = [];

  // Blocks are addressed globally by bare id, so every block is listed in
  // document order — including any under a heading shadowed by a duplicate.
  const collectBlocks = (node: SectionNode): void => {
    for (const block of node.blocks) {
      blocks.push(block.id);
    }
    for (const child of node.children) {
      collectBlocks(child);
    }
  };
  collectBlocks(model.root);

  // Headings nest by containment, first-wins on a repeated sibling name.
  const buildTree = (node: SectionNode, into: HeadingTree): void => {
    for (const child of node.children) {
      if (!child.heading) {
        continue;
      }
      const { text } = child.heading;
      if (Object.prototype.hasOwnProperty.call(into, text)) {
        continue; // shadowed duplicate; see {@link HeadingTree}
      }
      const subtree: HeadingTree = {};
      into[text] = subtree;
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
