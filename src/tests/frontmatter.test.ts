import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { patch } from "../engine";
import { buildModel } from "../model";
import { readTarget } from "../read";
import {
  MergeError,
  FrontmatterParseError,
  FrontmatterKeyCollisionError,
} from "../instructions";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FM = "---\ntitle: Hello\ntags:\n  - a\n  - b\n---\nbody text\n";

describe("patch — frontmatter content cells", () => {
  test("replace @ content sets the value, preserving the body", () => {
    const result = patch(FM, {
      targetType: "frontmatter",
      target: "title",
      operation: "replace",
      scope: "content",
      value: "Goodbye",
    });
    expect(result.document).toBe(
      "---\ntitle: Goodbye\ntags:\n  - a\n  - b\n---\nbody text\n"
    );
  });

  test("append @ content concatenates onto a list value", () => {
    const result = patch(FM, {
      targetType: "frontmatter",
      target: "tags",
      operation: "append",
      scope: "content",
      value: ["c"],
    });
    expect(result.document).toBe(
      "---\ntitle: Hello\ntags:\n  - a\n  - b\n  - c\n---\nbody text\n"
    );
  });

  test("prepend @ content concatenates onto the front of a list value", () => {
    const result = patch(FM, {
      targetType: "frontmatter",
      target: "tags",
      operation: "prepend",
      scope: "content",
      value: ["z"],
    });
    expect(result.document).toBe(
      "---\ntitle: Hello\ntags:\n  - z\n  - a\n  - b\n---\nbody text\n"
    );
  });

  test("append @ content concatenates strings", () => {
    const result = patch(FM, {
      targetType: "frontmatter",
      target: "title",
      operation: "append",
      scope: "content",
      value: " World",
    });
    expect(result.document).toBe(
      "---\ntitle: Hello World\ntags:\n  - a\n  - b\n---\nbody text\n"
    );
  });

  test("delete @ content clears the value but keeps the key", () => {
    const result = patch(FM, {
      targetType: "frontmatter",
      target: "title",
      operation: "delete",
      scope: "content",
    });
    expect(result.document).toBe(
      "---\ntitle: null\ntags:\n  - a\n  - b\n---\nbody text\n"
    );
  });

  test("mismatched value types are not mergeable", () => {
    expect(() =>
      patch(FM, {
        targetType: "frontmatter",
        target: "title",
        operation: "append",
        scope: "content",
        value: 5,
      })
    ).toThrow(MergeError);
  });
});

describe("patch — frontmatter marker cell", () => {
  test("replace @ marker renames the key, keeping its value and position", () => {
    const result = patch(FM, {
      targetType: "frontmatter",
      target: "title",
      operation: "replace",
      scope: "marker",
      content: "heading",
    });
    expect(result.document).toBe(
      "---\nheading: Hello\ntags:\n  - a\n  - b\n---\nbody text\n"
    );
  });
});

describe("patch — frontmatter markerAndContent cells", () => {
  test("delete @ markerAndContent removes the whole entry", () => {
    const result = patch(FM, {
      targetType: "frontmatter",
      target: "tags",
      operation: "delete",
      scope: "markerAndContent",
    });
    expect(result.document).toBe("---\ntitle: Hello\n---\nbody text\n");
  });

  test("deleting the last entry removes the frontmatter block entirely", () => {
    const result = patch("---\nonly: x\n---\nbody\n", {
      targetType: "frontmatter",
      target: "only",
      operation: "delete",
      scope: "markerAndContent",
    });
    expect(result.document).toBe("body\n");
  });

  test("replace @ markerAndContent re-emits the entry with a new value", () => {
    const result = patch(FM, {
      targetType: "frontmatter",
      target: "title",
      operation: "replace",
      scope: "markerAndContent",
      value: 42,
    });
    expect(result.document).toBe(
      "---\ntitle: 42\ntags:\n  - a\n  - b\n---\nbody text\n"
    );
  });

  test("append @ markerAndContent inserts a new entry after the anchor", () => {
    const result = patch(FM, {
      targetType: "frontmatter",
      target: "title",
      operation: "append",
      scope: "markerAndContent",
      value: { author: "me" },
    });
    expect(result.document).toBe(
      "---\ntitle: Hello\nauthor: me\ntags:\n  - a\n  - b\n---\nbody text\n"
    );
  });

  test("prepend @ markerAndContent inserts a new entry before the anchor", () => {
    const result = patch(FM, {
      targetType: "frontmatter",
      target: "tags",
      operation: "prepend",
      scope: "markerAndContent",
      value: { author: "me" },
    });
    expect(result.document).toBe(
      "---\ntitle: Hello\nauthor: me\ntags:\n  - a\n  - b\n---\nbody text\n"
    );
  });
});

