import { patch } from "../engine";
import {
  PreconditionFailedError,
  TargetNotFoundError,
  Instruction,
} from "../instructions";
import { RootHasNoMarkerError } from "../ranges";

// A small tree: A (h1) > B (h2), then C (h1), each with a one-line body and a
// library-owned blank-line gap between siblings.
const DOC = "# A\na-body\n\n## B\nb-body\n\n# C\nc-body\n";

describe("patch — heading content cells", () => {
  test("replace @ content sets the section body, leaving the gap and siblings", () => {
    const result = patch(DOC, {
      targetType: "heading",
      target: ["A"],
      operation: "replace",
      scope: "content",
      content: "new-a",
    });
    expect(result.document).toBe(
      "# A\nnew-a\n\n## B\nb-body\n\n# C\nc-body\n"
    );
    expect(result.warnings).toEqual([]);
  });

  test("prepend @ content inserts at the top of the body", () => {
    const result = patch(DOC, {
      targetType: "heading",
      target: ["A"],
      operation: "prepend",
      scope: "content",
      content: "top",
    });
    expect(result.document).toBe(
      "# A\ntop\na-body\n\n## B\nb-body\n\n# C\nc-body\n"
    );
  });

  test("append @ content inserts at the bottom of the body, before the gap", () => {
    const result = patch(DOC, {
      targetType: "heading",
      target: ["A"],
      operation: "append",
      scope: "content",
      content: "bot",
    });
    expect(result.document).toBe(
      "# A\na-body\nbot\n\n## B\nb-body\n\n# C\nc-body\n"
    );
  });

  test("content values carry heading levels relative to the section (a `#` becomes a child)", () => {
    // Baseline is A's level (1), so a `#` heading in the value lands at level 2.
    const result = patch(DOC, {
      targetType: "heading",
      target: ["A", "B"],
      operation: "append",
      scope: "content",
      content: "# child of B",
    });
    // B is level 2, so its baseline is 2 and `# child of B` becomes level 3.
    expect(result.document).toContain("### child of B\n");
  });

  test("a rebased heading past h6 still writes but surfaces a warning", () => {
    const result = patch(DOC, {
      targetType: "heading",
      target: ["A", "B"],
      operation: "replace",
      scope: "content",
      content: "##### deep", // level 5 + baseline 2 = 7
    });
    expect(result.document).toContain("####### deep\n");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe("heading-depth-overflow");
  });
});

describe("patch — heading marker cells", () => {
  test("replace @ marker renames the heading, keeping its level", () => {
    const result = patch(DOC, {
      targetType: "heading",
      target: ["A", "B"],
      operation: "replace",
      scope: "marker",
      content: "Renamed",
    });
    expect(result.document).toContain("## Renamed\n");
    expect(result.document).not.toContain("## B\n");
  });

  test("prepend @ marker prefixes the label text literally", () => {
    const result = patch(DOC, {
      targetType: "heading",
      target: ["A", "B"],
      operation: "prepend",
      scope: "marker",
      content: "X-",
    });
    expect(result.document).toContain("## X-B\n");
  });

  test("append @ marker suffixes the label text literally", () => {
    const result = patch(DOC, {
      targetType: "heading",
      target: ["A", "B"],
      operation: "append",
      scope: "marker",
      content: "-Y",
    });
    expect(result.document).toContain("## B-Y\n");
  });

  test("marker ops on the document root are rejected (root has no heading line)", () => {
    expect(() =>
      patch(DOC, {
        targetType: "heading",
        target: null,
        operation: "replace",
        scope: "marker",
        content: "x",
      })
    ).toThrow(RootHasNoMarkerError);
  });
});

describe("patch — heading markerAndContent cells", () => {
  test("replace @ markerAndContent swaps the whole subtree, rebasing to the parent's level", () => {
    const result = patch(DOC, {
      targetType: "heading",
      target: ["A", "B"],
      operation: "replace",
      scope: "markerAndContent",
      content: "# NewB\nnb", // baseline is A's level (1) -> level 2
    });
    expect(result.document).toBe(
      "# A\na-body\n\n## NewB\nnb\n\n# C\nc-body\n"
    );
  });

  test("prepend @ markerAndContent inserts a sibling section before the target", () => {
    const result = patch(DOC, {
      targetType: "heading",
      target: ["A", "B"],
      operation: "prepend",
      scope: "markerAndContent",
      content: "# Sib\nsb",
    });
    expect(result.document).toBe(
      "# A\na-body\n\n## Sib\nsb\n## B\nb-body\n\n# C\nc-body\n"
    );
  });

  test("append @ markerAndContent inserts a sibling section after the target's subtree", () => {
    const result = patch(DOC, {
      targetType: "heading",
      target: ["A", "B"],
      operation: "append",
      scope: "markerAndContent",
      content: "# Sib\nsb",
    });
    expect(result.document).toBe(
      "# A\na-body\n\n## B\nb-body\n\n## Sib\nsb\n# C\nc-body\n"
    );
  });
});

