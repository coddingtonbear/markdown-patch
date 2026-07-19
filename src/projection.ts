import { DocumentModel, SectionNode } from "./model.js";

/**
 * The terse, context-cheap public view of a document, derived from the
 * {@link DocumentModel}.  It carries no in-band grammar: headings are plain
 * null-padded arrays and block references are bare ids.
 */
export interface PublicMap {
  /** Content-hash token; pass back as an `ifMatch` precondition. */
  version: string;
  /** Top-level frontmatter field names, in document order. */
  frontmatterFields: string[];
  /**
   * One entry per heading, in document order.  Each entry is an array whose
   * length equals the heading's level: index `i` holds the text of the heading
   * at level `i + 1` on the path to this heading, `null` where that level is
   * skipped, and `""` for an empty-text heading.
   */
  headings: (string | null)[][];
  /** Block reference ids, bare (no `^`), in document order. */
  blocks: string[];
}

/**
 * The null-padded address of a heading-bearing section: an array whose length
 * is the heading's level, index `i` holding the text of the level-`i+1` heading
 * on the path to this node, `null` for a skipped level and `""` for an
 * empty-text heading.  Shared with the resolver so map addresses and target
 * matching use one definition.
 */
export const headingPath = (node: SectionNode): (string | null)[] => {
  const level = node.heading!.level;
  const path: (string | null)[] = new Array(level).fill(null);
  let current: SectionNode | null = node;
  while (current && current.heading) {
    path[current.heading.level - 1] = current.heading.text;
    current = current.parent;
  }
  return path;
};

/** Project the internal model into the public map consumers receive. */
export const projectMap = (model: DocumentModel): PublicMap => {
  const headings: (string | null)[][] = [];
  const blocks: string[] = [];

  const walk = (node: SectionNode): void => {
    if (node.heading) {
      headings.push(headingPath(node));
    }
    // A section's own blocks precede its child sections in document order.
    for (const block of node.blocks) {
      blocks.push(block.id);
    }
    for (const child of node.children) {
      walk(child);
    }
  };
  walk(model.root);

  return {
    version: model.version,
    frontmatterFields: model.frontmatter.entries.map((entry) => entry.key),
    headings,
    blocks,
  };
};
