/// <reference lib="dom" />

/**
 * The landing page's playground: the real engine, running on whatever the
 * visitor types. `npm run build:site` bundles this file — engine included,
 * with Node's `crypto` aliased to `./crypto-shim.ts` — into `site/playground.js`,
 * which `index.html` loads as a module.
 *
 * The logic worth being sure about (the diff, folding a clicked address into
 * the instruction, projecting the map into chips) is exported and unit-tested
 * in `playground.test.ts`; `mount` is the thin DOM wiring over it.
 */

import {
  buildModel,
  headingTreePaths,
  patch,
  projectMap,
  readTarget,
} from "../src/index.js";
import type { InstructionInput, ReadTarget } from "../src/index.js";

export type DiffKind = "" | "add" | "del";
/** One rendered line: its text, and whether the patch added or removed it. */
export type DiffRow = [text: string, kind: DiffKind];

/** The instruction editor holds whatever JSON the visitor typed, so nothing
 *  downstream of it can assume a shape until the engine validates it. */
export type JsonObject = Record<string, unknown>;

/** Above this many line-pairs the quadratic table stops being free; a document
 *  that large is past the point where a line diff tells the visitor anything. */
const DIFF_CELL_LIMIT = 400_000;

/**
 * A line-level LCS diff, so the result pane shows what the instruction *did*
 * rather than only the document it produced. Playground documents are small,
 * which is cheaper than carrying a diff dependency into the bundle.
 */
export const diffLines = (before: string, after: string): DiffRow[] => {
  const a = before.split("\n");
  const b = after.split("\n");
  if (a.length * b.length > DIFF_CELL_LIMIT) {
    return b.map((line): DiffRow => [line, ""]);
  }

  // lcs[i][j] = length of the longest common subsequence of a[i:] and b[j:].
  const lcs: Uint32Array[] = [];
  for (let i = 0; i <= a.length; i += 1) lcs.push(new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i]![j] =
        a[i] === b[j]
          ? lcs[i + 1]![j + 1]! + 1
          : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      rows.push([a[i]!, ""]);
      i += 1;
      j += 1;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      rows.push([a[i]!, "del"]);
      i += 1;
    } else {
      rows.push([b[j]!, "add"]);
      j += 1;
    }
  }
  while (i < a.length) {
    rows.push([a[i]!, "del"]);
    i += 1;
  }
  while (j < b.length) {
    rows.push([b[j]!, "add"]);
    j += 1;
  }
  return rows;
};

export type ChipGroup = "version" | "headings" | "frontmatter" | "blocks";

/** One clickable address from the document map, and what clicking it sets. */
export interface Chip {
  group: ChipGroup;
  label: string;
  fields: JsonObject;
}

/**
 * Project the document map into the chips the map pane renders. A document the
 * engine cannot model isn't an error state for the page — the visitor is
 * mid-keystroke — so it comes back as a message rather than a throw.
 */
export const mapChips = (
  document: string
): { chips: Chip[]; error: null } | { chips: null; error: string } => {
  let map;
  try {
    map = projectMap(buildModel(document));
  } catch (error) {
    return { chips: null, error: messageOf(error) };
  }

  const chips: Chip[] = [
    { group: "version", label: map.version, fields: { ifMatch: map.version } },
  ];
  for (const path of headingTreePaths(map.headings)) {
    chips.push({
      group: "headings",
      // A readable path; the instruction gets the array form the library takes.
      label: path.join(" › "),
      fields: { targetType: "heading", target: path },
    });
  }
  for (const field of map.frontmatterFields) {
    chips.push({
      group: "frontmatter",
      label: field,
      fields: { targetType: "frontmatter", target: field },
    });
  }
  for (const id of map.blocks) {
    chips.push({
      group: "blocks",
      // The bare id — it is what the instruction takes; the group label says "blocks".
      label: id,
      fields: { targetType: "block", target: id },
    });
  }
  return { chips, error: null };
};

export type OptionField = "targetType" | "operation" | "scope";

/** One clickable enum value for an instruction field. */
export interface OptionChip {
  field: OptionField;
  value: string;
}

/**
 * Every value the engine accepts for the instruction's enumerated fields, so
 * a visitor can see what exists without reading the types. Read mode has no
 * operation and no `parent` scope (that scope only makes sense for a move).
 */
export const optionChips = (mode: "patch" | "read"): OptionChip[] => {
  const of = (field: OptionField, values: readonly string[]): OptionChip[] =>
    values.map((value) => ({ field, value }));
  const targetTypes = of("targetType", ["heading", "block", "frontmatter"]);
  if (mode === "read") {
    return [
      ...targetTypes,
      ...of("scope", ["content", "marker", "markerAndContent"]),
    ];
  }
  return [
    ...targetTypes,
    ...of("operation", ["replace", "prepend", "append", "delete"]),
    ...of("scope", ["content", "marker", "markerAndContent", "parent"]),
  ];
};

/** The enumerated fields currently set in the instruction text, for
 *  highlighting the matching chips. Unparseable text selects nothing. */
