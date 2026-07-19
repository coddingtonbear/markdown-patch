/**
 * Instruction shapes for the 2.0 patch engine.
 *
 * The engine is one algebra: an {@link Operation} applied to a {@link Scope} of
 * a target node.  The scope names the *value* being edited (`content` = the
 * body, `marker` = the label, `markerAndContent` = the whole node/subtree,
 * `parent` = the node's place in the tree); the operation says what happens to
 * that value.  Every scope value is a plain string except `parent`, whose value
 * is a structured {@link ParentSpec}.
 *
 * These are plain TypeScript discriminated unions.  A published Zod schema
 * (from which obsidian-local-rest-api will derive its MCP and OpenAPI docs) is
 * a deliberate follow-on; nothing here uses `any`.
 */

export type Operation = "replace" | "prepend" | "append" | "delete";
export type Scope = "content" | "marker" | "markerAndContent" | "parent";
export type TargetType = "heading" | "block" | "frontmatter";

/**
 * A heading address: a null-padded or collapsed array of heading texts, or
 * `null`/`[]` for the document root.  A collapsed array (no `null`s) matches by
 * nesting like a 1.x path; `null` explicitly marks a skipped level and `""` a
 * genuinely empty-text heading.  Array length is the heading's level.
 */
export type HeadingAddress = (string | null)[] | null;

/** Where a moved section lands relative to its new parent's children. */
export type Place =
  | "first"
  | "last"
  | { before: HeadingAddress }
  | { after: HeadingAddress };

/** The `destination` of a `replace @ parent` (move) instruction. */
export interface ParentSpec {
  /** The section's new parent, or `null`/`[]` to move to the document root. */
  parent: HeadingAddress;
  /** The position among the new parent's children. */
  place: Place;
}

interface BaseInstruction {
  /**
   * Optimistic-concurrency precondition: the `version` token from the map the
   * caller planned against.  When present and it does not equal the current
   * document's version, the patch fails without modifying the document.
   */
  ifMatch?: string;
  /** Create the target (and any missing ancestors) when it does not exist. */
  createTargetIfMissing?: boolean;
  /** Fail instead of applying when the value already appears in the target. */
  rejectIfContentPreexists?: boolean;
}

interface HeadingTargeted extends BaseInstruction {
  targetType: "heading";
  target: HeadingAddress;
}
interface BlockTargeted extends BaseInstruction {
  targetType: "block";
  /** The bare block id, without the leading `^`. */
  target: string;
}
interface FrontmatterTargeted extends BaseInstruction {
  targetType: "frontmatter";
  /** The top-level frontmatter key. */
  target: string;
}

// --- Heading instructions ------------------------------------------------

/**
 * `replace`/`prepend`/`append` on a heading's body, label, or whole subtree.
 * String values carry heading levels *relative* to the edited span's container
 * (see `levels.ts`), so no `#` counting is required.
 */
export interface HeadingWriteInstruction extends HeadingTargeted {
  operation: "replace" | "prepend" | "append";
  scope: "content" | "marker" | "markerAndContent";
  content: string;
}
/** `replace @ parent`: move (and re-level) the section beneath a new parent. */
export interface HeadingMoveInstruction extends HeadingTargeted {
  operation: "replace";
  scope: "parent";
  /** The section's new placement in the tree. Carried in its own field so it is
   * never confused with the string `content`/JSON `value` write carriers. */
  destination: ParentSpec;
}
/**
 * `delete` a heading's body (`content`), its subtree (`markerAndContent`), or
 * the heading line only (`marker`) — the last dissolving the section into what
 * textually precedes it.
 */
export interface HeadingDeleteInstruction extends HeadingTargeted {
  operation: "delete";
  scope: "content" | "marker" | "markerAndContent";
}
export type HeadingInstruction =
  | HeadingWriteInstruction
  | HeadingMoveInstruction
  | HeadingDeleteInstruction;

// --- Block instructions --------------------------------------------------

/** `replace`/`prepend`/`append` on a block's text or the whole block. */
export interface BlockWriteInstruction extends BlockTargeted {
  operation: "replace" | "prepend" | "append";
  scope: "content" | "markerAndContent";
  content: string;
}
/** `replace @ marker`: change the block's `^id`. */
export interface BlockMarkerReplaceInstruction extends BlockTargeted {
  operation: "replace";
  scope: "marker";
  /** The new block id, without the leading `^`. */
  content: string;
}
/**
 * `delete` a block's text (`content`), the whole block (`markerAndContent`), or
 * just the `^id` (`marker`, detaching the id while keeping the content).
 */
