/** The value shapes a frontmatter `prepend`/`append` can merge into. */
export type AppendableFrontmatterType =
  | string
  | Array<unknown>
  | Record<string, unknown>;

export function isString(obj: unknown): obj is string {
  return typeof obj === "string";
}

export function isDictionary(obj: unknown): obj is Record<string, unknown> {
  return typeof obj === "object" && obj !== null && !Array.isArray(obj);
}

export function isList(obj: unknown): obj is Array<unknown> {
  return Array.isArray(obj);
}

export function isAppendableFrontmatterType(
  obj: unknown
): obj is AppendableFrontmatterType {
  return isString(obj) || isDictionary(obj) || isList(obj);
}
