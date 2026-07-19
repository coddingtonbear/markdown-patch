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

The leading `\n` in the content above is deliberate: a blank-line separator at the target boundary is preserved only if one was already there, and is never synthesized for you.

See {@link Reference.patch} for the full instruction shape, {@link Reference.readTarget} for the read-side mirror of the same addressing, and {@link Reference.projectMap} for discovering what a document has to target.

> **Note:** {@link Reference.applyPatch} and {@link Reference.getDocumentMap} are the deprecated 1.x API. They still work, but new code should use {@link Reference.patch}; see the README for the migration table.
