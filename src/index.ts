/**
 * @module Reference
 */

export {
  PatchFailureReason,
  PatchFailed,
  PatchError,
  TablePartsNotFound,
  applyPatch,
} from "./patch.js";
export {
  getDocumentMap,
  FrontmatterParseError,
} from "./map.js";

export * from "./types.js";

// --- 2.0 engine ----------------------------------------------------------

export { patch } from "./engine.js";
export { buildModel } from "./model.js";
export { projectMap, headingTreePaths } from "./projection.js";
export type { PublicMap, HeadingTree } from "./projection.js";
export { readTarget } from "./read.js";
export type { ReadTarget, ReadResult } from "./read.js";
export {
  EngineError,
  InvalidCellError,
  InvalidInstructionError,
  TargetNotFoundError,
  PreconditionFailedError,
  ContentPreexistsError,
  MergeError,
  isValidCell,
  assertValidCell,
  isBlockTableRowInstruction,
} from "./instructions.js";
export {
  InstructionInputSchema,
  InstructionInputObjectSchema,
} from "./schema.js";
export { NotATableError, TableColumnCountError } from "./engine/table.js";
export type {
  Instruction,
  InstructionInput,
  HeadingInstruction,
  HeadingWriteInstruction,
  HeadingMoveInstruction,
  HeadingDeleteInstruction,
  BlockInstruction,
  BlockWriteInstruction,
  BlockMarkerReplaceInstruction,
  BlockDeleteInstruction,
  BlockTableRowInstruction,
  FrontmatterInstruction,
  FrontmatterValueInstruction,
  FrontmatterRenameInstruction,
  FrontmatterDeleteInstruction,
  Operation,
  Scope,
  TargetType,
  HeadingAddress,
  ParentSpec,
  Place,
  PatchResult,
  Warning,
  WarningCode,
  Cell,
} from "./instructions.js";
