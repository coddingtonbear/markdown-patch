/**
 * Pins the rename behavior the README documents under "Renaming, deleting, and
 * moving".  A `marker`-scope replace takes the new label as plain text and
 * preserves the node's level, so callers never need to know a heading's depth.
 *
 * The `#` case matters because it is the exact reverse of the deprecated
 * `applyPatch`, which *required* matching `#` characters.  Here they are not
 * stripped -- they land in the heading text -- so a caller migrating from the
 * old API silently gets a corrupted heading rather than an error.
 */

import { patch } from "../engine.js";

const doc = `---
alpha: 1
---

# Heading 1

## Subheading

body

some paragraph ^abc123
`;

const rename = (
  targetType: "heading" | "block" | "frontmatter",
  target: string | string[],
  content: string
) =>
  patch(doc, {
    targetType,
    target,
    operation: "replace",
    scope: "marker",
    content,
  } as never).document;

describe("documented rename behavior", () => {
  it("renames a heading from plain text, preserving its level", () => {
    expect(rename("heading", ["Heading 1", "Subheading"], "New Name")).toContain("## New Name");
  });

  it("leaves the heading's body untouched", () => {
    expect(rename("heading", ["Heading 1", "Subheading"], "New Name")).toContain(
      "## New Name\n\nbody\n"
    );
  });

  it("does not strip `#` characters -- they become part of the label", () => {
    // Documented as a trap for callers migrating from applyPatch, which
    // required the `#`s.  If this ever starts stripping them, the README's
    // warning is wrong and must be updated.
    expect(rename("heading", ["Heading 1", "Subheading"], "## New Name")).toContain(
      "## ## New Name"
    );
  });

  it("renames a block id, which is given bare", () => {
    expect(rename("block", "abc123", "xyz789")).toContain("some paragraph ^xyz789");
  });

  it("renames a frontmatter key, preserving its value", () => {
    expect(rename("frontmatter", "alpha", "renamed")).toContain("renamed: 1");
  });
});
