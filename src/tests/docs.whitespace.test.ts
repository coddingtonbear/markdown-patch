/**
 * Pins the whitespace contract the README documents under "Whitespace is
 * spliced verbatim".  Content is spliced in exactly as written at one edge of
 * the target's span and the engine contributes no whitespace of its own, so a
 * leading `\n` is what produces a blank line before the inserted text — for
 * `append` as much as for `prepend`.
 *
 * These expectations are the literal strings quoted in the docs.  If one of
 * them changes, the documentation is wrong and must change with it.
 */

import { patch } from "../engine.js";

const doc = `# One

body of one
`;

const run = (operation: "append" | "prepend" | "replace", content: string) =>
  patch(doc, { targetType: "heading", target: ["One"], operation, content }).document;

describe("documented whitespace behavior", () => {
  describe("content with no leading newline lands flush against its neighbor", () => {
    it("prepend butts against the heading line", () => {
      expect(run("prepend", "X\n")).toBe("# One\nX\n\nbody of one\n");
    });

    it("append butts against the section's last line", () => {
      expect(run("append", "X\n")).toBe("# One\n\nbody of one\nX\n");
    });

    it("replace clears the span, blank line included", () => {
      expect(run("replace", "X\n")).toBe("# One\nX\n");
    });
  });

  describe("a leading newline buys a blank line before the content", () => {
    it("prepend", () => {
      expect(run("prepend", "\nX\n")).toBe("# One\n\nX\n\nbody of one\n");
    });

    it("append", () => {
      expect(run("append", "\nX\n")).toBe("# One\n\nbody of one\n\nX\n");
    });

    it("replace", () => {
      expect(run("replace", "\nX\n")).toBe("# One\n\nX\n");
    });
  });

  it("a blank line already following a heading belongs to the body, not the boundary", () => {
    // The document is well-spaced, but prepending still lands flush against the
    // heading: the existing blank line is pushed below the inserted text.
    expect(run("prepend", "X\n")).toBe("# One\nX\n\nbody of one\n");
  });

  it("trailing padding survives mid-document but is trimmed at end of document", () => {
    const midDoc = `# One

body of one

# Two

body of two
`;
    expect(
      patch(midDoc, {
        targetType: "heading",
        target: ["One"],
        operation: "append",
        content: "X\n\n",
      }).document
    ).toBe("# One\n\nbody of one\nX\n\n# Two\n\nbody of two\n");

    // At the end of the document the same trailing blank line is normalized away.
    expect(run("append", "X\n\n")).toBe("# One\n\nbody of one\nX\n");
  });
});
