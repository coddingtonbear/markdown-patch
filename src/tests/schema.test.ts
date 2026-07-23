import { z } from "zod";

import {
  InstructionInputSchema,
  InstructionInputObjectSchema,
} from "../schema";
import { patch } from "../engine";
import {
  InstructionInput,
  InvalidInstructionError,
} from "../instructions";

// --- Type-level drift guard ----------------------------------------------
//
// Every member of the hand-written InstructionInput union must be accepted by
// the flat schema's input type. If the union grows a field or tightens a type
// the schema does not mirror, this assignment stops compiling — which, under
// ts-jest, fails the suite. (The reverse does not hold and is not expected: the
// flat schema is looser at compile time and tightened at runtime by the
// superRefine, so a bare object without its carrier is a valid *type* but a
// runtime error.)
const _unionSatisfiesSchema: (
  i: InstructionInput
) => z.input<typeof InstructionInputObjectSchema> = (i) => i;
void _unionSatisfiesSchema;

// A representative instance of each union member, to exercise the schema at
// runtime the way callers actually use it.
const valid: { name: string; instruction: InstructionInput }[] = [
  {
    name: "heading write @ content",
    instruction: { targetType: "heading", target: ["A"], operation: "append", content: "x" },
  },
  {
    name: "heading write @ marker",
    instruction: { targetType: "heading", target: ["A"], operation: "replace", scope: "marker", content: "New" },
  },
  {
    name: "heading move @ parent",
    instruction: {
      targetType: "heading",
      target: ["A", "B"],
      operation: "replace",
      scope: "parent",
      destination: { parent: null, place: "last" },
    },
  },
  {
    name: "heading delete",
    instruction: { targetType: "heading", target: ["A"], operation: "delete", scope: "markerAndContent" },
  },
  {
    name: "block write @ content",
    instruction: { targetType: "block", target: "abc", operation: "append", content: "row" },
  },
  {
    name: "block marker replace",
    instruction: { targetType: "block", target: "abc", operation: "replace", scope: "marker", content: "def" },
  },
  {
    name: "block target/marker with hyphens and underscores",
    instruction: { targetType: "block", target: "a-b_c1", operation: "replace", scope: "marker", content: "x-y_2" },
  },
  {
    name: "block table-row write",
    instruction: { targetType: "block", target: "abc", operation: "append", value: [["a", "b"]] },
  },
  {
    name: "block target disambiguated by the duplicate-marker suffix",
    instruction: {
      targetType: "block",
      target: "abc\u{FC750}\u{F6440}",
      operation: "replace",
      content: "x",
    },
  },
  {
    name: "frontmatter value write",
    instruction: { targetType: "frontmatter", target: "title", operation: "replace", value: "T" },
  },
  {
    name: "frontmatter value merge",
    instruction: { targetType: "frontmatter", target: "tags", operation: "append", value: ["x"] },
  },
  {
    name: "frontmatter rename",
    instruction: { targetType: "frontmatter", target: "a", operation: "replace", scope: "marker", content: "b" },
  },
  {
    name: "frontmatter delete",
    instruction: { targetType: "frontmatter", target: "a", operation: "delete" },
  },
  {
    name: "heading within write (literal splice into a body block)",
    instruction: { targetType: "heading", target: ["A"], within: -1, operation: "append", content: "\n- x" },
  },
  {
    name: "heading within delete",
    instruction: { targetType: "heading", target: ["A"], within: 0, operation: "delete" },
  },
  {
    name: "heading within sibling insert",
    instruction: {
      targetType: "heading",
      target: ["A"],
      within: 1,
      operation: "prepend",
      scope: "markerAndContent",
      content: "new block",
    },
  },
];

