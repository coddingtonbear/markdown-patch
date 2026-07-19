/*
 * Obsidian conformance-capture snippet.
 *
 * Freezes Obsidian's canonical parse (metadataCache) for the conformance
 * fixtures so markdown-patch's model can be cross-validated against it. This is
 * throwaway capture tooling — it is not shipped and touches no plugin API.
 *
 * Usage (run once, re-run when fixtures change):
 *   1. Copy every `*.md` file from this folder into a folder named
 *      `conformance/` at the root of any Obsidian vault.
 *   2. Open that vault in Obsidian, then open the developer console
 *      (Ctrl/Cmd-Shift-I) and let the metadata cache settle for a moment.
 *   3. Paste this entire file into the console and press Enter.
 *   4. It writes a `<name>.obsidian.json` beside each fixture in the vault's
 *      `conformance/` folder. Copy those JSON files back into this folder,
 *      next to the matching `.md` fixture.
 *
 * The golden shape is intentionally minimal — only offsets markdown-patch's
 * model is validated against:
 *   { headings: [{ level, text, start, end }],
 *     sections: [{ type, start, end }],
 *     blocks:   { id: { start, end } },
 *     listItems:[{ start, end }] }
 * where start/end are `position.start.offset` / `position.end.offset`.
 */
(async () => {
  const FOLDER = "conformance";
  const offsets = (pos) => ({ start: pos.start.offset, end: pos.end.offset });

  const files = app.vault
    .getMarkdownFiles()
    .filter((f) => f.path.startsWith(`${FOLDER}/`));

  if (files.length === 0) {
    console.warn(
      `No fixtures found under "${FOLDER}/". Copy the conformance *.md files there first.`
    );
    return;
  }

  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);
    if (!cache) {
      console.warn(`No cache yet for ${file.path}; skipping.`);
      continue;
    }
    const golden = {
      headings: (cache.headings ?? []).map((h) => ({
        level: h.level,
        text: h.heading,
        ...offsets(h.position),
      })),
      sections: (cache.sections ?? []).map((s) => ({
        type: s.type,
        ...offsets(s.position),
      })),
      blocks: Object.fromEntries(
        Object.entries(cache.blocks ?? {}).map(([id, b]) => [
          id,
          offsets(b.position),
        ])
      ),
      listItems: (cache.listItems ?? []).map((li) => offsets(li.position)),
    };
    const outPath = file.path.replace(/\.md$/, ".obsidian.json");
    await app.vault.adapter.write(outPath, JSON.stringify(golden, null, 2) + "\n");
    console.log(`captured ${outPath}`);
  }
  console.log(`Done. Captured ${files.length} fixture(s).`);
})();
