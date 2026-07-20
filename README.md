# markdown-patch

Make targeted, structure-aware edits to Markdown documents — without `sed`.

Instead of treating a document as a blob of text, `markdown-patch` understands its structure (headings, block references, frontmatter) and lets you edit a specific location within it.

Available as both a **CLI tool** (`mdpatch`) and a **TypeScript/JavaScript library**.

**API docs:** https://coddingtonbear.github.io/markdown-patch/

## Install

```sh
npm install markdown-patch
```

The `mdpatch` binary is included and available after install.

## The model

Every edit is one **operation** applied to a **scope** of a **target** node.

- **`targetType`** — `heading`, `block`, or `frontmatter`.
- **`target`** — for a heading, an array of heading texts from the top level down (`["Meeting Notes", "Action Items"]`), or `null`/`[]` for the document root; for a block, the bare id without `^`; for a frontmatter field, the key.
- **`operation`** — `replace`, `prepend`, `append`, or `delete`.
- **`scope`** (optional, defaults to `content`):
  - `content` — the node's body. For a heading, that's its whole subtree *below* the heading line.
  - `marker` — the label only: a heading line, a block `^id`, or a frontmatter key. `replace` renames it.
  - `markerAndContent` — the marker *and* the body together: for a heading, its heading line plus everything beneath it. Unlike `content`, the heading line is inside the edited span, so a `replace` here rewrites the heading itself. `prepend`/`append` insert a *sibling* before/after it.
  - `parent` — a heading's place in the tree. Valid only with `replace`, and carries a `destination` (a **move**).

The payload rides in exactly one field, chosen by what it is:

| Field | Type | Used for |
|---|---|---|
| `content` | `string` | Heading and block bodies/labels, and frontmatter key renames |
| `value` | `unknown` (JSON) | Frontmatter values |
| `destination` | `ParentSpec` | Where a moved heading lands |

Not every combination is meaningful. `prepend @ parent`, or any `parent` scope on a block or frontmatter target, is not part of the algebra and is rejected with an `InvalidCellError`.

## Library usage

```typescript
import { patch } from "markdown-patch";

const document = `---
status: in-progress
---

# Meeting Notes

## Action Items

- Follow up with design team
`;

const { document: patched, warnings } = patch(document, {
  targetType: "heading",
  target: ["Meeting Notes", "Action Items"],
  operation: "append",
  content: "- Send the report\n",
});
```

`patch` returns `{ document, warnings }` — it does not mutate its input.

### Relative heading levels

Heading `#`-counts inside a `content` string are *relative* to the span being edited, so you never count `#`s yourself. Appending `# Notes from the call` to the content of the level-1 `Meeting Notes` writes it as `## Notes from the call` — a direct child:

```typescript
patch(document, {
  targetType: "heading",
  target: ["Meeting Notes"],
  operation: "append",
  content: "# Notes from the call\n\nSome detail.\n",
});
```

Under `markerAndContent` (or a sibling insert) the same content lands at the target's own level instead. Nesting inside your content is preserved as you wrote it, so replacing a `##` section with `# New\n\n## Child` yields `## New` and `### Child`. A level rebased past `######` (h6) is still written, but `warnings` will contain a `heading-depth-overflow` entry.

Because the heading line is part of the `markerAndContent` span, a `replace` whose content has *no* heading removes it — the section is dissolved into a plain paragraph. Include a leading `#` (at any depth; it is rebased for you) to keep it a heading.

### Whitespace is spliced verbatim

Your `content` is inserted exactly as written at one edge of the target's span; the engine adds no whitespace of its own. For a heading, that span begins immediately *after* the heading line and ends after the last line of its subtree. So given:

```markdown
# One

body of one
```

- `prepend` lands flush against the heading line → `# One\nX\n\nbody of one\n`
- `append` lands flush against the section's last line → `# One\n\nbody of one\nX\n`
- `replace` clears the whole span, blank line included → `# One\nX\n`

