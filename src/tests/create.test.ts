import { patch } from "../engine";
import { TargetNotFoundError } from "../instructions";

describe("createTargetIfMissing — headings", () => {
  test("creates a missing child under an existing ancestor and places content", () => {
    const result = patch("# A\na-body\n", {
      targetType: "heading",
      target: ["A", "B"],
      operation: "replace",
      scope: "content",
      content: "hi",
      createTargetIfMissing: true,
    });
    expect(result.document).toBe("# A\na-body\n## B\nhi\n");
  });

  test("creates a whole missing chain with consecutive levels (no skipped-depth hole)", () => {
    const result = patch("# A\na\n", {
      targetType: "heading",
      target: ["A", "B", "C"],
      operation: "replace",
      scope: "content",
      content: "x",
      createTargetIfMissing: true,
    });
    expect(result.document).toBe("# A\na\n## B\n### C\nx\n");
  });

  test("creates a top-level heading when no ancestor matches", () => {
    const result = patch("# A\na\n", {
      targetType: "heading",
      target: ["New"],
      operation: "replace",
      scope: "content",
      content: "body",
      createTargetIfMissing: true,
    });
    expect(result.document).toBe("# A\na\n# New\nbody\n");
  });

  test("warns when a created heading would exceed h6", () => {
    const result = patch("###### A\na\n", {
      targetType: "heading",
      target: ["A", "B"], // A is h6, B would be h7
      operation: "replace",
      scope: "content",
      content: "x",
      createTargetIfMissing: true,
    });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe("heading-depth-overflow");
    expect(result.document).toContain("####### B\n");
  });

  test("a heading created at a terminator-less last line starts a fresh line", () => {
    // The insertion point is the end of a document with no trailing newline;
    // without the owed line start the new marker would glue onto the last
    // body line ("…no newline# New Section").
    const result = patch("# A\nlast line no newline", {
      targetType: "heading",
      target: ["New Section"],
      operation: "append",
      content: "hello",
      createTargetIfMissing: true,
    });
    expect(result.document).toBe(
      "# A\nlast line no newline\n# New Section\nhello\n"
    );
  });

  test("without createTargetIfMissing a missing heading still throws", () => {
    expect(() =>
      patch("# A\na\n", {
        targetType: "heading",
        target: ["A", "B"],
        operation: "replace",
        scope: "content",
        content: "x",
      })
    ).toThrow(TargetNotFoundError);
  });
});

describe("createTargetIfMissing — blocks", () => {
  test("mints a new block at the end of the document", () => {
    const result = patch("a paragraph\n", {
      targetType: "block",
      target: "ref",
      operation: "replace",
      scope: "content",
      content: "new block",
      createTargetIfMissing: true,
    });
    expect(result.document).toBe("a paragraph\n\nnew block ^ref\n");
  });

  test("mints a block in an empty document without a leading separator", () => {
    const result = patch("", {
      targetType: "block",
      target: "ref",
      operation: "replace",
      scope: "content",
      content: "only block",
      createTargetIfMissing: true,
    });
    expect(result.document).toBe("only block ^ref\n");
  });
});

describe("createTargetIfMissing — frontmatter", () => {
  test("creates a new key when the frontmatter block already exists", () => {
    const result = patch("---\ntitle: Hello\n---\nbody\n", {
      targetType: "frontmatter",
      target: "author",
      operation: "replace",
      scope: "content",
      value: "me",
      createTargetIfMissing: true,
    });
    expect(result.document).toBe(
      "---\ntitle: Hello\nauthor: me\n---\nbody\n"
    );
  });

  test("creates the frontmatter block when the document has none", () => {
    const result = patch("body only\n", {
      targetType: "frontmatter",
      target: "title",
      operation: "replace",
      scope: "content",
      value: "New",
      createTargetIfMissing: true,
    });
    expect(result.document).toBe("---\ntitle: New\n---\nbody only\n");
  });

  test("creating with a merge seeds an empty value of the right kind", () => {
    const result = patch("---\ntitle: Hello\n---\nbody\n", {
      targetType: "frontmatter",
      target: "tags",
      operation: "append",
      scope: "content",
      value: ["a"],
      createTargetIfMissing: true,
    });
    expect(result.document).toBe(
      "---\ntitle: Hello\ntags:\n  - a\n---\nbody\n"
    );
  });

  test("a missing key without createTargetIfMissing throws", () => {
    expect(() =>
      patch("---\ntitle: Hello\n---\nbody\n", {
        targetType: "frontmatter",
        target: "author",
        operation: "replace",
        scope: "content",
        value: "me",
      })
    ).toThrow(TargetNotFoundError);
  });
});
