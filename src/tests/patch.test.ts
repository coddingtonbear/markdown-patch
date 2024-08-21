import fs from "fs";
import path from "path";
import { PatchInstruction } from "../types";
import { applyPatch } from "../patch";

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
        target: "Overview",
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
        target: "Overview",
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
        target: "Overview",
        operation: "replace",
        content: "Beep Boop\n",
      };

      const actualResult = applyPatch(sample, instruction);
      expect(actualResult).toEqual(expected);
    });
    describe("seamless", () => {
      test("prepend", () => {
        const expected = fs.readFileSync(
          path.join(__dirname, "sample.patch.heading.seamless.prepend.md"),
          "utf-8"
        );
        const instruction: PatchInstruction = {
          targetType: "heading",
          target: "Page Targets\u001fHeading",
          operation: "prepend",
          content: "\nBeep Boop\n",
        };

        const actualResult = applyPatch(sample, instruction);
        expect(actualResult).toEqual(expected);
      });
      test("append", () => {
        const expected = fs.readFileSync(
          path.join(__dirname, "sample.patch.heading.seamless.append.md"),
          "utf-8"
        );
        const instruction: PatchInstruction = {
          targetType: "heading",
          target: "Problems",
          operation: "append",
          content: "\n\nBeep Boop\n\n",
          seamless: true,
        };

        const actualResult = applyPatch(sample, instruction);
        expect(actualResult).toEqual(expected);
      });
    });
  });
});
