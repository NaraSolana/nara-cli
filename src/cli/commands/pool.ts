/**
 * Pool commands
 */

import { Command } from "commander";
import { NaraSDK } from "../../client";
import { DEFAULT_DBC_CONFIG_ADDRESS } from "../../constants";
import {
  createPool,
  createPoolWithFirstBuy,
  getPoolInfo,
  getPoolProgress,
} from "../../pool";
import { loadWallet, getRpcUrl } from "../utils/wallet";
import {
  validatePublicKey,
  validateRequired,
  validatePositiveNumber,
  validateNonNegativeNumber,
} from "../utils/validation";
import {
  handleTransaction,
  printTransactionResult,
} from "../utils/transaction";
import { formatOutput, printError, printInfo } from "../utils/output";
import type {
  PoolCreateOptions,
  PoolCreateWithBuyOptions,
  PoolInfoOptions,
} from "../types";

/**
 * Register pool commands
 * @param program Commander program
 */
export function registerPoolCommands(program: Command): void {
  const pool = program.command("pool").description("Pool management commands");

  // pool create
  pool
    .command("create")
    .description("Create a new token pool")
    .requiredOption("-n, --name <string>", "Token name")
    .requiredOption("-s, --symbol <string>", "Token symbol")
    .requiredOption("-u, --uri <string>", "Metadata URI")
    .requiredOption(
      "--dbc-config <address>",
      "DBC config address (or set DBC_CONFIG_ADDRESS env)"
    )
    .option("--creator <address>", "Pool creator address")
    .option("-e, --export-tx", "Export unsigned transaction", false)
    .action(async (options: PoolCreateOptions) => {
      try {
        await handlePoolCreate(options);
      } catch (error: any) {
        printError(error.message);
        process.exit(1);
      }
    });

  // pool create-with-buy
  pool
    .command("create-with-buy")
    .description("Create a new token pool with initial buy")
    .requiredOption("-n, --name <string>", "Token name")
    .requiredOption("-s, --symbol <string>", "Token symbol")
    .requiredOption("-u, --uri <string>", "Metadata URI")
    .requiredOption(
      "--dbc-config <address>",
      "DBC config address (or set DBC_CONFIG_ADDRESS env)"
    )
    .requiredOption("--amount <number>", "Initial buy amount in NSO")
    .option("--creator <address>", "Pool creator address")
    .option("--buyer <address>", "Buyer address")
    .option("--receiver <address>", "Token receiver address")
    .option("--slippage <number>", "Slippage in basis points", "100")
    .option("-e, --export-tx", "Export unsigned transaction", false)
    .action(async (options: PoolCreateWithBuyOptions) => {
      try {
        await handlePoolCreateWithBuy(options);
      } catch (error: any) {
        printError(error.message);
        process.exit(1);
      }
    });

  // pool info
  pool
    .command("info <token-address>")
    .description("Get pool information")
    .action(async (tokenAddress: string, options: PoolInfoOptions) => {
      try {
        await handlePoolInfo(tokenAddress, options);
      } catch (error: any) {
        printError(error.message);
        process.exit(1);
      }
    });

  // pool progress
  pool
    .command("progress <token-address>")
    .description("Get bonding curve progress")
    .action(async (tokenAddress: string, options: PoolInfoOptions) => {
      try {
        await handlePoolProgress(tokenAddress, options);
      } catch (error: any) {
        printError(error.message);
        process.exit(1);
      }
    });
}

/**
 * Handle pool create command
 * @param options Command options
 */
