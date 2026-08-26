/**
 * The playground's logic, tested away from the DOM. `playground.ts` holds no
 * top-level side effects — `playground.main.ts` is what calls `mount()` in the
 * bundle — so everything below runs in plain Node.
 */
import type { DiffRow } from "./playground.js";
import * as playground from "./playground.js";

const texts = (rows: DiffRow[]): string[] => rows.map(([text]) => text);
const kinds = (rows: DiffRow[]): string[] => rows.map(([, kind]) => kind);

describe("diffLines", () => {
  it("marks nothing when the document is unchanged", () => {
    const rows = playground.diffLines("a\nb\nc", "a\nb\nc");
    expect(kinds(rows)).toEqual(["", "", ""]);
  });

  it("marks an inserted line as added, in place", () => {
    const rows = playground.diffLines("a\nb", "a\nnew\nb");
    expect(texts(rows)).toEqual(["a", "new", "b"]);
    expect(kinds(rows)).toEqual(["", "add", ""]);
  });

  it("marks a removed line as deleted", () => {
    const rows = playground.diffLines("a\ngone\nb", "a\nb");
    expect(texts(rows)).toEqual(["a", "gone", "b"]);
    expect(kinds(rows)).toEqual(["", "del", ""]);
  });

  it("shows a replaced line as a deletion beside an addition", () => {
    const rows = playground.diffLines("# Attendees", "# People");
    expect(rows).toEqual([
      ["# Attendees", "del"],
      ["# People", "add"],
    ]);
  });

  it("keeps every line of the new document, in order", () => {
    const after = "---\nstatus: final\n---\n\n# Title\n\nbody\n";
    const rows = playground.diffLines("# Title\n", after);
    expect(texts(rows.filter(([, kind]) => kind !== "del"))).toEqual(
      after.split("\n")
    );
  });

  it("does not choke on an empty document on either side", () => {
    expect(kinds(playground.diffLines("", "a"))).toEqual(["del", "add"]);
    expect(texts(playground.diffLines("a", ""))).toEqual(["a", ""]);
  });

  it("falls back to the new document when the diff would be too large", () => {
    const before = "x\n".repeat(700);
    const after = "y\n".repeat(700);
    const rows = playground.diffLines(before, after);
    expect(kinds(rows).every((kind) => kind === "")).toBe(true);
    expect(rows).toHaveLength(after.split("\n").length);
  });
});

describe("mapChips", () => {
  const DOCUMENT = [
    "---",
    "status: draft",
    "owner: adam",
    "---",
    "",
    "# Weekly Sync",
    "",
    "## Notes",
    "",
    "A line. ^note-1",
    "",
  ].join("\n");

  it("offers the version token as an ifMatch chip", () => {
    const { chips } = playground.mapChips(DOCUMENT);
    expect(chips![0]!.group).toBe("version");
    expect(chips![0]!.fields).toEqual({ ifMatch: chips![0]!.label });
    expect(chips![0]!.label).toMatch(/^[0-9a-f]{6}$/);
  });

  it("offers every heading path, labelled readably but targeted as an array", () => {
    const { chips } = playground.mapChips(DOCUMENT);
    const headings = chips!.filter((chip) => chip.group === "headings");
    expect(headings.map((chip) => chip.label)).toEqual([
      "Weekly Sync",
      "Weekly Sync › Notes",
    ]);
    expect(headings[1]!.fields).toEqual({
      targetType: "heading",
      target: ["Weekly Sync", "Notes"],
    });
  });

  it("offers frontmatter fields and block ids", () => {
    const { chips } = playground.mapChips(DOCUMENT);
    expect(
      chips!.filter((chip) => chip.group === "frontmatter").map((c) => c.fields)
    ).toEqual([
      { targetType: "frontmatter", target: "status" },
      { targetType: "frontmatter", target: "owner" },
    ]);
    const blocks = chips!.filter((chip) => chip.group === "blocks");
    expect(blocks).toEqual([
      {
        group: "blocks",
        label: "note-1",
        fields: { targetType: "block", target: "note-1" },
      },
    ]);
  });

  it("still produces a version chip for an empty document", () => {
    const { chips, error } = playground.mapChips("");
    expect(error).toBeNull();
    expect(chips!.map((chip) => chip.group)).toEqual(["version"]);
  });

  it("reports a document it cannot model instead of throwing", () => {
    const { chips, error } = playground.mapChips("---\n: : :\nnope\n---\n");
    // Either outcome is legitimate — some malformed frontmatter models fine —
    // but neither may escape as an exception to the keystroke handler.
    expect(chips === null ? typeof error : error).toBeTruthy();
  });
});

