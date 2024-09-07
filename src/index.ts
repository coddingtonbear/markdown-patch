#!/usr/bin/env node
import { Command } from "commander";
import fs from "fs/promises";
import { getDocumentMap } from "./map.js";
import { printMap } from "./debug.js";
import { PatchInstruction } from "./types.js";
import { applyPatch } from "./patch.js";

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

const program = new Command();

// Configure the CLI
program
  .name("mdpatch")
  .description(
    "Make predicatble changes to markdown documents, even if you don't quite know exactly what they look like."
  )
  .version("1.0.0");

program
  .command("print-map")
  .argument("<path>", "filepath to show identified patchable paths for")
  .argument(
    "[regex]",
    "limit displayed matches to those matching the supplied regular expression"
  )
  .action(async (path: string, regex: string | undefined) => {
    const document = await fs.readFile(path, "utf-8");
    const documentMap = getDocumentMap(document);

    printMap(document, documentMap, regex ? new RegExp(regex) : undefined);
  });

program
  .command("apply")
  .argument("<path>", "file to patch")
  .argument("<patch>", "patch file to apply")
  .option(
    "-o, --output <output>",
    "write output to the specified path instead of applying in-place; use '-' for stdout"
  )
  .action(async (path: string, patch: string, options) => {
    let patchParsed: PatchInstruction[];
    let patchData: string;
    try {
      if (patch === "-") {
        patchData = await readStdin();
      } else {
        patchData = await fs.readFile(patch, "utf-8");
      }
    } catch (e) {
      console.error("Failed to read patch: ", e);
      process.exit(1);
    }

    try {
      const parsedData = JSON.parse(patchData);
      if (!Array.isArray(parsedData)) {
        patchParsed = [parsedData];
      } else {
        patchParsed = parsedData;
      }
    } catch (e) {
      console.error("Could not parse patch file as JSON");
      process.exit(1);
    }

    let document = await fs.readFile(path, "utf-8");
    console.log("Document", document);
    for (const instruction of patchParsed) {
      document = applyPatch(document, instruction);
    }

    if (options.output === "-") {
      process.stdout.write(document);
    } else {
      await fs.writeFile(options.output ? options.output : path, document);
    }
  });

program.parse(process.argv);
