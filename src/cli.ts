#!/usr/bin/env node
import { Command } from "commander";
import fs from "fs/promises";
import { patch } from "./engine.js";
import { buildModel } from "./model.js";
import { projectMap, headingTreePaths } from "./projection.js";
import { readTarget } from "./read.js";
import {
  EngineError,
  InstructionInput,
  PatchResult,
  TargetType,
} from "./instructions.js";
import packageJson from "../package.json";

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

/** Print engine failures as one clean line rather than a stack trace. */
function fail(e: unknown): never {
  if (e instanceof EngineError) {
    console.error(`${e.constructor.name}: ${e.message}`);
    process.exit(1);
  }
  throw e;
}

function printWarnings(result: PatchResult): void {
  for (const warning of result.warnings) {
    console.error(`warning (${warning.code}): ${warning.message}`);
  }
}

async function writeResult(
  document: string,
  output: string | undefined,
  fallbackPath: string
): Promise<void> {
  if (output === "-") {
    process.stdout.write(document);
  } else {
    await fs.writeFile(output ? output : fallbackPath, document);
  }
}

/** A heading target is a delimiter-joined containment path; `''` is the root. */
function parseTarget(
  targetType: TargetType,
  target: string,
  delimiter: string
): string | string[] | null {
  if (targetType !== "heading") {
    return target;
  }
  return target === "" ? null : target.split(delimiter);
}

const program = new Command();

program
  .name(Object.keys(packageJson.bin)[0])
  .description(packageJson.description)
  .version(packageJson.version);

program
  .command("print-map")
  .description(
    "Print a document's addressable map: its version token, frontmatter " +
      "fields, heading tree, and block ids."
  )
  .argument("<path>", "filepath to show identified patchable targets for")
  .argument(
    "[regex]",
    "list only addresses matching the supplied regular expression, one per line"
  )
  .option(
    "-d, --delimiter <delimiter>",
    "Heading delimiter to use in place of '::'.",
    "::"
  )
  .action(async (path: string, regex: string | undefined, options) => {
    const document = await fs.readFile(path, "utf-8");
    const map = projectMap(buildModel(document));

    if (regex === undefined) {
      console.log(JSON.stringify(map, null, 2));
      return;
    }

    const pattern = new RegExp(regex);
    for (const headingPath of headingTreePaths(map.headings)) {
      const joined = headingPath.join(options.delimiter);
      if (pattern.test(joined)) {
        console.log(`heading\t${joined}`);
      }
    }
    for (const blockId of map.blocks) {
      if (pattern.test(blockId)) {
        console.log(`block\t${blockId}`);
      }
    }
    for (const field of map.frontmatterFields) {
      if (pattern.test(field)) {
        console.log(`frontmatter\t${field}`);
      }
    }
  });

program
  .command("patch")
  .description(
    "Apply a single instruction built from flags; content is read from " +
      "stdin unless --input is given.  For the full instruction model " +
      "(table rows, moves), use `apply`."
  )
  .option(
    "-i, --input <input>",
    "Path to content to insert; by default reads from stdin."
  )
  .option(
    "-o, --output <output>",
    "Path to write output to; use '-' for stdout.  Defaults to patching in-place."
  )
  .option(
    "-d, --delimiter <delimiter>",
    "Heading delimiter to use in place of '::'.",
    "::"
  )
  .option(
    "-s, --scope <scope>",
    "Scope to operate on ('content', 'marker', 'markerAndContent', 'parent'); defaults to 'content'."
  )
  .option(
    "--if-match <version>",
    "Fail unless the document's version token matches (see `print-map`)."
  )
  .option(
    "--create-target-if-missing",
    "Create the target (and any missing ancestors) when it does not exist."
  )
  .option(
    "--reject-if-content-preexists",
    "Fail instead of applying when the content already appears in the target."
  )
  .argument(
    "<operation>",
    "Operation to perform ('replace', 'prepend', 'append', 'delete')"
  )
  .argument(
    "<targetType>",
    "Target type ('heading', 'block', 'frontmatter')"
  )
  .argument(
    "<target>",
    "Target ('::'-delimited containment path for headings, '' for the " +
      "document root; a bare block id; a frontmatter key); see `mdpatch " +
      "print-map <path>` for options"
  )
  .argument("<documentPath>", "Path to document to apply patch to.")
  .action(
    async (
      operation: string,
      targetType: string,
      target: string,
      documentPath: string,
      options
    ) => {
      const instruction: Record<string, unknown> = {
        operation,
        targetType,
        target: parseTarget(targetType as TargetType, target, options.delimiter),
      };
      if (options.scope !== undefined) {
        instruction.scope = options.scope;
      }
      if (options.ifMatch !== undefined) {
        instruction.ifMatch = options.ifMatch;
      }
      if (options.createTargetIfMissing) {
        instruction.createTargetIfMissing = true;
      }
      if (options.rejectIfContentPreexists) {
        instruction.rejectIfContentPreexists = true;
      }

      // Delete carries no payload; everything else reads one from stdin/-i.
      if (operation !== "delete") {
        const raw = options.input
          ? await fs.readFile(options.input, "utf-8")
          : await readStdin();
        if (options.scope === "parent") {
          // A move's payload is its JSON destination: {"parent": [...], "place": ...}
          instruction.destination = JSON.parse(raw);
        } else if (targetType === "frontmatter" && options.scope !== "marker") {
          // Frontmatter values are structured JSON; fall back to the raw
          // string so `echo done | mdpatch patch replace frontmatter status`
          // does what it looks like.
          try {
            instruction.value = JSON.parse(raw);
          } catch {
            instruction.value = raw.replace(/\n$/, "");
          }
        } else if (options.scope === "marker") {
          // A marker payload is a single-line label (heading text, block id,
          // frontmatter key), so a shell pipeline's trailing newline is
          // framing, not content — without this, `echo New Name | mdpatch
          // patch replace heading Old -s marker` is rejected for the line
          // break every pipeline appends. Body content keeps its bytes.
          instruction.content = raw.replace(/\r?\n$/, "");
        } else {
          instruction.content = raw;
        }
      }

      const document = await fs.readFile(documentPath, "utf-8");
      let result: PatchResult;
      try {
        result = patch(document, instruction as InstructionInput);
      } catch (e) {
        fail(e);
      }
      printWarnings(result);
      await writeResult(result.document, options.output, documentPath);
    }
  );

