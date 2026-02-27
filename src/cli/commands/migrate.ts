/**
 * Migration commands
 */

import { Command } from "commander";
import { NaraSDK } from "../../client";
import { migrateToDAMMV2, createLocker, canMigrate } from "../../migrate";
import { loadWallet, getRpcUrl } from "../utils/wallet";
import { validatePublicKey } from "../utils/validation";
import {
  handleTransaction,
  printTransactionResult,
} from "../utils/transaction";
import { formatOutput, printError, printInfo, printSuccess, printWarning } from "../utils/output";
import type {
  MigrateLaunchOptions,
  MigrateCreateLockerOptions,
  MigrateCheckOptions,
} from "../types";

/**
 * Register migration commands
 * @param program Commander program
 */
export function registerMigrateCommands(program: Command): void {
  const migrate = program
    .command("migrate")
    .description("Pool migration commands");

  // migrate launch
  migrate
    .command("launch <token-address>")
    .description("Migrate pool to DAMM V2 (graduation)")
    .option("-e, --export-tx", "Export unsigned transaction", false)
    .action(
      async (
        tokenAddress: string,
        options: Omit<MigrateLaunchOptions, "tokenAddress">
      ) => {
        try {
          await handleMigrateLaunch(tokenAddress, options);
        } catch (error: any) {
          printError(error.message);
          process.exit(1);
        }
      }
    );

  // migrate create-locker
  migrate
    .command("create-locker <token-address>")
    .description("Create locker for pools with vesting")
    .option("-e, --export-tx", "Export unsigned transaction", false)
    .action(
      async (
        tokenAddress: string,
        options: Omit<MigrateCreateLockerOptions, "tokenAddress">
      ) => {
        try {
          await handleMigrateCreateLocker(tokenAddress, options);
        } catch (error: any) {
          printError(error.message);
          process.exit(1);
        }
      }
    );

  // migrate check
  migrate
    .command("check <token-address>")
    .description("Check if pool can be migrated")
    .action(
      async (
        tokenAddress: string,
        options: Omit<MigrateCheckOptions, "tokenAddress">
      ) => {
        try {
          await handleMigrateCheck(tokenAddress, options);
        } catch (error: any) {
          printError(error.message);
          process.exit(1);
        }
      }
    );
}

/**
 * Handle migrate launch command
 * @param tokenAddress Token address
 * @param options Command options
 */
async function handleMigrateLaunch(
  tokenAddress: string,
  options: Omit<MigrateLaunchOptions, "tokenAddress">
): Promise<void> {
  // Load wallet
  const wallet = await loadWallet(options.wallet);
  const rpcUrl = getRpcUrl(options.rpcUrl);

  printInfo(`Using RPC: ${rpcUrl}`);
  printInfo(`Wallet: ${wallet.publicKey.toBase58()}`);

  // Validate address
  validatePublicKey(tokenAddress);

  // Initialize SDK
  const sdk = new NaraSDK({
    rpcUrl,
    commitment: "confirmed",
  });

  // Check if migration is possible
  printInfo("Checking if pool can be migrated...");
  const checkResult = await canMigrate(sdk, tokenAddress);

  if (!checkResult.canMigrate) {
    printError(`Cannot migrate: ${checkResult.reason}`);
    process.exit(1);
  }

  printSuccess("Pool is ready for migration!");
  printInfo("Migrating pool to DAMM V2...");

  // Migrate to DAMM V2
  const result = await migrateToDAMMV2(sdk, {
    tokenAddress,
    payer: wallet.publicKey,
  });

  printInfo(`Pool address: ${result.poolAddress}`);

  // Handle transaction
  // Migration requires three signatures: wallet, firstPositionNftKeypair, secondPositionNftKeypair
  const txResult = await handleTransaction(
    sdk,
    result.transaction,
    [wallet, result.firstPositionNftKeypair, result.secondPositionNftKeypair],
    options.exportTx || false
  );

  // Output result
  if (options.json) {
    const output = {
      poolAddress: result.poolAddress,
      ...(txResult.signature && { signature: txResult.signature }),
      ...(txResult.base64 && { transaction: txResult.base64 }),
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(`\nPool Address: ${result.poolAddress}`);
    printTransactionResult(txResult, false);

    if (txResult.signature) {
      printSuccess("\nPool successfully migrated to DAMM V2!");
      printInfo("Pool is now a constant product AMM with full liquidity.");
    }
  }
}

/**
 * Handle migrate create-locker command
 * @param tokenAddress Token address
 * @param options Command options
 */
async function handleMigrateCreateLocker(
  tokenAddress: string,
  options: Omit<MigrateCreateLockerOptions, "tokenAddress">
): Promise<void> {
  // Load wallet
  const wallet = await loadWallet(options.wallet);
  const rpcUrl = getRpcUrl(options.rpcUrl);

  printInfo(`Using RPC: ${rpcUrl}`);
  printInfo(`Wallet: ${wallet.publicKey.toBase58()}`);

  // Validate address
  validatePublicKey(tokenAddress);

  // Initialize SDK
  const sdk = new NaraSDK({
    rpcUrl,
    commitment: "confirmed",
  });

  printInfo("Creating locker for pool with vesting parameters...");

  // Create locker
  const result = await createLocker(sdk, {
    tokenAddress,
    payer: wallet.publicKey,
  });

  printInfo(`Pool address: ${result.poolAddress}`);

  // Handle transaction
  const txResult = await handleTransaction(
    sdk,
    result.transaction,
    [wallet],
    options.exportTx || false
  );

  // Output result
  if (options.json) {
    const output = {
      poolAddress: result.poolAddress,
      ...(txResult.signature && { signature: txResult.signature }),
      ...(txResult.base64 && { transaction: txResult.base64 }),
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(`\nPool Address: ${result.poolAddress}`);
    printTransactionResult(txResult, false);

    if (txResult.signature) {
      printSuccess("\nLocker created successfully!");
      printInfo("You can now proceed with migrating the pool.");
    }
  }
}

/**
 * Handle migrate check command
 * @param tokenAddress Token address
 * @param options Command options
 */
async function handleMigrateCheck(
  tokenAddress: string,
  options: Omit<MigrateCheckOptions, "tokenAddress">
): Promise<void> {
  const rpcUrl = getRpcUrl(options.rpcUrl);

  printInfo(`Using RPC: ${rpcUrl}`);

  // Validate address
  validatePublicKey(tokenAddress);

  // Initialize SDK
  const sdk = new NaraSDK({
    rpcUrl,
    commitment: "confirmed",
  });

  printInfo("Checking migration status...");

  // Check if can migrate
  const result = await canMigrate(sdk, tokenAddress);

  // Output result
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`\nMigration Status:`);
    console.log(`  Can Migrate: ${result.canMigrate ? "Yes" : "No"}`);
    console.log(`  Progress: ${(result.progress * 100).toFixed(2)}%`);
    if (result.reason) {
      console.log(`  Reason: ${result.reason}`);
    }

    if (result.canMigrate) {
      printSuccess("\nPool is ready for migration!");
      printInfo("Run: nara-cli migrate launch <token-address>");
    } else {
      printWarning("\nPool is not ready for migration yet.");
      if (result.progress < 1.0) {
        printInfo(`Curve completion required: 100% (current: ${(result.progress * 100).toFixed(2)}%)`);
      }
    }
  }
}