In all three cases **a leading `\n` in your content is what buys you a blank line before it**. Passing `"\nX\n"` instead gives `# One\n\nX\n\nbody of one\n`, `# One\n\nbody of one\n\nX\n`, and `# One\n\nX\n` respectively.

Note that this is a *leading* newline even for `append`: the gap you usually want is between the existing text and yours, and that edge comes first. Trailing newlines control the gap *after* your content, and are trimmed at the very end of a document — so padding the end of an `append` at the end of a file does nothing.

The case that most often surprises: prepending into a section whose heading is already followed by a blank line still yields `# One\nX`, with no gap. That blank line is part of the body, not of the boundary, so it is pushed below your text rather than kept above it.

### Frontmatter

Frontmatter payloads are JSON, so they ride in `value`:

```typescript
patch(document, {
  targetType: "frontmatter",
  target: "status",
  operation: "replace",
  value: "done",
});
```

`prepend`/`append` merge rather than overwrite — list concat, dict merge, string concat. Appending `["beta"]` to a `tags` of `["alpha"]` yields `["alpha", "beta"]`. Add `createTargetIfMissing: true` to create a field that may not exist yet.

To rename a key, use `scope: "marker"` — the new key name is a string, so it rides in `content`, not `value`.

### Renaming, deleting, and moving

Rename a heading with the `marker` scope. Supply just the new text — the heading keeps whatever level it had, so you never need to know its depth:

```typescript
patch(document, {
  targetType: "heading",
  target: ["Meeting Notes", "Action Items"],
  operation: "replace",
  scope: "marker",
  content: "Follow-ups",
});
```

Do **not** include `#` characters here. They are not stripped — they become part of the heading text, so `"## Follow-ups"` renames the heading to the literal `## Follow-ups`. (The deprecated `applyPatch` required them; if you are migrating, drop them.)

The same shape renames a block id (`targetType: "block"`, new id without `^`) or a frontmatter key (`targetType: "frontmatter"`, new key in `content`).

`delete` empties the `content` scope, removes the whole subtree (`markerAndContent`), or dissolves just the heading line while keeping its body (`marker`).

A move is `replace @ parent` with a `destination`:

```typescript
patch(document, {
  targetType: "heading",
  target: ["A", "Details"],
  operation: "replace",
  scope: "parent",
  destination: { parent: ["B"], place: "last" },
});
```

`place` may be `"first"`, `"last"`, `{ before: <heading path> }`, or `{ after: <heading path> }`. Use `parent: null` to move to the document root. The section is re-levelled to fit its new home.

### Inspecting a document

`buildModel` parses a document; `projectMap` projects it into the public map of what is addressable:

```typescript
import { buildModel, projectMap } from "markdown-patch";

const map = projectMap(buildModel(document));
// {
//   version: "c23234",
//   frontmatterFields: ["status"],
//   headings: [["Meeting Notes"], ["Meeting Notes", "Action Items"]],
//   blocks: []
// }
```

Each `headings` entry is an array whose length is that heading's level, so `["Meeting Notes", "Action Items"]` is two deep. Pass one straight back as a `target`. A `null` element marks a skipped level; `""` is a genuinely empty heading.

`readTarget` is the mirror image of `patch` — the same `(targetType, target)` address, read instead of written:

```typescript
import { readTarget } from "markdown-patch";

readTarget(document, { targetType: "heading", target: ["Meeting Notes", "Action Items"] });
// { kind: "heading", content: "\n- Follow up with design team\n" }

readTarget(document, { targetType: "frontmatter", target: "tags" });
// { kind: "frontmatter", value: ["alpha"] }
```

### Optimistic concurrency

Pass `ifMatch` with the `version` token from the map you planned against. If the document changed since, the patch throws `PreconditionFailedError` and nothing is modified — rebuild the map and retry:

