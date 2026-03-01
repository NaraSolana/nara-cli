/**
 * Nara CLI - Command-line interface for the Nara chain
 */

import { Command } from "commander";
import { registerCommands } from "../src/cli/index";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

// Create program
const program = new Command();

// Set program metadata
program
  .name("naracli")
  .description("CLI for the Nara chain (Solana-compatible)")
  .version(version);

// Add global options
program
  .option("-r, --rpc-url <url>", "RPC endpoint URL")
  .option("-w, --wallet <path>", "Path to wallet keypair JSON file")
  .option("-j, --json", "Output in JSON format");

// Register all command modules
registerCommands(program);

// Parse arguments and execute
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
