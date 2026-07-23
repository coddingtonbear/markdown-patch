import { readTarget } from "../read";
import { patch } from "../engine";
import { InvalidInstructionError, TargetNotFoundError } from "../instructions";

const DOC =
  "---\n" +
  "title: Draft\n" +
  "tags:\n" +
  "- a\n" +
  "- b\n" +
  "---\n\n" +
  "# Overview\n\n" +
  "The thesis. ^thesis\n\n" +
  "## Details\n\n" +
  "Nested body.\n\n" +
  "# Other\n\n" +
  "Elsewhere.\n";

describe("readTarget", () => {
  test("a heading yields its whole section body, subsections included", () => {
    const result = readTarget(DOC, { targetType: "heading", target: ["Overview"] });
    expect(result.kind).toBe("heading");
    if (result.kind !== "frontmatter") {
      expect(result.content).toContain("The thesis.");
      // "## Details" is level 2 in the document, but content is de-levelled
      // relative to "Overview" (level 1), matching what a content-scope write
      // expects back — see the round-trip tests below.
      expect(result.content).toContain("# Details");
      expect(result.content).not.toContain("## Details");
      expect(result.content).toContain("Nested body.");
      expect(result.content).not.toContain("Elsewhere.");
    }
  });

  test("a nested heading is addressed by its path array", () => {
    const result = readTarget(DOC, {
      targetType: "heading",
      target: ["Overview", "Details"],
    });
    if (result.kind !== "frontmatter") {
      expect(result.content).toContain("Nested body.");
      expect(result.content).not.toContain("The thesis.");
    }
  });

  test("a block id yields its text", () => {
    const result = readTarget(DOC, { targetType: "block", target: "thesis" });
    expect(result.kind).toBe("block");
    if (result.kind !== "frontmatter") {
      expect(result.content).toContain("The thesis.");
    }
  });

  test("a frontmatter key yields its parsed value", () => {
    expect(readTarget(DOC, { targetType: "frontmatter", target: "title" })).toEqual({
      kind: "frontmatter",
      value: "Draft",
    });
    expect(readTarget(DOC, { targetType: "frontmatter", target: "tags" })).toEqual({
      kind: "frontmatter",
      value: ["a", "b"],
    });
  });

  test("a heading's content round-trips through a content-scope write unchanged", () => {
    // readTarget's heading content must come back de-leveled the same way a
    // content-scope write expects it (relative to the target's own level), or
    // reading a section and writing it straight back re-levels every nested
    // heading inside it.
    const doc =
      "# Overview\n\nIntro.\n\n## Details\n\nNested body.\n\n# Other\n\nElsewhere.\n";
    const result = readTarget(doc, { targetType: "heading", target: ["Overview"] });
    if (result.kind === "frontmatter") throw new Error("unexpected");
    const written = patch(doc, {
      targetType: "heading",
      target: ["Overview"],
      operation: "replace",
      content: result.content,
    });
    expect(written.document).toBe(doc);
  });

  test("a nested heading's content round-trips through a content-scope write unchanged", () => {
    const doc =
      "# Overview\n\n## Details\n\nIntro.\n\n### Sub\n\nDeep body.\n\n# Other\n\nElsewhere.\n";
    const result = readTarget(doc, {
      targetType: "heading",
      target: ["Overview", "Details"],
    });
    if (result.kind === "frontmatter") throw new Error("unexpected");
    const written = patch(doc, {
      targetType: "heading",
      target: ["Overview", "Details"],
      operation: "replace",
      content: result.content,
    });
    expect(written.document).toBe(doc);
  });

  test("a document-root read still round-trips (baseline 0, no releveling needed)", () => {
    const doc = "# One\n\nbody\n\n# Two\n\nbody two\n";
    const result = readTarget(doc, { targetType: "heading", target: null });
    if (result.kind === "frontmatter") throw new Error("unexpected");
    const written = patch(doc, {
      targetType: "heading",
      target: null,
      operation: "replace",
      content: result.content,
    });
    expect(written.document).toBe(doc);
  });

  test("within reads one body block of a section, literally", () => {
    const doc = "# H\n\nfirst\n\n- one\n- two\n\nlast\n";
    const first = readTarget(doc, {
      targetType: "heading",
      target: ["H"],
      within: 0,
    });
    expect(first).toEqual({ kind: "heading", content: "first" });
    const list = readTarget(doc, {
      targetType: "heading",
      target: ["H"],
      within: -2,
    });
    expect(list).toEqual({ kind: "heading", content: "- one\n- two" });
  });

  test("a within read round-trips through a within replace as byte identity", () => {
    const doc = "# H\n\nfirst\n\n- one\n- two\n\nlast\n";
    const result = readTarget(doc, {
      targetType: "heading",
      target: ["H"],
      within: 1,
    });
    if (result.kind === "frontmatter") throw new Error("unexpected");
    const written = patch(doc, {
      targetType: "heading",
      target: ["H"],
      within: 1,
      operation: "replace",
      content: result.content,
    });
    expect(written.document).toBe(doc);
  });

  test("an out-of-range within read throws TargetNotFoundError", () => {
    expect(() =>
      readTarget(DOC, { targetType: "heading", target: ["Other"], within: 5 })
    ).toThrow(TargetNotFoundError);
  });

  describe("scoped reads", () => {
    test("marker yields a heading's raw label text", () => {
      expect(
        readTarget(DOC, {
          targetType: "heading",
          target: ["Overview", "Details"],
          scope: "marker",
        })
      ).toEqual({ kind: "heading", content: "Details" });
    });

    test("marker on the document root throws TargetNotFoundError", () => {
      expect(() =>
        readTarget(DOC, { targetType: "heading", target: null, scope: "marker" })
      ).toThrow(TargetNotFoundError);
    });

    test("markerAndContent yields the subtree at the parent's baseline", () => {
      const result = readTarget(DOC, {
        targetType: "heading",
        target: ["Overview", "Details"],
        scope: "markerAndContent",
      });
      // Details is h2 in the document; at its parent's (h1) baseline it reads
      // as a top-level "# Details" — the shape a markerAndContent replace takes.
      expect(result).toEqual({
        kind: "heading",
        content: "# Details\n\nNested body.\n",
      });
    });

    test("a heading markerAndContent read round-trips through a markerAndContent replace", () => {
      const doc =
        "# Overview\n\nIntro.\n\n## Details\n\nNested.\n\n### Sub\n\nDeep.\n\n# Other\n\nElsewhere.\n";
      const result = readTarget(doc, {
        targetType: "heading",
        target: ["Overview", "Details"],
        scope: "markerAndContent",
      });
      if (result.kind === "frontmatter") throw new Error("unexpected");
      const written = patch(doc, {
        targetType: "heading",
        target: ["Overview", "Details"],
        operation: "replace",
        scope: "markerAndContent",
        content: result.content,
      });
      expect(written.document).toBe(doc);
    });

    test("a heading marker read round-trips through a marker replace", () => {
      const doc = "# Overview\n\nIntro.\n";
      const result = readTarget(doc, {
        targetType: "heading",
        target: ["Overview"],
        scope: "marker",
      });
      if (result.kind === "frontmatter") throw new Error("unexpected");
      const written = patch(doc, {
        targetType: "heading",
        target: ["Overview"],
        operation: "replace",
        scope: "marker",
        content: result.content,
      });
      expect(written.document).toBe(doc);
    });

    test("marker yields a block's bare id; markerAndContent its full span", () => {
      expect(
        readTarget(DOC, { targetType: "block", target: "thesis", scope: "marker" })
      ).toEqual({ kind: "block", content: "thesis" });
      expect(
        readTarget(DOC, {
          targetType: "block",
          target: "thesis",
          scope: "markerAndContent",
        })
      ).toEqual({ kind: "block", content: "The thesis. ^thesis" });
    });

    test("a block markerAndContent read round-trips through a markerAndContent replace", () => {
      const doc = "start\n\nThe thesis. ^thesis\n\nend\n";
      const result = readTarget(doc, {
        targetType: "block",
        target: "thesis",
        scope: "markerAndContent",
      });
      if (result.kind === "frontmatter") throw new Error("unexpected");
      const written = patch(doc, {
        targetType: "block",
        target: "thesis",
        operation: "replace",
        scope: "markerAndContent",
        content: result.content,
      });
      expect(written.document).toBe(doc);
    });

    test("marker yields a frontmatter key; markerAndContent the whole entry", () => {
      expect(
        readTarget(DOC, {
          targetType: "frontmatter",
          target: "title",
          scope: "marker",
        })
      ).toEqual({ kind: "frontmatter", value: "title" });
      expect(
        readTarget(DOC, {
          targetType: "frontmatter",
          target: "tags",
          scope: "markerAndContent",
        })
      ).toEqual({ kind: "frontmatter", value: { tags: ["a", "b"] } });
    });

    test("a within read at a non-content scope throws InvalidInstructionError", () => {
      expect(() =>
        readTarget(DOC, {
          targetType: "heading",
          target: ["Overview"],
          within: 0,
          scope: "marker",
        })
      ).toThrow(InvalidInstructionError);
    });
  });

  test("an unresolvable target throws TargetNotFoundError", () => {
    expect(() =>
      readTarget(DOC, { targetType: "heading", target: ["Nope"] })
    ).toThrow(TargetNotFoundError);
    expect(() =>
      readTarget(DOC, { targetType: "block", target: "missing" })
    ).toThrow(TargetNotFoundError);
    expect(() =>
      readTarget(DOC, { targetType: "frontmatter", target: "absent" })
    ).toThrow(TargetNotFoundError);
  });
});
