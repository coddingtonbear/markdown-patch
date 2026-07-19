import * as marked from "marked";
import { parse as parseYaml } from "yaml";
import { createHash } from "crypto";

import { DocumentRange } from "./types.js";
import {
  CAN_INCLUDE_BLOCK_REFERENCE,
  TARGETABLE_BY_ISOLATED_BLOCK_REFERENCE,
} from "./constants.js";

/**
 * A single section of a document: a heading plus the body that belongs
 * directly to it (i.e. up to its first child heading), together with the
 * blank-line separator the library owns.  Child sections are stored as an
 * ordered list; the tree *is* the nesting.  Nothing contested is stored here
 * (no path, no occurrence counter); those are derived when projecting or
 * resolving a target.
 */
export interface SectionNode {
  /** `null` for the synthetic document root. `level` is the *source* heading
   * depth as written; canonical levels are derived, not stored. */
  heading: { text: string; level: number } | null;
  /** The heading line (`# Foo\n`); `null` for the root. */
  marker: DocumentRange | null;
  /** The section's direct body, excluding {@link trailingGap}. */
  content: DocumentRange;
  /** The blank-line separator following {@link content} that the library owns. */
  trailingGap: DocumentRange;
  /** Child sections, in document order. */
  children: SectionNode[];
  /** `^id`-bearing blocks that live directly in this section's body. */
  blocks: BlockNode[];
  parent: SectionNode | null;
}

/**
 * A `^id`-bearing block. Blocks are an *overlay* onto the section tree: their
 * ranges fall within their containing section's {@link SectionNode.content},
 * they do not tile the document themselves.
 */
export interface BlockNode {
  id: string;
  /** marked token type: `paragraph`, `table`, `list`, `blockquote`, … */
  kind: string;
  /** Column header texts, for `table` blocks only. */
  columns?: string[];
  /**
   * True when the `^id` sits alone on its own line and therefore targets the
   * *preceding* block (Obsidian's isolated-block-reference rule): in that case
   * {@link content} is the preceding block's span and {@link marker} is the
   * detached `^id` line that follows it.  False for an inline `^id` trailing a
   * paragraph/table row, where content and marker are contiguous.
   */
  isolated: boolean;
  /**
   * The region the block id addresses.  For an inline block this is the token
   * text preceding the `^id` marker; for an isolated block it is the whole
   * preceding block.  Never includes a trailing line ending (Obsidian excludes
   * it from block spans).
   */
  content: DocumentRange;
  /** The `^id` token span, with any trailing line ending excluded. */
  marker: DocumentRange;
  /** The blank-line separator following the block. */
  trailingGap: DocumentRange;
  section: SectionNode;
}

export interface FrontmatterEntry {
  key: string;
  value: unknown;
  /** The full `key: value` span within the frontmatter block. */
  entryRange: DocumentRange;
  /** The value span within {@link entryRange}. */
  valueRange: DocumentRange;
}

export interface DocumentModel {
  /** Short content hash of the source document; the future `ifMatch` token. */
  version: string;
  lineEnding: "\n" | "\r\n";
  frontmatter: {
    entries: FrontmatterEntry[];
    /** The `---` … `---` block span, or `null` when there is no frontmatter. */
    block: DocumentRange | null;
  };
  root: SectionNode;
}

interface PreprocessedDocument {
  content: string;
  contentOffset: number;
  frontmatterText: string | null;
}

const FRONTMATTER_REGEX =
  /^---(?:\r\n|\r|\n)(?:---(?:\r\n|\r|\n|$)|([\s\S]*?)(?:\r\n|\r|\n)---(?:\r\n|\r|\n|$))/;

const preProcess = (document: string): PreprocessedDocument => {
  const match = FRONTMATTER_REGEX.exec(document);
  if (!match) {
    return { content: document, contentOffset: 0, frontmatterText: null };
  }
  const contentOffset = match[0].length;
  return {
    content: document.slice(contentOffset),
    contentOffset,
    frontmatterText: match[1] ?? "",
  };
};

const versionOf = (document: string): string =>
  createHash("sha256").update(document, "utf8").digest("hex").slice(0, 6);

