import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import {
  buildModel,
  serializeModel,
  eachSection,
  DocumentModel,
  SectionNode,
} from "../model";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFORMANCE_DIR = path.join(__dirname, "conformance");

const readConformanceFixtures = (): Array<{ name: string; text: string }> =>
  fs
    .readdirSync(CONFORMANCE_DIR)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .map((f) => ({
      name: f,
      text: fs.readFileSync(path.join(CONFORMANCE_DIR, f), "utf-8"),
    }));

// A spread of hand-crafted documents exercising boundary conditions the
// fixtures may not: no trailing newline, no frontmatter, empty body sections,
// headings with no blank-line separators, and a bare preamble.
const CRAFTED: Array<{ name: string; text: string }> = [
  { name: "empty", text: "" },
  { name: "only-text", text: "Just a paragraph, no headings.\n" },
  { name: "no-trailing-newline", text: "# H\n\nBody with no final newline." },
  { name: "heading-only", text: "# Alone\n" },
  { name: "heading-only-no-newline", text: "# Alone" },
  { name: "no-blank-separators", text: "# A\nbody a\n# B\nbody b\n" },
  {
    name: "preamble-then-heading",
    text: "Preamble line.\n\n# First\n\nBody.\n",
  },
  { name: "consecutive-headings", text: "# A\n## B\n### C\n\nbody\n" },
  {
    name: "many-blank-lines",
    text: "# A\n\nbody a\n\n\n\n# B\n\nbody b\n",
  },
];

const allDocuments = (): Array<{ name: string; text: string }> => [
  ...readConformanceFixtures(),
  ...CRAFTED,
];

const collectSections = (model: DocumentModel): SectionNode[] => {
  const nodes: SectionNode[] = [];
  eachSection(model.root, (n) => nodes.push(n));
  return nodes;
};

describe("model partition invariants", () => {
  describe.each(allDocuments())("$name", ({ text }) => {
    const model = buildModel(text);

    test("round-trips: serializing the model reproduces the source", () => {
      expect(serializeModel(text, model)).toEqual(text);
    });

    test("every section range is well-formed (start <= end)", () => {
      for (const node of collectSections(model)) {
        if (node.marker) {
          expect(node.marker.start).toBeLessThanOrEqual(node.marker.end);
        }
        expect(node.content.start).toBeLessThanOrEqual(node.content.end);
        expect(node.trailingGap.start).toBeLessThanOrEqual(node.trailingGap.end);
      }
    });

    test("content and trailingGap are contiguous per section", () => {
      for (const node of collectSections(model)) {
        expect(node.content.end).toEqual(node.trailingGap.start);
        if (node.marker) {
          expect(node.marker.end).toEqual(node.content.start);
        }
      }
    });

    test("trailingGap is whitespace only", () => {
      for (const node of collectSections(model)) {
        const gap = text.slice(node.trailingGap.start, node.trailingGap.end);
        expect(gap).toMatch(/^\s*$/);
      }
    });

    test("block ranges fall inside their containing section body", () => {
      for (const node of collectSections(model)) {
        for (const block of node.blocks) {
          expect(block.content.start).toBeGreaterThanOrEqual(node.content.start);
          expect(block.marker.end).toBeLessThanOrEqual(node.trailingGap.end);
          expect(block.section).toBe(node);
        }
      }
    });
  });
});

describe("model structure", () => {
  test("duplicate headings become distinct sibling sections", () => {
    const doc =
      "# Log\n\n## 2026-07-18\n\nfirst\n\n## 2026-07-18\n\nsecond\n";
    const model = buildModel(doc);
    const log = model.root.children[0];
    expect(log.children).toHaveLength(2);
    expect(log.children[0].heading?.text).toEqual("2026-07-18");
    expect(log.children[1].heading?.text).toEqual("2026-07-18");
    expect(text_of(doc, log.children[0])).toContain("first");
    expect(text_of(doc, log.children[1])).toContain("second");
  });

  test("skipped heading levels still nest by depth", () => {
    const doc = "# Top\n\nintro\n\n### Deep\n\ndeep body\n\n# Second\n\nx\n";
    const model = buildModel(doc);
    expect(model.root.children.map((c) => c.heading?.text)).toEqual([
      "Top",
      "Second",
    ]);
    const top = model.root.children[0];
    expect(top.children.map((c) => c.heading?.text)).toEqual(["Deep"]);
    expect(top.children[0].heading?.level).toEqual(3);
  });

  test("preamble before the first heading belongs to the root", () => {
    const doc = "Preamble.\n\n# First\n\nbody\n";
    const model = buildModel(doc);
    expect(text_of(doc, model.root)).toContain("Preamble.");
    expect(model.root.heading).toBeNull();
  });

  test("frontmatter block is excluded from the section tree", () => {
    const doc = "---\ntitle: t\n---\n\n# H\n\nbody\n";
    const model = buildModel(doc);
    expect(model.frontmatter.block).not.toBeNull();
    expect(model.frontmatter.entries.map((e) => e.key)).toEqual(["title"]);
    // Root content starts at or after the frontmatter block.
    expect(model.root.content.start).toBeGreaterThanOrEqual(
      model.frontmatter.block!.end
    );
  });
});

const text_of = (doc: string, node: SectionNode): string =>
  doc.slice(node.content.start, node.content.end);

// A small deterministic PRNG so failures are reproducible from their seed.
const mulberry32 = (seed: number): (() => number) => {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const randomDocument = (rand: () => number): string => {
  const eol = rand() < 0.3 ? "\r\n" : "\n";
  const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
  const parts: string[] = [];
  if (rand() < 0.4) {
    parts.push(`---${eol}title: t${eol}count: ${Math.floor(rand() * 9)}${eol}---${eol}`);
  }
  const blockCount = Math.floor(rand() * 8);
  for (let i = 0; i < blockCount; i++) {
    const kind = pick(["heading", "para", "blank", "list", "block-id"]);
    if (kind === "heading") {
      const level = 1 + Math.floor(rand() * 6);
      const text = rand() < 0.15 ? "" : ` H${i}`;
      parts.push(`${"#".repeat(level)}${text}${eol}`);
    } else if (kind === "para") {
      parts.push(`paragraph ${i}${eol}`);
    } else if (kind === "blank") {
      parts.push(eol);
    } else if (kind === "list") {
      parts.push(`- item ${i}a${eol}- item ${i}b${eol}`);
    } else if (kind === "block-id") {
      parts.push(`paragraph ${i} ^b${i}${eol}${eol}`);
    }
  }
  let doc = parts.join("");
  if (rand() < 0.2 && doc.endsWith(eol)) {
    doc = doc.slice(0, -eol.length); // sometimes drop the final newline
  }
  return doc;
};

describe("model partition fuzz", () => {
  test("round-trips across 500 randomly generated documents", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const rand = mulberry32(seed);
      const doc = randomDocument(rand);
      const model = buildModel(doc);
      expect({ seed, out: serializeModel(doc, model) }).toEqual({
        seed,
        out: doc,
      });
      // Section ranges must tile: each section's trailingGap end meets the
      // next boundary and gaps are whitespace only.
      eachSection(model.root, (node) => {
        expect(node.content.end).toEqual(node.trailingGap.start);
        expect(doc.slice(node.trailingGap.start, node.trailingGap.end)).toMatch(
          /^\s*$/
        );
      });
    }
  });
});
