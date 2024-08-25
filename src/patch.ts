import { getDocumentMap } from "./map";
import { HeadingMarkerContentPair, PatchInstruction } from "./types";

enum PatchFailureReason {
  InvalidTarget = "invalid-target",
  ContentAlreadyPreexistsInTarget = "content-already-preexists-in-target",
}

export class PatchFailed extends Error {
  public reason: PatchFailureReason;
  public instruction: PatchInstruction;
  public targetMap: HeadingMarkerContentPair | null;

  constructor(
    reason: PatchFailureReason,
    instruction: PatchInstruction,
    targetMap: HeadingMarkerContentPair | null
  ) {
    super();
    this.reason = reason;
    this.instruction = instruction;
    this.targetMap = targetMap;
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
      const targetMap =
        map.heading[
          instruction.target ? instruction.target.join("\u001f") : ""
        ];
      if (!targetMap) {
        throw new PatchFailed(
          PatchFailureReason.InvalidTarget,
          instruction,
          null
        );
      }

      if (
        (!("applyIfContentPreexists" in instruction) ||
          !instruction.applyIfContentPreexists) &&
        document
          .slice(targetMap.content.start, targetMap.content.end)
          .includes(instruction.content.trim())
      ) {
        throw new PatchFailed(
          PatchFailureReason.ContentAlreadyPreexistsInTarget,
          instruction,
          targetMap
        );
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