describe("InstructionInputSchema", () => {
  test.each(valid)("accepts a $name", ({ instruction }) => {
    expect(InstructionInputSchema.safeParse(instruction).success).toBe(true);
  });

  test("defaults an omitted scope to content and the flags to false", () => {
    const parsed = InstructionInputSchema.parse({
      targetType: "heading",
      target: ["A"],
      operation: "append",
      content: "x",
    });
    expect(parsed.scope).toBe("content");
    expect(parsed.createTargetIfMissing).toBe(false);
    expect(parsed.rejectIfContentPreexists).toBe(false);
  });

  describe("rejects malformed instructions", () => {
    const invalid: { name: string; instruction: unknown }[] = [
      {
        name: "a heading target given as a string",
        instruction: { targetType: "heading", target: "A", operation: "append", content: "x" },
      },
      {
        name: "a block target given as an array",
        instruction: { targetType: "block", target: ["a"], operation: "append", content: "x" },
      },
      {
        name: "an invalid cell (parent on a block)",
        instruction: {
          targetType: "block",
          target: "a",
          operation: "replace",
          scope: "parent",
          destination: { parent: null, place: "last" },
        },
      },
      {
        name: "an invalid cell (prepend on a frontmatter marker)",
        instruction: { targetType: "frontmatter", target: "a", operation: "prepend", scope: "marker", content: "b" },
      },
      {
        name: "a heading write carrying value instead of content",
        instruction: { targetType: "heading", target: ["A"], operation: "replace", value: 1 },
      },
      {
        name: "a frontmatter value write carrying content instead of value",
        instruction: { targetType: "frontmatter", target: "a", operation: "replace", content: "x" },
      },
      {
        name: "a heading write missing its content carrier",
        instruction: { targetType: "heading", target: ["A"], operation: "replace" },
      },
      {
        name: "a move missing its destination carrier",
        instruction: { targetType: "heading", target: ["A"], operation: "replace", scope: "parent" },
      },
      {
        name: "a delete carrying content",
        instruction: { targetType: "heading", target: ["A"], operation: "delete", content: "x" },
      },
      {
        name: "a block content write carrying both content and value",
        instruction: {
          targetType: "block",
          target: "abc",
          operation: "append",
          content: "x",
          value: [["a", "b"]],
        },
      },
      {
        name: "a block content write with a value that isn't a 2-D array of strings",
        instruction: { targetType: "block", target: "abc", operation: "append", value: ["a", "b"] },
      },
      {
        name: "a block content write with a value row containing a non-string cell",
        instruction: { targetType: "block", target: "abc", operation: "append", value: [["a", 1]] },
      },
      {
        name: "a value on a block marker cell (only content/value on `content` scope)",
        instruction: { targetType: "block", target: "abc", operation: "replace", scope: "marker", value: [["a"]] },
      },
      {
        name: "a block target containing a space",
        instruction: { targetType: "block", target: "has space", operation: "append", content: "x" },
      },
      {
        name: "a block marker rename to an id containing a space",
        instruction: { targetType: "block", target: "abc", operation: "replace", scope: "marker", content: "new id" },
      },
      {
        name: "a block marker rename to an id carrying the duplicate-marker suffix",
        instruction: {
          targetType: "block",
          target: "abc",
          operation: "replace",
          scope: "marker",
          content: "def\u{FC750}\u{F6440}",
        },
      },
      {
        name: "a block marker rename to an id containing a caret",
        instruction: { targetType: "block", target: "abc", operation: "replace", scope: "marker", content: "^def" },
      },
      {
        name: "a heading marker rename containing an embedded newline",
        instruction: { targetType: "heading", target: ["A"], operation: "replace", scope: "marker", content: "New\nline" },
      },
      {
        name: "within on a block target",
        instruction: { targetType: "block", target: "abc", within: 0, operation: "append", content: "x" },
      },
      {
        name: "within on a frontmatter target",
        instruction: { targetType: "frontmatter", target: "a", within: 0, operation: "replace", value: "v" },
      },
      {
        name: "a non-integer within",
        instruction: { targetType: "heading", target: ["A"], within: 0.5, operation: "append", content: "x" },
      },
      {
        name: "within with marker scope",
        instruction: { targetType: "heading", target: ["A"], within: 0, operation: "replace", scope: "marker", content: "x" },
      },
      {
        name: "within with parent scope",
        instruction: {
          targetType: "heading",
          target: ["A"],
          within: 0,
          operation: "replace",
          scope: "parent",
          destination: { parent: null, place: "last" },
        },
      },
      {
        name: "a within replace @ markerAndContent (content covers it)",
        instruction: {
          targetType: "heading",
          target: ["A"],
          within: 0,
          operation: "replace",
          scope: "markerAndContent",
          content: "x",
        },
      },
      {
        name: "a within delete @ markerAndContent (content covers it)",
        instruction: {
          targetType: "heading",
          target: ["A"],
          within: 0,
          operation: "delete",
          scope: "markerAndContent",
        },
      },
      {
        name: "within combined with createTargetIfMissing",
        instruction: {
          targetType: "heading",
          target: ["A"],
          within: 0,
          operation: "append",
          content: "x",
          createTargetIfMissing: true,
        },
      },
    ];

    test.each(invalid)("rejects $name", ({ instruction }) => {
      expect(InstructionInputSchema.safeParse(instruction).success).toBe(false);
    });
  });
});

describe("patch() boundary validation", () => {
  test("throws InvalidInstructionError for a malformed instruction", () => {
    expect(() =>
      // A heading write with no content carrier: valid cell, wrong shape.
      patch("# A\n\nbody\n", {
        targetType: "heading",
        target: ["A"],
        operation: "replace",
      } as InstructionInput)
    ).toThrow(InvalidInstructionError);
  });

  test("applies a well-formed instruction", () => {
    const { document } = patch("# A\n\nbody\n", {
      targetType: "frontmatter",
      target: "title",
      operation: "replace",
      value: "Set",
      createTargetIfMissing: true,
    });
    expect(document).toContain("title: Set");
  });
});
