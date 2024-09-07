# Markdown Patch

Have you ever needed to set up a script for modifying a markdown document and found yourself using arcane tools like `sed` before giving up entirely?

Markdown Patch (`mdpatch`) is aware of the structure of your markdown document and makes it possible for you to easily inserting content relative to parts of that structure like headings and block references.

## Quickstart

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

## Use as a library

```ts
import {PatchInstruction, applyPatch} from "markdown-patch"

const myDocument = `
# Noise Floor

- Some content

# Discoveries

# Events

- Checked out of my hotel
- Caught the flight home

`

const instruction: PatchInstruction {
    operation: "append",
    targetType: "heading",
    target: "Discoveries",
    content: "\n## My discovery\nI discovered a thing\n",
}

console.log(
    applyPatch(myDocument, instruction)
)
```

and you'll see the output:

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
