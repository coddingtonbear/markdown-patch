import { getDocumentMap } from "./map.js";
import * as marked from "marked";
import * as yaml from "yaml";
import {
  AppendTableRowsBlockPatchInstruction,
  PrependTableRowsBlockPatchInstruction,
  DocumentMap,
  DocumentMapMarkerContentPair,
  TextExtendingPatchInstruction,
  PatchInstruction,
  ReplaceTableRowsBlockPatchInstruction,
  BaseHeadingPatchInstruction,
  BaseBlockPatchInstruction,
  AppendableFrontmatterType,
} from "./types.js";
import { ContentType } from "./types.js";
import {
  isAppendableFrontmatterType,
  isDictionary,
  isList,
  isString,
  isStringArray,
  isStringArrayArray,
} from "./typeGuards.js";

export enum PatchFailureReason {
  InvalidTarget = "invalid-target",
  ContentAlreadyPreexistsInTarget = "content-already-preexists-in-target",
  TableContentIncorrectColumnCount = "table-content-incorrect-column-count",
  ContentTypeInvalid = "content-type-invalid",
  ContentTypeInvalidForTarget = "content-type-invalid-for-target",
  ContentNotMergeable = "content-not-mergeable",
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

export class MergeNotPossible extends Error {}

const replaceText = (
  document: string,
  instruction: PatchInstruction,
  target: DocumentMapMarkerContentPair
): string => {
  const suffix = document.slice(target.content.end);
  // Some block tokens (e.g. tables) have their raw include the blank-line
  // separator, so content.end lands on that separator \n rather than just
  // after the content's own trailing \n.  The suffix then starts with only
  // one \n instead of the two that form the blank line.  Restore the missing
  // newline so the blank line is preserved when the replacement has no
  // trailing newline of its own.
  const lineEnding = suffix.startsWith("\r\n") ? "\r\n" : "\n";
  const hasSingleLeadingNewline =
    suffix.startsWith(lineEnding) && !suffix.startsWith(lineEnding + lineEnding);
  const content =
    hasSingleLeadingNewline &&
    typeof instruction.content === "string" &&
    !instruction.content.endsWith("\n") &&
    !instruction.content.endsWith("\r\n")
      ? instruction.content + lineEnding
      : instruction.content;
  return [
    document.slice(0, target.content.start),
    content,
    suffix,
  ].join("");
};

const prependText = (
  document: string,
  instruction: TextExtendingPatchInstruction & PatchInstruction,
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
  instruction: TextExtendingPatchInstruction & PatchInstruction,
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
    let content = instruction.content;
    if (isStringArray(content)) {
      // For when the request sends in just a single row
      content = [content];
    }
    if (isStringArrayArray(content)) {
      // For when the incoming request is multiple rows
      for (const row of content) {
        if (
          row.length !== table.token.header.length ||
          typeof row === "string"
        ) {
          throw new PatchFailed(
            PatchFailureReason.TableContentIncorrectColumnCount,
            instruction,
            target
          );
        }

        tableRows.push("| " + row.join(" | ") + " |" + table.lineEnding);
      }
    } else {
      throw new PatchFailed(
        PatchFailureReason.ContentTypeInvalid,
        instruction,
        target
      );
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
    let content = instruction.content;
    if (isStringArray(content)) {
      // For when the request sends in just a single row
      content = [content];
    }
    if (isStringArrayArray(content)) {
      // For when the request sends in just a single row
      for (const row of content) {
        if (
          row.length !== table.token.header.length ||
          typeof row === "string"
        ) {
          throw new PatchFailed(
            PatchFailureReason.TableContentIncorrectColumnCount,
            instruction,
            target
          );
        }

        tableRows.push("| " + row.join(" | ") + " |" + table.lineEnding);
      }
    } else {
      throw new PatchFailed(
        PatchFailureReason.ContentTypeInvalid,
        instruction,
        target
      );
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
    let content = instruction.content;
    if (isStringArray(content)) {
      // For when the request sends in just a single row
      content = [content];
    }
    if (isStringArrayArray(content)) {
      // For when the incoming request is multiple rows
      for (const row of content) {
        if (
          row.length !== table.token.header.length ||
          typeof row === "string"
        ) {
          throw new PatchFailed(
            PatchFailureReason.TableContentIncorrectColumnCount,
            instruction,
            target
          );
        }

        tableRows.push("| " + row.join(" | ") + " |" + table.lineEnding);
      }
    } else {
      throw new PatchFailed(
        PatchFailureReason.ContentTypeInvalid,
        instruction,
        target
      );
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
  instruction: TextExtendingPatchInstruction & PatchInstruction,
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
  instruction: TextExtendingPatchInstruction & PatchInstruction,
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
  instruction: TextExtendingPatchInstruction &
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
  if (
    document.slice(
      bestTarget.content.end - map.lineEnding.length,
      bestTarget.content.end
    ) !== map.lineEnding
  ) {
    finalContent += map.lineEnding;
  }
  for (const headingPart of (instruction.target ?? []).slice(existingLevels)) {
    existingLevels += 1;
    finalContent += `${"#".repeat(existingLevels)} ${headingPart}${map.lineEnding}`;
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
  instruction: TextExtendingPatchInstruction &
    PatchInstruction &
    BaseBlockPatchInstruction,
  map: DocumentMap
): string => {
  return (
    document +
    map.lineEnding +
    instruction.content +
    map.lineEnding +
    map.lineEnding +
    "^" +
    instruction.target
  );
};

const addTarget = (
  document: string,
  instruction: TextExtendingPatchInstruction &
    PatchInstruction &
    (BaseBlockPatchInstruction | BaseHeadingPatchInstruction),
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
    case "frontmatter":
      return map.frontmatter[instruction.target];
  }
};

function mergeFrontmatterValue(
  obj1: AppendableFrontmatterType,
  obj2: AppendableFrontmatterType
): AppendableFrontmatterType {
  if (isList(obj1) && isList(obj2)) {
    return [...obj1, ...obj2];
  } else if (isDictionary(obj1) && isDictionary(obj2)) {
    return { ...obj1, ...obj2 };
  } else if (isString(obj1) && isString(obj2)) {
    return obj1 + obj2;
  }

  throw new Error(
    `Cannot merge objects of different types or unsupported types: ${typeof obj1} and ${typeof obj2}`
  );
}

function regenerateDocumentWithFrontmatter(
  frontmatter: Record<string, unknown>,
  document: string,
  map: DocumentMap
): string {
  const rawFrontmatterText = Object.values(frontmatter).some(
    (value) => value !== undefined
  )
    ? `---\n${yaml.stringify(frontmatter).trimEnd()}\n---\n`
    : "";

  const frontmatterText =
    map.lineEnding !== "\n"
      ? rawFrontmatterText.replaceAll("\n", map.lineEnding)
      : rawFrontmatterText;
  const finalDocument = document.slice(map.contentOffset);

  return frontmatterText + finalDocument;
}

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

  if (
    instruction.targetType === "block" ||
    instruction.targetType === "heading"
  ) {
    if (!target) {
      if (
        instruction.createTargetIfMissing &&
        instruction.operation !== "replace"
      ) {
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
      default:
        throw new PatchError("Invalid operation");
    }
  }
  const frontmatter = { ...map.frontmatter };

  if (frontmatter[instruction.target] === undefined) {
    if (instruction.createTargetIfMissing) {
      if (isList(instruction.content)) {
        frontmatter[instruction.target] = [];
      } else if (isString(instruction.content)) {
        frontmatter[instruction.target] = "";
      } else if (isDictionary(instruction.content)) {
        frontmatter[instruction.target] = {};
      }
    } else {
      throw new PatchFailed(
        PatchFailureReason.InvalidTarget,
        instruction,
        null
      );
    }
  }

  try {
    switch (instruction.operation) {
      case "append":
        if (!isAppendableFrontmatterType(instruction.content)) {
          throw new MergeNotPossible();
        }
        frontmatter[instruction.target] = mergeFrontmatterValue(
          frontmatter[instruction.target],
          instruction.content
        );
        break;
      case "prepend":
        if (!isAppendableFrontmatterType(instruction.content)) {
          throw new MergeNotPossible();
        }
        frontmatter[instruction.target] = mergeFrontmatterValue(
          instruction.content,
          frontmatter[instruction.target]
        );
        break;
      case "replace":
        frontmatter[instruction.target] = instruction.content;
        break;
    }

    return regenerateDocumentWithFrontmatter(frontmatter, document, map);
  } catch (error) {
    if (error instanceof MergeNotPossible) {
      throw new PatchFailed(
        PatchFailureReason.ContentNotMergeable,
        instruction,
        null
      );
    }
    throw error;
  }
};
