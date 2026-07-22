/**
 * Table-row writes: `replace`/`prepend`/`append` @ `content` on a `block`
 * target carrying structured `value` rather than literal `content` text (see
 * {@link isBlockTableRowInstruction}). Unlike a literal-text block write, which
 * splices `block.content` verbatim, a row write parses the table's header and
 * separator lines out of that span and edits only the body rows beneath them.
 */

import { DocumentModel, BlockNode } from "../model.js";
import {
  BlockTableRowInstruction,
  PatchResult,
  EngineError,
} from "../instructions.js";
import { splice } from "../text.js";

/** The instruction's `value` targets a block whose `kind` isn't `"table"`. */
export class NotATableError extends EngineError {}

/** A row's cell count doesn't match the table's column count. */
export class TableColumnCountError extends EngineError {}

interface ParsedTable {
  header: string;
  separator: string;
  rows: string[];
  /** Whether `block.content` included its own trailing line ending: true when
   *  the `^id` sits inline in the same token (content runs up to the marker),
   *  false when it's isolated on its own line (content is EOL-stripped). */
  trailingEol: boolean;
}

const EOL_AT_END = /\r\n$|\r$|\n$/;

const parseTable = (text: string): ParsedTable => {
  const trailingEol = EOL_AT_END.test(text);
  const lines = (trailingEol ? text.replace(EOL_AT_END, "") : text).split(/\r\n|\r|\n/);
  return { header: lines[0] ?? "", separator: lines[1] ?? "", rows: lines.slice(2), trailingEol };
};

const formatRow = (row: string[]): string => "| " + row.join(" | ") + " |";

export const patchTableRows = (
  document: string,
  model: DocumentModel,
  instruction: BlockTableRowInstruction,
  block: BlockNode
): PatchResult => {
  if (block.kind !== "table" || !block.columns) {
    throw new NotATableError(
      `block "${block.id}" is not a table; row writes require a table block`
    );
  }

  const columnCount = block.columns.length;
  for (const row of instruction.value) {
    if (row.length !== columnCount) {
      throw new TableColumnCountError(
        `row ${JSON.stringify(row)} has ${row.length} cell(s); table "${block.id}" has ${columnCount} column(s)`
      );
    }
  }

  const { header, separator, rows: existingRows, trailingEol } = parseTable(
    document.slice(block.content.start, block.content.end)
  );
  const newRows = instruction.value.map(formatRow);

  const bodyRows =
    instruction.operation === "replace"
      ? newRows
      : instruction.operation === "prepend"
        ? [...newRows, ...existingRows]
        : [...existingRows, ...newRows];

  const text =
    [header, separator, ...bodyRows].join(model.lineEnding) +
    (trailingEol ? model.lineEnding : "");
  return splice(document, [{ range: block.content, text }], []);
};
