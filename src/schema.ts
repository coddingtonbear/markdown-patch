/**
 * The published Zod schema for a patch instruction.
 *
 * This is the single source of truth for the *shape and validity* of an
 * instruction as a caller supplies it, from which downstream projects derive
 * their own surfaces: obsidian-local-rest-api builds its MCP `vault_patch` tool
 * input from {@link InstructionInputObjectSchema}'s field shape and its OpenAPI
 * `PatchInstruction` component by running the same schema through
 * `zod-to-json-schema`.  Keeping it here means those three representations
 * cannot drift.
 *
 * The schema is deliberately a *flat* object rather than a discriminated union:
 * that is the only shape an MCP tool input accepts (a tool takes a flat
 * `ZodRawShape`, never a top-level union), and it matches how both the REST and
 * MCP layers already model an instruction.  The cross-field rules that a
 * discriminated union would encode in its structure — which carrier a cell
 * requires, which `operation × scope` pairs are valid for a target — are instead
 * enforced by {@link instructionAlgebra} in a `superRefine`.
 *
 * The hand-written {@link InstructionInput} union in `instructions.ts` remains
 * the exported *type*; this schema is checked against it (see `schema.test.ts`)
 * so the two stay in agreement.  {@link patch} validates its input against
 * {@link InstructionInputSchema} at the boundary, so a malformed instruction is
 * rejected with a typed {@link InvalidInstructionError} before any handler runs.
 */

import { z } from "zod";

import {
  Operation,
  Scope,
  TargetType,
  isValidCell,
} from "./instructions.js";
import { DUPLICATE_DIGITS, DUPLICATE_MARKER } from "./constants.js";

// --- Field pieces --------------------------------------------------------

const operationValues = [
  "replace",
  "prepend",
  "append",
  "delete",
] as const satisfies readonly Operation[];

const scopeValues = [
  "content",
  "marker",
  "markerAndContent",
  "parent",
] as const satisfies readonly Scope[];

const targetTypeValues = [
  "heading",
  "block",
  "frontmatter",
] as const satisfies readonly TargetType[];

/** A heading containment path, or `null`/`[]` for the document root. */
const headingAddress = z
  .union([z.array(z.string()), z.null()])
  .describe(
    "A heading's containment path: the ancestor heading texts from the top level down (e.g. [\"Overview\",\"Details\"]), or null/[] for the document root."
  );

/** Where a moved section lands among its new parent's children. */
const place = z
  .union([
    z.enum(["first", "last"]),
    z.object({ before: headingAddress }).strict(),
    z.object({ after: headingAddress }).strict(),
  ])
  .describe(
    "Position among the new parent's children: \"first\", \"last\", or { before } / { after } a sibling heading address."
  );

const destination = z
  .object({
    parent: headingAddress.describe(
      "The section's new parent heading address, or null/[] for the document root."
    ),
    place,
  })
  .strict()
  .describe(
    "For a heading move (operation `replace`, scope `parent`): where the section is re-parented. Provide exactly one of `content`, `value`, or `destination`."
  );

// --- The flat object -----------------------------------------------------

/**
 * The instruction as a flat object, before cross-field validation.  Exposed so
 * consumers can read its `.shape` (e.g. to build an MCP tool input, one Zod
 * field per parameter).  Use {@link InstructionInputSchema} to actually
 * validate an instruction — it adds the {@link instructionAlgebra} refinement.
 */
