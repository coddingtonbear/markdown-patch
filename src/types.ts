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

export type PatchTargetType = "heading";

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
  /** Fail to patch if supplied content already exists in target.
   *
   * In some cases, you may want your patch operation to be
   * idempotent. You can use `rejectIfExists` if you would like
   * a patch operation to be rejected if your supplied `content`
   * already exists (anywhere) in the `target` content.
   */
  rejectIfExists?: boolean;
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

export type HeadingPatchInstruction =
  | PrependHeadingPatchInstruction
  | AppendHeadingPatchInstruction
  | ReplaceHeadingPatchInstruction;

export type PatchInstruction = HeadingPatchInstruction;
