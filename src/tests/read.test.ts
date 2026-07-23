import { readTarget } from "../read";
import { patch } from "../engine";
import { TargetNotFoundError } from "../instructions";

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

  test("an out-of-range within read throws TargetNotFoundError", () => {
    expect(() =>
      readTarget(DOC, { targetType: "heading", target: ["Other"], within: 5 })
    ).toThrow(TargetNotFoundError);
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