```typescript
patch(document, {
  targetType: "frontmatter",
  target: "status",
  operation: "replace",
  value: "done",
  ifMatch: map.version,
});
```

### Errors

All failures extend `EngineError`:

| Error | Raised when |
|---|---|
| `InvalidCellError` | The operation×scope combination is not part of the algebra |
| `TargetNotFoundError` | The address does not resolve (and `createTargetIfMissing` was not set) |
| `PreconditionFailedError` | The `ifMatch` version did not match |
| `ContentPreexistsError` | `rejectIfContentPreexists` was set and the value was already there |
| `MergeError` | A frontmatter merge hit a type mismatch |

## CLI reference

> **Note:** the `mdpatch` CLI currently drives the deprecated 1.x engine described under [Deprecated: the 1.x API](#deprecated-the-1x-api). Its addressing is `::`-joined rather than an array, and it has no access to `delete`, moves, or `ifMatch`. CLI support for the model above is still to come; use the library for anything the 1.x surface cannot express.

### `mdpatch patch`

Apply a single patch operation.

```
mdpatch patch [options] <operation> <targetType> <target> <documentPath>
```

- `<operation>` — `append`, `prepend`, or `replace`
- `<targetType>` — `heading`, `block`, or `frontmatter`
- `<target>` — the target address, `::`-joined for nested headings
- `<documentPath>` — file to modify (patched in-place by default)

Options:

| Flag | Description |
|---|---|
| `-i, --input <path>` | Read content from a file instead of stdin |
| `-o, --output <path>` | Write result to a file instead of patching in-place; use `-` for stdout |
| `-d, --delimiter <str>` | Heading path delimiter (default: `::`) |

```sh
echo "- Send the report" | mdpatch patch append heading "Meeting Notes::Action Items" notes.md
echo '"done"' | mdpatch patch replace frontmatter status notes.md
```

### `mdpatch apply`

Apply one or more patch instructions from a JSON patch file.

```
mdpatch apply [options] <documentPath> <patchFile>
```

The patch file should be a JSON object (single instruction) or JSON array (multiple instructions). Use `-` to read from stdin.

### `mdpatch query`

Extract the content of a specific target and write it to stdout (or a file).

```
mdpatch query [options] <targetType> <target> <documentPath>
```

### `mdpatch print-map`

Show all patchable targets discovered in a document, useful for finding the right target address.

```
mdpatch print-map <documentPath> [regex]
```

## Deprecated: the 1.x API

`applyPatch` and `getDocumentMap` are the previous generation of this library. They still work and are still exported, but they are deprecated and will be removed in a future major release.

The 1.x API spread its addressing across a `::`-joined `target` string with a separate `targetDelimiter`, offered no `delete` operation, no moves, and no `version` token. To migrate, switch to `patch` and move each field across:

| 1.x (`applyPatch`) | Current (`patch`) |
|---|---|
| `operation: "append"` | `operation: "append"` (now also `"delete"`) |
| `targetType: "heading"` | `targetType: "heading"` |
| `target: "A::B"` (+ `targetDelimiter`) | `target: ["A", "B"]` (a real array — no delimiter) |
| `targetScope: "content"` | `scope: "content"` (adds `"parent"` for moves) |
| `content: "..."` | `content: "..."` for headings/blocks, `value: <json>` for frontmatter |
| `createTargetIfMissing: true` | `createTargetIfMissing: true` |
| `rejectIfContentPreexists: true` | `rejectIfContentPreexists: true` |
| `trimTargetWhitespace` | *(dropped; the engine owns boundary whitespace)* |
| `getDocumentMap(doc)` | `projectMap(buildModel(doc))` |

Two behavioral differences to watch for when migrating:

- **Heading levels are now relative.** 1.x took the `#`s in your content literally; the current engine rebases them against the span being edited.
- **Heading `content` scope covers the whole subtree.** In 1.x it stopped at the next heading of any level.
