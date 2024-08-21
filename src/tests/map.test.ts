import fs from "fs";
import path from "path";

import { getDocumentMap } from "../map";

describe("map", () => {
  const sample = fs.readFileSync(path.join(__dirname, "sample.md"), "utf-8");

  test("heading", () => {
    const actualHeadings = getDocumentMap(sample).heading;

    const expectedHeadings = {
      Overview: {
        marker: {
          start: 131,
          end: 142,
        },
        content: {
          start: 142,
          end: 430,
        },
        level: 1,
      },
      Problems: {
        marker: {
          start: 430,
          end: 441,
        },
        content: {
          start: 441,
          end: 1468,
        },
        level: 1,
      },
      Actions: {
        marker: {
          start: 1468,
          end: 1478,
        },
        content: {
          start: 1478,
          end: 3182,
        },
        level: 1,
      },
      Headers: {
        marker: {
          start: 3182,
          end: 3192,
        },
        content: {
          start: 3192,
          end: 4282,
        },
        level: 1,
      },
      "Page Targets": {
        marker: {
          start: 4282,
          end: 4297,
        },
        content: {
          start: 4297,
          end: 6988,
        },
        level: 1,
      },
      "Page Targets\u001fHeading": {
        marker: {
          start: 4298,
          end: 4309,
        },
        content: {
          start: 4309,
          end: 5251,
        },
        level: 2,
      },
      "Page Targets\u001fBlock": {
        marker: {
          start: 5251,
          end: 5260,
        },
        content: {
          start: 5260,
          end: 6122,
        },
        level: 2,
      },
      "Page Targets\u001fBlock\u001fUse Cases": {
        marker: {
          start: 5764,
          end: 5778,
        },
        content: {
          start: 5778,
          end: 6122,
        },
        level: 3,
      },
      "Page Targets\u001fFrontmatter Field": {
        marker: {
          start: 6122,
          end: 6143,
        },
        content: {
          start: 6143,
          end: 6690,
        },
        level: 2,
      },
      "Page Targets\u001fFrontmatter Field\u001fUse Cases": {
        marker: {
          start: 6496,
          end: 6510,
        },
        content: {
          start: 6510,
          end: 6690,
        },
        level: 3,
      },
      "Page Targets\u001fDocument Properties (Exploratory)": {
        marker: {
          start: 6690,
          end: 6727,
        },
        content: {
          start: 6727,
          end: 6988,
        },
        level: 2,
      },
    };

    //console.log(JSON.stringify(actualHeadings, undefined, 4));

    expect(actualHeadings).toEqual(expectedHeadings);
  });
});
