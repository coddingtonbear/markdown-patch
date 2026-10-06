import { buildModel, projectMap, versionOf } from "../index";

/**
 * `versionOf` is public contract: consumers (obsidian-local-rest-api's ETags)
 * hold tokens it produced and compare them against tokens produced later, so
 * the derivation must never drift.  The pinned values below are independent of
 * the implementation — they are the first six hex characters of the sha256 of
 * each document's UTF-8 bytes, computed with `sha256sum`.
 */
describe("versionOf", () => {
  it.each([
    ["an empty document", "", "e3b0c4"],
    ["a one-heading document", "# Hello\n", "90f8ec"],
  ])("pins the derivation for %s", (_label, document, expected) => {
    expect(versionOf(document)).toBe(expected);
  });

  const fixtures: Array<[string, string]> = [
    ["an empty document", ""],
    ["plain content", "# Title\n\nBody text. ^block\n"],
    ["CRLF line endings", "# Title\r\n\r\nBody text.\r\n\r\n## Child\r\n"],
    [
      "frontmatter",
      "---\nstatus: draft\ntags:\n  - alpha\n---\n\n# Meeting Notes\n",
    ],
    ["CRLF frontmatter", "---\r\nstatus: draft\r\n---\r\n\r\n# Notes\r\n"],
    ["non-ASCII text", "# Café 🎯\n\nnaïve — ünïcode\n"],
  ];

  it.each(fixtures)(
    "equals the document map's version for %s",
    (_label, document) => {
      const model = buildModel(document);
      expect(versionOf(document)).toBe(model.version);
      expect(versionOf(document)).toBe(projectMap(model).version);
    }
  );

  it.each(fixtures)(
    "gives the same token for the UTF-8 bytes of %s",
    (_label, document) => {
      expect(versionOf(new TextEncoder().encode(document))).toBe(
        versionOf(document)
      );
    }
  );

  it("accepts a Buffer, which is a Uint8Array", () => {
    const document = "# Title\r\n\r\nBody.\r\n";
    expect(versionOf(Buffer.from(document, "utf8"))).toBe(versionOf(document));
  });

  it("hashes bytes as given, without decoding them", () => {
    // Not valid UTF-8: decoding would replace these with U+FFFD and change the
    // hash, so a binary file must be hashed verbatim.
    const bytes = new Uint8Array([0xff, 0xfe, 0x00, 0x80]);
    const decoded = new TextDecoder().decode(bytes);
    expect(versionOf(bytes)).not.toBe(versionOf(decoded));
    expect(versionOf(bytes)).toBe("5a7419");
  });

  it("hashes only the viewed bytes of a subarray", () => {
    const document = "# Title\n";
    const padded = new TextEncoder().encode(`xx${document}yy`);
    expect(versionOf(padded.subarray(2, 2 + document.length))).toBe(
      versionOf(document)
    );
  });
});
