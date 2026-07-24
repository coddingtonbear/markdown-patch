# markdown-patch

Make targeted, structure-aware edits to Markdown documents — without `sed`.

Instead of treating a document as a blob of text, `markdown-patch` understands its structure (headings, block references, frontmatter) and lets you edit a specific location within it:

```diff
 # Weekly Sync

 ## Notes

 Kim walked through the Q3 timeline.

+Decided: we ship on Thursday.
+
 ## Attendees

 - Adam
 - Kim
```

The new paragraph lands inside the `Notes` section — not at the end of the file — and the blank lines around it are the engine's job, not yours. The edit is one instruction, with no line numbers and no regex:

```typescript
import { patch } from "markdown-patch";

const { document } = patch(note, {
  targetType: "heading",
  target: ["Weekly Sync", "Notes"],
  operation: "append",
  content: "Decided: we ship on Thursday.",
});
```

The same edit from a shell, with the bundled `mdpatch` CLI:

```sh
echo "Decided: we ship on Thursday." | mdpatch patch append heading "Weekly Sync::Notes" notes.md
```

**API docs:** https://coddingtonbear.github.io/markdown-patch/

## Install

```sh
npm install markdown-patch
```

The `mdpatch` binary is included and available after install.

## Why

The obvious ways to edit Markdown programmatically all break on contact with real documents:

