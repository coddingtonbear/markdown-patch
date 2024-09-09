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

And if you were to create a document named `document.md` with the following content:

```markdown
# Noise Floor

- Some content

# Discoveries

# Events

- Checked out of my hotel
- Caught the flight home

```

Then you can use the `patch` or `apply` subcommands to alter the document.  For example, the following will add a new heading below the heading "Discoveries":

```bash
mdpatch patch append heading Discoveries ./document.md

## My discovery
I discovered a thing

<Ctrl+D>
```

Your final document will then look like:

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

See `--help` for more insight into what commands are available.