/**
 * marked collapses every `\r\n` (and lone `\r`) to `\n` in `token.raw`, so
 * offsets accumulated from raw lengths drift against a CRLF source.  We
 * therefore tokenize a normalized copy and keep a map from each normalized
 * offset back to the original offset, so stored ranges address the real bytes.
 */
const normalizeLineEndings = (
  input: string
): { normalized: string; toOriginal: number[] } => {
  const toOriginal: number[] = [];
  let normalized = "";
  let i = 0;
  while (i < input.length) {
    toOriginal.push(i);
    if (input[i] === "\r" && input[i + 1] === "\n") {
      normalized += "\n";
      i += 2;
    } else if (input[i] === "\r") {
      normalized += "\n";
      i += 1;
    } else {
      normalized += input[i];
      i += 1;
    }
  }
  toOriginal.push(input.length);
  return { normalized, toOriginal };
};

/** Translate a normalized-content offset into an absolute original offset. */
type Abs = (normalizedOffset: number) => number;

/**
 * Split a content-space range into its visible content and its trailing
 * blank-line separator.  The last visible line keeps exactly one line ending
 * as part of the content; any further line endings are the trailing gap.  A
 * range that is entirely line endings is all gap (an empty section body).
 */
const splitTrailingGap = (
  content: string,
  start: number,
  end: number
): { contentEnd: number } => {
  let visibleEnd = end;
  while (
    visibleEnd > start &&
    (content[visibleEnd - 1] === "\n" || content[visibleEnd - 1] === "\r")
  ) {
    visibleEnd--;
  }
  if (visibleEnd === start) {
    // Entire range is line endings: no visible content, all gap.
    return { contentEnd: start };
  }
  // Keep the terminating line ending of the final visible line with content.
  let contentEnd = visibleEnd;
  if (content[contentEnd] === "\r" && content[contentEnd + 1] === "\n") {
    contentEnd += 2;
  } else if (content[contentEnd] === "\n" || content[contentEnd] === "\r") {
    contentEnd += 1;
  }
  return { contentEnd };
};

interface HeadingSpan {
  text: string;
  level: number;
  /** content-space offset of the heading line start. */
  markerStart: number;
  /** content-space offset just past the heading line's terminator. */
  markerEnd: number;
}

/** Locate every top-level heading token with exact content-space offsets. */
const findHeadings = (
  content: string,
  tokens: marked.TokensList
): HeadingSpan[] => {
  const headings: HeadingSpan[] = [];
  let offset = 0;
  for (const token of tokens) {
    if (token.type === "heading") {
      const heading = token as marked.Tokens.Heading;
      const markerStart = offset;
      let markerEnd = markerStart + heading.raw.trimEnd().length;
      if (content[markerEnd] === "\r" && content[markerEnd + 1] === "\n") {
        markerEnd += 2;
      } else if (content[markerEnd] === "\n" || content[markerEnd] === "\r") {
        markerEnd += 1;
      }
      headings.push({
        text: heading.text.trim(),
        level: heading.depth,
        markerStart,
        markerEnd,
      });
    }
    offset += token.raw.length;
  }
  return headings;
};

const buildSectionTree = (
  content: string,
  abs: Abs,
  headings: HeadingSpan[]
): SectionNode => {
  const contentLength = content.length;

  const root: SectionNode = {
    heading: null,
    marker: null,
    content: { start: 0, end: 0 },
    trailingGap: { start: 0, end: 0 },
    children: [],
    blocks: [],
    parent: null,
  };

  // Root's direct body runs from the top of the content region to the first
  // heading (or the whole content region when there are no headings).
  const rootBodyStart = 0;
  const rootBodyEnd = headings.length ? headings[0].markerStart : contentLength;
  const rootSplit = splitTrailingGap(content, rootBodyStart, rootBodyEnd);
  root.content = { start: abs(rootBodyStart), end: abs(rootSplit.contentEnd) };
  root.trailingGap = { start: abs(rootSplit.contentEnd), end: abs(rootBodyEnd) };

  const stack: SectionNode[] = [root];

  headings.forEach((heading, index) => {
    // A section's direct body ends at the next heading of any level (which is
    // either its first child or the heading that closes it), or the end of the
    // content region.
    const bodyStart = heading.markerEnd;
    const bodyEnd =
      index + 1 < headings.length
        ? headings[index + 1].markerStart
        : contentLength;
    const split = splitTrailingGap(content, bodyStart, bodyEnd);

    const node: SectionNode = {
      heading: { text: heading.text, level: heading.level },
      marker: { start: abs(heading.markerStart), end: abs(heading.markerEnd) },
      content: { start: abs(bodyStart), end: abs(split.contentEnd) },
      trailingGap: { start: abs(split.contentEnd), end: abs(bodyEnd) },
      children: [],
      blocks: [],
      parent: null,
    };

    while (
      stack.length > 1 &&
      stack[stack.length - 1].heading!.level >= heading.level
    ) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    node.parent = parent;
    parent.children.push(node);
    stack.push(node);
  });

  return root;
};

