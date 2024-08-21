import { getDocumentMap } from "./map";
import { PatchInstruction } from "./types";

class PatchFailed extends Error {
  public instruction: PatchInstruction;

  constructor(instruction: PatchInstruction) {
    super();
    this.instruction = instruction;
    this.name = "PatchFailed";

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export const joinStrings = (values: string[], seamless?: boolean): string => {
  if (!seamless) {
    return values.join("");
  } else {
    function removeOverlap(first: string, second: string): string {
      let overlapLength = 0;
      for (let i = 1; i <= Math.min(first.length, second.length); i++) {
        if (first.slice(-i) === second.slice(0, i)) {
          overlapLength = i;
        }
      }
      return first + second.slice(overlapLength);
    }

    return values.reduce((acc, current) => removeOverlap(acc, current));
  }
};

export const applyPatch = (
  document: string,
  instruction: PatchInstruction
): string => {
  const map = getDocumentMap(document);

  switch (instruction.targetType) {
    case "heading":
      const targetMap = map.heading[instruction.target];
      if (!targetMap) {
        throw new PatchFailed(instruction);
      }
      switch (instruction.operation) {
        case "append":
          return joinStrings(
            [
              document.slice(0, targetMap.content.end),
              instruction.content,
              document.slice(targetMap.content.end),
            ],
            instruction.seamless
          );
        case "prepend":
          return joinStrings(
            [
              document.slice(0, targetMap.content.start),
              instruction.content,
              document.slice(targetMap.content.start),
            ],
            instruction.seamless
          );
        case "replace":
          return joinStrings(
            [
              document.slice(0, targetMap.content.start),
              instruction.content,
              document.slice(targetMap.content.end),
            ],
            instruction.seamless
          );
      }
  }
};
