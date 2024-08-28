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
}

export type PatchTargetType = "heading" | "block";

export type PatchOperation = "replace" | "prepend" | "append";

export interface BasePatchInstructionTarget {
  targetType: PatchTargetType;
  target: any;
  content: string;
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
  extends BasePatchInstructionOperation {
  operation: "replace";
}

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

export interface PrependHeadingPatchInstruction
  extends ExtendingPatchInstruction,
    BaseHeadingPatchInstruction {
  operation: "prepend";
}

export interface AppendHeadingPatchInstruction
  extends ExtendingPatchInstruction,
    BaseHeadingPatchInstruction {
  operation: "append";
}

export interface ReplaceHeadingPatchInstruction
  extends NonExtendingPatchInstruction,
    BaseHeadingPatchInstruction {
  operation: "replace";
}

export interface PrependBlockPatchInstruction
  extends ExtendingPatchInstruction,
    BaseBlockPatchInstruction {
  operation: "prepend";
}

export interface AppendBlockPatchInstruction
  extends ExtendingPatchInstruction,
    BaseBlockPatchInstruction {
  operation: "append";
}

export interface ReplaceBlockPatchInstruction
  extends NonExtendingPatchInstruction,
    BaseBlockPatchInstruction {
  operation: "replace";
}

export type HeadingPatchInstruction =
  | PrependHeadingPatchInstruction
  | AppendHeadingPatchInstruction
  | ReplaceHeadingPatchInstruction;

export type BlockPatchInstruction =
  | PrependBlockPatchInstruction
  | AppendBlockPatchInstruction
  | ReplaceBlockPatchInstruction;

export type PatchInstruction = HeadingPatchInstruction | BlockPatchInstruction;
