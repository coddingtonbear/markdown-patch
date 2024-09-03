import { getDocumentMap } from "./map.ts";
import * as marked from "marked";
import {
  DocumentMap,
  DocumentMapMarkerContentPair,
  ExtendingPatchInstruction,
  PatchInstruction,
} from "./types.ts";

enum PatchFailureReason {
  InvalidTarget = "invalid-target",
  ContentAlreadyPreexistsInTarget = "content-already-preexists-in-target",
  TableContentIncorrectColumnCount = "table-content-incorrect-column-count",
  RequestedBlockTypeBehaviorUnavailable = "requested-block-type-behavior-unavailable",
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

const replaceText = (
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

const prependText = (
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

const appendText = (
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

const replaceTable = (
  document: string,
  instruction: PatchInstruction,
  target: DocumentMapMarkerContentPair
): string => {
  const targetTable = document.slice(target.content.start, target.content.end);
  const tableToken = marked.lexer(targetTable)[0];
  const match = /^(.*?)(?:\r?\n)(.*?)(\r?\n)/.exec(targetTable);
  if (!(tableToken.type === "table") || !match) {
    throw new PatchFailed(
      PatchFailureReason.RequestedBlockTypeBehaviorUnavailable,
      instruction,
      target
    );
  }

  const lineEnding = match[3];
  const tableRows: string[] = [match[1] + lineEnding, match[2] + lineEnding];

  for (const row of instruction.content) {
    if (row.length !== tableToken.header.length || typeof row === "string") {
      throw new PatchFailed(
        PatchFailureReason.TableContentIncorrectColumnCount,
        instruction,
        target
      );
    }

    tableRows.push("| " + row.join(" | ") + " |" + lineEnding);
  }

  return [
    document.slice(0, target.content.start),
    tableRows.join(""),
    document.slice(target.content.end),
  ].join("");
};

const prependTable = (
  document: string,
  instruction: PatchInstruction,
  target: DocumentMapMarkerContentPair
): string => {
  const targetTable = document.slice(target.content.start, target.content.end);
  const tableToken = marked.lexer(targetTable)[0];
  const match = /^(.*?)(?:\r?\n)(.*?)(\r?\n)/.exec(targetTable);
  if (!(tableToken.type === "table") || !match) {
    throw new PatchFailed(
      PatchFailureReason.RequestedBlockTypeBehaviorUnavailable,
      instruction,
      target
    );
  }

  const lineEnding = match[3];
  const tableRows: string[] = [match[1] + lineEnding, match[2] + lineEnding];

  for (const row of instruction.content) {
    if (row.length !== tableToken.header.length || typeof row === "string") {
      throw new PatchFailed(
        PatchFailureReason.TableContentIncorrectColumnCount,
        instruction,
        target
      );
    }

    tableRows.push("| " + row.join(" | ") + " |" + lineEnding);
  }

  tableRows.push(targetTable.slice(match[0].length));

  return [
    document.slice(0, target.content.start),
    tableRows.join(""),
    document.slice(target.content.end),
  ].join("");
};

const appendTable = (
  document: string,
  instruction: PatchInstruction,
  target: DocumentMapMarkerContentPair
): string => {
  const targetTable = document.slice(target.content.start, target.content.end);
  const tableToken = marked.lexer(targetTable)[0];
  const match = /^(.*?)(?:\r?\n)(.*?)(\r?\n)/.exec(targetTable);
  if (!(tableToken.type === "table") || !match) {
    throw new PatchFailed(
      PatchFailureReason.RequestedBlockTypeBehaviorUnavailable,
      instruction,
      target
    );
  }

  const lineEnding = match[3];
  const tableRows: string[] = [
    match[1] + lineEnding,
    match[2] + lineEnding,
    targetTable.slice(match[0].length),
  ];

  for (const row of instruction.content) {
    if (row.length !== tableToken.header.length || typeof row === "string") {
      throw new PatchFailed(
        PatchFailureReason.TableContentIncorrectColumnCount,
        instruction,
        target
      );
    }

    tableRows.push("| " + row.join(" | ") + " |" + lineEnding);
  }

  return [
    document.slice(0, target.content.start),
    tableRows.join(""),
    document.slice(target.content.end),
  ].join("");
};

const replace = (
  document: string,
  instruction: PatchInstruction,
  target: DocumentMapMarkerContentPair
): string => {
  const targetBlockTypeBehavior =
    "targetBlockTypeBehavior" in instruction
      ? instruction.targetBlockTypeBehavior
      : "text";

  switch (targetBlockTypeBehavior) {
    case "text":
      return replaceText(document, instruction, target);
    case "table":
      return replaceTable(document, instruction, target);
  }
};

const prepend = (
  document: string,
  instruction: ExtendingPatchInstruction & PatchInstruction,
  target: DocumentMapMarkerContentPair
): string => {
  const targetBlockTypeBehavior =
    "targetBlockTypeBehavior" in instruction
      ? instruction.targetBlockTypeBehavior
      : "text";

  switch (targetBlockTypeBehavior) {
    case "text":
      return prependText(document, instruction, target);
    case "table":
      return prependTable(document, instruction, target);
  }
};

const append = (
  document: string,
  instruction: ExtendingPatchInstruction & PatchInstruction,
  target: DocumentMapMarkerContentPair
): string => {
  const targetBlockTypeBehavior =
    "targetBlockTypeBehavior" in instruction
      ? instruction.targetBlockTypeBehavior
      : "text";

  switch (targetBlockTypeBehavior) {
    case "text":
      return appendText(document, instruction, target);
    case "table":
      return appendTable(document, instruction, target);
  }
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
    typeof instruction.content === "string" &&
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
