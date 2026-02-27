/**
 * Nara CLI - Command-line interface for the Nara chain
 */

import { Command } from "commander";
import { registerCommands } from "../src/cli/index";
import { loadWallet } from "../src/cli/utils/wallet";
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

// Top-level address shortcut
program
  .command("address")
  .description("Show wallet address")
  .action(async () => {
    const opts = program.opts();
    try {
      const wallet = await loadWallet(opts.wallet);
      if (opts.json) {
        console.log(JSON.stringify({ address: wallet.publicKey.toBase58() }, null, 2));
      } else {
        console.log(wallet.publicKey.toBase58());
      }
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// Register all command modules
registerCommands(program);

// Parse arguments and execute
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
