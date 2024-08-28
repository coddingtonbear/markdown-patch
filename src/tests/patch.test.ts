import fs from "fs";
import path from "path";
import { PatchInstruction } from "../types";
import { applyPatch, PatchFailed } from "../patch";

describe("patch", () => {
  const sample = fs.readFileSync(path.join(__dirname, "sample.md"), "utf-8");

  describe("heading", () => {
    test("prepend", () => {
      const expected = fs.readFileSync(
        path.join(__dirname, "sample.patch.heading.prepend.md"),
        "utf-8"
      );
      const instruction: PatchInstruction = {
        targetType: "heading",
        target: ["Overview"],
        operation: "prepend",
        content: "Beep Boop\n",
      };

      const actualResult = applyPatch(sample, instruction);
      expect(actualResult).toEqual(expected);
    });
    test("append", () => {
      const expected = fs.readFileSync(
        path.join(__dirname, "sample.patch.heading.append.md"),
        "utf-8"
      );
      const instruction: PatchInstruction = {
        targetType: "heading",
        target: ["Overview"],
        operation: "append",
        content: "Beep Boop\n",
      };

      const actualResult = applyPatch(sample, instruction);
      expect(actualResult).toEqual(expected);
    });
    test("replace", () => {
      const expected = fs.readFileSync(
        path.join(__dirname, "sample.patch.heading.replace.md"),
        "utf-8"
      );
      const instruction: PatchInstruction = {
        targetType: "heading",
        target: ["Overview"],
        operation: "replace",
        content: "Beep Boop\n",
      };

      const actualResult = applyPatch(sample, instruction);
      expect(actualResult).toEqual(expected);
    });
    describe("document", () => {
      test("prepend", () => {
        const expected = fs.readFileSync(
          path.join(__dirname, "sample.patch.heading.document.prepend.md"),
          "utf-8"
        );
        const instruction: PatchInstruction = {
          targetType: "heading",
          target: null,
          operation: "prepend",
          content: "Beep Boop\n",
        };

        const actualResult = applyPatch(sample, instruction);
        expect(actualResult).toEqual(expected);
      });
      test("append", () => {
        const expected = fs.readFileSync(
          path.join(__dirname, "sample.patch.heading.document.append.md"),
          "utf-8"
        );
        const instruction: PatchInstruction = {
          targetType: "heading",
          target: null,
          operation: "append",
          content: "Beep Boop\n",
        };

        const actualResult = applyPatch(sample, instruction);
        expect(actualResult).toEqual(expected);
      });
    });
  });

  describe("block", () => {
    /*
    test("prepend", () => {
      const expected = fs.readFileSync(
        path.join(__dirname, "sample.patch.block.prepend.md"),
        "utf-8"
      );
      const instruction: PatchInstruction = {
        targetType: "block",
        target: "2c67a6",
        operation: "prepend",
        content: "Beep Boop\n",
      };

      const actualResult = applyPatch(sample, instruction);
      expect(actualResult).toEqual(expected);
    });
    test("append", () => {
      const expected = fs.readFileSync(
        path.join(__dirname, "sample.patch.block.append.md"),
        "utf-8"
      );
      const instruction: PatchInstruction = {
        targetType: "block",
        target: ["Overview"],
        operation: "append",
        content: "Beep Boop\n",
      };

      const actualResult = applyPatch(sample, instruction);
      expect(actualResult).toEqual(expected);
    });
    test("replace", () => {
      const expected = fs.readFileSync(
        path.join(__dirname, "sample.patch.block.replace.md"),
        "utf-8"
      );
      const instruction: PatchInstruction = {
        targetType: "block",
        target: ["Overview"],
        operation: "replace",
        content: "Beep Boop\n",
      };

      const actualResult = applyPatch(sample, instruction);
      expect(actualResult).toEqual(expected);
    });
  });*/

  describe("parameter", () => {
    describe("trimTargetWhitespace", () => {
      describe("heading", () => {
        test("prepend", () => {
          const expected = fs.readFileSync(
            path.join(
              __dirname,
              "sample.patch.heading.trimTargetWhitespace.prepend.md"
            ),
            "utf-8"
          );
          const instruction: PatchInstruction = {
            targetType: "heading",
            target: ["Page Targets", "Document Properties (Exploratory)"],
            operation: "prepend",
            content: "Beep Boop",
            trimTargetWhitespace: true,
          };

          const actualResult = applyPatch(sample, instruction);
          expect(actualResult).toEqual(expected);
        });
        test("append", () => {
          const expected = fs.readFileSync(
            path.join(
              __dirname,
              "sample.patch.heading.trimTargetWhitespace.append.md"
            ),
            "utf-8"
          );
          const instruction: PatchInstruction = {
            targetType: "heading",
            target: ["Problems"],
            operation: "append",
            content: "Beep Boop\n",
            trimTargetWhitespace: true,
          };

          const actualResult = applyPatch(sample, instruction);
          expect(actualResult).toEqual(expected);
        });
      });
    });

    describe("applyIfContentPreexists", () => {
      describe("disabled (default)", () => {
        describe("heading", () => {
          test("preexists at target", () => {
            const instruction: PatchInstruction = {
              targetType: "heading",
              target: ["Page Targets"],
              operation: "append",
              content: "## Frontmatter Field",
              // applyIfContentPreexists: false,  # default
            };

            expect(() => {
              applyPatch(sample, instruction);
            }).toThrow(PatchFailed);
          });
          test("does not preexist at target", () => {
            const instruction: PatchInstruction = {
              targetType: "heading",
              target: ["Headers"],
              operation: "append",
              content: "## Frontmatter Field",
              // applyIfContentPreexists: false,  # default
            };

            expect(() => {
              applyPatch(sample, instruction);
            }).not.toThrow(PatchFailed);
          });
        });
      });
      describe("enabled", () => {
        describe("heading", () => {
          test("preexists at target", () => {
            const instruction: PatchInstruction = {
              targetType: "heading",
              target: ["Page Targets"],
              operation: "append",
              content: "## Frontmatter Field",
              applyIfContentPreexists: true,
            };

            expect(() => {
              applyPatch(sample, instruction);
            }).not.toThrow(PatchFailed);
          });
        });
      });
    });
  });
});
