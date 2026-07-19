import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { buildModel, eachSection, SectionNode } from "../model";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFORMANCE_DIR = path.join(__dirname, "conformance");

interface Golden {
  headings: Array<{ level: number; text: string; start: number; end: number }>;
  sections: Array<{ type: string; start: number; end: number }>;
  blocks: Record<string, { start: number; end: number }>;
  listItems: Array<{ start: number; end: number }>;
}

interface Fixture {
  name: string;
  text: string;
  golden: Golden | null;
}

const loadFixtures = (): Fixture[] =>
  fs
    .readdirSync(CONFORMANCE_DIR)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .map((f) => {
      const goldenPath = path.join(
        CONFORMANCE_DIR,
        f.replace(/\.md$/, ".obsidian.json")
      );
      return {
        name: f,
        text: fs.readFileSync(path.join(CONFORMANCE_DIR, f), "utf-8"),
        golden: fs.existsSync(goldenPath)
          ? (JSON.parse(fs.readFileSync(goldenPath, "utf-8")) as Golden)
          : null,
      };
    });

const sectionsOf = (text: string): SectionNode[] => {
  const model = buildModel(text);
  const nodes: SectionNode[] = [];
  eachSection(model.root, (n) => {
    if (n.heading) {
      nodes.push(n);
    }
  });
  return nodes;
};

const blockIds = (text: string): Set<string> => {
  const model = buildModel(text);
  const ids = new Set<string>();
  eachSection(model.root, (n) => n.blocks.forEach((b) => ids.add(b.id)));
  return ids;
};

const fixtures = loadFixtures();
const withGolden = fixtures.filter((f) => f.golden !== null);
const withoutGolden = fixtures.filter((f) => f.golden === null);

describe("Obsidian conformance", () => {
  if (withGolden.length === 0) {
    // No goldens captured yet: keep the suite green but make the gap visible.
    test.todo(
      "capture goldens with src/tests/conformance/capture-snippet.js (see conformance/README.md)"
    );
  }

  const checkFixture = ({ text, golden }: Fixture): void => {
    const g = golden as Golden;
    const sections = sectionsOf(text);

    test("model heading levels, texts and start offsets match Obsidian", () => {
      const modelHeadings = sections.map((s) => ({
        level: s.heading!.level,
        text: s.heading!.text,
        start: s.marker!.start,
      }));
      const obsidianHeadings = g.headings.map((h) => ({
        level: h.level,
        text: h.text,
        start: h.start,
      }));
      expect(modelHeadings).toEqual(obsidianHeadings);
    });

    test("model block ids match Obsidian's block ids", () => {
      expect([...blockIds(text)].sort()).toEqual(Object.keys(g.blocks).sort());
    });

    test("each model block span equals Obsidian's block span", () => {
      const model = buildModel(text);
      eachSection(model.root, (node) => {
        for (const block of node.blocks) {
          const span = g.blocks[block.id];
          expect(span).toBeDefined();
          // Obsidian reports a single span per block: for an isolated `^id` it
          // is the preceding block (our `content`); for an inline `^id` it runs
          // from the content start through the marker.
          const modelSpan = block.isolated
            ? { start: block.content.start, end: block.content.end }
            : { start: block.content.start, end: block.marker.end };
          expect(modelSpan).toEqual({ start: span.start, end: span.end });
        }
      });
    });
  };

  for (const fixture of withGolden) {
    describe(fixture.name, () => checkFixture(fixture));
  }

  for (const fixture of withoutGolden) {
    test.todo(`capture golden for ${fixture.name}`);
  }
});
