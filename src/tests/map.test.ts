import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { getDocumentMap } from "../map";
import { DocumentMapMarkerContentPair } from "../types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("map", () => {
  const sample = fs.readFileSync(path.join(__dirname, "sample.md"), "utf-8");

  test("heading", () => {
    const actualHeadings = getDocumentMap(sample).heading;

    const expectedHeadings = {
      "": {
        content: {
          start: 130,
          end: 6988,
        },
        marker: {
          start: 0,
          end: 0,
        },
        level: 0,
      },
      Overview: {
        content: {
          start: 142,
          end: 430,
        },
        marker: {
          start: 131,
          end: 142,
        },
        level: 1,
      },
      Problems: {
        content: {
          start: 441,
          end: 1468,
        },
        marker: {
          start: 430,
          end: 441,
        },
        level: 1,
      },
      Actions: {
        content: {
          start: 1478,
          end: 3182,
        },
        marker: {
          start: 1468,
          end: 1478,
        },
        level: 1,
      },
      Headers: {
        content: {
          start: 3192,
          end: 4282,
        },
        marker: {
          start: 3182,
          end: 3192,
        },
        level: 1,
      },
      "Page Targets": {
        content: {
          start: 4297,
          end: 6988,
        },
        marker: {
          start: 4282,
          end: 4297,
        },
        level: 1,
      },
      "Page Targets\u001fHeading": {
        content: {
          start: 4309,
          end: 5251,
        },
        marker: {
          start: 4298,
          end: 4309,
        },
        level: 2,
      },
      "Page Targets\u001fBlock": {
        content: {
          start: 5260,
          end: 6122,
        },
        marker: {
          start: 5251,
          end: 5260,
        },
        level: 2,
      },
      "Page Targets\u001fBlock\u001fUse Cases": {
        content: {
          start: 5778,
          end: 6122,
        },
        marker: {
          start: 5764,
          end: 5778,
        },
        level: 3,
      },
      "Page Targets\u001fFrontmatter Field": {
        content: {
          start: 6143,
          end: 6690,
        },
        marker: {
          start: 6122,
          end: 6143,
        },
        level: 2,
      },
      "Page Targets\u001fFrontmatter Field\u001fUse Cases": {
        content: {
          start: 6510,
          end: 6690,
        },
        marker: {
          start: 6496,
          end: 6510,
        },
        level: 3,
      },
      "Page Targets\u001fDocument Properties (Exploratory)": {
        content: {
          start: 6727,
          end: 6988,
        },
        marker: {
          start: 6690,
          end: 6727,
        },
        level: 2,
      },
    };

    //console.log(JSON.stringify(actualHeadings, undefined, 4));

    expect(actualHeadings).toEqual(expectedHeadings);
  });

  test("block", () => {
    const actualBlocks = getDocumentMap(sample).block;
    const expectedBlocks: Record<string, DocumentMapMarkerContentPair> = {
      "2c67a6": {
        content: {
          start: 1478,
          end: 3172,
        },
        marker: {
          start: 3173,
          end: 3181,
        },
      },
      "1d6271": {
        content: {
          start: 3192,
          end: 4272,
        },
        marker: {
          start: 4273,
          end: 4281,
        },
      },
      bfec1f: {
        content: {
          start: 4310,
          end: 4606,
        },
        marker: {
          start: 4607,
          end: 4615,
        },
      },
      "259a73": {
        content: {
          start: 6570,
          end: 6633,
        },
        marker: {
          start: 6633,
          end: 6642,
        },
      },
      e6068e: {
        content: {
          start: 6642,
          end: 6681,
        },
        marker: {
          start: 6681,
          end: 6690,
        },
      },
    };

    //console.log(JSON.stringify(actualBlocks, undefined, 4));

    expect(actualBlocks).toEqual(expectedBlocks);
  });

  describe("frontmatter", () => {
    test("exists", () => {
      const actualFrontmatter = getDocumentMap(sample).frontmatter;

      const expectedFrontmatter = {
        aliases: ["Structured Markdown Patch"],
        "project-type": "Technical",
        repository: "https://github.com/coddingtonbear/markdown-patch",
      };

      expect(expectedFrontmatter).toEqual(actualFrontmatter);
    });

    test("does not exist", () => {
      const sample = fs.readFileSync(
        path.join(__dirname, "sample.frontmatter.none.md"),
        "utf-8"
      );

      const actualFrontmatter = getDocumentMap(sample).frontmatter;
      const expectedFrontmatter = {};

      expect(expectedFrontmatter).toEqual(actualFrontmatter);
    });

    test("does not exist, but starts with hr", () => {
      const sample = fs.readFileSync(
        path.join(__dirname, "sample.frontmatter.nonfrontmatter-hr.md"),
        "utf-8"
      );

      const actualFrontmatter = getDocumentMap(sample).frontmatter;
      const expectedFrontmatter = {};

      expect(expectedFrontmatter).toEqual(actualFrontmatter);
    });
  });
});