describe("foldAddress", () => {
  const FALLBACK = { targetType: "heading", target: ["A"] };

  it("keeps the fields the visitor already wrote", () => {
    const folded = playground.foldAddress(
      JSON.stringify({ operation: "append", content: "hi", target: ["Old"] }),
      { targetType: "heading", target: ["New", "Path"] },
      FALLBACK
    );
    expect(JSON.parse(folded)).toEqual({
      operation: "append",
      content: "hi",
      targetType: "heading",
      target: ["New", "Path"],
    });
  });

  it("replaces the whole target when the address changes type", () => {
    const folded = playground.foldAddress(
      JSON.stringify({ targetType: "heading", target: ["A", "B"] }),
      { targetType: "block", target: "note-1" },
      FALLBACK
    );
    expect(JSON.parse(folded)).toEqual({
      targetType: "block",
      target: "note-1",
    });
  });

  it("adds ifMatch without disturbing the address", () => {
    const folded = playground.foldAddress(
      JSON.stringify({ targetType: "heading", target: ["A"], operation: "append" }),
      { ifMatch: "abc123" },
      FALLBACK
    );
    expect(JSON.parse(folded)).toEqual({
      targetType: "heading",
      target: ["A"],
      operation: "append",
      ifMatch: "abc123",
    });
  });

  it("recovers from unparseable text by starting from the fallback", () => {
    const folded = playground.foldAddress("{not json", { ifMatch: "abc123" }, FALLBACK);
    expect(JSON.parse(folded)).toEqual({ ...FALLBACK, ifMatch: "abc123" });
  });

  it("refuses to merge into a non-object", () => {
    const folded = playground.foldAddress("[1, 2]", { ifMatch: "abc123" }, FALLBACK);
    expect(JSON.parse(folded)).toEqual({ ...FALLBACK, ifMatch: "abc123" });
  });

  it("pretty-prints, since the result goes straight back into the editor", () => {
    expect(playground.foldAddress("{}", { ifMatch: "abc123" }, FALLBACK)).toBe(
      '{\n  "ifMatch": "abc123"\n}'
    );
  });
});

describe("runInstruction", () => {
  const DOCUMENT = "---\nstatus: draft\n---\n\n# Title\n\nbody\n";

  it("patches and reports the diff", () => {
    const outcome = playground.runInstruction(
      DOCUMENT,
      JSON.stringify({
        targetType: "heading",
        target: ["Title"],
        operation: "append",
        content: "more",
      }),
      "patch"
    );
    expect(outcome.kind).toBe("ok");
    if (outcome.kind !== "ok") return;
    expect(texts(outcome.rows)).toContain("more");
    expect(outcome.rows.find(([text]) => text === "more")![1]).toBe("add");
    expect(outcome.warnings).toEqual([]);
  });

  it("reads without writing", () => {
    const outcome = playground.runInstruction(
      DOCUMENT,
      JSON.stringify({ targetType: "frontmatter", target: "status" }),
      "read"
    );
    expect(outcome.kind).toBe("ok");
    if (outcome.kind !== "ok") return;
    expect(outcome.rows.map(([text]) => text).join("\n")).toBe('"draft"');
    expect(outcome.status).toContain('scope "content"');
  });

  it("shows a section's content itself, not the readTarget envelope", () => {
    const outcome = playground.runInstruction(
      DOCUMENT,
      JSON.stringify({ targetType: "heading", target: ["Title"] }),
      "read"
    );
    expect(outcome.kind).toBe("ok");
    if (outcome.kind !== "ok") return;
    const text = outcome.rows.map(([t]) => t).join("\n");
    expect(text).toContain("body");
    expect(text).not.toContain('"kind"');
  });

  it("names malformed JSON as a syntax error, not an engine error", () => {
    const outcome = playground.runInstruction(DOCUMENT, "{oops", "patch");
    expect(outcome).toMatchObject({ kind: "error", name: "SyntaxError" });
  });

  it("surfaces the engine's own error for an unresolvable address", () => {
    const outcome = playground.runInstruction(
      DOCUMENT,
      JSON.stringify({
        targetType: "heading",
        target: ["Nope"],
        operation: "append",
        content: "x",
      }),
      "patch"
    );
    expect(outcome).toMatchObject({
      kind: "error",
      name: "TargetNotFoundError",
    });
  });

  it("surfaces the engine's own error for a malformed instruction", () => {
    const outcome = playground.runInstruction(
      DOCUMENT,
      JSON.stringify({ targetType: "heading" }),
      "patch"
    );
    expect(outcome).toMatchObject({
      kind: "error",
      name: "InvalidInstructionError",
    });
  });

  it("fails a stale ifMatch, which is the whole point of showing the token", () => {
    const { chips } = playground.mapChips(DOCUMENT);
    const version = chips![0]!.label;
    const live = playground.runInstruction(
      DOCUMENT,
      JSON.stringify({
        targetType: "heading",
        target: ["Title"],
        operation: "append",
        content: "x",
        ifMatch: version,
      }),
      "patch"
    );
    expect(live.kind).toBe("ok");

    const stale = playground.runInstruction(
      `${DOCUMENT}edited\n`,
      JSON.stringify({
        targetType: "heading",
        target: ["Title"],
        operation: "append",
        content: "x",
        ifMatch: version,
      }),
      "patch"
    );
    expect(stale).toMatchObject({
      kind: "error",
      name: "PreconditionFailedError",
    });
  });
});

describe("optionChips", () => {
  it("lists every operation and scope for patch mode", () => {
    const chips = playground.optionChips("patch");
    const values = (field: string) =>
      chips.filter((c) => c.field === field).map((c) => c.value);
    expect(values("targetType")).toEqual(["heading", "block", "frontmatter"]);
    expect(values("operation")).toEqual(["replace", "prepend", "append", "delete"]);
    expect(values("scope")).toEqual(["content", "marker", "markerAndContent", "parent"]);
  });

  it("drops operation and the parent scope in read mode", () => {
    const chips = playground.optionChips("read");
    expect(chips.some((c) => c.field === "operation")).toBe(false);
    expect(chips.map((c) => c.value)).not.toContain("parent");
  });
});

describe("selectedOptions", () => {
  it("reads the enumerated fields and defaults scope to content", () => {
    expect(
      playground.selectedOptions(
        JSON.stringify({ targetType: "heading", target: ["A"], operation: "append" })
      )
    ).toEqual({ targetType: "heading", operation: "append", scope: "content" });
  });

  it("selects nothing for text that isn't an object", () => {
    expect(playground.selectedOptions("{oops")).toEqual({});
    expect(playground.selectedOptions("[1]")).toEqual({});
  });
});
