import { buildModel } from "../model";
import { ReservedDuplicateMarkerError } from "../instructions";

describe("reserved duplicate-marker collision guard", () => {
  test("throws when a heading's raw text ends with the marker followed by digits", () => {
    const doc = `# Heading\u{FC750}\u{F6440}\n\nbody\n`;
    expect(() => buildModel(doc)).toThrow(ReservedDuplicateMarkerError);
  });

  test("throws when a heading's raw text ends with the marker followed by multiple digits", () => {
    const doc = `# Heading\u{FC750}\u{F6441}\u{F6440}\n\nbody\n`;
    expect(() => buildModel(doc)).toThrow(ReservedDuplicateMarkerError);
  });

  test("throws when a block id ends with the marker followed by digits", () => {
    const doc = `paragraph text ^ref\u{FC750}\u{F6440}\n`;
    expect(() => buildModel(doc)).toThrow(ReservedDuplicateMarkerError);
  });

  test("does not throw when the marker sequence sits in the middle of a heading", () => {
    const doc = `# Heading\u{FC750}\u{F6440} and more text\n\nbody\n`;
    expect(() => buildModel(doc)).not.toThrow();
  });

  test("does not throw when the marker appears with no digits after it", () => {
    const doc = `# Heading\u{FC750}\n\nbody\n`;
    expect(() => buildModel(doc)).not.toThrow();
  });

  test("does not throw for an ordinary document with no reserved codepoints", () => {
    const doc = `# Heading\n\nbody ^ref\n`;
    expect(() => buildModel(doc)).not.toThrow();
  });
});
