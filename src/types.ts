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

export type PatchTarget = "heading";

export type PatchOperation = "replace" | "prepend" | "append";

export interface PatchInstruction {
  targetType: PatchTarget;
  target: string;
  operation: PatchOperation;
  content: string;
  seamless?: boolean;
}
