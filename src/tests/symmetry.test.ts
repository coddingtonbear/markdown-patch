import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { patch } from "../engine";
import { Instruction } from "../instructions";
import { buildModel, eachSection, serializeModel } from "../model";
import { projectMap, headingPath } from "../projection";
import { headingContentRange } from "../ranges";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFORMANCE_DIR = path.join(__dirname, "conformance");

const arrayEquals = (a: unknown[], b: unknown[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const collapse = (path: (string | null)[]): (string | null)[] =>
  path.filter((segment) => segment !== null);

const collapsedHeadings = (document: string): (string | null)[][] =>
  projectMap(buildModel(document)).headings.map(collapse);

const hasHeading = (document: string, wanted: string[]): boolean =>
  collapsedHeadings(document).some((heading) => arrayEquals(heading, wanted));

// The top design constraint: a successful, non-overflow write leaves its target
// addressable in the map derived from the result.
describe("map/patch symmetry — written targets are addressable in the next map", () => {
  const DOC = "# A\na-body\n\n## B\nb-body\n\n# C\nc-body\n";
  const FM = "---\ntitle: Hello\n---\nbody\n";

  const cases: Array<{
    name: string;
    document: string;
    instruction: Instruction;
    check: (result: string) => boolean;
  }> = [
    {
      name: "content replace keeps the heading addressable",
      document: DOC,
      instruction: {
        targetType: "heading",
        target: ["A", "B"],
        operation: "replace",
        scope: "content",
        content: "z",
      },
      check: (r) => hasHeading(r, ["A", "B"]),
    },
    {
      name: "markerAndContent replace makes the renamed heading addressable",
      document: DOC,
      instruction: {
        targetType: "heading",
        target: ["A", "B"],
        operation: "replace",
        scope: "markerAndContent",
        content: "# Renamed\nx",
      },
      check: (r) => hasHeading(r, ["A", "Renamed"]),
    },
    {
      name: "created heading is addressable",
      document: DOC,
      instruction: {
        targetType: "heading",
        target: ["A", "New"],
        operation: "replace",
        scope: "content",
        content: "body",
        createTargetIfMissing: true,
      },
      check: (r) => hasHeading(r, ["A", "New"]),
    },
    {
      name: "moved heading is addressable under its new parent",
      document: DOC,
      instruction: {
        targetType: "heading",
        target: ["C"],
        operation: "replace",
        scope: "parent",
        destination: { parent: ["A"], place: "last" },
      },
      check: (r) => hasHeading(r, ["A", "C"]),
    },
    {
      name: "sibling insert makes the new section addressable",
      document: DOC,
      instruction: {
        targetType: "heading",
        target: ["A", "B"],
        operation: "prepend",
        scope: "markerAndContent",
        content: "# Sib\ns",
      },
      check: (r) => hasHeading(r, ["A", "Sib"]),
    },
    {
      name: "created block is addressable",
      document: DOC,
      instruction: {
        targetType: "block",
        target: "blk",
        operation: "replace",
        scope: "content",
        content: "a block",
        createTargetIfMissing: true,
      },
      check: (r) => projectMap(buildModel(r)).blocks.includes("blk"),
    },
    {
      name: "created frontmatter key is addressable",
      document: FM,
      instruction: {
        targetType: "frontmatter",
        target: "author",
        operation: "replace",
        scope: "content",
        content: "me",
        createTargetIfMissing: true,
      },
      check: (r) =>
        projectMap(buildModel(r)).frontmatterFields.includes("author"),
    },
  ];

  for (const testCase of cases) {
    test(testCase.name, () => {
      const result = patch(testCase.document, testCase.instruction);
      expect(result.warnings).toEqual([]);
      expect(testCase.check(result.document)).toBe(true);
      // The result must itself be a well-formed model (lossless partition).
      expect(serializeModel(result.document, buildModel(result.document))).toBe(
        result.document
      );
    });
  }
});

// A content-scope replace must not disturb any byte outside the edited body.
describe("splice locality — content edits are confined to the target body", () => {
  const fixtures = fs
    .readdirSync(CONFORMANCE_DIR)
    .filter((file) => file.endsWith(".md"))
    .map((file) => fs.readFileSync(path.join(CONFORMANCE_DIR, file), "utf-8"));

  test("prefix and suffix around a section's body are byte-preserved", () => {
    for (const document of fixtures) {
      const model = buildModel(document);

      // Only target headings whose padded address is unique, so the resolver
      // cannot pick a different occurrence than the one we measured.
      const paths = new Map<string, number>();
      eachSection(model.root, (section) => {
        if (section.heading) {
          const key = JSON.stringify(headingPath(section));
          paths.set(key, (paths.get(key) ?? 0) + 1);
        }
      });

      eachSection(model.root, (section) => {
        if (!section.heading) {
          return;
        }
        if (paths.get(JSON.stringify(headingPath(section))) !== 1) {
          return;
        }
        // `content` scope spans the subtree below the heading (span B), so the
        // preserved suffix begins where that span ends, not at the direct body.
        const body = headingContentRange(section);
        const before = document.slice(0, body.start);
        const after = document.slice(body.end);
        const result = patch(document, {
          targetType: "heading",
          target: headingPath(section),
          operation: "replace",
          scope: "content",
          content: "LOCALMARK",
        }).document;
        expect(result.startsWith(before)).toBe(true);
        expect(result.endsWith(after)).toBe(true);
      });
    }
  });
});
