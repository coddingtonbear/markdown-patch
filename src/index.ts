/**
 * @module Reference
 */

export type { DocumentRange } from "./types.js";

export { patch } from "./engine.js";
export { buildModel } from "./model.js";
export type {
  DocumentModel,
  SectionNode,
  BlockNode,
  FrontmatterEntry,
} from "./model.js";
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
  FrontmatterParseError,
  FrontmatterKeyCollisionError,
  ReservedDuplicateMarkerError,
  isValidCell,
  assertValidCell,
  isBlockTableRowInstruction,
} from "./instructions.js";
export {
  InstructionInputSchema,
  InstructionInputObjectSchema,
} from "./schema.js";
export {
  NotATableError,
  TableColumnCountError,
  InvalidCellContentError,
} from "./engine/table.js";
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
