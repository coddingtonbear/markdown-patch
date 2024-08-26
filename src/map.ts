import {
  DocumentMap,
  DocumentMapMarkerContentPair,
  HeadingMarkerContentPair,
} from "./types";

function getBlockPositions(
  document: string
): Record<string, DocumentMapMarkerContentPair> {
  const blockRanges: Record<string, DocumentMapMarkerContentPair> = {};
  const lines = document.split("\n");

  let contentStart = 0; // Start position of the current block of content

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    let nextLine = lines[i + 1] || "";
    let match = line.match(/\^(\w+)$/);

    // Check if the caret is at the end of the line
    if (match) {
      const blockNameStart = document.indexOf(match[0], contentStart) + 1;
      const blockNameEnd = blockNameStart + match[0].length - 1;
      const contentEnd = blockNameStart - 2; // Exclude the newline and space before the caret

      const blockName = document.substring(blockNameStart, blockNameEnd);

      blockRanges[blockName] = {
        content: {
          start: contentStart,
          end: contentEnd,
        },
        marker: {
          start: blockNameStart,
          end: blockNameEnd,
        },
      };

      contentStart = document.indexOf("\n", blockNameEnd) + 1; // Update start for next block
    } else if (nextLine.trim().startsWith("^")) {
      // Handle cases where the caret is on its own line, possibly after a newline
      let standaloneMatch = nextLine.trim().match(/^\^(\w+)$/);
      if (standaloneMatch) {
        const blockNameStart =
          document.indexOf(standaloneMatch[0], contentStart) + 1;
        const blockNameEnd = blockNameStart + standaloneMatch[0].length - 1;
        const contentEnd = document.lastIndexOf("\n", blockNameStart) - 1; // End of content before the caret line

        const blockName = document.substring(blockNameStart, blockNameEnd);

        blockRanges[blockName] = {
          content: {
            start: contentStart,
            end: contentEnd,
          },
          marker: {
            start: blockNameStart,
            end: blockNameEnd,
          },
        };

        contentStart = document.indexOf("\n", blockNameEnd) + 1; // Update start for next block
        i++; // Skip the next line as it has already been processed
      }
    }

    // Update the start of the next content block if no caret is found
    if (!match && !nextLine.trim().startsWith("^")) {
      contentStart = document.indexOf("\n", contentStart) + 1;
    }
  }

  return blockRanges;
}

function getHeadingPositions(
  document: string
): Record<string, HeadingMarkerContentPair> {
  const frontmatterPattern = /^---\s*\n[\s\S]*?\n---\s*\n/;
  const frontmatterMatch = frontmatterPattern.exec(document);
  const documentStart = frontmatterMatch ? frontmatterMatch[0].length - 2 : 0;

  const headingPattern = /^(#{1,6})\s+(.*)/gm;
  const positions: Record<string, HeadingMarkerContentPair> = {
    "": {
      marker: { start: 0, end: 0 },
      content: { start: documentStart, end: document.length },
      level: 0,
    },
  };
  const stack: Array<{ heading: string; position: HeadingMarkerContentPair }> =
    [];
  let match: RegExpExecArray | null;

  while ((match = headingPattern.exec(document)) !== null) {
    const [fullMatch, hashes, headingText] = match;
    const startHeading = match.index;
    const endHeading = match.index + fullMatch.length;
    const headingLevel = hashes.length;

    // Determine the start of the content after this heading
    const startContent = endHeading;

    // End of the content before the next heading of the same or higher level, or end of document
    const nextMatch = headingPattern.exec(document);
    const nextStart = nextMatch ? nextMatch.index : document.length;

    const endContent = nextStart - 1;

    const currentHeading: HeadingMarkerContentPair = {
      marker: {
        start: startHeading,
        end: endHeading,
      },
      content: {
        start: startContent,
        end: endContent,
      },
      level: headingLevel,
    };

    // Build the full heading path with parent headings separated by '\t'
    let fullHeadingPath = headingText.trim();
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

    headingPattern.lastIndex = nextStart;
  }

  return positions;
}

export const getDocumentMap = (document: string): DocumentMap => {
  for (const line of document.split(/\r?\n/)) {
  }

  return {
    heading: getHeadingPositions(document),
    block: getBlockPositions(document),
  };
};
