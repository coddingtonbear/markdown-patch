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
    // Headings nest by containment (the skipped h2 leaves no hole), and the
    // second "2026-07-18" gets its own disambiguated key.
    expect(map.headings).toEqual({
      Overview: { "Known quirks": {} },
      "Development Logs": {
        "2026-07-18": {},
        "2026-07-18\u{FC750}\u{F6440}": {},
      },
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

  test("a repeated sibling name gets a distinct key per occurrence", () => {
    const doc =
      "## Log\n\n### Monday\n\nm\n\n## Log\n\n### Tuesday\n\nt\n";
    const map = projectMap(buildModel(doc));
    // The first "Log" keeps its plain text; the second gets a marker suffix
    // so both are separately addressable, each with its own subtree.
    const secondLog = "Log\u{FC750}\u{F6440}";
    expect(map.headings).toEqual({
      Log: { Monday: {} },
      [secondLog]: { Tuesday: {} },
    });
  });

  test("sections that would have collided on path alone now get distinct addresses", () => {
    const doc =
      "## Log\n\n### Monday\n\nfirst\n\n## Log\n\n### Monday\n\nsecond\n";
    const map = projectMap(buildModel(doc));
    // Both "Log"s have a "Monday" child, but the second "Log" is itself
    // disambiguated, so the two Mondays end up on distinct paths.
    const secondLog = "Log\u{FC750}\u{F6440}";
    expect(map.headings).toEqual({
      Log: { Monday: {} },
      [secondLog]: { Monday: {} },
    });
  });

  test("a repeat's descendants nest under the repeat's own disambiguated key", () => {
    const doc =
      "# A\n\n## X\n\nfirst\n\n# A\n\n## X\n\n### Z\n\nz\n";
    const map = projectMap(buildModel(doc));
    const secondA = "A\u{FC750}\u{F6440}";
    expect(map.headings).toEqual({
      A: { X: {} },
      [secondA]: { X: { Z: {} } },
    });
  });

  test("a block under a repeated heading is still listed, and each heading gets its own key", () => {
    const doc =
      "## Log\n\nfirst ^a\n\n## Log\n\nsecond ^b\n";
    const map = projectMap(buildModel(doc));
    // Blocks are addressed globally and both stay listed regardless.
    const secondLog = "Log\u{FC750}\u{F6440}";
    expect(map.headings).toEqual({ Log: {}, [secondLog]: {} });
    expect(map.blocks).toEqual(["a", "b"]);
  });

  test("a third occurrence advances the hex digit", () => {
    const doc = "## Dup\n\na\n\n## Dup\n\nb\n\n## Dup\n\nc\n";
    const map = projectMap(buildModel(doc));
    expect(Object.keys(map.headings)).toEqual([
      "Dup",
      "Dup\u{FC750}\u{F6440}",
      "Dup\u{FC750}\u{F6441}",
    ]);
  });

  test("a duplicate block id gets its own disambiguated entry in the blocks list", () => {
    const doc = ["first ^dup", "", "second ^dup", "", "third ^dup", ""].join("\n");
    const map = projectMap(buildModel(doc));
    expect(map.blocks).toEqual([
      "dup",
      "dup\u{FC750}\u{F6440}",
      "dup\u{FC750}\u{F6441}",
    ]);
  });

  test("occurrence indexes past 16 cross into two hex digits", () => {
    const lines: string[] = [];
    for (let i = 0; i < 18; i++) {
      lines.push("## Dup", "", `body ${i}`, "");
    }
    const map = projectMap(buildModel(lines.join("\n")));
    const keys = Object.keys(map.headings);
    expect(keys).toHaveLength(18);
    // The 17th occurrence (index 15, hex "f") is the last representable in
    // a single reserved digit.
    expect(keys[16]).toBe("Dup\u{FC750}\u{F644F}");
    // The 18th occurrence (index 16, hex "10") is the first that needs two.
    expect(keys[17]).toBe("Dup\u{FC750}\u{F6441}\u{F6440}");
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
    {
      name: "three siblings with the same text",
      document: "## Dup\n\na\n\n## Dup\n\nb\n\n## Dup\n\nc\n",
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
    // is hidden. Every section now gets its own disambiguated address, so the
    // advertised and actual sets should match one-for-one, with no dedup.
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
