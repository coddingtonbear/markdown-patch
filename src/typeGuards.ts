import { AppendableFrontmatterType } from "./types";

export function isStringArrayArray(obj: unknown): obj is string[][] {
  // Check if the object is an array
  if (!Array.isArray(obj)) return false;

  // Check if every element is an array of strings
  return obj.every(
    (item) =>
      Array.isArray(item) &&
      item.every((subItem) => typeof subItem === "string")
  );
}
export function isAppendableFrontmatterType(
  obj: unknown
): obj is AppendableFrontmatterType {
  return isString(obj) || isDictionary(obj) || isList(obj);
}

export function isString(obj: unknown): obj is string {
  return typeof obj === "string";
}

export function isDictionary(obj: unknown): obj is Record<string, unknown> {
  return typeof obj === "object" && obj !== null && !Array.isArray(obj);
}

export function isList(obj: unknown): obj is Array<unknown> {
  return Array.isArray(obj);
}
