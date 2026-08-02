/**
 * Pins the map example the README documents under "Inspecting a document",
 * along with the claims the prose around it makes.
 *
 * Two things have to stay true together, so both are checked: the engine has to
 * produce the map the docs show, and the docs have to keep showing that map.
 * The sample document is read out of README.md itself rather than retyped here,
 * so the map under test is the one a reader actually gets by pasting the
 * snippet; the expected values are the literal characters the docs display, so
 * an engine change fails the projection assertions and a docs edit fails the
 * quoted-line assertions.
 *
 * The example this replaces was wrong for the whole of 2.0: it showed
 * `headings` as an array of paths (`[["Meeting Notes"], ["Meeting Notes",
 * "Action Items"]]`), a shape no released version ever produced -- 1.x's
 * `getDocumentMap` returned a flat `Record` of `::`-joined keys, and 2.0's
 * `projectMap` returns a containment tree.  A reader following it would have
 * indexed into an array that was really an object.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { buildModel } from "../model";
import { projectMap, headingTreePaths } from "../projection";
import { readTarget } from "../read";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.join(path.dirname(__filename), "..", "..");

const readDoc = (relativePath: string): string =>
  fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf-8");

/**
 * The `const document = ...` template literal from the README's "Library usage"
 * section -- the document every later snippet, including the map example, is
 * written against.  Extracted rather than retyped so the projection under test
 * is the one a reader gets by copying the snippet.
 */
const readmeSampleDocument = (): string => {
  const match = /const document = `([\s\S]*?)`;/.exec(readDoc("README.md"));
  if (!match) {
    throw new Error(
      "README.md no longer defines `const document = ...`; the map example's " +
        "input has moved and this test needs to follow it"
    );
  }
  return match[1];
};

describe("documented map example", () => {
  test("the README's sample document projects to the map the README shows", () => {
    const map = projectMap(buildModel(readmeSampleDocument()));

    expect(map).toEqual({
      version: "329b63",
      frontmatterFields: ["status"],
      headings: { "Meeting Notes": { "Action Items": {} } },
      blocks: [],
    });
  });

  test("the README still quotes that map verbatim", () => {
    const readme = readDoc("README.md");

    for (const line of [
      '//   version: "329b63",',
      '//   frontmatterFields: ["status"],',
      '//   headings: { "Meeting Notes": { "Action Items": {} } },',
      "//   blocks: []",
    ]) {
      expect(readme).toContain(line);
    }
  });

  test("pages/how_to.md shows the same heading shape", () => {
    // The typedoc project document carries its own copy of the example; it
    // drifted in lockstep with the README's and has to stay in lockstep now.
    expect(readDoc("pages/how_to.md")).toContain(
      '//   headings: { "Meeting Notes": { "Action Items": {} } },'
    );
  });
});

describe("documented claims about the heading tree", () => {
  const map = () => projectMap(buildModel(readmeSampleDocument()));

  test("a leaf heading maps to an empty object", () => {
    expect(map().headings["Meeting Notes"]["Action Items"]).toEqual({});
  });

  test("headingTreePaths turns the tree into the list of addresses", () => {
    expect(headingTreePaths(map().headings)).toEqual([
      ["Meeting Notes"],
      ["Meeting Notes", "Action Items"],
    ]);
  });

  test("a path of keys is exactly what a target takes", () => {
    // The README's "pass it straight back as a `target`" claim: every address
    // the tree advertises has to resolve against the same document.
    const document = readmeSampleDocument();
    for (const target of headingTreePaths(map().headings)) {
      expect(readTarget(document, { targetType: "heading", target })).toEqual(
        expect.objectContaining({ kind: "heading" })
      );
    }
  });

  test("a skipped level is not a hole -- the deeper heading nests under its container", () => {
    // "an `h1` followed directly by an `h3`", as the README puts it.
    expect(projectMap(buildModel("# One\n\n### Deep\n\nbody\n")).headings).toEqual({
      One: { Deep: {} },
    });
  });

  test("a heading with no text is the key \"\"", () => {
    expect(projectMap(buildModel("# One\n\n##\n\nbody\n")).headings).toEqual({
      One: { "": {} },
    });
  });
});
