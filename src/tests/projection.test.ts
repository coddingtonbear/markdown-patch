import { buildModel } from "../model";
import { projectMap } from "../projection";

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
    expect(map.headings).toEqual([
      ["Overview"],
      ["Overview", null, "Known quirks"],
      ["Development Logs"],
      ["Development Logs", "2026-07-18"],
      ["Development Logs", "2026-07-18"],
    ]);
    expect(map.blocks).toEqual(["thesis", "quirks"]);
    expect(map.version).toMatch(/^[0-9a-f]{6}$/);
  });

  test("null-pads skipped levels and preserves empty heading text", () => {
    const doc = "# \n\nbody\n\n#### Deep\n\ndeep\n";
    const map = projectMap(buildModel(doc));
    expect(map.headings).toEqual([[""], ["", null, null, "Deep"]]);
  });

  test("version tracks content and matches the model", () => {
    const a = buildModel("# A\n\nbody\n");
    const b = buildModel("# A\n\nbody changed\n");
    expect(projectMap(a).version).toEqual(a.version);
    expect(projectMap(a).version).not.toEqual(projectMap(b).version);
  });

  test("headings and blocks are empty for a bare document", () => {
    const map = projectMap(buildModel("just text, no structure\n"));
    expect(map.headings).toEqual([]);
    expect(map.blocks).toEqual([]);
    expect(map.frontmatterFields).toEqual([]);
  });
});