const forEachSection = (
  root: SectionNode,
  visit: (node: SectionNode) => void
): void => {
  visit(root);
  for (const child of root.children) {
    forEachSection(child, visit);
  }
};

/** Find the deepest section whose direct body contains the given offset. */
const sectionContaining = (root: SectionNode, offset: number): SectionNode => {
  let best = root;
  forEachSection(root, (node) => {
    if (offset >= node.content.start && offset < node.trailingGap.end) {
      // Prefer the deepest (most specific) containing section.
      if (node.content.start >= best.content.start) {
        best = node;
      }
    }
  });
  return best;
};

const BLOCK_REFERENCE_REGEX = /[^\S\r\n]*\^([a-zA-Z0-9_-]+)\s*$/;

/**
 * Back up over trailing line endings so a boundary sits just past the last
 * visible character (`content` is normalized, so only `\n` occurs).  Obsidian's
 * block spans exclude every trailing newline — a token's raw may carry one (an
 * inline paragraph) or a following blank line (a table) — so block boundaries
 * are trimmed the same way.
 */
const stripTrailingEol = (content: string, end: number, start: number): number => {
  let trimmed = end;
  while (trimmed > start && content[trimmed - 1] === "\n") {
    trimmed--;
  }
  return trimmed;
};

const findBlocks = (
  content: string,
  abs: Abs,
  tokens: marked.TokensList,
  root: SectionNode
): BlockNode[] => {
  const blocks: BlockNode[] = [];
  let searchFrom = 0;
  // The most recent block-level token an isolated `^id` line can bind to, in
  // content space with its trailing newline stripped.  Mirrors the old engine's
  // `lastBlockDetails` and matches Obsidian, which reports an isolated block's
  // position as the preceding block rather than the marker line.
  let lastIsolatedTarget: { start: number; end: number } | null = null;

  marked.walkTokens(tokens, (token) => {
    const found = content.indexOf(token.raw, searchFrom);
    if (found === -1) {
      // Inner blockquote tokens omit their `> ` prefix and never appear
      // verbatim; skip them rather than corrupt the running offset.
      return;
    }
    searchFrom = found;
    const rawEnd = found + token.raw.length;

    const match = BLOCK_REFERENCE_REGEX.exec(token.raw);
    if (match && CAN_INCLUDE_BLOCK_REFERENCE.includes(token.type)) {
      const id = match[1];
      if (id) {
        const markerStart = found + match.index;
        const markerEnd = stripTrailingEol(content, rawEnd, found);
        let contentStart = found;
        let contentEnd = markerStart;
        let isolated = false;
        if (contentStart === contentEnd && lastIsolatedTarget) {
          // Nothing precedes the `^id` on its line: it targets the block above.
          contentStart = lastIsolatedTarget.start;
          contentEnd = lastIsolatedTarget.end;
          isolated = true;
        }
        const section = sectionContaining(root, abs(contentStart));
        const block: BlockNode = {
          id,
          kind: token.type,
          isolated,
          content: { start: abs(contentStart), end: abs(contentEnd) },
          marker: { start: abs(markerStart), end: abs(markerEnd) },
          trailingGap: { start: abs(markerEnd), end: abs(markerEnd) },
          section,
        };
        if (token.type === "table") {
          block.columns = (token as marked.Tokens.Table).header.map(
            (cell) => cell.text
          );
        }
        blocks.push(block);
        section.blocks.push(block);
      }
    }

    if (TARGETABLE_BY_ISOLATED_BLOCK_REFERENCE.includes(token.type)) {
      lastIsolatedTarget = {
        start: found,
        end: stripTrailingEol(content, rawEnd, found),
      };
    }
  });

  return blocks;
};

