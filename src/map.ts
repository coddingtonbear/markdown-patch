import marked from "marked";

import { DocumentMap, HeadingMarkerContentPair } from "./types";

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

export const getDocumentMap = (document: string): DocumentMap => {
  const lexer = new marked.Lexer();
  const tokens = lexer.lex(document);

  return {
    heading: getHeadingPositions(document, tokens),
  };
};