program
  .command("apply")
  .description(
    "Apply a JSON patch file: a single instruction object or an array of " +
      "them, applied in order."
  )
  .argument("<path>", "file to patch")
  .argument("<patch>", "patch file to apply; use '-' for stdin")
  .option(
    "-o, --output <output>",
    "write output to the specified path instead of applying in-place; use '-' for stdout"
  )
  .action(async (path: string, patchPath: string, options) => {
    let patchData: string;
    try {
      patchData =
        patchPath === "-"
          ? await readStdin()
          : await fs.readFile(patchPath, "utf-8");
    } catch (e) {
      console.error("Failed to read patch: ", e);
      process.exit(1);
    }

    let instructions: InstructionInput[];
    try {
      const parsed: unknown = JSON.parse(patchData);
      // Each instruction is schema-validated by `patch` at the boundary; the
      // only shape enforced here is object-or-array-of-objects.
      instructions = (Array.isArray(parsed)
        ? parsed
        : [parsed]) as InstructionInput[];
    } catch (e) {
      console.error("Could not parse patch file as JSON");
      process.exit(1);
    }

    let document = await fs.readFile(path, "utf-8");
    try {
      for (const instruction of instructions) {
        const result = patch(document, instruction);
        printWarnings(result);
        document = result.document;
      }
    } catch (e) {
      fail(e);
    }

    await writeResult(document, options.output, path);
  });

program
  .command("query")
  .description(
    "Read a target's content: markdown for headings and blocks, JSON for " +
      "frontmatter values."
  )
  .option(
    "-o, --output <output>",
    "Path to write output to; defaults to stdout."
  )
  .option(
    "-d, --delimiter <delimiter>",
    "Heading delimiter to use in place of '::'.",
    "::"
  )
  .argument(
    "<targetType>",
    "Target type ('heading', 'block', 'frontmatter')"
  )
  .argument(
    "<target>",
    "Target ('::'-delimited containment path for headings, '' for the " +
      "document root; a bare block id; a frontmatter key); see `mdpatch " +
      "print-map <path>` for options"
  )
  .argument("<documentPath>", "Path to document to query from.")
  .action(
    async (targetType: string, target: string, documentPath: string, options) => {
      const document = await fs.readFile(documentPath, "utf-8");
      let result;
      try {
        result = readTarget(document, {
          targetType,
          target: parseTarget(targetType as TargetType, target, options.delimiter),
        } as Parameters<typeof readTarget>[1]);
      } catch (e) {
        fail(e);
      }

      const value =
        result.kind === "frontmatter"
          ? JSON.stringify(result.value, null, 2)
          : result.content;

      if (options.output) {
        await fs.writeFile(options.output, value);
      } else {
        process.stdout.write(value);
      }
    }
  );

program.parse(process.argv);
