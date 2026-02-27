/**
 * Config commands
 */

import { Command } from "commander";
import { NaraSDK } from "../../client";
import { createConfig } from "../../config";
import { loadWallet, getRpcUrl } from "../utils/wallet";
import { validatePublicKey } from "../utils/validation";
import {
  handleTransaction,
  printTransactionResult,
} from "../utils/transaction";
import { formatOutput, printError, printInfo } from "../utils/output";
import type { ConfigCreateOptions } from "../types";

/**
 * Register config commands
 * @param program Commander program
 */
export function registerConfigCommands(program: Command): void {
  const config = program
    .command("config")
    .description("Configuration management commands");

  // config create
  config
    .command("create")
    .description("Create a bonding curve configuration")
    .option("--fee-claimer <address>", "Fee claimer wallet address")
    .option(
      "--leftover-receiver <address>",
      "Leftover token receiver wallet address"
    )
    .option(
      "--total-supply <number>",
      "Total token supply",
      "1000000000"
    )
    .option("--initial-mcap <number>", "Initial market cap", "30")
    .option("--migration-mcap <number>", "Migration market cap", "540")
    .option("-e, --export-tx", "Export unsigned transaction", false)
    .action(async (options: ConfigCreateOptions) => {
      try {
        await handleConfigCreate(options);
      } catch (error: any) {
        printError(error.message);
        process.exit(1);
      }
    });
}

/**
 * Handle config create command
 * @param options Command options
 */
async function handleConfigCreate(
  options: ConfigCreateOptions
): Promise<void> {
  // Load wallet
  const wallet = await loadWallet(options.wallet);
  const rpcUrl = getRpcUrl(options.rpcUrl);

  printInfo(`Using RPC: ${rpcUrl}`);
  printInfo(`Wallet: ${wallet.publicKey.toBase58()}`);

  // Initialize SDK
  const sdk = new NaraSDK({
    rpcUrl,
    commitment: "confirmed",
  });

  // Parse addresses
  const feeClaimer = options.feeClaimer
    ? validatePublicKey(options.feeClaimer)
    : wallet.publicKey;
  const leftoverReceiver = options.leftoverReceiver
    ? validatePublicKey(options.leftoverReceiver)
    : wallet.publicKey;

  // Parse numeric options
  const totalTokenSupply = parseInt(String(options.totalSupply || "1000000000"));
  const initialMarketCap = parseFloat(String(options.initialMcap || "30"));
  const migrationMarketCap = parseFloat(String(options.migrationMcap || "540"));

  printInfo("Creating bonding curve configuration...");

  // Create config
  const result = await createConfig(sdk, {
    feeClaimer,
    leftoverReceiver,
    payer: wallet.publicKey,
    totalTokenSupply,
    initialMarketCap,
    migrationMarketCap,
  });

  printInfo(`Config address: ${result.configAddress}`);

  // Handle transaction
  const txResult = await handleTransaction(
    sdk,
    result.transaction,
    [wallet, result.configKeypair], // Both wallet and config keypair need to sign
    options.exportTx || false
  );

  // Output result
  if (options.json) {
    const output = {
      configAddress: result.configAddress,
      ...(txResult.signature && { signature: txResult.signature }),
      ...(txResult.base64 && { transaction: txResult.base64 }),
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(`\nConfig Address: ${result.configAddress}`);
    printTransactionResult(txResult, false);

    if (txResult.signature) {
      printInfo("\nSave this DBC config address for creating pools:");
      console.log(`export DBC_CONFIG_ADDRESS="${result.configAddress}"`);
    }
  }
}
