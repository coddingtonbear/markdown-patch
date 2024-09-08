export const TARGETABLE_BY_ISOLATED_BLOCK_REFERENCE = [
  "code",
  "heading",
  "table",
  "blockquote",
  "list",
  "paragraph",
  "image",
];

export const CAN_INCLUDE_BLOCK_REFERENCE = ["paragraph", "list_item"];

export enum ContentType {
  text = "text/plain",
  tableRows = "application/vnd.markdown-patch.table-rows+json",
}
