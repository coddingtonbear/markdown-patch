import { buildModel, SectionNode } from "../model";

const sectionNamed = (
  model: ReturnType<typeof buildModel>,
  text: string
): SectionNode => {
  const found = model.root.children.find((c) => c.heading?.text === text);
  if (!found) throw new Error(`no section named ${text}`);
  return found;
};

const childTexts = (doc: string, node: SectionNode): string[] =>
  node.bodyChildren.map((c) => doc.slice(c.range.start, c.range.end));

describe("findBodyChildren", () => {
  test("a mixed body yields one child per top-level block, in order", () => {
    const doc = [
      "# Mixed",
      "",
      "First paragraph.",
      "",
      "- one",
      "- two",
      "",
      "```",
      "fenced",
      "```",
      "",
      "| a |",
      "| - |",
      "| 1 |",
      "",
      "> quoted",
      "",
      "---",
      "",
      "tail paragraph",
      "",
    ].join("\n");
    const model = buildModel(doc);
    const section = sectionNamed(model, "Mixed");
    expect(section.bodyChildren.map((c) => c.kind)).toEqual([
      "paragraph",
      "list",
      "code",
      "table",
      "blockquote",
      "hr",
      "paragraph",
    ]);
    expect(childTexts(doc, section)).toEqual([
      "First paragraph.",
      "- one\n- two",
      "```\nfenced\n```",
      "| a |\n| - |\n| 1 |",
      "> quoted",
      "---",
      "tail paragraph",
    ]);
  });

  test("an empty section body has no children", () => {
    const model = buildModel("# Empty\n\n# Next\n\nbody\n");
    expect(sectionNamed(model, "Empty").bodyChildren).toEqual([]);
    expect(sectionNamed(model, "Next").bodyChildren).toHaveLength(1);
  });

  test("preamble blocks before the first heading belong to the root", () => {
    const doc = "Preamble one.\n\nPreamble two.\n\n# First\n\nbody\n";
    const model = buildModel(doc);
    expect(childTexts(doc, model.root)).toEqual([
      "Preamble one.",
      "Preamble two.",
    ]);
  });

  test("children split between a section's direct body and its subsection", () => {
    const doc = "# A\n\npara a\n\n## B\n\nsub para\n";
    const model = buildModel(doc);
    const a = sectionNamed(model, "A");
    expect(childTexts(doc, a)).toEqual(["para a"]);
    expect(childTexts(doc, a.children[0])).toEqual(["sub para"]);
  });

  test("an isolated ^id marker line is not a child; an inline ^id stays in its block's span", () => {
    const doc = "# H\n\nfirst para ^inline\n\n- item\n\n^listref\n\nlast\n";
    const model = buildModel(doc);
    const section = sectionNamed(model, "H");
    // The isolated `^listref` line annotates the list; it is not counted, so
    // indices here match the rendered blocks a reader sees.
    expect(childTexts(doc, section)).toEqual([
      "first para ^inline",
      "- item",
      "last",
    ]);
  });

  test("a setext heading is structure, not a body child", () => {
    const doc = "Title\n=====\n\nbody para\n";
    const model = buildModel(doc);
    expect(model.root.bodyChildren).toEqual([]);
    const title = model.root.children[0];
    expect(title.heading?.text).toEqual("Title");
    expect(childTexts(doc, title)).toEqual(["body para"]);
  });

  test("CRLF documents index children at original byte offsets", () => {
    const doc = "# H\r\n\r\nfirst\r\n\r\n- a\r\n- b\r\n";
    const model = buildModel(doc);
    const section = sectionNamed(model, "H");
    expect(childTexts(doc, section)).toEqual(["first", "- a\r\n- b"]);
  });

  test("a final block with no trailing newline is still a child", () => {
    const doc = "# H\n\nfirst\n\nlast without newline";
    const model = buildModel(doc);
    expect(childTexts(doc, sectionNamed(model, "H"))).toEqual([
      "first",
      "last without newline",
    ]);
  });

  test("frontmatter is not a body child", () => {
    const doc = "---\ntitle: t\n---\n\nonly para\n";
    const model = buildModel(doc);
    expect(childTexts(doc, model.root)).toEqual(["only para"]);
  });
});