const findLineEnding = (document: string): "\n" | "\r\n" =>
  document.indexOf("\r\n") > -1 ? "\r\n" : "\n";

const buildFrontmatter = (
  document: string,
  frontmatterText: string | null,
  contentOffset: number
): DocumentModel["frontmatter"] => {
  if (frontmatterText === null) {
    return { entries: [], block: null };
  }
  const block: DocumentRange = { start: 0, end: contentOffset };
  const parsed = parseYaml(frontmatterText.trim());
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { entries: [], block };
  }
  const parsedRecord = parsed as Record<string, unknown>;

  // The inner YAML begins just past the opening delimiter and runs for
  // `frontmatterText.length`; the closing `---` follows.  Locate each
  // top-level `key:` at a line start so callers get real ranges (used later
  // for key-scoped splicing).
  const openingLength =
    /^---(?:\r\n|\r|\n)/.exec(document)?.[0].length ?? 4;
  const innerStart = openingLength;
  const innerEnd = innerStart + frontmatterText.length;

  const keyStarts: Array<{ key: string; start: number; colon: number }> = [];
  let lineStart = innerStart;
  for (const line of frontmatterText.split(/(?<=\n)/)) {
    const keyMatch = /^([^\s:][^:]*):/.exec(line);
    if (keyMatch && keyMatch[1].trim() in parsedRecord) {
      keyStarts.push({
        key: keyMatch[1].trim(),
        start: lineStart,
        colon: lineStart + keyMatch[0].length,
      });
    }
    lineStart += line.length;
  }

  const entries: FrontmatterEntry[] = keyStarts.map((entry, idx) => {
    const end = keyStarts[idx + 1]?.start ?? innerEnd;
    return {
      key: entry.key,
      value: parsedRecord[entry.key],
      entryRange: { start: entry.start, end },
      valueRange: { start: entry.colon, end },
    };
  });

  return { entries, block };
};

/**
 * Build the internal document model: an ordered tree of sections (each owning
 * its heading, direct body and trailing gap), a block overlay indexed into
 * those sections, and the frontmatter.  Every byte of the content region
 * belongs to exactly one section's marker, content or trailingGap, so the tree
 * losslessly partitions the document.
 */
export const buildModel = (document: string): DocumentModel => {
  const { content, contentOffset, frontmatterText } = preProcess(document);
  const { normalized, toOriginal } = normalizeLineEndings(content);
  const abs: Abs = (n) => contentOffset + toOriginal[n];
  const tokens = new marked.Lexer().lex(normalized);
  const headings = findHeadings(normalized, tokens);
  const root = buildSectionTree(normalized, abs, headings);
  findBlocks(normalized, abs, tokens, root);

  return {
    version: versionOf(document),
    lineEnding: findLineEnding(document),
    frontmatter: buildFrontmatter(document, frontmatterText, contentOffset),
    root,
  };
};

/** Iterate every section, root first, in document order. Exposed for tests. */
export const eachSection = forEachSection;

/**
 * Reconstruct the source document from the section partition. Used to prove the
 * tree tiles the content region losslessly.
 */
export const serializeModel = (
  document: string,
  model: DocumentModel
): string => {
  const frontmatter = model.frontmatter.block
    ? document.slice(model.frontmatter.block.start, model.frontmatter.block.end)
    : "";
  const parts: string[] = [];
  const emit = (node: SectionNode): void => {
    if (node.marker) {
      parts.push(document.slice(node.marker.start, node.marker.end));
    }
    parts.push(document.slice(node.content.start, node.content.end));
    parts.push(document.slice(node.trailingGap.start, node.trailingGap.end));
    for (const child of node.children) {
      emit(child);
    }
  };
  emit(model.root);
  return frontmatter + parts.join("");
};
