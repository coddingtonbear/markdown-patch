/**
 * Frontmatter cells.  Unlike heading and block edits, which splice byte ranges,
 * frontmatter is edited by parsing the block into an ordered list of key/value
 * pairs, applying the operation to that list, and re-serializing the whole
 * block with `yaml.stringify`.  This sidesteps the fiddliness of serializing a
 * single value in place (block scalars, flow vs. block style, quoting) at the
 * cost of reformatting the block; the model's entry ranges are still used to
 * resolve and order entries.  Frontmatter values are JSON, never relative
 * markdown, so nothing here is rebased.
 */

import * as yaml from "yaml";

import { DocumentModel } from "../model.js";
import { spliceRange } from "../splice.js";
import {
  isAppendableFrontmatterType,
  isDictionary,
  isList,
  isString,
} from "../typeGuards.js";
import {
  FrontmatterInstruction,
  PatchResult,
  MergeError,
  TargetNotFoundError,
} from "../instructions.js";

type Pair = [string, unknown];

/** List concat / dict merge / string concat, mirroring the 1.x merge rule. */
const mergeValues = (a: unknown, b: unknown): unknown => {
  if (isList(a) && isList(b)) {
    return [...a, ...b];
  }
  if (isDictionary(a) && isDictionary(b)) {
    return { ...a, ...b };
  }
  if (isString(a) && isString(b)) {
    return a + b;
  }
  throw new MergeError(
    "frontmatter values are not mergeable (need two lists, two dicts, or two strings)"
  );
};

/** Re-serialize the ordered pairs as a `---` block in the document's ending. */
const serializeBlock = (pairs: Pair[], lineEnding: "\n" | "\r\n"): string => {
  if (pairs.length === 0) {
    return "";
  }
  const object: Record<string, unknown> = {};
  for (const [key, value] of pairs) {
    object[key] = value;
  }
  const raw = `---\n${yaml.stringify(object).trimEnd()}\n---\n`;
  return lineEnding === "\n" ? raw : raw.replaceAll("\n", lineEnding);
};

/** Apply a frontmatter instruction by regenerating the block from its pairs. */
export const patchFrontmatter = (
  document: string,
  model: DocumentModel,
  instruction: FrontmatterInstruction
): PatchResult => {
  const pairs: Pair[] = model.frontmatter.entries.map((entry) => [
    entry.key,
    entry.value,
  ]);
  const key = instruction.target;
  let index = pairs.findIndex(([existing]) => existing === key);
  if (index === -1) {
    // Creation is only meaningful when setting/merging a value: a content write
    // or a whole-entry replace.  Renaming, deleting, or inserting relative to a
    // key that does not exist has no sensible meaning.
    const creatable =
      instruction.createTargetIfMissing &&
      ((instruction.scope === "content" && instruction.operation !== "delete") ||
        (instruction.scope === "markerAndContent" &&
          instruction.operation === "replace"));
    if (!creatable) {
      throw new TargetNotFoundError(`frontmatter key "${key}" was not found`);
    }
    // Seed an empty value of the payload's kind so a merge has something to
    // merge onto; a replace overwrites it regardless.  `creatable` guarantees a
    // value instruction here, so `value` is present.
    const content = "value" in instruction ? instruction.value : "";
    const seed = isList(content) ? [] : isDictionary(content) ? {} : "";
    pairs.push([key, seed]);
    index = pairs.length - 1;
  }

  if (instruction.scope === "marker") {
    // Rename the key, keeping its value and position (replace-only per matrix).
    pairs[index] = [instruction.content, pairs[index][1]];
  } else if (instruction.operation === "delete") {
    if (instruction.scope === "content") {
      pairs[index] = [key, null]; // clear the value, keep the key
    } else {
      pairs.splice(index, 1); // remove the whole entry
    }
  } else {
    // Value instruction: replace / prepend / append at content or markerAndContent.
    const content = instruction.value;
    if (instruction.scope === "content") {
      if (instruction.operation === "replace") {
        pairs[index] = [key, content];
      } else {
        const current = pairs[index][1];
        if (!isAppendableFrontmatterType(content) || !isAppendableFrontmatterType(current)) {
          throw new MergeError(
            `frontmatter key "${key}" cannot be merged with the given value`
          );
        }
        pairs[index] = [
          key,
          instruction.operation === "append"
            ? mergeValues(current, content)
            : mergeValues(content, current),
        ];
      }
    } else if (instruction.operation === "replace") {
      pairs[index] = [key, content]; // re-emit the whole entry with a new value
    } else {
      // Insert new entries (a dictionary) before/after the anchor entry.
      if (!isDictionary(content)) {
        throw new MergeError(
          "inserting frontmatter entries requires a dictionary of key/value pairs"
        );
      }
      const at = instruction.operation === "prepend" ? index : index + 1;
      pairs.splice(at, 0, ...(Object.entries(content) as Pair[]));
    }
  }

  const block = model.frontmatter.block ?? { start: 0, end: 0 };
  return {
    document: spliceRange(document, block, serializeBlock(pairs, model.lineEnding)),
    warnings: [],
  };
};
