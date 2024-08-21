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
          return (
            document.slice(0, targetMap.content.end) +
            instruction.content +
            document.slice(targetMap.content.end)
          );
        case "prepend":
          return (
            document.slice(0, targetMap.content.start) +
            instruction.content +
            document.slice(targetMap.content.start)
          );
        case "replace":
          return (
            document.slice(0, targetMap.content.start) +
            instruction.content +
            document.slice(targetMap.content.end)
          );
      }
  }
};
