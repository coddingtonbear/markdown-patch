import { createHash as nodeCreateHash } from "crypto";

import { createHash } from "./crypto-shim.js";

/**
 * The shim only earns its place if it agrees with Node byte for byte: the
 * playground's `version` token has to be the token `mdpatch print-map` prints,
 * or an `ifMatch` demonstrated in the browser is a lie. Every case below is
 * asserted against Node's own `createHash` rather than a checked-in constant,
 * so the oracle is the thing we are standing in for.
 */
const agreesWithNode = (chunks: string[]): void => {
  const node = nodeCreateHash("sha256");
  const shim = createHash("sha256");
  for (const chunk of chunks) {
    node.update(chunk, "utf8");
    shim.update(chunk, "utf8");
  }
  expect(shim.digest("hex")).toBe(node.digest("hex"));
};

describe("crypto shim", () => {
  it.each([
    ["empty input", [""]],
    ["ascii", ["hello world"]],
    ["a realistic document", ["---\nstatus: draft\n---\n\n# Weekly Sync\n"]],
    ["non-ascii", ["héllo wörld — ünïcode"]],
    ["astral plane", ["🩹 patch 𝔘𝔫𝔦𝔠𝔬𝔡𝔢 🎯"]],
    ["combining marks", ["égalité"]],
    ["lone surrogate replacement", ["ok\ud800end"]],
    ["multiple chunks", ["one ", "two ", "three"]],
    ["chunks split mid-codepoint boundary", ["a".repeat(70), "b".repeat(3)]],
  ])("matches Node's sha256 for %s", (_label, chunks) => {
    agreesWithNode(chunks);
  });

  // The padding block is where a hand-written SHA-256 goes wrong: a message
  // whose length lands on or just under a 64-byte boundary needs an extra
  // block, and off-by-one there is invisible for every other length.
  it.each([0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 1000])(
    "matches Node's sha256 at a message length of %i bytes",
    (length) => {
      agreesWithNode(["x".repeat(length)]);
    }
  );

  it("is chunk-boundary agnostic", () => {
    const whole = createHash("sha256").update("abcdefghij", "utf8");
    const split = createHash("sha256")
      .update("abcde", "utf8")
      .update("fghij", "utf8");
    expect(split.digest("hex")).toBe(whole.digest("hex"));
  });

  it("produces the 6-character token the engine slices", () => {
    const document = "# Title\n\nBody.\n";
    const expected = nodeCreateHash("sha256")
      .update(document, "utf8")
      .digest("hex")
      .slice(0, 6);
    expect(createHash("sha256").update(document, "utf8").digest("hex").slice(0, 6)).toBe(
      expected
    );
  });

  it("refuses an algorithm it cannot honour", () => {
    expect(() => createHash("sha1")).toThrow(/only "sha256"/);
  });

  it("refuses encodings it cannot honour", () => {
    expect(() => createHash("sha256").update("x", "latin1" as "utf8")).toThrow(
      /only "utf8"/
    );
    expect(() =>
      createHash("sha256").update("x", "utf8").digest("base64" as "hex")
    ).toThrow(/only "hex"/);
  });
});
