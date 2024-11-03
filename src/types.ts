export interface DocumentRange {
  start: number;
  end: number;
}

export interface DocumentMapMarkerContentPair {
  marker: DocumentRange;
  content: DocumentRange;
}

export interface HeadingMarkerContentPair extends DocumentMapMarkerContentPair {
  level: number;
}

export interface DocumentMap {
  heading: Record<string, HeadingMarkerContentPair>;
  block: Record<string, DocumentMapMarkerContentPair>;
  frontmatter: Record<string, any>;
  contentOffset: number;
  lineEnding: string;
}

export type PatchTargetType = "heading" | "block" | "frontmatter";

export type PatchOperation = "replace" | "prepend" | "append";

export interface BasePatchInstructionTarget {
  targetType: PatchTargetType;
  target: any;
  createTargetIfMissing?: boolean;
}

export interface BasePatchInstructionOperation {
  operation: string;
}

export interface BaseHeadingPatchInstruction
  extends BasePatchInstructionTarget {
  targetType: "heading";
  target: string[] | null;
}

export interface BaseFrontmatterPatchInstruction
  extends BasePatchInstructionTarget {
  targetType: "frontmatter";
  target: string;
}

export interface BaseBlockPatchInstruction extends BasePatchInstructionTarget {
  targetType: "block";
  target: string;
}

export interface NonExtendingPatchInstruction
  extends BasePatchInstructionOperation {}

export interface TextExtendingPatchInstruction
  extends BasePatchInstructionOperation {
  /** Trim whitepsace from target before joining with content
   *
   * - For `prepend`: Trims content from the beginning of
   *   the target content.
   * - For `append`: Trims content from the end of the target
   *   content.  Your content should probably end in a newline
   *   in this case, or the trailing heading will no longer
   *   be the start of its own line
   */
  trimTargetWhitespace?: boolean;
  /** Apply patch even if content already exists at target
   *
   * By default, we will fail to apply a patch if the supplied
   * content is found anywhere in your target content.  If you
   * would instead like the patch to occur, regardless of whether
   * it appears the content is already there, you can set
   * `applyIfContentPreexists` to `true`.
   */
  applyIfContentPreexists?: boolean;
}

export interface StringContent {
  contentType?: ContentType.text;
  content: string;
}

export interface JsonContent {
  contentType: ContentType.json;
  content: unknown;
}

/**
 * Prepend content to content existing under a heading
 *
 * @category Patch Instructions
 */
export interface PrependHeadingPatchInstruction
  extends TextExtendingPatchInstruction,
    BaseHeadingPatchInstruction,
    StringContent {
  operation: "prepend";
}

/**
 * Append content to content existing under a heading
 *
 * @category Patch Instructions
 */
export interface AppendHeadingPatchInstruction
  extends TextExtendingPatchInstruction,
    BaseHeadingPatchInstruction,
    StringContent {
  operation: "append";
}

/**
 * Replace content under a heading
 *
 * @category Patch Instructions
 */
export interface ReplaceHeadingPatchInstruction
  extends NonExtendingPatchInstruction,
    BaseHeadingPatchInstruction,
    StringContent {
  operation: "replace";
}

/**
 * Prepend content to a block referenced by a block reference
 *
 * @category Patch Instructions
 */
export interface PrependBlockPatchInstruction
  extends TextExtendingPatchInstruction,
    BaseBlockPatchInstruction,
    StringContent {
  operation: "prepend";
}

/**
 * Append content to a block referenced by a block reference
 *
 * @category Patch Instructions
 */
export interface AppendBlockPatchInstruction
  extends TextExtendingPatchInstruction,
    BaseBlockPatchInstruction,
    StringContent {
  operation: "append";
}

/**
 * Replace content of block referenced by a block reference.
 *
 * @category Patch Instructions
 */
export interface ReplaceBlockPatchInstruction
  extends NonExtendingPatchInstruction,
    BaseBlockPatchInstruction,
    StringContent {
  operation: "replace";
}

/**
 * Prepend rows to a table referenced by a block reference.
 *
 * @category Patch Instructions
 */
export interface PrependTableRowsBlockPatchInstruction
  extends TextExtendingPatchInstruction,
    BaseBlockPatchInstruction,
    JsonContent {
  operation: "prepend";
}

/**
 * Patch Instruction for appending rows to a table
 * referenced by a block reference.
 *
 * @category Patch Instructions
 */
export interface AppendTableRowsBlockPatchInstruction
  extends TextExtendingPatchInstruction,
    BaseBlockPatchInstruction,
    JsonContent {
  operation: "append";
}

/**
 * Patch Instruction for replacing all rows of a table
 * referenced by a block reference.
 *
 * @category Patch Instructions
 */
export interface ReplaceTableRowsBlockPatchInstruction
  extends NonExtendingPatchInstruction,
    BaseBlockPatchInstruction,
    JsonContent {
  operation: "replace";
}

/**
 * Prepend content to a frontmatter field
 *
 * @category Patch Instructions
 */
export interface PrependFrontmatterPatchInstruction
  extends NonExtendingPatchInstruction,
    BaseFrontmatterPatchInstruction,
    JsonContent {
  operation: "prepend";
}

/**
 * Append content to a frontmatter field
 *
 * @category Patch Instructions
 */
export interface AppendFrontmatterPatchInstruction
  extends NonExtendingPatchInstruction,
    BaseFrontmatterPatchInstruction,
    JsonContent {
  operation: "append";
}

/**
 * Replace content of frontmatter field
 *
 * @category Patch Instructions
 */
export interface ReplaceFrontmatterPatchInstruction
  extends NonExtendingPatchInstruction,
    BaseFrontmatterPatchInstruction,
    JsonContent {
  operation: "replace";
}

/**
 * Patch Instruction for Headings
 */
export type HeadingPatchInstruction =
  | PrependHeadingPatchInstruction
  | AppendHeadingPatchInstruction
  | ReplaceHeadingPatchInstruction;

/**
 * Patch Instruction for Block References
 */
export type BlockPatchInstruction =
  | PrependBlockPatchInstruction
  | AppendBlockPatchInstruction
  | ReplaceBlockPatchInstruction
  | PrependTableRowsBlockPatchInstruction
  | AppendTableRowsBlockPatchInstruction
  | ReplaceTableRowsBlockPatchInstruction;

export type FrontmatterPatchInstruction =
  | PrependFrontmatterPatchInstruction
  | AppendFrontmatterPatchInstruction
  | ReplaceFrontmatterPatchInstruction;

/**
 * Patch Instruction
 */
export type PatchInstruction =
  | HeadingPatchInstruction
  | BlockPatchInstruction
  | FrontmatterPatchInstruction;

export enum ContentType {
  /**
   * Content is simple markdown text.
   */
  text = "text/markdown",
  /**
   * Content is a JSON document
   */
  json = "application/json",
}

export interface PreprocessedDocument {
  frontmatter: Record<string, any>;
  contentOffset: number;
  content: string;
}

export type AppendableFrontmatterType =
  | string
  | Array<unknown>
  | Record<string, unknown>;
