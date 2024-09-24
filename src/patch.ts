import { getDocumentMap } from "./map.js";
import * as marked from "marked";
import {
  AppendTableRowsBlockPatchInstruction,
  PrependTableRowsBlockPatchInstruction,
  DocumentMap,
  DocumentMapMarkerContentPair,
  ExtendingPatchInstruction,
  PatchInstruction,
  ReplaceTableRowsBlockPatchInstruction,
  BaseHeadingPatchInstruction,
  BaseBlockPatchInstruction,
} from "./types.js";
import { ContentType } from "./types.js";

export enum PatchFailureReason {
  InvalidTarget = "invalid-target",
  ContentAlreadyPreexistsInTarget = "content-already-preexists-in-target",
  TableContentIncorrectColumnCount = "table-content-incorrect-column-count",
  ContentTypeInvalidForTarget = "content-type-invalid-for-target",
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

export class TablePartsNotFound extends Error {}

const _getTableData = (
  document: string,
  target: DocumentMapMarkerContentPair
): {
  token: marked.Tokens.Table;
  lineEnding: string;
  headerParts: string;
  contentParts: string;
} => {
  const targetTable = document.slice(target.content.start, target.content.end);
  const tableToken = marked.lexer(targetTable)[0];
  const match = /^(.*?)(?:\r?\n)(.*?)(\r?\n)/.exec(targetTable);
  if (!(tableToken.type === "table") || !match) {
    throw new TablePartsNotFound();
  }

  const lineEnding = match[3];
  return {
    token: tableToken as marked.Tokens.Table,
    lineEnding: match[3],
    headerParts: match[1] + lineEnding + match[2] + lineEnding,
    contentParts: targetTable.slice(match[0].length),
  };
};

const replaceTable = (
  document: string,
  instruction: ReplaceTableRowsBlockPatchInstruction,
  target: DocumentMapMarkerContentPair
): string => {
  try {
    const table = _getTableData(document, target);
    const tableRows: string[] = [table.headerParts];
    for (const row of instruction.content) {
      if (row.length !== table.token.header.length || typeof row === "string") {
        throw new PatchFailed(
          PatchFailureReason.TableContentIncorrectColumnCount,
          instruction,
          target
        );
      }

      tableRows.push("| " + row.join(" | ") + " |" + table.lineEnding);
    }

    return [
      document.slice(0, target.content.start),
      tableRows.join(""),
      document.slice(target.content.end),
    ].join("");
  } catch (TablePartsNotFound) {
    throw new PatchFailed(
      PatchFailureReason.ContentTypeInvalidForTarget,
      instruction,
      target
    );
  }
};

const prependTable = (
  document: string,
  instruction: PrependTableRowsBlockPatchInstruction,
  target: DocumentMapMarkerContentPair
): string => {
  try {
    const table = _getTableData(document, target);
    const tableRows: string[] = [table.headerParts];
    for (const row of instruction.content) {
      if (row.length !== table.token.header.length || typeof row === "string") {
        throw new PatchFailed(
          PatchFailureReason.TableContentIncorrectColumnCount,
          instruction,
          target
        );
      }

      tableRows.push("| " + row.join(" | ") + " |" + table.lineEnding);
    }

    tableRows.push(table.contentParts);

    return [
      document.slice(0, target.content.start),
      tableRows.join(""),
      document.slice(target.content.end),
    ].join("");
  } catch (TablePartsNotFound) {
    throw new PatchFailed(
      PatchFailureReason.ContentTypeInvalidForTarget,
      instruction,
      target
    );
  }
};

const appendTable = (
  document: string,
  instruction: AppendTableRowsBlockPatchInstruction,
  target: DocumentMapMarkerContentPair
): string => {
  try {
    const table = _getTableData(document, target);
    const tableRows: string[] = [table.headerParts, table.contentParts];
    for (const row of instruction.content) {
      if (row.length !== table.token.header.length || typeof row === "string") {
        throw new PatchFailed(
          PatchFailureReason.TableContentIncorrectColumnCount,
          instruction,
          target
        );
      }

      tableRows.push("| " + row.join(" | ") + " |" + table.lineEnding);
    }

    return [
      document.slice(0, target.content.start),
      tableRows.join(""),
      document.slice(target.content.end),
    ].join("");
  } catch (TablePartsNotFound) {
    throw new PatchFailed(
      PatchFailureReason.ContentTypeInvalidForTarget,
      instruction,
      target
    );
  }
};

const replace = (
  document: string,
  instruction: PatchInstruction,
  target: DocumentMapMarkerContentPair
): string => {
  const contentType =
    "contentType" in instruction && instruction.contentType
      ? instruction.contentType
      : ContentType.text;

  switch (contentType) {
    case ContentType.text:
      return replaceText(document, instruction, target);
    case ContentType.json:
      return replaceTable(
        document,
        instruction as ReplaceTableRowsBlockPatchInstruction,
        target
      );
  }
};

const prepend = (
  document: string,
  instruction: ExtendingPatchInstruction & PatchInstruction,
  target: DocumentMapMarkerContentPair
): string => {
  const contentType =
    "contentType" in instruction && instruction.contentType
      ? instruction.contentType
      : ContentType.text;

  switch (contentType) {
    case ContentType.text:
      return prependText(document, instruction, target);
    case ContentType.json:
      return prependTable(
        document,
        instruction as PrependTableRowsBlockPatchInstruction,
        target
      );
  }
};

const append = (
  document: string,
  instruction: ExtendingPatchInstruction & PatchInstruction,
  target: DocumentMapMarkerContentPair
): string => {
  const contentType =
    "contentType" in instruction && instruction.contentType
      ? instruction.contentType
      : ContentType.text;

  switch (contentType) {
    case ContentType.text:
      return appendText(document, instruction, target);
    case ContentType.json:
      return appendTable(
        document,
        instruction as AppendTableRowsBlockPatchInstruction,
        target
      );
  }
};

const addTargetHeading = (
  document: string,
  instruction: ExtendingPatchInstruction &
    PatchInstruction &
    BaseHeadingPatchInstruction,
  map: DocumentMap
): string => {
  const elements: string[] = [];
  let bestTarget = map.heading[""];
  for (const element of instruction.target ?? []) {
    const possibleMatch = map.heading[[...elements, element].join("\u001f")];
    if (possibleMatch) {
      elements.push(element);
      bestTarget = possibleMatch;
    } else {
      break;
    }
  }
  let finalContent = "";
  let existingLevels = elements.length;
  const lineEnding = document.indexOf("\r\n") !== -1 ? "\r\n" : "\n";
  if (
    document.slice(
      bestTarget.content.end - lineEnding.length,
      bestTarget.content.end
    ) !== lineEnding
  ) {
    finalContent += lineEnding;
  }
  for (const headingPart of (instruction.target ?? []).slice(existingLevels)) {
    existingLevels += 1;
    finalContent += `${"#".repeat(existingLevels)} ${headingPart}${lineEnding}`;
  }
  finalContent += instruction.content;

  return [
    document.slice(0, bestTarget.content.end),
    finalContent,
    document.slice(bestTarget.content.end),
  ].join("");
};

const addTargetBlock = (
  document: string,
  instruction: ExtendingPatchInstruction &
    PatchInstruction &
    BaseBlockPatchInstruction,
  map: DocumentMap
): string => {
  return (
    document + "\n" + instruction.content + "\n\n" + "^" + instruction.target
  );
};

const addTarget = (
  document: string,
  instruction: ExtendingPatchInstruction & PatchInstruction,
  map: DocumentMap
): string => {
  switch (instruction.targetType) {
    case "heading":
      return addTargetHeading(document, instruction, map);
    case "block":
      return addTargetBlock(document, instruction, map);
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

/**
 * Applies a patch to the specified document.
 *
 * @param document The document to apply the patch to.
 * @param instruction The patch to apply.
 * @returns The patched document
 */
export const applyPatch = (
  document: string,
  instruction: PatchInstruction
): string => {
  const map = getDocumentMap(document);
  const target = getTarget(map, instruction);

  if (!target) {
    if (instruction.createTargetIfMissing) {
      return addTarget(document, instruction, map);
    } else {
      throw new PatchFailed(
        PatchFailureReason.InvalidTarget,
        instruction,
        null
      );
    }
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
