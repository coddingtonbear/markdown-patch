---
title: Overview
group: Documents
category: Guides
---

Markdown Patch is a patch format and tool that allows you to make
systematic changes to Markdown documents by allowing you to
alter the content of a Markdown document relative to elements
of that document's structure like headings or block references.

Have you ever needed to set up a script for modifying a markdown document and found yourself using arcane tools like `sed` before giving up entirely?  This tool might be for you!

# Quickstart

You can install the package via `npm`:

```bash
npm install markdown-patch
```

Every edit is one **operation** (`replace`, `prepend`, `append`, `delete`) applied to a **scope** (`content`, `marker`, `markerAndContent`, `parent`) of a **target** node — a heading, a block reference, or a frontmatter field.

Given a document named `document.md`:

```markdown
# Noise Floor

- Some content

# Discoveries

# Events

- Checked out of my hotel
- Caught the flight home
```

You can add a subsection below "Discoveries" like so:

```typescript
import { patch } from "markdown-patch";

const { document: patched } = patch(document, {
  targetType: "heading",
  target: ["Discoveries"],
  operation: "append",
  content: "\n# My discovery\n\nI discovered a thing\n",
});
```

Note that the content says `#`, not `##`. Heading levels inside a `content` string are *relative* to the span being edited, so a single `#` becomes a direct child of the target and you never have to count `#`s to match the surrounding document. The result:

```markdown
# Noise Floor

- Some content

# Discoveries

## My discovery

I discovered a thing

# Events

- Checked out of my hotel
- Caught the flight home
```

The leading `\n` in the content above is deliberate. Content is spliced in exactly as written at the edge of the target's span, and the engine adds no whitespace of its own — without that newline, `## My discovery` would sit flush against the line above it. See the README for the full whitespace rules.

See {@link Reference.patch} for the full instruction shape, {@link Reference.readTarget} for the read-side mirror of the same addressing, and {@link Reference.projectMap} for discovering what a document has to target.

> **Note:** the 1.x API (`applyPatch` and `getDocumentMap`) was removed in 2.0; see the README's "Migrating from 1.x" section for the migration table.