async function handlePoolCreate(options: PoolCreateOptions): Promise<void> {
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

  // Get config address from option or env
  const configAddress =
    options.dbcConfig || DEFAULT_DBC_CONFIG_ADDRESS;
  if (!configAddress) {
    throw new Error(
      "DBC config address is required. Use --dbc-config flag or set DBC_CONFIG_ADDRESS environment variable."
    );
  }

  // Parse addresses
  const configPubkey = validatePublicKey(configAddress);
  const creator = options.creator
    ? validatePublicKey(options.creator)
    : wallet.publicKey;

  printInfo("Creating token pool...");

  // Create pool
  const result = await createPool(sdk, {
    name: options.name,
    symbol: options.symbol,
    uri: options.uri,
    configAddress,
    payer: wallet.publicKey,
    poolCreator: creator,
  });

  printInfo(`Pool address: ${result.poolAddress}`);
  printInfo(`Token address: ${result.baseMint}`);

  // Handle transaction
  const txResult = await handleTransaction(
    sdk,
    result.transaction,
    [wallet, result.baseMintKeypair], // Both wallet and baseMint keypair need to sign
    options.exportTx || false
  );

  // Output result
  if (options.json) {
    const output = {
      poolAddress: result.poolAddress,
      tokenAddress: result.baseMint,
      ...(txResult.signature && { signature: txResult.signature }),
      ...(txResult.base64 && { transaction: txResult.base64 }),
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(`\nPool Address: ${result.poolAddress}`);
    console.log(`Token Address: ${result.baseMint}`);
    printTransactionResult(txResult, false);

    if (txResult.signature) {
      printInfo("\nSave this token address for buying/selling:");
      console.log(`export TOKEN_ADDRESS="${result.baseMint}"`);
    }
  }
}

/**
 * Handle pool create-with-buy command
 * @param options Command options
 */
async function handlePoolCreateWithBuy(
  options: PoolCreateWithBuyOptions
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

  // Get config address from option or env
  const configAddress =
    options.dbcConfig || DEFAULT_DBC_CONFIG_ADDRESS;
  if (!configAddress) {
    throw new Error(
      "DBC config address is required. Use --dbc-config flag or set DBC_CONFIG_ADDRESS environment variable."
    );
  }

  // Parse addresses
  const configPubkey = validatePublicKey(configAddress);
  const creator = options.creator
    ? validatePublicKey(options.creator)
    : wallet.publicKey;
  const buyer = options.buyer
    ? validatePublicKey(options.buyer)
    : wallet.publicKey;
  const receiver = options.receiver
    ? validatePublicKey(options.receiver)
    : buyer;

  // Parse numbers
  const amount = validatePositiveNumber(options.amount, "amount");
  const slippage = validateNonNegativeNumber(
    options.slippage || "100",
    "slippage"
  );

  printInfo("Creating token pool with initial buy...");
  printInfo(`Initial buy amount: ${amount} NSO`);

  // Create pool with first buy
  const result = await createPoolWithFirstBuy(sdk, {
    name: options.name,
    symbol: options.symbol,
    uri: options.uri,
    configAddress,
    payer: wallet.publicKey,
    poolCreator: creator,
    initialBuyAmountSOL: amount,
    buyer,
    receiver,
    slippageBps: slippage,
  });

  printInfo(`Pool address: ${result.poolAddress}`);
  printInfo(`Token address: ${result.baseMint}`);

  // Handle transaction
  const txResult = await handleTransaction(
    sdk,
    result.createPoolTx,
    [wallet, result.baseMintKeypair], // Both wallet and baseMint keypair need to sign
    options.exportTx || false
  );

  // Output result
  if (options.json) {
    const output = {
      poolAddress: result.poolAddress,
      tokenAddress: result.baseMint,
      buyInfo: result.buyInfo,
      ...(txResult.signature && { signature: txResult.signature }),
      ...(txResult.base64 && { transaction: txResult.base64 }),
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(`\nPool Address: ${result.poolAddress}`);
    console.log(`Token Address: ${result.baseMint}`);
    console.log(`\nBuy Info:`);
    console.log(`  Amount In: ${(parseInt(result.buyInfo.amountIn) / 1e9).toFixed(4)} NSO`);
    console.log(`  Minimum Out: ${result.buyInfo.minimumAmountOut} tokens (smallest unit)`);
    printTransactionResult(txResult, false);

    if (txResult.signature) {
      printInfo("\nSave this token address for buying/selling:");
      console.log(`export TOKEN_ADDRESS="${result.baseMint}"`);
    }
  }
}

/**
 * Handle pool info command
 * @param tokenAddress Token address
 * @param options Command options
 */
async function handlePoolInfo(
  tokenAddress: string,
  options: PoolInfoOptions
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

  printInfo("Fetching pool information...");

  // Get pool info
  const poolInfo = await getPoolInfo(sdk, tokenAddress);

  // Output result
  formatOutput(poolInfo, options.json || false);
}

/**
 * Handle pool progress command
 * @param tokenAddress Token address
 * @param options Command options
 */
async function handlePoolProgress(
  tokenAddress: string,
  options: PoolInfoOptions
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

  printInfo("Fetching bonding curve progress...");

  // Get pool progress
  const progress = await getPoolProgress(sdk, tokenAddress);

  // Format progress as percentage for human-readable output
  const output = {
    progress: `${(progress.progress * 100).toFixed(2)}%`,
    progressRaw: progress.progress,
    quoteReserve: progress.quoteReserve,
    isMigrated: progress.isMigrated,
  };

  // Output result
  if (options.json) {
    console.log(JSON.stringify(progress, null, 2));
  } else {
    formatOutput(output, false);
  }
}
