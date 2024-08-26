import fs from "fs";
import path from "path";

import { getDocumentMap } from "../map";

describe("map", () => {
  const sample = fs.readFileSync(path.join(__dirname, "sample.md"), "utf-8");

  test("heading", () => {
    const actualHeadings = getDocumentMap(sample).heading;

    const expectedHeadings = {
      "": {
        marker: { start: 0, end: 0 },
        content: { start: 129, end: 6988 },
        level: 0,
      },
      Overview: {
        marker: { start: 131, end: 141 },
        content: { start: 141, end: 429 },
        level: 1,
      },
      Problems: {
        marker: { start: 430, end: 440 },
        content: { start: 440, end: 1467 },
        level: 1,
      },
      Actions: {
        marker: { start: 1468, end: 1477 },
        content: { start: 1477, end: 3181 },
        level: 1,
      },
      Headers: {
        marker: { start: 3182, end: 3191 },
        content: { start: 3191, end: 4281 },
        level: 1,
      },
      "Page Targets": {
        marker: { start: 4282, end: 4296 },
        content: { start: 4296, end: 6987 },
        level: 1,
      },
      "Page Targets\u001fHeading": {
        marker: { start: 4298, end: 4308 },
        content: { start: 4308, end: 5250 },
        level: 2,
      },
      "Page Targets\u001fBlock": {
        marker: { start: 5251, end: 5259 },
        content: { start: 5259, end: 6121 },
        level: 2,
      },
      "Page Targets\u001fBlock\u001fUse Cases": {
        marker: { start: 5764, end: 5777 },
        content: { start: 5777, end: 6121 },
        level: 3,
      },
      "Page Targets\u001fFrontmatter Field": {
        marker: { start: 6122, end: 6142 },
        content: { start: 6142, end: 6689 },
        level: 2,
      },
      "Page Targets\u001fFrontmatter Field\u001fUse Cases": {
        marker: { start: 6496, end: 6509 },
        content: { start: 6509, end: 6689 },
        level: 3,
      },
      "Page Targets\u001fDocument Properties (Exploratory)": {
        marker: { start: 6690, end: 6726 },
        content: { start: 6726, end: 6987 },
        level: 2,
      },
    };

    //console.log(JSON.stringify(actualHeadings, undefined, 4));

    expect(actualHeadings).toEqual(expectedHeadings);
  });
});
