# Obsidian conformance fixtures

These `*.md` fixtures cross-validate markdown-patch's internal model against
Obsidian's own parse (`metadataCache`). Obsidian is the source of truth for what
counts as a heading, section, or block, so the model must agree with it on
boundaries.

## How it works

- Each `*.md` fixture has a frozen golden `*.obsidian.json` beside it, captured
  from live Obsidian (see below).
- `conformance.test.ts` builds the model for each fixture and asserts that the
  heading levels/texts/offsets, the block id set, and each block's span match
  the golden exactly. Block spans encode Obsidian's rules directly: offsets
  index raw bytes (a CRLF counts as two), spans exclude trailing newlines, and
  an isolated `^id` on its own line takes the span of the block above it.
- Fixtures **without** a golden are reported as pending (the suite stays green),
  so the capture step can lag behind adding a fixture.

## Capturing / refreshing goldens

The goldens are only regenerated when fixtures change — this needs a live
Obsidian instance and is a manual, occasional step. Either method below
produces the same golden shape.

### Method A — DevTools console snippet (no plugin changes)

1. Copy this folder's `*.md` files into a `conformance/` folder at the root of
   any Obsidian vault.
2. Open that vault, open the developer console (Ctrl/Cmd-Shift-I), and wait a
   moment for the metadata cache to settle.
3. Paste the contents of [`capture-snippet.js`](./capture-snippet.js) into the
   console and run it. It writes `<name>.obsidian.json` beside each fixture in
   the vault.
4. Copy the resulting `*.obsidian.json` files back into this folder.

### Method B — temporary REST route (fully scriptable, no console)

With a live Obsidian running the sibling `obsidian-local-rest-api` plugin from
source (it rebuilds on save), a coding agent can refresh goldens end to end:

1. Add a throwaway `GET /__debug_cache/*` route to that plugin's
   `src/requestHandler.ts` that resolves the path with `getAbstractFileByPath`
   and returns `{ content, cache: metadataCache.getFileCache(file) }` as JSON.
2. Wait a few seconds for the rebuild, then for each fixture `PUT /vault/...`
   its exact bytes, poll the `note+json` endpoint until indexed, and
   `GET /__debug_cache/...`.
3. Reduce each raw cache to the golden shape (`headings`/`sections`/`blocks`/
   `listItems` with `position.*.offset` start/end) and write it here.
4. **Delete the temporary route and the fixtures you PUT into the vault; do not
   commit the route.**

Both methods are throwaway capture tooling: neither is part of the shipped
library.
