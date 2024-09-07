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
}

export type PatchTargetType = "heading" | "block";

export type PatchOperation = "replace" | "prepend" | "append";

export interface BasePatchInstructionTarget {
  targetType: PatchTargetType;
  target: any;
}

export interface BasePatchInstructionOperation {
  operation: string;
}

export interface BaseHeadingPatchInstruction
  extends BasePatchInstructionTarget {
  targetType: "heading";
  target: string[] | null;
}

export interface BaseBlockPatchInstruction extends BasePatchInstructionTarget {
  targetType: "block";
  target: string;
}

export interface NonExtendingPatchInstruction
  extends BasePatchInstructionOperation {}

export interface ExtendingPatchInstruction
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
  content: string;
}

export interface TableRowsContent {
  targetBlockTypeBehavior?: "table";
  content: string[][];
}

export interface PrependHeadingPatchInstruction
  extends ExtendingPatchInstruction,
    BaseHeadingPatchInstruction,
    StringContent {
  operation: "prepend";
}

export interface AppendHeadingPatchInstruction
  extends ExtendingPatchInstruction,
    BaseHeadingPatchInstruction,
    StringContent {
  operation: "append";
}

export interface ReplaceHeadingPatchInstruction
  extends NonExtendingPatchInstruction,
    BaseHeadingPatchInstruction,
    StringContent {
  operation: "replace";
}

export interface PrependBlockPatchInstruction
  extends ExtendingPatchInstruction,
    BaseBlockPatchInstruction,
    StringContent {
  operation: "prepend";
}

export interface AppendBlockPatchInstruction
  extends ExtendingPatchInstruction,
    BaseBlockPatchInstruction,
    StringContent {
  operation: "append";
}

export interface ReplaceBlockPatchInstruction
  extends NonExtendingPatchInstruction,
    BaseBlockPatchInstruction,
    StringContent {
  operation: "replace";
}

export interface PrependTableRowsBlockPatchInstruction
  extends ExtendingPatchInstruction,
    BaseBlockPatchInstruction,
    TableRowsContent {
  operation: "prepend";
}

export interface AppendTableRowsBlockPatchInstruction
  extends ExtendingPatchInstruction,
    BaseBlockPatchInstruction,
    TableRowsContent {
  operation: "append";
}

export interface ReplaceTableRowsBlockPatchInstruction
  extends NonExtendingPatchInstruction,
    BaseBlockPatchInstruction,
    TableRowsContent {
  operation: "replace";
}

export type HeadingPatchInstruction =
  | PrependHeadingPatchInstruction
  | AppendHeadingPatchInstruction
  | ReplaceHeadingPatchInstruction;

export type BlockPatchInstruction =
  | PrependBlockPatchInstruction
  | AppendBlockPatchInstruction
  | ReplaceBlockPatchInstruction
  | PrependTableRowsBlockPatchInstruction
  | AppendTableRowsBlockPatchInstruction
  | ReplaceTableRowsBlockPatchInstruction;

export type PatchInstruction = HeadingPatchInstruction | BlockPatchInstruction;
