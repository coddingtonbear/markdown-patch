import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { FrontmatterPatchInstruction, PatchInstruction } from "../types";
import { applyPatch, PatchFailed } from "../patch";
import { ContentType } from "../types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("patch", () => {
  const sample = fs.readFileSync(path.join(__dirname, "sample.md"), "utf-8");

  const assertPatchResultsMatch = (
    inputDocumentPath: string,
    outputDocumentPath: string,
    instruction: PatchInstruction
  ) => {
    const inputDocument = fs.readFileSync(
      path.join(__dirname, inputDocumentPath),
      "utf-8"
    );
    const outputDocument = fs.readFileSync(
      path.join(__dirname, outputDocumentPath),
      "utf-8"
    );

    expect(applyPatch(inputDocument, instruction)).toEqual(outputDocument);
  };

  describe("heading", () => {
    test("prepend", () => {
      const instruction: PatchInstruction = {
        targetType: "heading",
        target: ["Overview"],
        operation: "prepend",
        content: "Beep Boop\n",
      };

      assertPatchResultsMatch(
        "sample.md",
        "sample.patch.heading.prepend.md",
        instruction
      );
    });
    test("append", () => {
      const instruction: PatchInstruction = {
        targetType: "heading",
        target: ["Overview"],
        operation: "append",
        content: "Beep Boop\n",
      };

      assertPatchResultsMatch(
        "sample.md",
        "sample.patch.heading.append.md",
        instruction
      );
    });
    test("replace", () => {
      const instruction: PatchInstruction = {
        targetType: "heading",
        target: ["Overview"],
        operation: "replace",
        content: "Beep Boop\n",
      };

      assertPatchResultsMatch(
        "sample.md",
        "sample.patch.heading.replace.md",
        instruction
      );
    });
    describe("document", () => {
      test("prepend", () => {
        const instruction: PatchInstruction = {
          targetType: "heading",
          target: null,
          operation: "prepend",
          content: "Beep Boop\n",
        };
        assertPatchResultsMatch(
          "sample.md",
          "sample.patch.heading.document.prepend.md",
          instruction
        );
      });
      test("append", () => {
        const instruction: PatchInstruction = {
          targetType: "heading",
          target: null,
          operation: "append",
          content: "Beep Boop\n",
        };

        assertPatchResultsMatch(
          "sample.md",
          "sample.patch.heading.document.append.md",
          instruction
        );
      });
    });
  });

  describe("parameter", () => {
    describe("trimTargetWhitespace", () => {
      describe("heading", () => {
        test("prepend", () => {
          const instruction: PatchInstruction = {
            targetType: "heading",
            target: ["Page Targets", "Document Properties (Exploratory)"],
            operation: "prepend",
            content: "Beep Boop",
            trimTargetWhitespace: true,
          };

          assertPatchResultsMatch(
            "sample.md",
            "sample.patch.heading.trimTargetWhitespace.prepend.md",
            instruction
          );
        });
        test("append", () => {
          const instruction: PatchInstruction = {
            targetType: "heading",
            target: ["Problems"],
            operation: "append",
            content: "Beep Boop\n",
            trimTargetWhitespace: true,
          };

          assertPatchResultsMatch(
            "sample.md",
            "sample.patch.heading.trimTargetWhitespace.append.md",
            instruction
          );
        });
      });
    });

    describe("createTargetIfMissing", () => {
      test("nested", () => {
        const instruction: PatchInstruction = {
          targetType: "heading",
          target: ["Page Targets", "Block", "Test"],
          operation: "replace",
          content: "Beep Boop\n",
          createTargetIfMissing: true,
        };

        assertPatchResultsMatch(
          "sample.md",
          "sample.patch.heading.createIfMissing.nested.md",
          instruction
        );
      });

      test("root", () => {
        const instruction: PatchInstruction = {
          targetType: "heading",
          target: ["Alpha", "Beta", "Test"],
          operation: "replace",
          content: "Beep Boop\n",
          createTargetIfMissing: true,
        };

        assertPatchResultsMatch(
          "sample.md",
          "sample.patch.heading.createIfMissing.root.md",
          instruction
        );
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
  describe("block", () => {
    test("prepend", () => {
      const instruction: PatchInstruction = {
        targetType: "block",
        target: "e6068e",
        operation: "prepend",
        content: "- OK\n",
      };

      assertPatchResultsMatch(
        "sample.md",
        "sample.patch.block.prepend.md",
        instruction
      );
    });
    test("append", () => {
      const instruction: PatchInstruction = {
        targetType: "block",
        target: "e6068e",
        operation: "append",
        content: "\n- OK",
      };

      assertPatchResultsMatch(
        "sample.md",
        "sample.patch.block.append.md",
        instruction
      );
    });
    test("replace", () => {
      const instruction: PatchInstruction = {
        targetType: "block",
        target: "259a73",
        operation: "replace",
        content: "- OK",
      };
      assertPatchResultsMatch(
        "sample.md",
        "sample.patch.block.replace.md",
        instruction
      );
    });
    describe("tagetBlockTypeBehavior", () => {
      describe("table", () => {
        test("prepend", () => {
          const instruction: PatchInstruction = {
            targetType: "block",
            target: "2c67a6",
            operation: "prepend",
            contentType: ContentType.json,
            content: [
              ["`something else`", "Some other application", "✅", "✅", "✅"],
            ],
          };

          assertPatchResultsMatch(
            "sample.md",
            "sample.patch.block.targetBlockTypeBehavior.table.prepend.md",
            instruction
          );
        });
        test("append", () => {
          const instruction: PatchInstruction = {
            targetType: "block",
            target: "2c67a6",
            operation: "append",
            contentType: ContentType.json,
            content: [
              ["`something else`", "Some other application", "✅", "✅", "✅"],
            ],
          };
          assertPatchResultsMatch(
            "sample.md",
            "sample.patch.block.targetBlockTypeBehavior.table.append.md",
            instruction
          );
        });
        test("replace", () => {
          const instruction: PatchInstruction = {
            targetType: "block",
            target: "2c67a6",
            operation: "replace",
            contentType: ContentType.json,
            content: [
              ["`something else`", "Some other application", "✅", "✅", "✅"],
            ],
          };

          assertPatchResultsMatch(
            "sample.md",
            "sample.patch.block.targetBlockTypeBehavior.table.replace.md",
            instruction
          );
        });
      });
    });
  });
  describe("frontmatter", () => {
    describe("append", () => {
      test("mismatched types", () => {
        const instruction: FrontmatterPatchInstruction = {
          targetType: "frontmatter",
          target: "array-value",
          operation: "append",
          contentType: ContentType.json,
          content: "OK",
        };

        expect(() => {
          applyPatch(sample, instruction);
        }).toThrow(PatchFailed);
      });
      test("invalid type", () => {
        const instruction: FrontmatterPatchInstruction = {
          targetType: "frontmatter",
          target: "array-value",
          operation: "append",
          contentType: ContentType.json,
          content: 10,
        };

        expect(() => {
          applyPatch(sample, instruction);
        }).toThrow(PatchFailed);
      });
      test("list", () => {
        const instruction: FrontmatterPatchInstruction = {
          targetType: "frontmatter",
          target: "array-value",
          operation: "append",
          contentType: ContentType.json,
          content: ["Beep"],
        };
        assertPatchResultsMatch(
          "sample.frontmatter.md",
          "sample.patch.frontmatter.append.list.md",
          instruction
        );
      });
      test("dictionary", () => {
        const instruction: FrontmatterPatchInstruction = {
          targetType: "frontmatter",
          target: "object-value",
          operation: "append",
          contentType: ContentType.json,
          content: { three: "Beep" },
        };
        assertPatchResultsMatch(
          "sample.frontmatter.md",
          "sample.patch.frontmatter.append.dictionary.md",
          instruction
        );
      });
      test("string", () => {
        const instruction: FrontmatterPatchInstruction = {
          targetType: "frontmatter",
          target: "string-value",
          operation: "append",
          contentType: ContentType.json,
          content: "Beep",
        };
        assertPatchResultsMatch(
          "sample.frontmatter.md",
          "sample.patch.frontmatter.append.string.md",
          instruction
        );
      });
    });
    describe("prepend", () => {
      test("mismatched types", () => {
        const instruction: FrontmatterPatchInstruction = {
          targetType: "frontmatter",
          target: "array-value",
          operation: "prepend",
          contentType: ContentType.json,
          content: "OK",
        };

        expect(() => {
          applyPatch(sample, instruction);
        }).toThrow(PatchFailed);
      });
      test("invalid type", () => {
        const instruction: FrontmatterPatchInstruction = {
          targetType: "frontmatter",
          target: "array-value",
          operation: "prepend",
          contentType: ContentType.json,
          content: 10,
        };

        expect(() => {
          applyPatch(sample, instruction);
        }).toThrow(PatchFailed);
      });
      test("list", () => {
        const instruction: FrontmatterPatchInstruction = {
          targetType: "frontmatter",
          target: "array-value",
          operation: "prepend",
          contentType: ContentType.json,
          content: ["Beep"],
        };
        assertPatchResultsMatch(
          "sample.frontmatter.md",
          "sample.patch.frontmatter.prepend.list.md",
          instruction
        );
      });
      test("dictionary", () => {
        const instruction: FrontmatterPatchInstruction = {
          targetType: "frontmatter",
          target: "object-value",
          operation: "prepend",
          contentType: ContentType.json,
          content: { three: "Beep" },
        };
        assertPatchResultsMatch(
          "sample.frontmatter.md",
          "sample.patch.frontmatter.prepend.dictionary.md",
          instruction
        );
      });
      test("string", () => {
        const instruction: FrontmatterPatchInstruction = {
          targetType: "frontmatter",
          target: "string-value",
          operation: "prepend",
          contentType: ContentType.json,
          content: "Beep",
        };
        assertPatchResultsMatch(
          "sample.frontmatter.md",
          "sample.patch.frontmatter.prepend.string.md",
          instruction
        );
      });
    });
    describe("replace", () => {
      test("list", () => {
        const instruction: FrontmatterPatchInstruction = {
          targetType: "frontmatter",
          target: "array-value",
          operation: "replace",
          contentType: ContentType.json,
          content: ["Replaced"],
        };
        assertPatchResultsMatch(
          "sample.frontmatter.md",
          "sample.patch.frontmatter.replace.list.md",
          instruction
        );
      });
      test("dictionary", () => {
        const instruction: FrontmatterPatchInstruction = {
          targetType: "frontmatter",
          target: "object-value",
          operation: "replace",
          contentType: ContentType.json,
          content: {
            replaced: true,
          },
        };
        assertPatchResultsMatch(
          "sample.frontmatter.md",
          "sample.patch.frontmatter.replace.dictionary.md",
          instruction
        );
      });
      test("string", () => {
        const instruction: FrontmatterPatchInstruction = {
          targetType: "frontmatter",
          target: "string-value",
          operation: "replace",
          contentType: ContentType.json,
          content: "Replaced",
        };
        assertPatchResultsMatch(
          "sample.frontmatter.md",
          "sample.patch.frontmatter.replace.string.md",
          instruction
        );
      });
      test("number", () => {
        const instruction: FrontmatterPatchInstruction = {
          targetType: "frontmatter",
          target: "number-value",
          operation: "replace",
          contentType: ContentType.json,
          content: 10,
        };
        assertPatchResultsMatch(
          "sample.frontmatter.md",
          "sample.patch.frontmatter.replace.number.md",
          instruction
        );
      });
      test("boolean", () => {
        const instruction: FrontmatterPatchInstruction = {
          targetType: "frontmatter",
          target: "boolean-value",
          operation: "replace",
          contentType: ContentType.json,
          content: true,
        };
        assertPatchResultsMatch(
          "sample.frontmatter.md",
          "sample.patch.frontmatter.replace.boolean.md",
          instruction
        );
      });
      describe("createTargetIfMissing", () => {
        test("list", () => {
          const instruction: FrontmatterPatchInstruction = {
            targetType: "frontmatter",
            target: "new-field",
            operation: "replace",
            contentType: ContentType.json,
            content: ["New Value"],
            createTargetIfMissing: true,
          };
          assertPatchResultsMatch(
            "sample.frontmatter.md",
            "sample.patch.frontmatter.createTargetIfMissing.list.md",
            instruction
          );
        });
        test("dictionary", () => {
          const instruction: FrontmatterPatchInstruction = {
            targetType: "frontmatter",
            target: "new-field",
            operation: "replace",
            contentType: ContentType.json,
            content: {
              newValue: true,
            },
            createTargetIfMissing: true,
          };
          assertPatchResultsMatch(
            "sample.frontmatter.md",
            "sample.patch.frontmatter.createTargetIfMissing.dictionary.md",
            instruction
          );
        });
        test("string", () => {
          const instruction: FrontmatterPatchInstruction = {
            targetType: "frontmatter",
            target: "new-field",
            operation: "replace",
            contentType: ContentType.json,
            content: "New Value",
            createTargetIfMissing: true,
          };
          assertPatchResultsMatch(
            "sample.frontmatter.md",
            "sample.patch.frontmatter.createTargetIfMissing.string.md",
            instruction
          );
        });
        test("number", () => {
          const instruction: FrontmatterPatchInstruction = {
            targetType: "frontmatter",
            target: "new-field",
            operation: "replace",
            contentType: ContentType.json,
            content: 588600,
            createTargetIfMissing: true,
          };
          assertPatchResultsMatch(
            "sample.frontmatter.md",
            "sample.patch.frontmatter.createTargetIfMissing.number.md",
            instruction
          );
        });
        test("boolean", () => {
          const instruction: FrontmatterPatchInstruction = {
            targetType: "frontmatter",
            target: "new-field",
            operation: "replace",
            contentType: ContentType.json,
            content: true,
            createTargetIfMissing: true,
          };
          assertPatchResultsMatch(
            "sample.frontmatter.md",
            "sample.patch.frontmatter.createTargetIfMissing.boolean.md",
            instruction
          );
        });
      });
    });
  });
});
