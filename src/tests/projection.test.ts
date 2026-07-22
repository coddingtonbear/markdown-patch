import { buildModel, eachSection } from "../model";
import { projectMap, headingTreePaths, headingPath } from "../projection";
import { resolveHeading } from "../resolve";

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

  test("a repeated sibling name merges its children into one subtree", () => {
    const doc =
      "## Log\n\n### Monday\n\nm\n\n## Log\n\n### Tuesday\n\nt\n";
    const map = projectMap(buildModel(doc));
    // "Log" is one key, but Tuesday has its own containment path and so is its
    // own address — dropping it would hide a heading the resolver can reach.
    expect(map.headings).toEqual({ Log: { Monday: {}, Tuesday: {} } });
  });

  test("sections that genuinely share a path collapse to one address", () => {
    const doc =
      "## Log\n\n### Monday\n\nfirst\n\n## Log\n\n### Monday\n\nsecond\n";
    const map = projectMap(buildModel(doc));
    // Both Mondays are ["Log", "Monday"]; that is one address, and it resolves
    // to the first in document order.
    expect(map.headings).toEqual({ Log: { Monday: {} } });
  });

  test("a repeat's descendants merge even below a shared path", () => {
    const doc =
      "# A\n\n## X\n\nfirst\n\n# A\n\n## X\n\n### Z\n\nz\n";
    const map = projectMap(buildModel(doc));
    // ["A","X"] is shared, but ["A","X","Z"] is unique and stays addressable.
    expect(map.headings).toEqual({ A: { X: { Z: {} } } });
  });

  test("a block under a repeated heading is still listed", () => {
    const doc =
      "## Log\n\nfirst ^a\n\n## Log\n\nsecond ^b\n";
    const map = projectMap(buildModel(doc));
    // Neither "Log" has child headings, so the tree has one leaf; blocks are
    // addressed globally and both stay listed.
    expect(map.headings).toEqual({ Log: {} });
    expect(map.blocks).toEqual(["a", "b"]);
  });

  test("a heading literally named __proto__ is a real, addressable key", () => {
    const doc = "# __proto__\n\nbody\n\n## Child\n\nc\n";
    const map = projectMap(buildModel(doc));
    // A plain `into[text] = subtree` assignment for text === "__proto__" sets
    // the object's prototype instead of an own property, silently dropping the
    // heading from the map. It must come back as a real own, enumerable key.
    expect(Object.prototype.hasOwnProperty.call(map.headings, "__proto__")).toBe(
      true
    );
    expect(map.headings.__proto__).toEqual({ Child: {} });
    expect(Object.keys(map.headings)).toEqual(["__proto__"]);
  });

  test("headingTreePaths enumerates every address in document order", () => {
    const paths = headingTreePaths(
      projectMap(buildModel("# A\n\n## B\n\nb\n\n### C\n\nc\n\n# D\n\nd\n")).headings
    );
    expect(paths).toEqual([["A"], ["A", "B"], ["A", "B", "C"], ["D"]]);
  });
});

// The map's contract: it advertises neither more nor less than the resolver
// accepts.  Under-reporting hides reachable headings from a consumer whose only
// view of the document is this map; over-reporting hands out addresses that 404.
describe("map/resolver agreement — the tree is exactly the addressable set", () => {
  const documents: Array<{ name: string; document: string }> = [
    { name: "plain nesting", document: "# A\n\n## B\n\nb\n\n### C\n\nc\n\n# D\n\nd\n" },
    { name: "skipped levels", document: "# A\n\nbody\n\n#### Deep\n\ndeep\n" },
    {
      name: "repeated sibling with distinct children",
      document: "## Log\n\n### Monday\n\nm\n\n## Log\n\n### Tuesday\n\nt\n",
    },
    {
      name: "repeated sibling with colliding children",
      document: "## Log\n\n### Monday\n\nfirst\n\n## Log\n\n### Monday\n\nsecond\n",
    },
    {
      name: "repeat nested below a shared path",
      document: "# A\n\n## X\n\nfirst\n\n# A\n\n## X\n\n### Z\n\nz\n",
    },
    { name: "empty heading text", document: "# \n\nbody\n\n## Child\n\nc\n" },
    { name: "no headings at all", document: "just prose\n" },
    {
      name: "__proto__ as heading text",
      document: "# __proto__\n\nbody\n\n## Child\n\nc\n",
    },
  ];

  test.each(documents)("$name", ({ document }) => {
    const model = buildModel(document);
    const advertised = headingTreePaths(projectMap(model).headings);

    // Every advertised address resolves.
    for (const address of advertised) {
      expect(resolveHeading(model, address)).not.toBeNull();
    }

    // ...and every heading in the document is advertised, so nothing reachable
    // is hidden.  Sections sharing a path are one address, hence the dedup.
    const actual: string[][] = [];
    eachSection(model.root, (node) => {
      if (node.heading) {
        actual.push(headingPath(node));
      }
    });
    const key = (path: string[]): string => JSON.stringify(path);
    expect(new Set(advertised.map(key))).toEqual(new Set(actual.map(key)));
  });
});
