import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { applyEdits, spliceRange, OverlappingEditsError } from "../splice";
import {
  buildModel,
  eachSection,
  SectionNode,
} from "../model";
import {
  lastDescendant,
  subtreeContentRange,
  subtreeEnd,
  headingMarkerRange,
  blockFullRange,
  RootHasNoMarkerError,
} from "../ranges";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFORMANCE_DIR = path.join(__dirname, "conformance");

describe("applyEdits", () => {
  const doc = "0123456789";

  test("replaces a single range", () => {
    expect(spliceRange(doc, { start: 2, end: 5 }, "XYZ")).toBe("01XYZ56789");
  });

  test("inserts at a point (empty range)", () => {
    expect(spliceRange(doc, { start: 3, end: 3 }, "--")).toBe("012--3456789");
  });

  test("stitches multiple non-overlapping edits regardless of order", () => {
    const result = applyEdits(doc, [
      { range: { start: 7, end: 8 }, text: "B" },
      { range: { start: 1, end: 2 }, text: "A" },
    ]);
    expect(result).toBe("0A23456B89");
  });

  test("throws on overlapping edits", () => {
    expect(() =>
      applyEdits(doc, [
        { range: { start: 2, end: 5 }, text: "x" },
        { range: { start: 4, end: 6 }, text: "y" },
      ])
    ).toThrow(OverlappingEditsError);
  });

  test("throws on an inverted range", () => {
    expect(() => spliceRange(doc, { start: 5, end: 2 }, "x")).toThrow(
      OverlappingEditsError
    );
  });
});

describe("splice no-op identity (property over fixtures)", () => {
  const fixtures = fs
    .readdirSync(CONFORMANCE_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => fs.readFileSync(path.join(CONFORMANCE_DIR, f), "utf-8"));

  test("splicing every node's own text back is identity", () => {
    for (const doc of fixtures) {
      const model = buildModel(doc);
      const edits: Array<{ range: { start: number; end: number }; text: string }> =
        [];
      eachSection(model.root, (node) => {
        if (node.marker) {
          edits.push({
            range: node.marker,
            text: doc.slice(node.marker.start, node.marker.end),
          });
        }
        edits.push({
          range: node.body,
          text: doc.slice(node.body.start, node.body.end),
        });
      });
      // Edits are node markers/contents, which are disjoint and in order.
      expect(applyEdits(doc, edits)).toBe(doc);
    }
  });
});

describe("subtree ranges", () => {
  const doc = [
    "# A", // 0
    "a-body", //
    "", //
    "## B", //
    "b-body", //
    "", //
    "# C", //
    "c-body", //
    "", //
  ].join("\n");

  const sectionByText = (text: string): SectionNode => {
    let found: SectionNode | undefined;
    eachSection(buildModel(doc).root, (n) => {
      if (n.heading?.text === text) found = n;
    });
    if (!found) throw new Error(`no section ${text}`);
    return found;
  };

  test("lastDescendant walks to the deepest last child", () => {
    const a = sectionByText("A");
    expect(lastDescendant(a).heading?.text).toBe("B");
  });

  test("subtreeContentRange covers the section and its descendants but not the next sibling", () => {
    const a = sectionByText("A");
    const span = doc.slice(
      subtreeContentRange(a).start,
      subtreeContentRange(a).end
    );
    expect(span).toContain("# A");
    expect(span).toContain("a-body");
    expect(span).toContain("## B");
    expect(span).toContain("b-body");
    expect(span).not.toContain("# C");
  });

  test("subtreeEnd includes the trailing separator gap", () => {
    const a = sectionByText("A");
    expect(subtreeEnd(a)).toBeGreaterThan(subtreeContentRange(a).end);
    // The gap between B's body and C is a single blank line.
    expect(doc.slice(subtreeContentRange(a).end, subtreeEnd(a))).toBe("\n");
  });

  test("headingMarkerRange returns the heading line and rejects the root", () => {
    const a = sectionByText("A");
    expect(doc.slice(headingMarkerRange(a).start, headingMarkerRange(a).end)).toBe(
      "# A\n"
    );
    expect(() => headingMarkerRange(buildModel(doc).root)).toThrow(
      RootHasNoMarkerError
    );
  });
});

describe("block ranges", () => {
  test("blockFullRange spans an inline id's content through its marker", () => {
    const doc = "a paragraph ^ref\n";
    const model = buildModel(doc);
    let range: { start: number; end: number } | undefined;
    eachSection(model.root, (n) =>
      n.blocks.forEach((b) => {
        if (b.id === "ref") range = blockFullRange(b);
      })
    );
    expect(range).toBeDefined();
    expect(doc.slice(range!.start, range!.end)).toBe("a paragraph ^ref");
  });
});
