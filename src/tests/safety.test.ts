import { patch, ContentPreexistsError, Instruction } from "../index";

describe("rejectIfContentPreexists", () => {
  const DOC = "# A\nalready here\n";

  test("append is refused when the content already appears in the target span", () => {
    expect(() =>
      patch(DOC, {
        targetType: "heading",
        target: ["A"],
        operation: "append",
        scope: "content",
        content: "already here",
        rejectIfContentPreexists: true,
      })
    ).toThrow(ContentPreexistsError);
  });

  test("append proceeds when the content is not already present", () => {
    const result = patch(DOC, {
      targetType: "heading",
      target: ["A"],
      operation: "append",
      scope: "content",
      content: "new line",
      rejectIfContentPreexists: true,
    });
    expect(result.document).toBe("# A\nalready here\nnew line\n");
  });

  test("replace is never blocked by the guard (it overwrites)", () => {
    const result = patch(DOC, {
      targetType: "heading",
      target: ["A"],
      operation: "replace",
      scope: "content",
      content: "already here",
      rejectIfContentPreexists: true,
    });
    expect(result.document).toBe("# A\nalready here\n");
  });

  test("the guard does not fire without the flag", () => {
    const result = patch(DOC, {
      targetType: "heading",
      target: ["A"],
      operation: "append",
      scope: "content",
      content: "already here",
    });
    expect(result.document).toBe("# A\nalready here\nalready here\n");
  });
});

describe("public 2.0 exports", () => {
  test("patch and the Instruction type are re-exported from the package root", () => {
    const instruction: Instruction = {
      targetType: "heading",
      target: ["A"],
      operation: "replace",
      scope: "content",
      content: "x",
    };
    const result = patch("# A\nold\n", instruction);
    expect(result.document).toBe("# A\nx\n");
    expect(result.warnings).toEqual([]);
  });
});