export const selectedOptions = (
  instructionText: string
): Partial<Record<OptionField, string>> => {
  let current: JsonObject | null;
  try {
    current = asObject(JSON.parse(instructionText));
  } catch (error) {
    return {};
  }
  if (!current) return {};
  const picked: Partial<Record<OptionField, string>> = {};
  for (const field of ["targetType", "operation", "scope"] as const) {
    const value = current[field];
    if (typeof value === "string") picked[field] = value;
  }
  // `scope` defaults to "content" when omitted, so show that as selected.
  if (picked.scope === undefined) picked.scope = "content";
  return picked;
};

const asObject = (value: unknown): JsonObject | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;

/**
 * Fold a clicked address into the instruction already in the editor, keeping
 * the visitor's other fields. Text that doesn't parse (or isn't an object) is
 * replaced by `fallback` rather than silently discarded to `{}` — a click
 * should always leave a runnable instruction behind.
 */
export const foldAddress = (
  instructionText: string,
  fields: JsonObject,
  fallback: JsonObject
): string => {
  let current: JsonObject | null = null;
  try {
    current = asObject(JSON.parse(instructionText));
  } catch (error) {
    current = null;
  }
  return JSON.stringify({ ...(current ?? fallback), ...fields }, null, 2);
};

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const nameOf = (error: unknown): string =>
  error instanceof Error ? error.name : "Error";

export type RunOutcome =
  | { kind: "ok"; status: string; rows: DiffRow[]; warnings: string[] }
  | { kind: "error"; name: string; message: string };

/** Run the engine over the panes' current contents. Every failure mode —
 *  malformed JSON, an unresolvable address, a stale `ifMatch` — comes back as
 *  the engine's own error, which is the point of running the real thing. */
export const runInstruction = (
  document: string,
  instructionText: string,
  mode: "patch" | "read"
): RunOutcome => {
  let instruction: unknown;
  try {
    instruction = JSON.parse(instructionText);
  } catch (error) {
    return {
      kind: "error",
      name: "SyntaxError",
      message: `the instruction isn't valid JSON — ${messageOf(error)}`,
    };
  }

  try {
    if (mode === "read") {
      const target = instruction as ReadTarget;
      const result = readTarget(document, target);
      // Show the targeted content itself, as `mdpatch query` prints it — not
      // the `{ kind, content }` envelope readTarget wraps it in. Frontmatter
      // values are JSON-encoded so a string is distinguishable from a number.
      const text =
        result.kind === "frontmatter"
          ? JSON.stringify(result.value, null, 2)
          : result.content;
      return {
        kind: "ok",
        status: `ok — read at scope ${JSON.stringify(target.scope ?? "content")}`,
        rows: text.split("\n").map((line): DiffRow => [line, ""]),
        warnings: [],
      };
    }
    const result = patch(document, instruction as InstructionInput);
    return {
      kind: "ok",
      status: `ok — ${result.document.length} characters written`,
      rows: diffLines(document, result.document),
      warnings: result.warnings.map((w) => `${w.code} — ${w.message}`),
    };
  } catch (error) {
    return { kind: "error", name: nameOf(error), message: messageOf(error) };
  }
};

// --- DOM wiring ----------------------------------------------------------

const DEMO_DOCUMENT = [
  "---",
  "status: draft",
  "---",
  "",
  "# Weekly Sync",
  "",
  "## Notes",
  "",
  "Kim walked through the Q3 timeline.",
  "",
  "Legal review is the open blocker. ^blocker",
  "",
  "## Attendees",
  "",
  "- Adam",
  "- Kim",
  "",
].join("\n");

const DEMO_INSTRUCTIONS: Record<"patch" | "read", JsonObject> = {
  patch: {
    targetType: "heading",
    target: ["Weekly Sync", "Notes"],
    operation: "append",
    content: "Decided: we ship on Thursday.",
  },
  read: {
    targetType: "heading",
    target: ["Weekly Sync", "Notes"],
    scope: "content",
  },
};

const GROUP_LABELS: Record<ChipGroup, string> = {
  version: "version",
  headings: "headings",
  frontmatter: "frontmatter",
  blocks: "blocks",
};

const need = <T extends Element>(id: string): T => {
  const element = window.document.getElementById(id);
  if (!element) throw new Error(`playground: #${id} is missing from the page`);
  return element as unknown as T;
};

/** Wire the playground to the page. `playground.main.ts` is the bundle's entry
 *  point and calls this; keeping the side effect out of this module is what
 *  lets the logic above be tested without a DOM. */
