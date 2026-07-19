# Obsidian conformance fixtures

These `*.md` fixtures cross-validate markdown-patch's internal model against
Obsidian's own parse (`metadataCache`). Obsidian is the source of truth for what
counts as a heading, section, or block, so the model must agree with it on
boundaries.

## How it works

- Each `*.md` fixture has a frozen golden `*.obsidian.json` beside it, captured
  from live Obsidian (see below).
- `conformance.test.ts` builds the model for each fixture and asserts that the
  heading levels/texts/offsets and the block id set match the golden.
- Fixtures **without** a golden are reported as pending (the suite stays green),
  so the capture step can lag behind adding a fixture.

## Capturing / refreshing goldens

The goldens are only regenerated when fixtures change — this needs a live
Obsidian instance and is a manual, occasional step:

1. Copy this folder's `*.md` files into a `conformance/` folder at the root of
   any Obsidian vault.
2. Open that vault, open the developer console (Ctrl/Cmd-Shift-I), and wait a
   moment for the metadata cache to settle.
3. Paste the contents of [`capture-snippet.js`](./capture-snippet.js) into the
   console and run it. It writes `<name>.obsidian.json` beside each fixture in
   the vault.
4. Copy the resulting `*.obsidian.json` files back into this folder.

This is throwaway capture tooling: it is not part of the shipped library and
uses no plugin API.