export const InstructionInputObjectSchema = z
  .object({
    targetType: z
      .enum(targetTypeValues)
      .describe("The kind of node to edit."),
    target: z
      .union([z.array(z.string()), z.string(), z.null()])
      .describe(
        "The node to edit. For a heading: an array of heading texts from the top level down to the target (e.g. [\"Overview\",\"Details\"]), or null/[] for the document root. If a heading is a duplicate of an earlier sibling under the same parent, its address carries an extra non-printable marker suffix appended by the server — copy that address verbatim from wherever the document's heading structure was discovered, never retype or reconstruct it. For a block: the bare block id, without the leading `^` (letters, numbers, hyphens, and underscores only). For a frontmatter field: the key."
      ),
    operation: z
      .enum(operationValues)
      .describe(
        "What happens to the scoped span: replace it, insert before (`prepend`) or after (`append`), or `delete` it."
      ),
    scope: z
      .enum(scopeValues)
      .default("content")
      .describe(
        "Which part of the target the operation acts on (default `content`). `content`: the node body — for a heading, its whole subtree below the heading line. `marker`: the label only — a heading line, a block `^id`, or a frontmatter key (`replace` renames it). `markerAndContent`: the whole node/subtree (`prepend`/`append` insert a sibling). `parent`: a heading's place in the tree — only with operation `replace`, carrying a `destination` (a move)."
      ),
    content: z
      .string()
      .describe(
        "String payload: a heading/block body or label, a new block id for a block `marker` rename (letters, numbers, hyphens, and underscores only), or a new frontmatter key name for a frontmatter `marker` rename. Heading levels are relative to the edited span (a leading `#` becomes a direct child). A heading `marker` rename may not contain a line break. Provide exactly one of `content`, `value`, or `destination`."
      )
      .optional(),
    value: z
      .unknown()
      .describe(
        "Structured JSON payload: a frontmatter value (any JSON — string, number, boolean, array, object, null; for `prepend`/`append` this merges: list concat, dict merge, string concat), or table rows on a `block` target's `content` cell (a 2-D array of strings, one row per entry — `replace` swaps the body rows, `prepend`/`append` insert before/after the existing ones; each row's length must match the table's column count). Provide exactly one of `content`, `value`, or `destination`."
      )
      .optional(),
    destination: destination.optional(),
    ifMatch: z
      .string()
      .describe(
        "Optimistic-concurrency token (the `version` from a prior document map). If set and the document has changed since, the patch fails with a precondition error without modifying the file."
      )
      .optional(),
    createTargetIfMissing: z
      .boolean()
      .default(false)
      .describe(
        "Create the target (heading path, block id, or frontmatter key) if it does not already exist."
      ),
    rejectIfContentPreexists: z
      .boolean()
      .default(false)
      .describe(
        "Fail a `prepend`/`append` when the string content already appears in the target span (makes those operations idempotent on retry)."
      ),
  })
  .describe(
    "A single edit expressed as one operation applied to a scope of a target node. The payload rides in exactly one of `content`, `value`, or `destination`, chosen by what it is. Not every operation×scope×targetType combination is valid; invalid ones are rejected."
  );

// --- The algebra (cross-field validity) ----------------------------------

/** Which payload carrier a valid cell requires (or `none` for a delete). */
type Carrier = "content" | "value" | "destination" | "none";

/**
 * The carrier(s) a `(targetType, operation, scope)` cell accepts, mirroring the
 * {@link Instruction} union member(s) for that cell.  Every cell expects exactly
 * one carrier except `block`'s `content` cell, which accepts either `content`
 * (literal text) or `value` (structured table rows) — the same way `frontmatter`
 * already distinguishes `content` (key rename) from `value` (value write), just
 * within one scope instead of across two.  Assumes the cell is already known
 * valid (see {@link isValidCell}).
 */
const expectedCarriers = (
  targetType: TargetType,
  operation: Operation,
  scope: Scope
): readonly Carrier[] => {
  if (operation === "delete") return ["none"];
  if (scope === "parent") return ["destination"]; // heading move
  if (targetType === "frontmatter") {
    return scope === "marker" ? ["content"] : ["value"]; // rename vs. value write
  }
  if (targetType === "block" && scope === "content") {
    return ["content", "value"]; // literal text, or structured table rows
  }
  return ["content"]; // heading/block label or whole-node write
};

const carriers = ["content", "value", "destination"] as const;

/**
 * A block id's allowed character set — mirrors `BLOCK_REFERENCE_REGEX` in
 * `model.ts`, which is what actually recognizes a `^id` marker in the
 * document.  A target or rename outside this set could never address (or
 * produce) a real block reference, so it is rejected here rather than
 * spliced in verbatim and silently failing to parse as one.
 */
const BLOCK_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * A block *target* additionally accepts the disambiguated form a duplicate
 * block id's later occurrence is addressed by (see disambiguatedBlockId in
 * projection.ts): the raw id followed by the reserved marker and one or more
 * digit codepoints. Only `target` (addressing an existing block) accepts
 * this — `content` on a `marker`-scope rename (naming a *new* real block id)
 * still requires {@link BLOCK_ID_PATTERN} alone, since a disambiguated
 * address is never something you rename a block to.
 */