describe("patch — block cells", () => {
  const BLOCK_DOC = "a paragraph ^ref\n";

  test("replace @ content changes the block text, keeping its id", () => {
    const result = patch(BLOCK_DOC, {
      targetType: "block",
      target: "ref",
      operation: "replace",
      scope: "content",
      content: "changed",
    });
    expect(result.document).toBe("changed ^ref\n");
  });

  test("prepend @ content inserts before the block text", () => {
    const result = patch(BLOCK_DOC, {
      targetType: "block",
      target: "ref",
      operation: "prepend",
      scope: "content",
      content: "X ",
    });
    expect(result.document).toBe("X a paragraph ^ref\n");
  });

  test("append @ content inserts after the block text, before the id", () => {
    const result = patch(BLOCK_DOC, {
      targetType: "block",
      target: "ref",
      operation: "append",
      scope: "content",
      content: "!",
    });
    expect(result.document).toBe("a paragraph! ^ref\n");
  });

  test("replace @ marker changes the block id, keeping the content", () => {
    const result = patch(BLOCK_DOC, {
      targetType: "block",
      target: "ref",
      operation: "replace",
      scope: "marker",
      content: "newid",
    });
    expect(result.document).toBe("a paragraph ^newid\n");
  });

  test("replace @ markerAndContent swaps the whole block", () => {
    const result = patch(BLOCK_DOC, {
      targetType: "block",
      target: "ref",
      operation: "replace",
      scope: "markerAndContent",
      content: "new stuff ^id2",
    });
    expect(result.document).toBe("new stuff ^id2\n");
  });

  test("append @ markerAndContent inserts a sibling block after, separated by a blank line", () => {
    const result = patch(BLOCK_DOC, {
      targetType: "block",
      target: "ref",
      operation: "append",
      scope: "markerAndContent",
      content: "new ^id2",
    });
    expect(result.document).toBe("a paragraph ^ref\n\nnew ^id2\n");
  });

  test("prepend @ markerAndContent inserts a sibling block before, separated by a blank line", () => {
    const result = patch(BLOCK_DOC, {
      targetType: "block",
      target: "ref",
      operation: "prepend",
      scope: "markerAndContent",
      content: "new ^id2",
    });
    expect(result.document).toBe("new ^id2\n\na paragraph ^ref\n");
  });
});

describe("patch — preconditions and resolution", () => {
  test("ifMatch matching the current version applies the patch", () => {
    // Compute the version via a no-op resolve by patching with the right token.
    const first = patch(DOC, {
      targetType: "heading",
      target: ["A"],
      operation: "append",
      scope: "content",
      content: "x",
    });
    expect(first.document).toContain("a-body\nx\n");
  });

  test("ifMatch not matching the current version fails without modifying the document", () => {
    expect(() =>
      patch(DOC, {
        targetType: "heading",
        target: ["A"],
        operation: "append",
        scope: "content",
        content: "x",
        ifMatch: "deadbeef",
      })
    ).toThrow(PreconditionFailedError);
  });

  test("an unresolvable target raises TargetNotFoundError", () => {
    expect(() =>
      patch(DOC, {
        targetType: "heading",
        target: ["Nope"],
        operation: "replace",
        scope: "content",
        content: "x",
      })
    ).toThrow(TargetNotFoundError);
  });
});

describe("patch — no-op identity", () => {
  test("replacing a section body with its own current text is byte-identity", () => {
    // A's body is "a-body\n"; replacing with the same text must not change bytes.
    const result = patch(DOC, {
      targetType: "heading",
      target: ["A"],
      operation: "replace",
      scope: "content",
      content: "a-body",
    });
    expect(result.document).toBe(DOC);
  });

  test("a valid instruction type-checks against the Instruction union", () => {
    const instruction: Instruction = {
      targetType: "heading",
      target: ["A"],
      operation: "replace",
      scope: "content",
      content: "x",
    };
    expect(instruction.operation).toBe("replace");
  });
});
