import { buildModel, eachSection, BlockNode } from "../model";

const findById = (model: ReturnType<typeof buildModel>, id: string): BlockNode | undefined => {
  let found: BlockNode | undefined;
  eachSection(model.root, (n) =>
    n.blocks.forEach((b) => {
      if (b.id === id) found = b;
    })
  );
  return found;
};

describe("findBlocks anchoring on duplicate blocks", () => {
  test("an isolated ^id binds to the nearer of two textually-identical preceding blocks", () => {
    // Two identical paragraphs, then an isolated `^ref` line: Obsidian's rule
    // is that it targets the immediately preceding block (the second "foo"),
    // not whichever occurrence `indexOf` happens to re-match first.
    const doc = "foo\n\nfoo\n\n^ref\n";
    const model = buildModel(doc);
    const firstFoo = doc.indexOf("foo");
    const secondFoo = doc.indexOf("foo", firstFoo + 1);

    const block = findById(model, "ref");
    expect(block).toBeDefined();
    expect(block!.isolated).toBe(true);
    expect(block!.content.start).toBe(secondFoo);
    expect(doc.slice(block!.content.start, block!.content.end)).toBe("foo");
  });

  test("three identical paragraphs each anchor to their own occurrence", () => {
    const doc = "foo\n\nfoo\n\nfoo ^a\n";
    const model = buildModel(doc);
    const thirdFoo = doc.lastIndexOf("foo");

    const block = findById(model, "a");
    expect(block).toBeDefined();
    expect(block!.isolated).toBe(false);
    expect(block!.content.start).toBe(thirdFoo);
  });

  test("an isolated ^id binds to the nearest of three byte-identical, unseparated code blocks", () => {
    // Fenced code blocks need no blank-line separator between them, and marked
    // emits them as leaf tokens (no nested child token to nudge the shared
    // search cursor forward either) -- so three back-to-back identical fences
    // are the case that actually exposes `indexOf(raw, searchFrom)` re-matching
    // the *first* occurrence for every later one, since nothing ever advances
    // the cursor past it.
    const fence = "```\nfoo\n```\n";
    const doc = fence + fence + "```\nfoo\n```" + "\n\n^ref\n";
    const model = buildModel(doc);
    const thirdFenceStart = doc.lastIndexOf("```\nfoo\n```");

    const block = findById(model, "ref");
    expect(block).toBeDefined();
    expect(block!.isolated).toBe(true);
    expect(block!.content.start).toBe(thirdFenceStart);
    expect(doc.slice(block!.content.start, block!.content.end)).toBe(
      "```\nfoo\n```"
    );
  });

  test("two duplicate blocks each carrying their own inline id resolve to distinct spans", () => {
    const doc = "same text ^one\n\nsame text ^two\n";
    const model = buildModel(doc);

    const one = findById(model, "one");
    const two = findById(model, "two");
    expect(one).toBeDefined();
    expect(two).toBeDefined();
    expect(one!.content.start).toBeLessThan(two!.content.start);
    expect(doc.slice(one!.content.start, one!.content.end)).toBe("same text");
    expect(doc.slice(two!.content.start, two!.content.end)).toBe("same text");
  });
});
