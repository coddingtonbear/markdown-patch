---
title: How To Guides
group: Documents
category: Guides
---

# Using as a library

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