export const mount = (): void => {
  const docEl = need<HTMLTextAreaElement>("pg-doc");
  const instrEl = need<HTMLTextAreaElement>("pg-instr");
  const mapEl = need<HTMLDivElement>("pg-map");
  const optionsEl = need<HTMLDivElement>("pg-options");
  const statusEl = need<HTMLParagraphElement>("pg-status");
  const resultEl = need<HTMLPreElement>("pg-result");
  const resultTitleEl = need<HTMLElement>("pg-result-title");
  const warnEl = need<HTMLParagraphElement>("pg-warn");
  const modeEl = need<HTMLDivElement>("pg-mode");
  const unbuiltEl = window.document.getElementById("pg-unbuilt");

  let mode: "patch" | "read" = "patch";

  const renderRows = (rows: DiffRow[]): void => {
    resultEl.replaceChildren(
      ...rows.map(([text, kind]) => {
        const line = window.document.createElement("span");
        line.className = kind ? `docline ${kind}` : "docline";
        // A blank line still needs to occupy one, so give it a space to hold.
        line.textContent = text === "" ? " " : text;
        return line;
      })
    );
  };

  const renderMap = (): void => {
    const { chips, error } = mapChips(docEl.value);
    mapEl.replaceChildren();
    if (!chips) {
      const message = window.document.createElement("span");
      message.className = "group";
      message.textContent = `the document could not be modelled: ${error}`;
      mapEl.append(message);
      return;
    }
    let lastGroup: ChipGroup | null = null;
    for (const chip of chips) {
      if (chip.group !== lastGroup) {
        const label = window.document.createElement("span");
        label.className = "group";
        label.textContent = GROUP_LABELS[chip.group];
        mapEl.append(label);
        lastGroup = chip.group;
      }
      const button = window.document.createElement("button");
      button.type = "button";
      button.className = chip.group === "version" ? "addr token" : "addr";
      button.textContent = chip.label;
      button.title =
        chip.group === "version"
          ? "send this version as ifMatch"
          : "target this address";
      button.addEventListener("click", () => {
        instrEl.value = foldAddress(
          instrEl.value,
          chip.fields,
          DEMO_INSTRUCTIONS[mode]
        );
        run();
      });
      mapEl.append(button);
    }
  };

  const renderOptions = (): void => {
    optionsEl.replaceChildren();
    const picked = selectedOptions(instrEl.value);
    let lastField: OptionField | null = null;
    for (const chip of optionChips(mode)) {
      if (chip.field !== lastField) {
        const label = window.document.createElement("span");
        label.className = "group";
        label.textContent = chip.field;
        optionsEl.append(label);
        lastField = chip.field;
      }
      const button = window.document.createElement("button");
      button.type = "button";
      button.className = "addr";
      button.textContent = chip.value;
      button.title = `set ${chip.field} to ${JSON.stringify(chip.value)}`;
      button.setAttribute("aria-pressed", String(picked[chip.field] === chip.value));
      button.addEventListener("click", () => {
        instrEl.value = foldAddress(
          instrEl.value,
          { [chip.field]: chip.value },
          DEMO_INSTRUCTIONS[mode]
        );
        run();
      });
      optionsEl.append(button);
    }
  };

  const run = (): void => {
    renderMap();
    renderOptions();
    resultTitleEl.textContent =
      mode === "read" ? "what readTarget returns — nothing written" : "result.document";
    const outcome = runInstruction(docEl.value, instrEl.value, mode);
    if (outcome.kind === "error") {
      statusEl.className = "pg-status err";
      statusEl.replaceChildren();
      const name = window.document.createElement("span");
      name.className = "name";
      name.textContent = outcome.name;
      statusEl.append(name, ` ${outcome.message}`);
      warnEl.hidden = true;
      renderRows([["—", ""]]);
      return;
    }
    statusEl.className = "pg-status";
    statusEl.textContent = outcome.status;
    renderRows(outcome.rows);
    warnEl.hidden = outcome.warnings.length === 0;
    warnEl.textContent = `warnings: ${outcome.warnings.join("; ")}`;
  };

  let pending = 0;
  const schedule = (): void => {
    window.clearTimeout(pending);
    pending = window.setTimeout(run, 120);
  };
  docEl.addEventListener("input", schedule);
  instrEl.addEventListener("input", schedule);

  const modeButtons = Array.from(modeEl.querySelectorAll("button"));
  for (const button of modeButtons) {
    button.addEventListener("click", () => {
      const next = button.dataset.pgmode === "read" ? "read" : "patch";
      if (next === mode) return;
      // Carry the visitor's edits back to the mode they were made in, so
      // toggling to compare a read against a patch loses nothing.
      try {
        const edited = asObject(JSON.parse(instrEl.value));
        if (edited) DEMO_INSTRUCTIONS[mode] = edited;
      } catch (error) {
        // Unparseable text isn't worth preserving; the demo instruction returns.
      }
      mode = next;
      for (const other of modeButtons) {
        other.setAttribute("aria-pressed", String(other === button));
      }
      instrEl.value = JSON.stringify(DEMO_INSTRUCTIONS[mode], null, 2);
      run();
    });
  }

  docEl.value = DEMO_DOCUMENT;
  instrEl.value = JSON.stringify(DEMO_INSTRUCTIONS.patch, null, 2);
  docEl.disabled = false;
  instrEl.disabled = false;
  // The page ships with a "bundle isn't built" note so a plain checkout of
  // site/ still explains itself; reaching here means it is built.
  unbuiltEl?.remove();
  run();
};
