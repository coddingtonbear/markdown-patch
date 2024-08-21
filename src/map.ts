import { DocumentMap, HeadingMarkerContentPair } from "./types";

function getHeadingPositions(document: string) {
  const headingPattern = /^(#{1,6})\s+(.*)/gm;

  const positions: Record<string, HeadingMarkerContentPair> = {};
  const stack: Array<{ heading: string; position: HeadingMarkerContentPair }> =
    [];
  let match: RegExpExecArray | null;

  while ((match = headingPattern.exec(document)) !== null) {
    const [fullMatch, hashes, headingText] = match;
    const startHeading = match.index;
    const endHeading = match.index + fullMatch.length + 1;
    const headingLevel = hashes.length;

    // Determine the start of the content after this heading
    const startContent = endHeading;

    // End of the content before the next heading of the same or higher level, or end of document
    const nextMatch = headingPattern.exec(document);
    const nextStart = nextMatch ? nextMatch.index : document.length;

    const endContent = nextStart;

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
    block: {},
  };
};