- **Regex and line numbers can't see structure.** In a changelog, `### Fixed` appears under every single release: a pattern matches all of them, while the heading path `["Changelog", "Unreleased", "Fixed"]` names exactly one. And when even the text is ambiguous — two identical sibling headings — the document map hands you a distinct address for each occurrence.
- **Hand-spliced text gets the joints wrong.** One missing `\n` merges two paragraphs; one extra one splits a list. Here, [whitespace is library-owned](#whitespace-is-library-owned): the engine supplies the separators, and `"X"`, `"X\n"`, and `"\nX\n"` all produce the same document.
- **Pasted sections land at the wrong depth.** Splicing a `## Details` subtree under a `###` heading means rewriting every `#` in it. Here, [heading levels are relative](#relative-heading-levels) — content is rebased to fit where it lands.
- **The file may have changed under you.** Between reading a document and writing your edit, anything can happen. Pass [`ifMatch`](#optimistic-concurrency) and a stale patch fails cleanly instead of landing in the wrong place.

These properties matter most when the editor isn't a person. An LLM agent maintaining a note shouldn't re-emit a 4,000-token file to add one paragraph: it can read the compact document map instead of the whole document, target one section, and append — cheaper, faster, and incapable of mangling the 3,900 tokens it had no business touching. `markdown-patch` is the editing engine behind [Obsidian Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api)'s PATCH endpoints and MCP tools, where exactly that kind of client is the norm.

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
| `value` | `unknown` (JSON) | Frontmatter values, and table rows (`string[][]`) |
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
  content: "Decided: ship on Thursday.",
});
```

`patch` returns `{ document, warnings }` — it does not mutate its input. The appended text lands as its own paragraph, separated from the list above it by a library-supplied blank line; see [Whitespace is library-owned](#whitespace-is-library-owned).

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

### Whitespace is library-owned

Your `content` crosses the API in trimmed, canonical form: leading and trailing blank lines are stripped, and a non-empty write always ends with exactly one newline. `"X"`, `"X\n"`, `"\nX\n"`, and `"X\n\n"` all produce the same document — newlines at the edges of your content are not a channel for controlling layout, so there is nothing to get wrong.

Blank-line separators are the engine's job. At any joint where your content faces body text, the engine supplies the blank line that keeps it a separate block. So given:

```markdown
# One

body of one
```

- `append` becomes a new block after the body → `# One\n\nbody of one\n\nX\n`
- `prepend` becomes a new block before the body → `# One\n\nX\n\nbody of one\n`
- `replace` swaps the body → `# One\n\nX\n`

Where no separator is owed, none is added — a heading line is self-delimiting, and existing blank lines, gaps between sections, and document edges are preserved rather than rewritten:

- The blank line between a heading and its body is kept in place: `replace` swaps the body beneath it and `prepend` inserts below it. A document written flush (`# One\nbody of one\n`) keeps its flush style — `replace` gives `# One\nX\n` — and replacing a body with its own text is byte-identity in either style.
- Writing into an empty section lands flush under its heading (`# E\nX\n`), with the section's existing trailing gap serving as the separator below.

One consequence worth knowing: a `content`-scope `append`/`prepend` always begins a new block — it can never continue an existing paragraph. To edit inline *within* an existing block, address the block itself, which puts you on the literal-splice path where content is spliced exactly as given and you own the joint. There are two ways to address one:

- Target it via a block reference (`^id`), if it has one.
- Add `within: <index>` to a heading instruction to pick one of the section's top-level body blocks by position — no `^id` required.

### Positional block edits: `within`

`within` refines a heading target to the Nth top-level block of the section's *direct* body (paragraphs, lists, tables, code fences, …), counted from 0 in document order; a negative index counts from the end. Isolated `^id` marker lines are not counted, so indices match the rendered blocks you see. Extend the last list of a section:

```typescript
patch(document, {
  targetType: "heading",
  target: ["Log"],
  within: -1,
  operation: "append",
  content: "\n- new item",
});
```

With the default `content` scope the four operations act on the block itself: `replace`/`prepend`/`append` splice literally (that leading `\n` above is yours to write — `append` without it continues the block's last line), and `delete` removes the block along with its separator. With `scope: "markerAndContent"`, `prepend`/`append` instead insert your content as a *new* block immediately before/after the addressed one, with the usual library-owned separators.

Two footguns to know about:

- A literal `append` to a block whose last line ends with an inline `^id` lands *after* the marker, un-marking it — prefer the `^id` block target for blocks that carry one.
- Deleting a block that an isolated `^id` line annotates leaves the marker line behind, dangling.

Because indices are positional, they are meant for single-request use: read the section (or its map), count its rendered blocks, and pair the edit with `ifMatch` from the same read so a concurrent change fails the patch instead of landing on the wrong block.

### Table rows

A `block` target whose block is a table supports structured row edits. Put a 2-D array of cell text in `value` instead of literal text in `content` — the carrier you choose decides which kind of write it is:

```typescript
patch(document, {
  targetType: "block",
  target: "inventory",
  operation: "append",
  value: [
    ["widget", "4"],
    ["sprocket", "1"],
  ],
});
```

`replace` swaps the table's body rows while keeping its header and separator lines; `prepend`/`append` insert rows before/after the existing body rows. Cells are *content*, not row source: a `|` in a cell is escaped for you, other markdown is passed through as written, and each row must match the table's column count. A cell containing a line break is rejected rather than silently split or rewritten as `<br>`. Structured row edits require a block target (`^id` on the table); a `within`-addressed table takes only literal-text edits.

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

Do **not** include `#` characters here. They are not stripped — they become part of the heading text, so `"## Follow-ups"` renames the heading to the literal `## Follow-ups`. (The removed 1.x `applyPatch` required them; if you are migrating, drop them.)

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

Duplicates are individually addressable. When two sibling headings share the same text (or two blocks share an id), the first occurrence keeps its plain text and each later occurrence's map entry carries an opaque, non-printable marker suffix. Copy such an entry verbatim from the map into your `target` — the suffix is made of reserved codepoints you are not meant to type or construct yourself. (A document whose own heading text already ends in the reserved sequence is rejected at parse time with `ReservedDuplicateMarkerError`, so a synthesized address can never collide with real text.)

`readTarget` is the mirror image of `patch` — the same `(targetType, target)` address, read instead of written:

```typescript
import { readTarget } from "markdown-patch";

readTarget(document, { targetType: "heading", target: ["Meeting Notes", "Action Items"] });
// { kind: "heading", content: "\n- Follow up with design team\n" }

readTarget(document, { targetType: "frontmatter", target: "tags" });
// { kind: "frontmatter", value: ["alpha"] }
```

Reads take an optional `scope` mirroring the patch scopes, with one invariant tying the two together: **read at scope S, then `replace` at scope S with the value unchanged, is a no-op.**

- `content` (the default) — the node's body: a heading's body de-levelled by the target's own level (so writing it back through a `content`-scope `replace` round-trips), a block's literal text, a frontmatter key's parsed value.
- `marker` — the label: a heading's raw text (no `#`s, no duplicate-marker suffix), a block's bare id, a frontmatter key.
- `markerAndContent` — the whole node, in exactly the shape a `markerAndContent` `replace` consumes: a heading's subtree re-levelled to its parent's baseline (its own heading line reads as `# Title`), a block's full span including its `^id`. The one deviation from the invariant is frontmatter, which reads as a `{key: value}` object — the shape a `markerAndContent` `prepend`/`append` takes, since a frontmatter `replace` carries a plain value at either scope.

A `within` read supports only `content` — a positional body block has no marker of its own.

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
| `InvalidInstructionError` | The instruction is malformed — a bad field, target shape, or payload carrier for an otherwise-valid cell |
| `TargetNotFoundError` | The address does not resolve (and `createTargetIfMissing` was not set) |
| `PreconditionFailedError` | The `ifMatch` version did not match |
| `ContentPreexistsError` | `rejectIfContentPreexists` was set and the value was already there |
| `MergeError` | A frontmatter merge hit a type mismatch |
| `FrontmatterParseError` | The frontmatter block is not parseable YAML |
| `FrontmatterKeyCollisionError` | A key rename or entry insert would create a duplicate key |
| `ReservedDuplicateMarkerError` | The source document's own text ends in the reserved duplicate-marker sequence |
| `NotATableError` | A table-row `value` addressed a block that is not a table |
| `TableColumnCountError` | A supplied row's cell count does not match the table's columns |
| `InvalidCellContentError` | A table cell's text cannot be written as a row (e.g. contains a line break) |

## CLI reference

The CLI drives the same engine as the library: `patch` is the quick flag-based form for common single edits, and `apply` takes full instruction JSON for everything the model can express (moves, table rows, `ifMatch` pipelines).

### `mdpatch patch`

Apply a single instruction built from flags. Content is read from stdin unless `--input` is given; `delete` takes no content.

```
mdpatch patch [options] <operation> <targetType> <target> <documentPath>
```

- `<operation>` — `append`, `prepend`, `replace`, or `delete`
- `<targetType>` — `heading`, `block`, or `frontmatter`
- `<target>` — the target address: a `::`-joined containment path for headings (`""` for the document root), a bare block id, or a frontmatter key
- `<documentPath>` — file to modify (patched in-place by default)

Options:

| Flag | Description |
|---|---|
| `-i, --input <path>` | Read content from a file instead of stdin |
| `-o, --output <path>` | Write result to a file instead of patching in-place; use `-` for stdout |
| `-d, --delimiter <str>` | Heading path delimiter (default: `::`) |
| `-s, --scope <scope>` | `content` (default), `marker`, `markerAndContent`, or `parent` |
| `--if-match <version>` | Fail unless the document's version token matches (see `print-map`) |
| `--create-target-if-missing` | Create the target (and missing ancestors) when it does not exist |
| `--reject-if-content-preexists` | Fail instead of applying when the content is already present |

For a `frontmatter` target the payload is parsed as JSON, falling back to the raw string; for `--scope parent` (a move) the payload is the JSON `destination`, e.g. `{"parent": ["Archive"], "place": "last"}`.

```sh
echo "- Send the report" | mdpatch patch append heading "Meeting Notes::Action Items" notes.md
echo '["draft", "urgent"]' | mdpatch patch replace frontmatter tags notes.md
mdpatch patch delete block quote-1 notes.md -s markerAndContent
```

### `mdpatch apply`

Apply one or more patch instructions from a JSON patch file.

```
mdpatch apply [options] <documentPath> <patchFile>
```

The patch file should be a JSON object (single instruction) or JSON array (multiple instructions, applied in order) in exactly the shape the library's `patch` accepts — see [The model](#the-model). Use `-` to read from stdin.

### `mdpatch query`

Read a target's content and write it to stdout (or a file with `-o`): markdown for headings and blocks, JSON for frontmatter values.

```
mdpatch query [options] <targetType> <target> <documentPath>
```

`-s, --scope` selects `content` (default), `marker`, or `markerAndContent`, mirroring the patch scopes — what a scope returns is what a `replace` at that scope consumes. See [Read scopes](#inspecting-a-document). `-d, --delimiter` overrides the `::` heading-path delimiter, as on `patch`.

### `mdpatch print-map`

Show a document's addressable map — its `version` token (for `--if-match`), frontmatter fields, heading tree, and block ids — as JSON. With a regex, list only matching addresses, one `type<TAB>address` per line (`-d, --delimiter` overrides the `::` joining the heading paths).

```
mdpatch print-map <documentPath> [regex]
```

## Migrating from 1.x

Version 2.0 removes the 1.x API: `applyPatch`, `getDocumentMap`, and the `PatchInstruction` types are gone. If you need the old behavior as-is, stay on `markdown-patch@1`.

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
