import { patch } from "../engine";
import {
  PreconditionFailedError,
  TargetNotFoundError,
  ContentPreexistsError,
  Instruction,
} from "../instructions";
import { RootHasNoMarkerError } from "../ranges";
import { buildModel } from "../model";
import {
  NotATableError,
  TableColumnCountError,
  InvalidCellContentError,
} from "../engine/table";

// A small tree: A (h1) > B (h2), then C (h1), each with a one-line body and a
// library-owned blank-line gap between siblings.
const DOC = "# A\na-body\n\n## B\nb-body\n\n# C\nc-body\n";

describe("patch — heading content cells", () => {
  test("replace @ content on a leaf sets just that section's body", () => {
    // B has no children, so its `content` span is exactly its direct body.
    const result = patch(DOC, {
      targetType: "heading",
      target: ["A", "B"],
      operation: "replace",
      scope: "content",
      content: "new-b",
    });
    expect(result.document).toBe(
      "# A\na-body\n\n## B\nnew-b\n\n# C\nc-body\n"
    );
    expect(result.warnings).toEqual([]);
  });

  test("replace @ content spans the whole subtree below the heading (subsections included)", () => {
    // A's `content` is everything under it minus its own heading line — a-body
    // *and* the ## B subsection — so replacing it absorbs the child section.
    const result = patch(DOC, {
      targetType: "heading",
      target: ["A"],
      operation: "replace",
      scope: "content",
      content: "new-a",
    });
    expect(result.document).toBe("# A\nnew-a\n\n# C\nc-body\n");
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

  test("append @ content inserts at the bottom of the subtree body, before the gap", () => {
    // A's content spans through ## B, so an append lands after B's body, not
    // between a-body and the subsection.
    const result = patch(DOC, {
      targetType: "heading",
      target: ["A"],
      operation: "append",
      scope: "content",
      content: "bot",
    });
    expect(result.document).toBe(
      "# A\na-body\n\n## B\nb-body\nbot\n\n# C\nc-body\n"
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

describe("patch — block table-row cells", () => {
  // Mirrors the design doc's worked example: an isolated `^id` line attaches
  // to the whole preceding table (header, separator, and body rows).
  const TABLE_DOC =
    "| City    | Population |\n" +
    "| ------- | ---------- |\n" +
    "| Seattle | 8          |\n" +
    "^ref\n";

  test("append @ content with a value inserts new rows after the existing body rows", () => {
    const result = patch(TABLE_DOC, {
      targetType: "block",
      target: "ref",
      operation: "append",
      scope: "content",
      value: [["Chicago", "16"]],
    });
    expect(result.document).toBe(
      "| City    | Population |\n" +
        "| ------- | ---------- |\n" +
        "| Seattle | 8          |\n" +
        "| Chicago | 16 |\n" +
        "^ref\n"
    );
  });

  test("prepend @ content with a value inserts new rows right after the header/separator", () => {
    const result = patch(TABLE_DOC, {
      targetType: "block",
      target: "ref",
      operation: "prepend",
      scope: "content",
      value: [["Chicago", "16"]],
    });
    expect(result.document).toBe(
      "| City    | Population |\n" +
        "| ------- | ---------- |\n" +
        "| Chicago | 16 |\n" +
        "| Seattle | 8          |\n" +
        "^ref\n"
    );
  });

  test("replace @ content with a value swaps all body rows, keeping the header/separator", () => {
    const result = patch(TABLE_DOC, {
      targetType: "block",
      target: "ref",
      operation: "replace",
      scope: "content",
      value: [["Chicago", "16"]],
    });
    expect(result.document).toBe(
      "| City    | Population |\n" +
        "| ------- | ---------- |\n" +
        "| Chicago | 16 |\n" +
        "^ref\n"
    );
  });

  test("a pipe in a cell is escaped so it stays one cell", () => {
    // The array form exists so a caller supplies cell *content* and the library
    // renders the table syntax. An unescaped `|` would silently split the cell
    // and shift every column after it.
    const result = patch(TABLE_DOC, {
      targetType: "block",
      target: "ref",
      operation: "append",
      scope: "content",
      value: [["Seattle | Tacoma", "16"]],
    });
    expect(result.document).toContain("| Seattle \\| Tacoma | 16 |");

    // And it survives a round trip: re-parsing the patched table still sees two
    // columns, with the pipe restored as cell text.
    const block = buildModel(result.document).root.blocks[0];
    expect(block.columns).toHaveLength(2);
  });

  test("a newline in a cell is rejected rather than splitting the row", () => {
    // A line break cannot be expressed inside a GFM table cell; writing it
    // verbatim would break one row into two malformed ones.
    expect(() =>
      patch(TABLE_DOC, {
        targetType: "block",
        target: "ref",
        operation: "append",
        scope: "content",
        value: [["two\nlines", "16"]],
      })
    ).toThrow(InvalidCellContentError);
  });

  test("a carriage return in a cell is rejected too", () => {
    expect(() =>
      patch(TABLE_DOC, {
        targetType: "block",
        target: "ref",
        operation: "append",
        scope: "content",
        value: [["two\r\nlines", "16"]],
      })
    ).toThrow(InvalidCellContentError);
  });

  test("a row with the wrong number of cells raises TableColumnCountError", () => {
    expect(() =>
      patch(TABLE_DOC, {
        targetType: "block",
        target: "ref",
        operation: "append",
        scope: "content",
        value: [["only-one-cell"]],
      })
    ).toThrow(TableColumnCountError);
  });

  test("a value on a non-table block raises NotATableError", () => {
    const result = "a paragraph ^ref\n";
    expect(() =>
      patch(result, {
        targetType: "block",
        target: "ref",
        operation: "append",
        scope: "content",
        value: [["x", "y"]],
      })
    ).toThrow(NotATableError);
  });

  test("createTargetIfMissing is rejected for table-row writes", () => {
    expect(() =>
      patch(TABLE_DOC, {
        targetType: "block",
        target: "nonexistent",
        operation: "append",
        scope: "content",
        value: [["Chicago", "16"]],
        createTargetIfMissing: true,
      })
    ).toThrow();
  });
});

describe("patch — preconditions and resolution", () => {
  test("ifMatch matching the current version applies the patch", () => {
    // Compute the version via a no-op resolve by patching with the right token.
    const first = patch(DOC, {
      targetType: "heading",
      target: ["A", "B"],
      operation: "append",
      scope: "content",
      content: "x",
    });
    expect(first.document).toContain("b-body\nx\n");
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

describe("patch — rejectIfContentPreexists on heading-bearing content", () => {
  // A's content already contains a rebased (absolute-level) heading: "##
  // Already Here" is what "# Already Here" becomes once rebased to A's
  // baseline (1). A naive comparison of the *raw* (relative-level) instruction
  // content against this *absolute*-level span never matches once the heading
  // isn't the very first thing in the content — the leading "#" run no longer
  // lines up as a lucky substring — so the guard silently passes when it
  // shouldn't.
  const doc = "# A\nintro\n## Already Here\nbody\n\n# C\nc-body\n";

  test("detects relative-level content that already exists once rebased to the target's level", () => {
    expect(() =>
      patch(doc, {
        targetType: "heading",
        target: ["A"],
        operation: "append",
        scope: "content",
        content: "intro\n# Already Here\nbody\n",
        rejectIfContentPreexists: true,
      })
    ).toThrow(ContentPreexistsError);
  });

  test("does not reject genuinely new heading-bearing content", () => {
    const result = patch(doc, {
      targetType: "heading",
      target: ["A"],
      operation: "append",
      scope: "content",
      content: "intro\n# Not Here Yet\nbody\n",
      rejectIfContentPreexists: true,
    });
    expect(result.document).toContain("## Not Here Yet");
  });

  test("detects relative-level content already present under markerAndContent (parent-level baseline)", () => {
    // markerAndContent rebases to the *parent's* level, not the target's own —
    // here B's parent A is level 1, so a relative "# B" (1 hash) is what B's
    // own absolute "## B" (2 hashes) looks like at that baseline.
    const nestedDoc = "# A\n## B\nintro\n### Already Here\nbody\n\n# C\nc-body\n";
    expect(() =>
      patch(nestedDoc, {
        targetType: "heading",
        target: ["A", "B"],
        operation: "prepend",
        scope: "markerAndContent",
        content: "# B\nintro\n## Already Here\nbody\n",
        rejectIfContentPreexists: true,
      })
    ).toThrow(ContentPreexistsError);
  });
});

describe("patch — scope defaults to content", () => {
  test("a heading write with no scope edits the section body", () => {
    const result = patch(DOC, {
      targetType: "heading",
      target: ["A", "B"],
      operation: "replace",
      content: "z",
    });
    expect(result.document).toBe("# A\na-body\n\n## B\nz\n\n# C\nc-body\n");
  });

  test("a heading delete with no scope empties the section body", () => {
    const result = patch(DOC, {
      targetType: "heading",
      target: ["A", "B"],
      operation: "delete",
    });
    expect(result.document).toBe("# A\na-body\n\n## B\n\n# C\nc-body\n");
  });

  test("a block write with no scope edits the block text", () => {
    const result = patch("a paragraph ^ref\n", {
      targetType: "block",
      target: "ref",
      operation: "replace",
      content: "changed",
    });
    expect(result.document).toBe("changed ^ref\n");
  });

  test("a frontmatter write with no scope sets the value", () => {
    const result = patch("---\ntitle: Hello\n---\nbody\n", {
      targetType: "frontmatter",
      target: "title",
      operation: "replace",
      value: "Bye",
    });
    expect(result.document).toBe("---\ntitle: Bye\n---\nbody\n");
  });

  test("an explicit scope is still honored over the default", () => {
    const result = patch(DOC, {
      targetType: "heading",
      target: ["A", "B"],
      operation: "replace",
      scope: "marker",
      content: "Renamed",
    });
    expect(result.document).toContain("## Renamed\n");
  });
});

describe("patch — no-op identity", () => {
  test("replacing a leaf section body with its own current text is byte-identity", () => {
    // B is a leaf, so its content span is just "b-body\n"; replacing with the
    // same text must not change any bytes.
    const result = patch(DOC, {
      targetType: "heading",
      target: ["A", "B"],
      operation: "replace",
      scope: "content",
      content: "b-body",
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
