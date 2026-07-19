import { patch } from "../engine";
import { EngineError, TargetNotFoundError } from "../instructions";

const DOC = "# A\na-body\n\n## B\nb-body\n\n# C\nc-body\n";

describe("patch — heading delete cells", () => {
  test("delete @ content empties the body, keeping the heading and gap", () => {
    const result = patch(DOC, {
      targetType: "heading",
      target: ["A"],
      operation: "delete",
      scope: "content",
    });
    expect(result.document).toBe("# A\n\n## B\nb-body\n\n# C\nc-body\n");
  });

  test("delete @ markerAndContent removes the subtree and its trailing gap", () => {
    const result = patch(DOC, {
      targetType: "heading",
      target: ["A", "B"],
      operation: "delete",
      scope: "markerAndContent",
    });
    expect(result.document).toBe("# A\na-body\n\n# C\nc-body\n");
  });
});

describe("patch — dissolve (delete @ marker)", () => {
  test("with no preceding same-level sibling, children are promoted and re-levelled up one", () => {
    const doc = "# A\n## S\n### child\nx\n";
    const result = patch(doc, {
      targetType: "heading",
      target: ["A", "S"],
      operation: "delete",
      scope: "marker",
    });
    expect(result.document).toBe("# A\n## child\nx\n");
  });

  test("with a preceding same-level sibling, the heading is simply removed and children absorbed", () => {
    const doc = "# A\n## P\n## S\n### child\nx\n";
    const result = patch(doc, {
      targetType: "heading",
      target: ["A", "S"],
      operation: "delete",
      scope: "marker",
    });
    expect(result.document).toBe("# A\n## P\n### child\nx\n");
  });

  test("dissolving a childless heading is a pure one-line deletion", () => {
    const result = patch(DOC, {
      targetType: "heading",
      target: ["A", "B"],
      operation: "delete",
      scope: "marker",
    });
    expect(result.document).toBe("# A\na-body\n\nb-body\n\n# C\nc-body\n");
  });

  test("dissolving the document root is rejected", () => {
    expect(() =>
      patch(DOC, {
        targetType: "heading",
        target: null,
        operation: "delete",
        scope: "marker",
      })
    ).toThrow();
  });
});

describe("patch — move (replace @ parent)", () => {
  test("moves a subsection to the document root, re-levelling it down to h1", () => {
    const result = patch(DOC, {
      targetType: "heading",
      target: ["A", "B"],
      operation: "replace",
      scope: "parent",
      value: { parent: null, place: "last" },
    });
    expect(result.document).toBe(
      "# A\na-body\n\n# C\nc-body\n# B\nb-body\n"
    );
  });

  test("moves a top-level section beneath a sibling, re-levelling it up", () => {
    const result = patch(DOC, {
      targetType: "heading",
      target: ["C"],
      operation: "replace",
      scope: "parent",
      value: { parent: ["A"], place: "last" },
    });
    // C (h1) becomes a child of A (h1) -> h2, appended after B.
    expect(result.document).toBe(
      "# A\na-body\n\n## B\nb-body\n\n## C\nc-body\n"
    );
  });

  test("place `before` a named sibling inserts the moved subtree ahead of it", () => {
    const result = patch(DOC, {
      targetType: "heading",
      target: ["C"],
      operation: "replace",
      scope: "parent",
      value: { parent: ["A"], place: { before: ["A", "B"] } },
    });
    expect(result.document).toBe(
      "# A\na-body\n\n## C\nc-body\n## B\nb-body\n\n"
    );
  });

  test("re-levelling preserves the internal nesting of the moved subtree", () => {
    const doc = "# A\n## B\n### deep\nd\n\n# C\nc\n";
    const result = patch(doc, {
      targetType: "heading",
      target: ["A", "B"],
      operation: "replace",
      scope: "parent",
      value: { parent: ["C"], place: "last" },
    });
    // B (h2) -> child of C (h1) -> h2, deep (h3) shifts with it -> h3.
    expect(result.document).toContain("# C\nc\n## B\n### deep\nd\n");
  });

  test("moving a section beneath itself is rejected", () => {
    expect(() =>
      patch(DOC, {
        targetType: "heading",
        target: ["A"],
        operation: "replace",
        scope: "parent",
        value: { parent: ["A", "B"], place: "last" },
      })
    ).toThrow(EngineError);
  });

  test("an unresolvable new parent raises TargetNotFoundError", () => {
    expect(() =>
      patch(DOC, {
        targetType: "heading",
        target: ["A", "B"],
        operation: "replace",
        scope: "parent",
        value: { parent: ["Nope"], place: "last" },
      })
    ).toThrow(TargetNotFoundError);
  });
});

describe("patch — block delete cells", () => {
  const BLOCK_DOC = "a paragraph ^ref\n";

  test("delete @ content empties the block text, keeping the id", () => {
    const result = patch(BLOCK_DOC, {
      targetType: "block",
      target: "ref",
      operation: "delete",
      scope: "content",
    });
    expect(result.document).toBe(" ^ref\n");
  });

  test("delete @ marker detaches the id, keeping the content", () => {
    const result = patch(BLOCK_DOC, {
      targetType: "block",
      target: "ref",
      operation: "delete",
      scope: "marker",
    });
    expect(result.document).toBe("a paragraph\n");
  });

  test("delete @ markerAndContent removes the block and its trailing gap", () => {
    const result = patch(BLOCK_DOC, {
      targetType: "block",
      target: "ref",
      operation: "delete",
      scope: "markerAndContent",
    });
    expect(result.document).toBe("");
  });

  test("delete @ markerAndContent consumes the blank line separating a following block", () => {
    const doc = "a ^x\n\nb ^y\n";
    const result = patch(doc, {
      targetType: "block",
      target: "x",
      operation: "delete",
      scope: "markerAndContent",
    });
    expect(result.document).toBe("b ^y\n");
  });
});
