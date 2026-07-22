export const TARGETABLE_BY_ISOLATED_BLOCK_REFERENCE = [
  "code",
  "heading",
  "table",
  "blockquote",
  "list",
  "paragraph",
  "image",
];

export const CAN_INCLUDE_BLOCK_REFERENCE = ["paragraph", "list_item", "table"];

export const DEFAULT_TARGET_SCOPE = "content";

/**
 * Reserved codepoints used to disambiguate a duplicate sibling heading's
 * address — never written into a document, only synthesized into an
 * ephemeral map key or target address. Both live in Supplementary Private
 * Use Area-A (U+F0000-U+FFFFD), well clear of the plane's start (Material
 * Design Icons claims U+F0001+) and of known BMP PUA clusters (legacy
 * Microsoft symbol fonts, Font Awesome, Octicons, the Apple logo glyph),
 * and far enough apart from each other that no plausible contiguous foreign
 * assignment could span both.
 *
 * DUPLICATE_DIGITS is 16 sequential codepoints — an arbitrary reserved
 * alphabet, not real Unicode digits — so an occurrence index is encoded in
 * hex, one reserved codepoint per hex digit, via {@link encodeOccurrenceSuffix}
 * in projection.ts.
 */
export const DUPLICATE_MARKER = String.fromCodePoint(0xfc750);

export const DUPLICATE_DIGITS: readonly string[] = Array.from(
  { length: 16 },
  (_, index) => String.fromCodePoint(0xf6440 + index)
);

/**
 * Matches a string ending in {@link DUPLICATE_MARKER} immediately followed by
 * one or more {@link DUPLICATE_DIGITS} codepoints, with nothing after — the
 * exact shape a synthesized disambiguation suffix takes. Used to guard
 * against a raw heading or block id in the source document colliding with a
 * synthesized address. The `u` flag is required: these are astral
 * codepoints, and without it the character class would match surrogate code
 * units rather than whole codepoints.
 */
export const DUPLICATE_MARKER_SUFFIX = new RegExp(
  `${DUPLICATE_MARKER}[${DUPLICATE_DIGITS.join("")}]+$`,
  "u"
);
