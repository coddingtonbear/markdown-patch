import { getDocumentMap } from "./map.ts";
import {
  DocumentMap,
  DocumentMapMarkerContentPair,
  ExtendingPatchInstruction,
  PatchInstruction,
} from "./types.ts";

enum PatchFailureReason {
  InvalidTarget = "invalid-target",
  ContentAlreadyPreexistsInTarget = "content-already-preexists-in-target",
}

export class PatchFailed extends Error {
  public reason: PatchFailureReason;
  public instruction: PatchInstruction;
  public targetMap: DocumentMapMarkerContentPair | null;

  constructor(
    reason: PatchFailureReason,
    instruction: PatchInstruction,
    targetMap: DocumentMapMarkerContentPair | null
  ) {
    super();
    this.reason = reason;
    this.instruction = instruction;
    this.targetMap = targetMap;
    this.name = "PatchFailed";

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class PatchError extends Error {}

const replace = (
  document: string,
  instruction: PatchInstruction,
  target: DocumentMapMarkerContentPair
): string => {
  return [
    document.slice(0, target.content.start),
    instruction.content,
    document.slice(target.content.end),
  ].join("");
};

const prepend = (
  document: string,
  instruction: ExtendingPatchInstruction & PatchInstruction,
  target: DocumentMapMarkerContentPair
): string => {
  return [
    document.slice(0, target.content.start),
    instruction.content,
    instruction.trimTargetWhitespace
      ? document.slice(target.content.start).trimStart()
      : document.slice(target.content.start),
  ].join("");
};

const append = (
  document: string,
  instruction: ExtendingPatchInstruction & PatchInstruction,
  target: DocumentMapMarkerContentPair
): string => {
  return [
    instruction.trimTargetWhitespace
      ? document.slice(0, target.content.end).trimEnd()
      : document.slice(0, target.content.end),
    instruction.content,
    document.slice(target.content.end),
  ].join("");
};

const getTarget = (
  map: DocumentMap,
  instruction: PatchInstruction
): DocumentMapMarkerContentPair | undefined => {
  switch (instruction.targetType) {
    case "heading":
      return map.heading[
        instruction.target ? instruction.target.join("\u001f") : ""
      ];
    case "block":
      return map.block[instruction.target];
  }
};

export const applyPatch = (
  document: string,
  instruction: PatchInstruction
): string => {
  const map = getDocumentMap(document);
  const target = getTarget(map, instruction);

  if (!target) {
    throw new PatchFailed(PatchFailureReason.InvalidTarget, instruction, null);
  }

  if (
    (!("applyIfContentPreexists" in instruction) ||
      !instruction.applyIfContentPreexists) &&
    document
      .slice(target.content.start, target.content.end)
      .includes(instruction.content.trim())
  ) {
    throw new PatchFailed(
      PatchFailureReason.ContentAlreadyPreexistsInTarget,
      instruction,
      target
    );
  }
  switch (instruction.operation) {
    case "append":
      return append(document, instruction, target);
    case "prepend":
      return prepend(document, instruction, target);
    case "replace":
      return replace(document, instruction, target);
  }
};
