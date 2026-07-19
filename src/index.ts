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
export {
  EngineError,
  InvalidCellError,
  TargetNotFoundError,
  PreconditionFailedError,
  ContentPreexistsError,
  MergeError,
  isValidCell,
  assertValidCell,
} from "./instructions.js";
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
