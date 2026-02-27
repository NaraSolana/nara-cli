/**
 * CLI command registration
 */

import { Command } from "commander";
import { registerConfigCommands } from "./commands/config";
import { registerPoolCommands } from "./commands/pool";
import { registerSwapCommands } from "./commands/swap";
import { registerMigrateCommands } from "./commands/migrate";
import { registerWalletCommands } from "./commands/wallet";
import { registerQuestCommands } from "./commands/quest";

/**
 * Register all CLI commands
 * @param program Commander program
 */
export function registerCommands(program: Command): void {
  // Register command modules
  registerConfigCommands(program);
  registerPoolCommands(program);
  registerSwapCommands(program);
  registerMigrateCommands(program);
  registerWalletCommands(program);
  registerQuestCommands(program);
}
