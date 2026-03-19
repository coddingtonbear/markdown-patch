# markdown-patch

Make targeted, structure-aware edits to Markdown documents — without `sed`.

Instead of treating a document as a blob of text, `markdown-patch` understands its structure (headings, block references, frontmatter) and lets you append, prepend, or replace content at a specific location within it.

Available as both a **CLI tool** (`mdpatch`) and a **TypeScript/JavaScript library**.

**API docs:** https://coddingtonbear.github.io/markdown-patch/

## Install

```sh
npm install markdown-patch
```

The `mdpatch` binary is included and available after install.

## Quick start

Given a document `notes.md`:

```markdown
---
status: in-progress
---

# Meeting Notes

## Action Items

- Follow up with design team
```

Append a new item under `Action Items`:

```sh
echo "- Send the report" | mdpatch patch append heading "Meeting Notes::Action Items" notes.md
```

Replace the `status` frontmatter field:

```sh
echo '"done"' | mdpatch patch replace frontmatter status notes.md
```

Not sure what targets exist in a document? Use `print-map`:

```sh
mdpatch print-map notes.md
```

## CLI reference

### `mdpatch patch`

Apply a single patch operation.

```
mdpatch patch [options] <operation> <targetType> <target> <documentPath>
```

- `<operation>` — `append`, `prepend`, or `replace`
- `<targetType>` — `heading`, `block`, or `frontmatter`
- `<target>` — the target address (see below)
- `<documentPath>` — file to modify (patched in-place by default)

Options:

| Flag | Description |
|---|---|
| `-i, --input <path>` | Read content from a file instead of stdin |
| `-o, --output <path>` | Write result to a file instead of patching in-place; use `-` for stdout |
| `-d, --delimiter <str>` | Heading path delimiter (default: `::`) |

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

## Targets

### Headings

Address a section by its heading path, delimited by `::` (or a custom delimiter). Nested headings use the full path:

```sh
# Target the top-level "Overview" section
mdpatch patch append heading "Overview" notes.md

# Target a nested heading
mdpatch patch append heading "Meeting Notes::Action Items" notes.md
```

### Block references

Address a paragraph, table, or other block by its Obsidian block ID (e.g. `^abc123`):

```sh
echo "New row content" | mdpatch patch append block "abc123" notes.md
```

When the target block is a Markdown table and content type is `application/json`, rows can be appended or prepended as JSON arrays.

### Frontmatter fields

Address a YAML frontmatter key by name. Content is treated as JSON:

```sh
# Set a scalar
echo '"done"' | mdpatch patch replace frontmatter status notes.md

# Append to a list
echo '"new-tag"' | mdpatch patch append frontmatter tags notes.md
```

## Library usage

```typescript
import { applyPatch, getDocumentMap } from "markdown-patch";

const document = `# My Note\n\n## Tasks\n\n- Buy milk\n`;

const patched = applyPatch(document, {
  operation: "append",
  targetType: "heading",
  target: ["My Note", "Tasks"],
  content: "- Write tests\n",
});
```

`getDocumentMap` parses a document and returns its structure — useful for inspecting what headings, blocks, and frontmatter fields are available before patching.

### Patch instruction options

| Option | Type | Description |
|---|---|---|
| `operation` | `"append" \| "prepend" \| "replace"` | What to do |
| `targetType` | `"heading" \| "block" \| "frontmatter"` | What to target |
| `target` | `string \| string[]` | Target address (array for heading paths) |
| `content` | `string` | Content to apply |
| `contentType` | `"text/markdown" \| "application/json"` | Defaults to `text/markdown` |
| `createTargetIfMissing` | `boolean` | Create the heading or frontmatter field if it doesn't exist |
| `applyIfContentPreexists` | `boolean` | By default, patching fails if the content is already present; set this to override |
| `trimTargetWhitespace` | `boolean` | Trim whitespace from the target boundary before joining |
