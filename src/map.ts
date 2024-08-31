import marked, { Token } from "marked";

import {
  DocumentMap,
  DocumentMapMarkerContentPair,
  HeadingMarkerContentPair,
} from "./types";

import {
  CAN_INCLUDE_BLOCK_REFERENCE,
  TARGETABLE_BY_ISOLATED_BLOCK_REFERENCE,
} from "./constants";

function getHeadingPositions(
  document: string,
  tokens: marked.TokensList
): Record<string, HeadingMarkerContentPair> {
  // If the document starts with frontmatter, figure out where
  // the frontmatter ends so we can know where the text of the
  // document begins
  let documentStart = 0;
  if (tokens[0].type === "hr") {
    documentStart = tokens[0].raw.length;
    for (const token of tokens.slice(1)) {
      documentStart += token.raw.length;
      if (token.type === "hr") {
        break;
      }
    }
  }

  const positions: Record<string, HeadingMarkerContentPair> = {
    "": {
      content: {
        start: documentStart,
        end: document.length,
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
      const endHeading = startHeading + headingToken.raw.trim().length;
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
          endContent = document.indexOf(tokens[i].raw.trim(), startContent) - 1;
          break;
        }
      }
      if (endContent === undefined) {
        endContent = document.length;
      }

      const currentHeading: HeadingMarkerContentPair = {
        content: {
          start: startContent,
          end: endContent,
        },
        marker: {
          start: startHeading,
          end: endHeading,
        },
        level: headingLevel,
      };

      // Build the full heading path with parent headings separated by '\t'
      let fullHeadingPath = headingToken.text.trim();
      while (
        stack.length &&
        stack[stack.length - 1].position.level >= headingLevel
      ) {
        stack.pop();
      }

      if (stack.length) {
        const parent = stack[stack.length - 1];
        parent.position.content.end = endContent;
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
  tokens: marked.TokensList
): Record<string, DocumentMapMarkerContentPair> {
  const positions: Record<string, DocumentMapMarkerContentPair> = {};

  let lastBlockDetails:
    | {
        token: Token;
        start: number;
        end: number;
      }
    | undefined = undefined;
  let startContent = 0;
  let endContent = 0;
  marked.walkTokens(tokens, (token) => {
    const blockReferenceRegex = /\^([a-zA-Z0-9_-]+)\s*$/gm;
    startContent = document.indexOf(token.raw.trim(), startContent);
    const match = blockReferenceRegex.exec(token.raw);
    endContent = startContent + (match ? match.index : token.raw.length);
    if (CAN_INCLUDE_BLOCK_REFERENCE.includes(token.type) && match) {
      const name = match[1];
      if (!name || match.index === undefined) {
        return;
      }

      const finalStartContent = {
        start: startContent,
        end: endContent,
      };
      if (token.type === "list_item") {
        finalStartContent.start += 2; // To skip the list markers
      }
      if (
        finalStartContent.start === finalStartContent.end &&
        lastBlockDetails
      ) {
        finalStartContent.start = lastBlockDetails.start;
        finalStartContent.end = lastBlockDetails.end;
      }

      positions[name] = {
        content: finalStartContent,
        marker: {
          start: startContent + match.index + 1, // To skip the ^
          end: startContent + token.raw.length - 1,
        },
      };
    }

    if (TARGETABLE_BY_ISOLATED_BLOCK_REFERENCE.includes(token.type)) {
      lastBlockDetails = {
        token: token,
        start: startContent,
        end: endContent,
      };
    }
  });

  return positions;
}

export const getDocumentMap = (document: string): DocumentMap => {
  const lexer = new marked.Lexer();
  const tokens = lexer.lex(document);

  return {
    heading: getHeadingPositions(document, tokens),
    block: getBlockPositions(document, tokens),
  };
};
