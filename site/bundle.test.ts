import { buildSync } from "esbuild";
import { createHash } from "crypto";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";

import type { InstructionInput } from "../src/index.js";

/**
 * The playground's whole premise is that the browser bundle is the same engine
 * the CLI runs — including the `version` token, which is the one thing the
 * bundle does *not* get from the library (Node's `crypto` is aliased away at
 * bundle time). So bundle the engine with the same alias `npm run build:site`
 * uses and check it against Node's own hash and against the unbundled engine.
 *
 * The shipped artifact's entry is `playground.main.ts`, which mounts against a
 * DOM and so can't be imported here; it gets a build-only check at the end.
 */
const OUT_DIR = mkdtempSync(join(tmpdir(), "mdpatch-bundle-"));
const OUT_FILE = join(OUT_DIR, "mdpatch.mjs");

const DOCUMENT = [
  "---",
  "status: draft",
  "---",
  "",
  "# Weekly Sync",
  "",
  "## Notes",
  "",
  "Kim walked through the Q3 timeline.",
  "",
].join("\n");

type Engine = typeof import("../src/index.js");

let bundled: Engine;

beforeAll(async () => {
  buildSync({
    entryPoints: ["src/index.ts"],
    bundle: true,
    format: "esm",
    minify: true,
    platform: "browser",
    alias: { crypto: "./site/crypto-shim.ts" },
    outfile: OUT_FILE,
  });
  // The bundle is browser-targeted, but nothing it touches (TextEncoder,
  // DataView) is browser-only, so Node can load it and answer for it here.
  bundled = (await import(pathToFileURL(OUT_FILE).href)) as Engine;
});

describe("the browser bundle", () => {
  it("carries no dependency on Node's crypto", () => {
    const outText = buildSync({
      entryPoints: ["src/index.ts"],
      bundle: true,
      format: "esm",
      platform: "browser",
      alias: { crypto: "./site/crypto-shim.ts" },
      write: false,
    }).outputFiles[0]!.text;
    expect(outText).not.toMatch(/require\(["']crypto["']\)/);
    expect(outText).not.toMatch(/from\s*["']crypto["']/);
  });

  it.each([
    ["a note with frontmatter", DOCUMENT],
    ["an empty document", ""],
    ["non-ascii content", "# Ünïcode — 🩹\n\nbody\n"],
    ["CRLF line endings", "# Title\r\n\r\nbody\r\n"],
  ])("computes the same version token as Node for %s", (_label, document) => {
    const expected = createHash("sha256")
      .update(document, "utf8")
      .digest("hex")
      .slice(0, 6);
    expect(bundled.buildModel(document).version).toBe(expected);
  });

  it("patches a document the same way the library does", async () => {
    const library = await import("../src/index.js");
    const instruction: InstructionInput = {
      targetType: "heading",
      target: ["Weekly Sync", "Notes"],
      operation: "append",
      content: "Decided: we ship on Thursday.",
    };
    expect(bundled.patch(DOCUMENT, instruction).document).toBe(
      library.patch(DOCUMENT, instruction).document
    );
  });

  it("projects the same document map, version token included", async () => {
    const library = await import("../src/index.js");
    expect(bundled.projectMap(bundled.buildModel(DOCUMENT))).toEqual(
      library.projectMap(library.buildModel(DOCUMENT))
    );
  });

  it("enforces ifMatch against a token Node produced", () => {
    const stale = createHash("sha256")
      .update("something else", "utf8")
      .digest("hex")
      .slice(0, 6);
    expect(() =>
      bundled.patch(DOCUMENT, {
        targetType: "heading",
        target: ["Weekly Sync", "Notes"],
        operation: "append",
        content: "x",
        ifMatch: stale,
      })
    ).toThrow(bundled.PreconditionFailedError);
  });

  it("accepts an ifMatch token computed outside the bundle", () => {
    const live = createHash("sha256")
      .update(DOCUMENT, "utf8")
      .digest("hex")
      .slice(0, 6);
    expect(() =>
      bundled.patch(DOCUMENT, {
        targetType: "heading",
        target: ["Weekly Sync", "Notes"],
        operation: "append",
        content: "x",
        ifMatch: live,
      })
    ).not.toThrow();
  });

  it("builds the artifact the page actually loads", () => {
    // `npm run build:site` in one call: if the entry, the alias, or a DOM-only
    // import ever breaks, this fails here rather than on the deployed page.
    const built = buildSync({
      entryPoints: ["site/playground.main.ts"],
      bundle: true,
      format: "esm",
      minify: true,
      platform: "browser",
      alias: { crypto: "./site/crypto-shim.ts" },
      write: false,
    });
    expect(built.errors).toEqual([]);
    expect(built.outputFiles[0]!.text.length).toBeGreaterThan(0);
  });

  it("throws the engine's own error types, so the playground can name them", () => {
    expect(() =>
      bundled.patch(DOCUMENT, {
        targetType: "heading",
        target: ["Nope"],
        operation: "append",
        content: "x",
      })
    ).toThrow(bundled.TargetNotFoundError);
    expect(() =>
      bundled.patch(DOCUMENT, { targetType: "heading" } as never)
    ).toThrow(bundled.InvalidInstructionError);
  });
});
