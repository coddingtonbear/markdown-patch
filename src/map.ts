import * as marked from "marked";
import { parse as parseYaml } from "yaml";

import {
  DocumentMap,
  DocumentMapMarkerContentPair,
  HeadingMarkerContentPair,
  YamlType,
} from "./types.js";

import {
  CAN_INCLUDE_BLOCK_REFERENCE,
  TARGETABLE_BY_ISOLATED_BLOCK_REFERENCE,
} from "./constants.js";

function getHeadingPositions(
  document: string,
  tokens: marked.TokensList
): Record<string, HeadingMarkerContentPair> {
  // If the document starts with frontmatter, figure out where
  // the frontmatter ends so we can know where the text of the
  // document begins
  let documentStart = 0;
  if (tokens[0].type === "hr") {
    documentStart = tokens[0].raw.length + 1;
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
          start: startContent,
          end: endContent,
        },
        marker: {
          start: startHeading,
          end: endHeading,
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
        token: marked.Token;
        start: number;
        end: number;
      }
    | undefined = undefined;
  let startContent = 0;
  let endContent = 0;
  let endMarker = 0;
  marked.walkTokens(tokens, (token) => {
    const blockReferenceRegex = /(?:\s+|^)\^([a-zA-Z0-9_-]+)\s*$/;
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
        content: finalStartContent,
        marker: {
          start: startMarker,
          end: endMarker,
        },
      };
    }

    if (TARGETABLE_BY_ISOLATED_BLOCK_REFERENCE.includes(token.type)) {
      lastBlockDetails = {
        token: token,
        start: startContent,
        end: endContent - 1,
      };
    }
  });

  return positions;
}

function getYamlType(value: any): YamlType {
  if (value === null) {
    return YamlType.null;
  }
  if (Array.isArray(value)) {
    return YamlType.list;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return YamlType.map;
  }
  switch (typeof value) {
    case "string":
      return YamlType.string;
    case "number":
      return YamlType.number;
    case "boolean":
      return YamlType.boolean;
    default:
      return YamlType.unknown;
  }
}

function getFrontmatterFields(
  document: string,
  tokens: marked.TokensList
): Record<string, YamlType> {
  let frontmatterStart = 0;
  let frontmatterEnd = 0;
  if (tokens[0].type === "hr") {
    frontmatterStart = tokens[0].raw.length;
    frontmatterEnd = frontmatterStart;
    for (const token of tokens.slice(1)) {
      if (token.type === "hr") {
        break;
      }
      frontmatterEnd += token.raw.length;
    }
  }
  if (frontmatterStart === 0 || frontmatterEnd === 0) {
    return {};
  }

  const value = parseYaml(document.slice(frontmatterStart, frontmatterEnd));
  if (
    !(
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      Object.keys(value).every((key) => typeof key === "string")
    )
  ) {
    return {};
  }

  const result: Record<string, YamlType> = {};
  for (const key in value) {
    if (value.hasOwnProperty(key)) {
      result[key] = getYamlType(value[key]);
    }
  }
  return result;
}

export const getDocumentMap = (document: string): DocumentMap => {
  const lexer = new marked.Lexer();
  const tokens = lexer.lex(document);

  return {
    heading: getHeadingPositions(document, tokens),
    block: getBlockPositions(document, tokens),
    frontmatter: getFrontmatterFields(document, tokens),
  };
};