export interface BlockDeleteInstruction extends BlockTargeted {
  operation: "delete";
  scope: "content" | "marker" | "markerAndContent";
}
export type BlockInstruction =
  | BlockWriteInstruction
  | BlockMarkerReplaceInstruction
  | BlockDeleteInstruction;

// --- Frontmatter instructions --------------------------------------------

/**
 * `replace`/`prepend`/`append` a frontmatter value (`content`) or whole entry
 * (`markerAndContent`).  `prepend`/`append` merge (list concat, dict merge,
 * string concat).  Values are JSON, never relative markdown.
 */
export interface FrontmatterValueInstruction extends FrontmatterTargeted {
  operation: "replace" | "prepend" | "append";
  scope: "content" | "markerAndContent";
  content: unknown;
}
/** `replace @ marker`: rename the frontmatter key. */
export interface FrontmatterRenameInstruction extends FrontmatterTargeted {
  operation: "replace";
  scope: "marker";
  /** The new key name. */
  content: string;
}
/** `delete` a frontmatter value (`content`) or the whole entry (`markerAndContent`). */
export interface FrontmatterDeleteInstruction extends FrontmatterTargeted {
  operation: "delete";
  scope: "content" | "markerAndContent";
}
export type FrontmatterInstruction =
  | FrontmatterValueInstruction
  | FrontmatterRenameInstruction
  | FrontmatterDeleteInstruction;

export type Instruction =
  | HeadingInstruction
  | BlockInstruction
  | FrontmatterInstruction;

// --- Result and warnings -------------------------------------------------

export type WarningCode = "heading-depth-overflow";

export interface Warning {
  code: WarningCode;
  message: string;
}

export interface PatchResult {
  document: string;
  warnings: Warning[];
}

// --- Cell validity -------------------------------------------------------

/**
 * The valid cells of the algebra: for each target type and scope, the
 * operations that mean something.  Cells absent here (e.g. `prepend @ parent`,
 * any `parent` cell on a block or frontmatter target) are dead and rejected.
 */
const VALID_CELLS: Record<TargetType, Record<Scope, readonly Operation[]>> = {
  heading: {
    content: ["replace", "prepend", "append", "delete"],
    marker: ["replace", "prepend", "append", "delete"],
    markerAndContent: ["replace", "prepend", "append", "delete"],
    parent: ["replace"],
  },
  block: {
    content: ["replace", "prepend", "append", "delete"],
    marker: ["replace", "delete"],
    markerAndContent: ["replace", "prepend", "append", "delete"],
    parent: [],
  },
  frontmatter: {
    content: ["replace", "prepend", "append", "delete"],
    marker: ["replace"],
    markerAndContent: ["replace", "prepend", "append", "delete"],
    parent: [],
  },
};

/** True when `operation` is meaningful for `scope` on a `targetType` target. */
export const isValidCell = (
  targetType: TargetType,
  operation: Operation,
  scope: Scope
): boolean => VALID_CELLS[targetType][scope].includes(operation);

/** The tuple {@link assertValidCell} inspects — a structural subset of an Instruction. */
export interface Cell {
  targetType: TargetType;
  operation: Operation;
  scope: Scope;
}

// --- Errors --------------------------------------------------------------

/** Base class for every failure the 2.0 engine raises. */
export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** The requested operation×scope combination is not part of the algebra. */
export class InvalidCellError extends EngineError {
  constructor(public cell: Cell) {
    super(
      `Invalid instruction: ${cell.operation} @ ${cell.scope} is not a valid operation for a ${cell.targetType} target`
    );
  }
}

/** The instruction's target could not be resolved in the document. */
export class TargetNotFoundError extends EngineError {}

/** The `ifMatch` precondition did not match the current document version. */
export class PreconditionFailedError extends EngineError {}

/** `rejectIfContentPreexists` was set and the value already exists at the target. */
export class ContentPreexistsError extends EngineError {}

/** A frontmatter merge or type mismatch made the operation impossible. */
export class MergeError extends EngineError {}

/** Throw {@link InvalidCellError} unless the cell is part of the algebra. */
export const assertValidCell = (cell: Cell): void => {
  if (!isValidCell(cell.targetType, cell.operation, cell.scope)) {
    throw new InvalidCellError(cell);
  }
};
