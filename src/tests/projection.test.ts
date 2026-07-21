import { buildModel } from "../model";
import { projectMap, headingTreePaths } from "../projection";

describe("projectMap", () => {
  test("produces the first-pass public shape", () => {
    const doc =
      "---\n" +
      "status: draft\n" +
      "reviewers:\n" +
      "- alice\n" +
      "---\n\n" +
      "# Overview\n\n" +
      "The thesis. ^thesis\n\n" +
      "### Known quirks\n\n" +
      "| quirk | fixed |\n| --- | --- |\n| a | b |\n\n^quirks\n\n" +
      "# Development Logs\n\n" +
      "## 2026-07-18\n\nfirst\n\n" +
      "## 2026-07-18\n\nsecond\n";
    const map = projectMap(buildModel(doc));

    expect(map.frontmatterFields).toEqual(["status", "reviewers"]);
    // Headings nest by containment (the skipped h2 leaves no hole), and the two
    // "2026-07-18" siblings collapse to one key — first-wins.
    expect(map.headings).toEqual({
      Overview: { "Known quirks": {} },
      "Development Logs": { "2026-07-18": {} },
    });
    expect(map.blocks).toEqual(["thesis", "quirks"]);
    expect(map.version).toMatch(/^[0-9a-f]{6}$/);
  });

  test("skipped levels nest by containment and empty heading text is a key", () => {
    const doc = "# \n\nbody\n\n#### Deep\n\ndeep\n";
    const map = projectMap(buildModel(doc));
    expect(map.headings).toEqual({ "": { Deep: {} } });
  });

  test("version tracks content and matches the model", () => {
    const a = buildModel("# A\n\nbody\n");
    const b = buildModel("# A\n\nbody changed\n");
    expect(projectMap(a).version).toEqual(a.version);
    expect(projectMap(a).version).not.toEqual(projectMap(b).version);
  });

  test("headings and blocks are empty for a bare document", () => {
    const map = projectMap(buildModel("just text, no structure\n"));
    expect(map.headings).toEqual({});
    expect(map.blocks).toEqual([]);
    expect(map.frontmatterFields).toEqual([]);
  });

  test("first-wins keeps the first duplicate's subtree, not the last", () => {
    const doc =
      "## Log\n\n### Monday\n\nm\n\n## Log\n\n### Tuesday\n\nt\n";
    const map = projectMap(buildModel(doc));
    // The first "Log" (with Monday) wins; the second "Log" and Tuesday drop out.
    expect(map.headings).toEqual({ Log: { Monday: {} } });
  });

  test("a block under a shadowed duplicate heading is still listed", () => {
    const doc =
      "## Log\n\nfirst ^a\n\n## Log\n\nsecond ^b\n";
    const map = projectMap(buildModel(doc));
    // The second "Log" is omitted from the tree, but its block stays addressable.
    expect(map.headings).toEqual({ Log: {} });
    expect(map.blocks).toEqual(["a", "b"]);
  });

  test("headingTreePaths enumerates every address in document order", () => {
    const doc = "# A\n\n## B\n\nb\n\n### C\n\nc\n\n# D\n\nd\n";
    const paths = headingTreePaths(projectMap(buildModel(doc)).headings);
    expect(paths).toEqual([
      ["A"],
      ["A", "B"],
      ["A", "B", "C"],
      ["D"],
    ]);
  });
});
