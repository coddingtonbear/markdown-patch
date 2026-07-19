import { readTarget } from "../read";
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
      expect(result.content).toContain("## Details");
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
