import * as marked from "marked";
import { parse as parseYaml } from "yaml";

import {
  DocumentMap,
  DocumentMapMarkerContentPair,
  HeadingMarkerContentPair,
  PreprocessedDocument,
} from "./types.js";

import {
  CAN_INCLUDE_BLOCK_REFERENCE,
  TARGETABLE_BY_ISOLATED_BLOCK_REFERENCE,
} from "./constants.js";

function getHeadingPositions(
  document: string,
  tokens: marked.TokensList,
  contentOffset: number
): Record<string, HeadingMarkerContentPair> {
  const positions: Record<string, HeadingMarkerContentPair> = {
    "": {
      content: {
        start: contentOffset,
        end: document.length + contentOffset,
      },
      marker: {
        start: 0,
        end: 0,
      },
      level: 0,
    },
  };
  const stack: Array<{ heading: string; position: HeadingMarkerContentPair }> =
    [];

  let currentPosition = 0;

  tokens.forEach((token, index) => {
    if (token.type === "heading") {
      const headingToken = token as marked.Tokens.Heading;

      const startHeading = document.indexOf(
        headingToken.raw.trim(),
        currentPosition
      );
      const endHeading = startHeading + headingToken.raw.trim().length + 1;
      const headingLevel = headingToken.depth;

      // Determine the start of the content after this heading
      const startContent = endHeading;

      // Determine the end of the content before the next heading of the same or higher level, or end of document
      let endContent: number | undefined = undefined;
      for (let i = index + 1; i < tokens.length; i++) {
        if (
          tokens[i].type === "heading" &&
          (tokens[i] as marked.Tokens.Heading).depth <= headingLevel
        ) {
          endContent = document.indexOf(tokens[i].raw.trim(), startContent);
          break;
        }
      }
      if (endContent === undefined) {
        endContent = document.length;
      }

      const currentHeading: HeadingMarkerContentPair = {
        content: {
          start: startContent + contentOffset,
          end: endContent + contentOffset,
        },
        marker: {
          start: startHeading + contentOffset,
          end: endHeading + contentOffset,
        },
        level: headingLevel,
      };

      // Build the full heading path with parent headings separated by \u001f
      let fullHeadingPath = headingToken.text.trim();
      while (
        stack.length &&
        stack[stack.length - 1].position.level >= headingLevel
      ) {
        stack.pop();
      }

      if (stack.length) {
        const parent = stack[stack.length - 1];
        parent.position.content.end = endContent + contentOffset;
        fullHeadingPath = `${parent.heading}\u001f${fullHeadingPath}`;
      }

      positions[fullHeadingPath] = currentHeading;
      stack.push({ heading: fullHeadingPath, position: currentHeading });

      currentPosition = endHeading;
    }
  });

  return positions;
}

function getBlockPositions(
  document: string,
  tokens: marked.TokensList,
  contentOffset: number
): Record<string, DocumentMapMarkerContentPair> {
  const positions: Record<string, DocumentMapMarkerContentPair> = {};

  let lastBlockDetails:
    | {
        token: marked.Token;
        start: number;
        end: number;
      }
    | undefined = undefined;
  let startContent = 0;
  let endContent = 0;
  let endMarker = 0;
  marked.walkTokens(tokens, (token) => {
    const blockReferenceRegex = /[^\S\r\n]*\^([a-zA-Z0-9_-]+)\s*$/;
    startContent = document.indexOf(token.raw, startContent);
    const match = blockReferenceRegex.exec(token.raw);
    endContent = startContent + (match ? match.index : token.raw.length);
    const startMarker = match ? startContent + match.index : -1;
    endMarker = startContent + token.raw.length;
    // The end of a list item token sometimes doesn't include the trailing
    // newline -- i'm honestly not sure why, but treating it as
    // included here would simplify my implementation
    if (
      document.slice(endMarker - 1, endMarker) !== "\n" &&
      document.slice(endMarker, endMarker + 1) === "\n"
    ) {
      endMarker += 1;
    } else if (
      document.slice(endMarker - 2, endMarker) !== "\r\n" &&
      document.slice(endMarker, endMarker + 2) === "\r\n"
    ) {
      endMarker += 2;
    }
    if (CAN_INCLUDE_BLOCK_REFERENCE.includes(token.type) && match) {
      const name = match[1];
      if (!name || match.index === undefined) {
        return;
      }

      const finalStartContent = {
        start: startContent,
        end: endContent,
      };
      if (
        finalStartContent.start === finalStartContent.end &&
        lastBlockDetails
      ) {
        finalStartContent.start = lastBlockDetails.start;
        finalStartContent.end = lastBlockDetails.end;
      }

      positions[name] = {
        content: {
          start: finalStartContent.start + contentOffset,
          end: finalStartContent.end + contentOffset,
        },
        marker: {
          start: startMarker + contentOffset,
          end: endMarker + contentOffset,
        },
      };
    }

    if (TARGETABLE_BY_ISOLATED_BLOCK_REFERENCE.includes(token.type)) {
      // Apply the same trailing-newline adjustment as endMarker: if the raw
      // doesn't include the trailing newline but the document has one right
      // after, treat it as included so the -1 correctly strips it.
      let adjustedEndContent = endContent;
      if (
        document.slice(adjustedEndContent - 1, adjustedEndContent) !== "\n" &&
        document.slice(adjustedEndContent, adjustedEndContent + 1) === "\n"
      ) {
        adjustedEndContent += 1;
      }
      lastBlockDetails = {
        token: token,
        start: startContent,
        end: adjustedEndContent - 1,
      };
    }
  });

  return positions;
}

function preProcess(document: string): PreprocessedDocument {
  const frontmatterRegex =
    /^---(?:\r\n|\r|\n)([\s\S]*?)(?:\r\n|\r|\n)---(?:\r\n|\r|\n|$)/;

  let content: string;
  let contentOffset = 0;
  let frontmatter: Record<string, any>;

  const match = frontmatterRegex.exec(document);
  if (match) {
    const frontmatterText = match[1].trim(); // Captured frontmatter content
    contentOffset = match[0].length; // Length of the entire frontmatter section including delimiters

    frontmatter = parseYaml(frontmatterText);
    content = document.slice(contentOffset);
  } else {
    content = document;
    frontmatter = {};
  }

  return {
    content,
    contentOffset,
    frontmatter,
  };
}

export const getDocumentMap = (document: string): DocumentMap => {
  const { frontmatter, contentOffset, content } = preProcess(document);

  const lexer = new marked.Lexer();
  const tokens = lexer.lex(content);

  const lineEnding = document.indexOf("\r\n") > -1 ? "\r\n" : "\n";

  return {
    heading: getHeadingPositions(content, tokens, contentOffset),
    block: getBlockPositions(content, tokens, contentOffset),
    frontmatter: frontmatter,
    contentOffset: contentOffset,
    lineEnding,
  };
};
