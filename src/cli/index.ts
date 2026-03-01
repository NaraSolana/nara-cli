/**
 * CLI command registration
 */

import { Command } from "commander";
import { registerWalletCommands } from "./commands/wallet";
import { registerQuestCommands } from "./commands/quest";

/**
 * Register all CLI commands
 * @param program Commander program
 */
export function registerCommands(program: Command): void {
  registerWalletCommands(program);
  registerQuestCommands(program);
}