describe("buildModel — keys whose written form differs from their parsed form", () => {
  // Entries come from the positioned YAML AST, so a key is recognized by what
  // it *parses to*, never by matching its raw line text. The line-scan this
  // guards against silently produced no entry for such keys — and, since
  // frontmatter writes re-serialize from the entry list, destroyed them.
  const QUOTED = '---\n"a:b": 1\nother: 2\n---\nbody\n';

  test("a quoted key containing a colon is listed and addressable", () => {
    const model = buildModel(QUOTED);
    expect(model.frontmatter.entries.map((e) => e.key)).toEqual([
      "a:b",
      "other",
    ]);
    expect(readTarget(QUOTED, { targetType: "frontmatter", target: "a:b" }))
      .toEqual({ kind: "frontmatter", value: 1 });
  });

  test("a quoted key survives a write to a sibling key", () => {
    const result = patch(QUOTED, {
      targetType: "frontmatter",
      target: "other",
      operation: "replace",
      value: 3,
    });
    // The serializer may re-emit the key in plain style ("a:b:" parses to the
    // same key); what matters is that the entry survives with its value.
    expect(result.document).toBe("---\na:b: 1\nother: 3\n---\nbody\n");
    const after = buildModel(result.document);
    expect(after.frontmatter.entries.map((e) => [e.key, e.value])).toEqual([
      ["a:b", 1],
      ["other", 3],
    ]);
  });

  test("a plainly quoted key is editable under its parsed name", () => {
    const result = patch('---\n"foo": 1\n---\nbody\n', {
      targetType: "frontmatter",
      target: "foo",
      operation: "replace",
      value: 9,
    });
    expect(result.document).toBe("---\nfoo: 9\n---\nbody\n");
  });

  test("a numeric key round-trips in document order", () => {
    const doc = "---\n2024: notes\nalpha: 1\n---\n";
    const model = buildModel(doc);
    expect(model.frontmatter.entries.map((e) => e.key)).toEqual([
      "2024",
      "alpha",
    ]);
  });
});

describe("buildModel — malformed frontmatter", () => {
  const colonInFrontmatter = fs.readFileSync(
    path.join(__dirname, "sample.frontmatter.colon-in-value.md"),
    "utf-8"
  );

  test("buildModel throws FrontmatterParseError rather than a raw YAML error", () => {
    expect(() => buildModel(colonInFrontmatter)).toThrow(FrontmatterParseError);
  });

  test("patch throws FrontmatterParseError, even for a non-frontmatter target", () => {
    expect(() =>
      patch(colonInFrontmatter, {
        targetType: "block",
        target: "block-1",
        operation: "replace",
        content: "New content.",
      })
    ).toThrow(FrontmatterParseError);
  });

  test("readTarget throws FrontmatterParseError", () => {
    expect(() =>
      readTarget(colonInFrontmatter, { targetType: "block", target: "block-1" })
    ).toThrow(FrontmatterParseError);
  });
});

describe("patch — frontmatter key collisions", () => {
  test("renaming a key onto an existing key raises FrontmatterKeyCollisionError", () => {
    expect(() =>
      patch(FM, {
        targetType: "frontmatter",
        target: "title",
        operation: "replace",
        scope: "marker",
        content: "tags",
      })
    ).toThrow(FrontmatterKeyCollisionError);
  });

  test("inserting an entry whose key already exists raises FrontmatterKeyCollisionError", () => {
    expect(() =>
      patch(FM, {
        targetType: "frontmatter",
        target: "title",
        operation: "append",
        scope: "markerAndContent",
        value: { tags: ["c"] },
      })
    ).toThrow(FrontmatterKeyCollisionError);
  });

  test("renaming a key to its own name is not a collision", () => {
    const result = patch(FM, {
      targetType: "frontmatter",
      target: "title",
      operation: "replace",
      scope: "marker",
      content: "title",
    });
    expect(result.document).toBe(FM);
  });
});
