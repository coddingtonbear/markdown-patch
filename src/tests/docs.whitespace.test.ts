/**
 * Pins the whitespace contract the README documents under "Whitespace is
 * library-owned".  Caller content is reduced to trimmed, canonical form —
 * leading and trailing blank lines are meaningless — and the engine
 * contributes the blank-line separator at any joint where the spliced block
 * faces body text, so a naive prepend/append can never merge into an existing
 * paragraph.  Joints against a heading line, an existing blank line, or a
 * document edge get nothing: headings are self-delimiting, and existing
 * separators and style are preserved rather than rewritten.
 *
 * This deliberately reverses commit 4f84d89, which documented the previous
 * "spliced verbatim / a leading \n buys the blank line" behavior instead of
 * fixing it to match Design Principle 1 ("the library owns whitespace").
 *
 * These expectations are the literal strings quoted in the docs.  If one of
 * them changes, the documentation is wrong and must change with it.
 */

import { patch } from "../engine.js";

const spaced = `# One

body of one
`;

const flush = `# One
body of one
`;

const run = (
  doc: string,
  operation: "append" | "prepend" | "replace",
  content: string
) => patch(doc, { targetType: "heading", target: ["One"], operation, content }).document;

describe("documented whitespace behavior", () => {
  describe("caller newlines are meaningless: every edge variant produces the same document", () => {
    const variants = ["X", "X\n", "X\n\n", "\nX\n", "\n\nX\n\n"];

    test.each(variants)("append %j", (content) => {
      expect(run(spaced, "append", content)).toBe("# One\n\nbody of one\n\nX\n");
    });

    test.each(variants)("prepend %j", (content) => {
      expect(run(spaced, "prepend", content)).toBe("# One\n\nX\n\nbody of one\n");
    });

    test.each(variants)("replace %j", (content) => {
      expect(run(spaced, "replace", content)).toBe("# One\n\nX\n");
    });
  });

  describe("the engine owns the separator at any joint facing body text", () => {
    it("append gets a blank line between the body's last line and the new block", () => {
      expect(run(spaced, "append", "X")).toBe("# One\n\nbody of one\n\nX\n");
    });

    it("prepend gets a blank line between the new block and the body below it", () => {
      expect(run(flush, "prepend", "X")).toBe("# One\nX\n\nbody of one\n");
    });
  });

  describe("existing separators and document style are preserved, not rewritten", () => {
    it("replace keeps the blank line a spaced document has between marker and body", () => {
      expect(run(spaced, "replace", "X")).toBe("# One\n\nX\n");
    });

    it("replace does not impose a blank line on a flush document", () => {
      expect(run(flush, "replace", "X")).toBe("# One\nX\n");
    });

    it("prepend inserts below a spaced document's marker separator", () => {
      expect(run(spaced, "prepend", "X")).toBe("# One\n\nX\n\nbody of one\n");
    });

    it("replacing a body with its own text is byte-identity in either style", () => {
      expect(run(spaced, "replace", "body of one")).toBe(spaced);
      expect(run(flush, "replace", "body of one")).toBe(flush);
    });
  });

  it("an append mid-document leaves the owned trailing gap in place", () => {
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
        content: "X",
      }).document
    ).toBe("# One\n\nbody of one\n\nX\n\n# Two\n\nbody of two\n");
  });

  describe("a joint owing no blank line still owes a line start", () => {
    // Flush-joint sides (a heading-led fragment, a body write directly under
    // its marker) contribute no blank line — but when the document's last
    // line has no terminator, splicing there verbatim would continue that
    // line. The engine owes the single ending that keeps the fragment off it.
    it("a sibling section appended at a terminator-less last line starts a fresh line", () => {
      const doc = "# A\nbody no newline";
      expect(
        patch(doc, {
          targetType: "heading",
          target: ["A"],
          operation: "append",
          scope: "markerAndContent",
          content: "# B\nnew body",
        }).document
      ).toBe("# A\nbody no newline\n# B\nnew body\n");
    });

    it("a body write under a terminator-less heading line starts a fresh line", () => {
      expect(
        patch("# A", {
          targetType: "heading",
          target: ["A"],
          operation: "append",
          content: "X",
        }).document
      ).toBe("# A\nX\n");
    });
  });

  it("writing into an empty section lands flush under its heading", () => {
    // A heading line is self-delimiting, so no separator is owed above; the
    // section's existing gap becomes the separator below.
    const emptySection = "# E\n\n# F\nf-body\n";
    expect(
      patch(emptySection, {
        targetType: "heading",
        target: ["E"],
        operation: "append",
        content: "X",
      }).document
    ).toBe("# E\nX\n\n# F\nf-body\n");
  });
});
