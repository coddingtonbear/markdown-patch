import { rebaseHeadings } from "../levels";

describe("rebaseHeadings", () => {
  test("baseline 0 leaves the value unchanged (root: relative == absolute)", () => {
    const value = "## X\nbody\n";
    const result = rebaseHeadings(value, 0);
    expect(result.text).toBe(value);
    expect(result.warnings).toEqual([]);
  });

  test("content baseline adds the target's level (a `#` becomes a direct child)", () => {
    const result = rebaseHeadings("# Child\ntext\n", 2);
    expect(result.text).toBe("### Child\ntext\n");
    expect(result.warnings).toEqual([]);
  });

  test("markerAndContent baseline (parent level) makes `# Title` a same-level sibling", () => {
    // Target is level 2, its parent is level 1, so baseline 1 -> `# Title` at level 2.
    const result = rebaseHeadings("# Title\nbody\n", 1);
    expect(result.text).toBe("## Title\nbody\n");
  });

  test("rebases every heading in a multi-section fragment", () => {
    const result = rebaseHeadings("# One\na\n# Two\nb\n", 1);
    expect(result.text).toBe("## One\na\n## Two\nb\n");
  });

  test("rebases nested headings preserving their relative depth", () => {
    const result = rebaseHeadings("# Parent\n## Child\n", 2);
    expect(result.text).toBe("### Parent\n#### Child\n");
  });

  test("does not rebase `#` lines inside a fenced code block", () => {
    const value = "# Real\n\n```\n# not a heading\n```\n";
    const result = rebaseHeadings(value, 1);
    expect(result.text).toBe("## Real\n\n```\n# not a heading\n```\n");
  });

  test("warns when a rebased heading exceeds h6 but still writes the hashes", () => {
    const result = rebaseHeadings("### Deep\n", 5); // 3 + 5 = 8
    expect(result.text).toBe("######## Deep\n");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe("heading-depth-overflow");
  });

  test("normalizes CRLF in the value to LF so the engine can apply the document's ending", () => {
    const result = rebaseHeadings("# Child\r\ntext\r\n", 1);
    expect(result.text).toBe("## Child\ntext\n");
  });
});
