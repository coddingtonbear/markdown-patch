import { patch } from "../engine";
import { MergeError } from "../instructions";

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
