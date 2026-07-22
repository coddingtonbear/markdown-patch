import {
  Operation,
  Scope,
  TargetType,
  Instruction,
  InstructionInput,
  isValidCell,
  assertValidCell,
  InvalidCellError,
  withDefaultScope,
  isBlockTableRowInstruction,
} from "../instructions";

const OPERATIONS: Operation[] = ["replace", "prepend", "append", "delete"];
const SCOPES: Scope[] = ["content", "marker", "markerAndContent", "parent"];
const TARGET_TYPES: TargetType[] = ["heading", "block", "frontmatter"];

// An independent, hand-written truth table for the 4×4×3 matrix, so the guard
// is checked against an explicit spec rather than its own data structure.
const VALID = new Set<string>([
  // heading
  "heading|replace|content",
  "heading|prepend|content",
  "heading|append|content",
  "heading|delete|content",
  "heading|replace|marker",
  "heading|prepend|marker",
  "heading|append|marker",
  "heading|delete|marker",
  "heading|replace|markerAndContent",
  "heading|prepend|markerAndContent",
  "heading|append|markerAndContent",
  "heading|delete|markerAndContent",
  "heading|replace|parent",
  // block
  "block|replace|content",
  "block|prepend|content",
  "block|append|content",
  "block|delete|content",
  "block|replace|marker",
  "block|delete|marker",
  "block|replace|markerAndContent",
  "block|prepend|markerAndContent",
  "block|append|markerAndContent",
  "block|delete|markerAndContent",
  // frontmatter
  "frontmatter|replace|content",
  "frontmatter|prepend|content",
  "frontmatter|append|content",
  "frontmatter|delete|content",
  "frontmatter|replace|marker",
  "frontmatter|replace|markerAndContent",
  "frontmatter|prepend|markerAndContent",
  "frontmatter|append|markerAndContent",
  "frontmatter|delete|markerAndContent",
]);

describe("cell validity matrix", () => {
  for (const targetType of TARGET_TYPES) {
    for (const operation of OPERATIONS) {
      for (const scope of SCOPES) {
        const key = `${targetType}|${operation}|${scope}`;
        const expected = VALID.has(key);
        test(`${key} is ${expected ? "valid" : "invalid"}`, () => {
          expect(isValidCell(targetType, operation, scope)).toBe(expected);
        });
      }
    }
  }
});

describe("assertValidCell", () => {
  test("passes for a valid cell", () => {
    expect(() =>
      assertValidCell({
        targetType: "heading",
        operation: "replace",
        scope: "parent",
      })
    ).not.toThrow();
  });

  test("throws InvalidCellError for an invalid cell", () => {
    expect(() =>
      assertValidCell({
        targetType: "heading",
        operation: "prepend",
        scope: "parent",
      })
    ).toThrow(InvalidCellError);
  });

  test("rejects parent scope on block and frontmatter targets", () => {
    expect(() =>
      assertValidCell({
        targetType: "block",
        operation: "replace",
        scope: "parent",
      })
    ).toThrow(InvalidCellError);
    expect(() =>
      assertValidCell({
        targetType: "frontmatter",
        operation: "replace",
        scope: "parent",
      })
    ).toThrow(InvalidCellError);
  });
});

describe("Instruction typing (compile-time)", () => {
  // These literals must type-check; they double as documentation of the shape.
  test("representative instructions are assignable to Instruction", () => {
    const examples: Instruction[] = [
      {
        targetType: "heading",
        operation: "append",
        scope: "content",
        target: ["Overview"],
        content: "# A child section\n",
      },
      {
        targetType: "heading",
        operation: "replace",
        scope: "parent",
        target: ["Overview", "Details"],
        destination: { parent: ["Appendix"], place: "last" },
      },
      {
        targetType: "heading",
        operation: "delete",
        scope: "marker",
        target: ["Overview", "Obsolete"],
      },
      {
        targetType: "block",
        operation: "replace",
        scope: "marker",
        target: "thesis",
        content: "revised-thesis",
      },
      {
        targetType: "block",
        operation: "append",
        scope: "content",
        target: "population-table",
        value: [["Chicago, IL", "16"]],
      },
      {
        targetType: "frontmatter",
        operation: "append",
        scope: "content",
        target: "reviewers",
        value: ["alice"],
      },
      {
        targetType: "frontmatter",
        operation: "replace",
        scope: "marker",
        target: "status",
        content: "state",
      },
    ];
    expect(examples).toHaveLength(7);
  });
});

describe("isBlockTableRowInstruction", () => {
  test("true for a block content cell carrying value", () => {
    expect(
      isBlockTableRowInstruction({
        targetType: "block",
        target: "abc",
        operation: "append",
        scope: "content",
        value: [["a", "b"]],
      })
    ).toBe(true);
  });

  test("false for a block content cell carrying literal content", () => {
    expect(
      isBlockTableRowInstruction({
        targetType: "block",
        target: "abc",
        operation: "append",
        scope: "content",
        content: "text",
      })
    ).toBe(false);
  });

  test("false for a block marker cell", () => {
    expect(
      isBlockTableRowInstruction({
        targetType: "block",
        target: "abc",
        operation: "replace",
        scope: "marker",
        content: "newid",
      })
    ).toBe(false);
  });
});

describe("InstructionInput — scope defaulting boundary", () => {
  test("scope may be omitted where it would default to content", () => {
    // A write/delete cell: `scope` is optional on the input.
    const headingWrite: InstructionInput = {
      targetType: "heading",
      target: ["A"],
      operation: "replace",
      content: "x",
    };
    const frontmatterValue: InstructionInput = {
      targetType: "frontmatter",
      target: "title",
      operation: "replace",
      value: "x",
    };
    expect(withDefaultScope(headingWrite).scope).toBe("content");
    expect(withDefaultScope(frontmatterValue).scope).toBe("content");
  });

  test("a move is never defaulted — it must name scope: parent", () => {
    // @ts-expect-error a `destination` without scope: "parent" matches no member.
    const move: InstructionInput = {
      targetType: "heading",
      target: ["A"],
      operation: "replace",
      destination: { parent: null, place: "last" },
    };
    void move;
  });

  test("an explicit scope is preserved by the default", () => {
    const explicit: InstructionInput = {
      targetType: "heading",
      target: ["A"],
      operation: "replace",
      scope: "markerAndContent",
      content: "# A\nx",
    };
    expect(withDefaultScope(explicit).scope).toBe("markerAndContent");
  });
});
