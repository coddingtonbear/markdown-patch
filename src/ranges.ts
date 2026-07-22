/**
 * Range geometry over model nodes: turn a resolved node into the byte spans an
 * operation acts on.  Both `content` and `markerAndContent` act on a section's
 * whole *subtree* — which is contiguous in document order because a section's
 * descendants immediately follow its content and gap — the difference being that
 * `content` excludes the heading line itself (the subtree *minus* its own
 * marker) while `markerAndContent` includes it.
 */

import { DocumentRange } from "./types.js";
import { BlockNode, SectionNode } from "./model.js";

/** The deepest, last node within a section's subtree (the section itself if a leaf). */
export const lastDescendant = (section: SectionNode): SectionNode =>
  section.children.length > 0
    ? lastDescendant(section.children[section.children.length - 1])
    : section;

const subtreeStart = (section: SectionNode): number =>
  section.marker ? section.marker.start : section.body.start;

/**
 * The subtree's visible extent: the heading line through the last descendant's
 * content, excluding the final separator gap.  Used for whole-section replace
 * and sibling-insert anchoring.
 */
export const subtreeContentRange = (section: SectionNode): DocumentRange => ({
  start: subtreeStart(section),
  end: lastDescendant(section).trailingGap.start,
});

/**
 * The `content` scope of a heading: everything below the heading line through
 * the last descendant's content, excluding the heading line itself and the final
 * trailing gap.  This is the whole subtree *minus* its own marker — the span 1.x
 * `content` addressed — so a single content read/replace round-trips a section's
 * full body, subsections included.  For a leaf section it coincides with the
 * direct body (`section.body`).
 */
export const headingContentRange = (section: SectionNode): DocumentRange => ({
  start: section.body.start,
  end: lastDescendant(section).trailingGap.start,
});

/** The subtree's end including its trailing separator gap; used for clean deletes. */
export const subtreeEnd = (section: SectionNode): number =>
  lastDescendant(section).trailingGap.end;

export class RootHasNoMarkerError extends Error {}

/** The heading label line span; throws for the markerless document root. */
export const headingMarkerRange = (section: SectionNode): DocumentRange => {
  if (!section.marker) {
    throw new RootHasNoMarkerError("the document root has no marker to address");
  }
  return section.marker;
};

/** The block's addressable text (the preceding block, for an isolated `^id`). */
export const blockContentRange = (block: BlockNode): DocumentRange => block.content;

/** The `^id` token span. */
export const blockMarkerRange = (block: BlockNode): DocumentRange => block.marker;

/** The whole block: content through marker (they are contiguous for inline ids). */
export const blockFullRange = (block: BlockNode): DocumentRange => ({
  start: Math.min(block.content.start, block.marker.start),
  end: Math.max(block.content.end, block.marker.end),
});
