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
      const targetMap = map.heading[instruction.target.join("\u001f")];
      if (!targetMap) {
        throw new PatchFailed(instruction);
      }
      switch (instruction.operation) {
        case "append":
          return [
            instruction.trimTargetWhitespace
              ? document.slice(0, targetMap.content.end).trimEnd()
              : document.slice(0, targetMap.content.end),
            instruction.content,
            document.slice(targetMap.content.end),
          ].join("");
        case "prepend":
          return [
            document.slice(0, targetMap.content.start),
            instruction.content,
            instruction.trimTargetWhitespace
              ? document.slice(targetMap.content.start).trimStart()
              : document.slice(targetMap.content.start),
          ].join("");
        case "replace":
          return [
            document.slice(0, targetMap.content.start),
            instruction.content,
            document.slice(targetMap.content.end),
          ].join("");
      }
  }
};
