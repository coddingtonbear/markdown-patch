---
title: How To Guides
group: Documents
category: Guides
---

All examples below assume this document:

```typescript
const myDocument = `---
status: in-progress
tags:
  - alpha
---

# Meeting Notes

## Action Items

- Follow up with design team
`;
```

# Add content below a heading

```typescript
import { patch } from "markdown-patch";

const { document } = patch(myDocument, {
  targetType: "heading",
  target: ["Meeting Notes", "Action Items"],
  operation: "append",
  content: "- Send the report\n",
});
```

The heading target is an array of heading texts from the top level down, so a heading whose text contains `::` needs no escaping. `prepend` and `replace` take the same shape.

Note that the heading line itself is not part of the `content` scope. When you `replace` a heading's content, supply only the body — including the heading line would duplicate it.

# Continue an existing block

A plain `append` always starts a *new* block. To extend a block that is already there — add an item to a list, continue a paragraph — address the block positionally with `within` and splice into it literally:

```typescript
patch(myDocument, {
  targetType: "heading",
  target: ["Meeting Notes", "Action Items"],
  within: -1, // the section's last body block; 0 is the first
  operation: "append",
  content: "\n- Send the report",
});
```

On a `within`-addressed block you own the joint: the leading `\n` above is what makes the text a new list item rather than a continuation of the last one. `replace`, `prepend`, and `delete` act on the same block; `scope: "markerAndContent"` with `prepend`/`append` inserts a new block beside it instead. Indices count the section's rendered top-level blocks (isolated `^id` lines don't count), so read the section first and pair the edit with `ifMatch` from the same read.

# Rename a heading

Use the `marker` scope, which addresses the label rather than the body. Supply just the text; the engine preserves the level:

```typescript
patch(myDocument, {
  targetType: "heading",
  target: ["Meeting Notes", "Action Items"],
  operation: "replace",
  scope: "marker",
  content: "Follow-ups",
});
```

# Delete a section

`delete` means something different in each scope: it empties the body (`content`), removes the heading and everything under it (`markerAndContent`), or dissolves just the heading line while keeping its body in place (`marker`).

```typescript
patch(myDocument, {
  targetType: "heading",
  target: ["Meeting Notes", "Action Items"],
  operation: "delete",
  scope: "markerAndContent",
});
```

# Move a section

A move is `replace` applied to the `parent` scope, carrying a `destination`:

```typescript
patch(myDocument, {
  targetType: "heading",
  target: ["A", "Details"],
  operation: "replace",
  scope: "parent",
  destination: { parent: ["B"], place: "last" },
});
```

`place` accepts `"first"`, `"last"`, `{ before: <heading path> }`, or `{ after: <heading path> }`; `parent: null` moves the section to the document root. The section is re-levelled to fit wherever it lands.

# Set or merge a frontmatter field

Frontmatter payloads are JSON rather than markdown, so they travel in `value`:

```typescript
patch(myDocument, {
  targetType: "frontmatter",
  target: "status",
  operation: "replace",
  value: "done",
});
```

`append` and `prepend` merge instead of overwriting — list concat, dict merge, string concat — so appending `["beta"]` to `tags` yields `["alpha", "beta"]`:

```typescript
patch(myDocument, {
  targetType: "frontmatter",
  target: "tags",
  operation: "append",
  value: ["beta"],
  createTargetIfMissing: true,
});
```

There is no "remove one item" operation. To drop a single list entry, read the field, filter it, and replace the whole value.

# Find out what a document has to target

```typescript
import { buildModel, projectMap } from "markdown-patch";

const map = projectMap(buildModel(myDocument));
// {
//   version: "c23234",
//   frontmatterFields: ["status", "tags"],
//   headings: [["Meeting Notes"], ["Meeting Notes", "Action Items"]],
//   blocks: []
// }
```

Each `headings` entry can be passed straight back as a `target`, and its length is the heading's level.

# Read a target instead of writing it

{@link Reference.readTarget} takes the same address a patch instruction carries:

```typescript
import { readTarget } from "markdown-patch";

readTarget(myDocument, {
  targetType: "heading",
  target: ["Meeting Notes", "Action Items"],
});
// { kind: "heading", content: "\n- Follow up with design team\n" }
```

# Make an edit conditional on the document not having changed

Pass the `version` from the map you planned against as `ifMatch`. If the document has moved on, the patch throws `PreconditionFailedError` and leaves it untouched:

```typescript
patch(myDocument, {
  targetType: "frontmatter",
  target: "status",
  operation: "replace",
  value: "done",
  ifMatch: map.version,
});
```
