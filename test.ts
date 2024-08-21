function findHeadingPositions(markdownText: string) {
  // Regex to match Markdown headings
  const headingPattern = /^(#{1,6})\s+(.*)/gm;

  interface HeadingPosition {
    headingStart: number;
    headingEnd: number;
    contentStart: number;
    contentEnd: number;
    headingLevel: number;
    headingText: string;
  }

  const positions: Record<string, HeadingPosition> = {};
  const stack: Array<{ heading: string; position: HeadingPosition }> = [];
  let match: RegExpExecArray | null;

  while ((match = headingPattern.exec(markdownText)) !== null) {
    const [fullMatch, hashes, headingText] = match;
    const startHeading = match.index;
    const endHeading = match.index + fullMatch.length;
    const headingLevel = hashes.length;

    // Determine the start of the content after this heading
    const startContent = endHeading;

    // End of the content before the next heading of the same or higher level, or end of document
    const nextMatch = headingPattern.exec(markdownText);
    const nextStart = nextMatch ? nextMatch.index : markdownText.length;

    const endContent = nextStart - 1;

    const currentHeading: HeadingPosition = {
      headingStart: startHeading,
      headingEnd: endHeading,
      contentStart: startContent,
      contentEnd: endContent,
      headingLevel: headingLevel,
      headingText: headingText.trim(),
    };

    // Build the full heading path with parent headings separated by '\t'
    let fullHeadingPath = headingText.trim();
    while (
      stack.length &&
      stack[stack.length - 1].position.headingLevel >= headingLevel
    ) {
      stack.pop();
    }

    if (stack.length) {
      const parent = stack[stack.length - 1];
      parent.position.contentEnd = endContent;
      fullHeadingPath = `${parent.heading}\t${fullHeadingPath}`;
    }

    positions[fullHeadingPath] = currentHeading;
    stack.push({ heading: fullHeadingPath, position: currentHeading });

    // Reset lastIndex for future matches
    headingPattern.lastIndex = nextStart;
  }

  return positions;
}

// Example usage
const markdownText = `# Heading 1
This is some content under heading 1.

## Heading 1.1
This is some content under heading 1.1.

### Heading 1.1.1
This is some content under heading 1.1.1.

## Heading 1.2
This is some content under heading 1.2.

# Heading 2
This is some content under heading 2.
`;

const positions = findHeadingPositions(markdownText);
for (const [heading, pos] of Object.entries(positions)) {
  console.log(
    `Heading path: '${heading}' starts at ${pos.headingStart} and ends at ${pos.headingEnd}.`
  );
  console.log(
    `Content starts at ${pos.contentStart} and ends at ${pos.contentEnd}.`
  );
  console.log("-".repeat(40));
}
console.log(JSON.stringify(positions, undefined, 4));
