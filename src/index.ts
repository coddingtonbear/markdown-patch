#!/usr/bin/env node
import { Command } from "commander";

// Create a new command instance
const program = new Command();

// Configure the CLI
program
  .name("md-patch")
  .description("A simple CLI example built with TypeScript")
  .version("1.0.0");

program.parse(process.argv);