const BLOCK_TARGET_PATTERN = new RegExp(
  `^[A-Za-z0-9_-]+(${DUPLICATE_MARKER}[${DUPLICATE_DIGITS.join("")}]+)?$`,
  "u"
);

/** A 2-D array of strings: table rows for a `block` `content`-cell `value` write. */
const isTableRowValue = (value: unknown): value is string[][] =>
  Array.isArray(value) &&
  value.every(
    (row) => Array.isArray(row) && row.every((cell) => typeof cell === "string")
  );

/**
 * Validate the cross-field rules the flat object cannot express on its own: the
 * target shape must match its type, the `operation × scope` cell must be part of
 * the algebra, and exactly one of the carrier(s) the cell expects must be
 * present — with the right shape, for cells whose carrier is structured.
 */
const instructionAlgebra = (
  input: z.infer<typeof InstructionInputObjectSchema>,
  ctx: z.RefinementCtx
): void => {
  const { targetType, operation, scope, target } = input;

  // Target shape by type.
  if (targetType === "heading") {
    if (target !== null && !Array.isArray(target)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["target"],
        message:
          "a heading target must be an array of heading texts, or null for the document root",
      });
    }
  } else if (typeof target !== "string") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["target"],
      message: `a ${targetType} target must be a string`,
    });
  } else if (targetType === "block" && !BLOCK_TARGET_PATTERN.test(target)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["target"],
      message:
        "a block id may contain only letters, numbers, hyphens, and underscores",
    });
  }

  // Cell validity.
  if (!isValidCell(targetType, operation, scope)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["operation"],
      message: `${operation} @ ${scope} is not a valid operation for a ${targetType} target`,
    });
    return; // carrier expectations are undefined for an invalid cell
  }

  // Carrier: exactly one of the ones the cell expects, and no others.
  const expected = expectedCarriers(targetType, operation, scope);
  const present = carriers.filter((carrier) => input[carrier] !== undefined);

  if (expected[0] === "none") {
    for (const carrier of present) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [carrier],
        message: `a ${operation} carries no payload; remove \`${carrier}\``,
      });
    }
    return;
  }

  if (present.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [expected[0]],
      message: `${operation} @ ${scope} on a ${targetType} target requires ${
        expected.length === 1 ? `\`${expected[0]}\`` : expected.map((c) => `\`${c}\``).join(" or ")
      }`,
    });
  } else if (present.length > 1) {
    for (const carrier of present) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [carrier],
        message: `${operation} @ ${scope} on a ${targetType} target carries its payload in exactly one of ${expected
          .map((c) => `\`${c}\``)
          .join(" or ")}, not both`,
      });
    }
  } else if (!expected.includes(present[0])) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [present[0]],
      message: `${operation} @ ${scope} on a ${targetType} target carries its payload in ${
        expected.length === 1 ? `\`${expected[0]}\`` : expected.map((c) => `\`${c}\``).join(" or ")
      }, not \`${present[0]}\``,
    });
  } else if (
    targetType === "block" &&
    scope === "content" &&
    present[0] === "value" &&
    !isTableRowValue(input.value)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["value"],
      message:
        "value for a block content write must be a 2-D array of strings — one row per entry, one cell per column",
    });
  } else if (
    targetType === "block" &&
    scope === "marker" &&
    operation === "replace" &&
    !BLOCK_ID_PATTERN.test(input.content as string)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["content"],
      message:
        "a block id may contain only letters, numbers, hyphens, and underscores",
    });
  } else if (
    targetType === "heading" &&
    scope === "marker" &&
    /[\r\n]/.test(input.content as string)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["content"],
      message: "a heading marker rename cannot contain a line break",
    });
  }
};

/**
 * The full instruction schema: the flat object plus the {@link instructionAlgebra}
 * cross-field refinement.  {@link patch} parses input through this at the
 * boundary.  It is a `ZodEffects`, so read `.shape` from
 * {@link InstructionInputObjectSchema} rather than from this.
 */
export const InstructionInputSchema =
  InstructionInputObjectSchema.superRefine(instructionAlgebra);
