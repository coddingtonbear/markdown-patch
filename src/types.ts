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

export interface BasePatchInstruction {
  operation: string;
  targetType: PatchTargetType;
  target: string;
  content: string;
}

export interface NonExtendingPatchInstruction extends BasePatchInstruction {
  operation: "replace";
}

export interface ExtendingPatchInstruction extends BasePatchInstruction {
  operation: "prepend" | "append";
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

export type PatchInstruction =
  | ExtendingPatchInstruction
  | NonExtendingPatchInstruction;
