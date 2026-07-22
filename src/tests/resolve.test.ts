import { buildModel } from "../model";
import { resolveTarget, resolveHeading, resolveBlock, ResolvedTarget } from "../resolve";
import { headingPath } from "../projection";

const headingLevel = (r: ResolvedTarget | null): number | null =>
  r && r.kind === "heading" && r.section.heading ? r.section.heading.level : null;

const bodyOf = (doc: string, r: ResolvedTarget | null): string => {
  if (!r || r.kind !== "heading") return "";
  return doc.slice(r.section.body.start, r.section.body.end);
};

describe("resolveHeading", () => {
  // Two h1 "A"s: the first has an h2 "B", the second an h3 "B" (skipped h2).
  const dupDoc = ["# A", "## B", "body b1", "", "# A", "### B", "body b2", ""].join(
    "\n"
  );

  test("null and [] resolve to the document root", () => {
    const model = buildModel(dupDoc);
    expect(resolveHeading(model, null)?.section).toBe(model.root);
    expect(resolveHeading(model, [])?.section).toBe(model.root);
  });

  test("containment path matches by nesting, first in document order", () => {
    const model = buildModel(dupDoc);
    // ["A","B"] names the first "A"'s child "B" (an h2); the second "A"'s "B"
    // (an h3) shares the same containment path but comes later.
    const r = resolveHeading(model, ["A", "B"]);
    expect(headingLevel(r)).toBe(2);
    expect(bodyOf(dupDoc, r)).toContain("body b1");
  });

  test("a bare, unsuffixed address uniquely names the first occurrence", () => {
    const model = buildModel(dupDoc);
    const r = resolveHeading(model, ["A"]);
    expect(headingLevel(r)).toBe(1);
    // The second "A" now has its own disambiguated address (see the next
    // test), so ["A"] is no longer "first wins among ambiguous matches" — it
    // unambiguously names only the first occurrence.
    expect(r?.kind).toBe("heading");
    if (r?.kind === "heading") {
      expect(r.section).toBe(model.root.children[0]);
    }
  });

  test("a repeated heading's later occurrence resolves via its disambiguated address", () => {
    const model = buildModel(dupDoc);
    const secondA = model.root.children[1];
    const address = headingPath(secondA);
    expect(address).toEqual(["A\u{FC750}\u{F6440}"]);
    const r = resolveHeading(model, address);
    expect(r?.kind).toBe("heading");
    if (r?.kind === "heading") {
      expect(r.section).toBe(secondA);
    }
  });

  test("containment path spans a skipped level (garden path)", () => {
    const doc = ["# Over", "### Quirk", "x", ""].join("\n");
    const model = buildModel(doc);
    // The skipped h2 leaves no hole in the address; ["Over","Quirk"] resolves.
    expect(headingLevel(resolveHeading(model, ["Over", "Quirk"]))).toBe(3);
  });

  test("empty-text heading is addressable by its empty-string key", () => {
    const doc = ["# ", "under empty", "## Real", "deep", ""].join("\n");
    const model = buildModel(doc);
    expect(headingLevel(resolveHeading(model, ["", "Real"]))).toBe(2);
  });

  test("returns null when no heading matches", () => {
    const model = buildModel(dupDoc);
    expect(resolveHeading(model, ["Nope"])).toBeNull();
    expect(resolveHeading(model, ["A", "C"])).toBeNull();
  });
});

describe("resolveTarget dispatch", () => {
  const doc = [
    "---",
    "status: draft",
    "reviewers:",
    "  - alice",
    "---",
    "para with ref ^blk1",
    "",
    "# H",
    "para ^blk2",
    "",
  ].join("\n");

  test("resolves a block by bare id", () => {
    const model = buildModel(doc);
    const r = resolveTarget(model, { targetType: "block", target: "blk1" });
    expect(r?.kind).toBe("block");
    if (r?.kind === "block") {
      expect(r.block.id).toBe("blk1");
      expect(r.block.kind).toBe("paragraph");
    }
  });

  test("a duplicate block id's bare form resolves only the first occurrence", () => {
    const dupDoc = ["first ^dup", "", "second ^dup", ""].join("\n");
    const model = buildModel(dupDoc);
    const r = resolveBlock(model, "dup");
    expect(r?.kind).toBe("block");
    if (r?.kind === "block") {
      expect(r.block.content.start).toBe(dupDoc.indexOf("first"));
    }
  });

  test("a duplicate block id's later occurrence resolves via its disambiguated address", () => {
    const dupDoc = ["first ^dup", "", "second ^dup", ""].join("\n");
    const model = buildModel(dupDoc);
    const r = resolveBlock(model, "dup\u{FC750}\u{F6440}");
    expect(r?.kind).toBe("block");
    if (r?.kind === "block") {
      expect(r.block.content.start).toBe(dupDoc.indexOf("second"));
    }
  });

  test("resolves a frontmatter key", () => {
    const model = buildModel(doc);
    const r = resolveTarget(model, {
      targetType: "frontmatter",
      target: "status",
    });
    expect(r?.kind).toBe("frontmatter");
    if (r?.kind === "frontmatter") {
      expect(r.entry.key).toBe("status");
      expect(r.entry.value).toBe("draft");
    }
  });

  test("resolves a heading via the dispatcher", () => {
    const model = buildModel(doc);
    const r = resolveTarget(model, { targetType: "heading", target: ["H"] });
    expect(headingLevel(r)).toBe(1);
  });

  test("returns null for missing block and frontmatter targets", () => {
    const model = buildModel(doc);
    expect(
      resolveTarget(model, { targetType: "block", target: "missing" })
    ).toBeNull();
    expect(
      resolveTarget(model, { targetType: "frontmatter", target: "missing" })
    ).toBeNull();
  });
});
