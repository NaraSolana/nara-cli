/**
 * Swap commands
 */

import { Command } from "commander";
import BN from "bn.js";
import { NaraSDK } from "../../client";
import { buyToken, sellToken, getSwapQuote, SwapMode } from "../../swap";
import { loadWallet, getRpcUrl } from "../utils/wallet";
import {
  validatePublicKey,
  validatePositiveNumber,
  validateNonNegativeNumber,
  validateSwapMode,
  validateDirection,
} from "../utils/validation";
import {
  handleTransaction,
  printTransactionResult,
} from "../utils/transaction";
import { formatOutput, printError, printInfo } from "../utils/output";
import type {
  SwapBuyOptions,
  SwapSellOptions,
  SwapQuoteOptions,
} from "../types";

/**
 * Register swap commands
 * @param program Commander program
 */
export function registerSwapCommands(program: Command): void {
  const swap = program.command("swap").description("Token swap commands");

  // swap buy
  swap
    .command("buy <token-address> <amount>")
    .description("Buy tokens with NSO")
    .option("--slippage <number>", "Slippage in basis points", "100")
    .option(
      "--mode <mode>",
      "Swap mode: exact-in|partial-fill|exact-out",
      "partial-fill"
    )
    .option("-e, --export-tx", "Export unsigned transaction", false)
    .action(
      async (
        tokenAddress: string,
        amount: string,
        options: Omit<SwapBuyOptions, "tokenAddress" | "amount">
      ) => {
        try {
          await handleSwapBuy(tokenAddress, amount, options);
        } catch (error: any) {
          printError(error.message);
          process.exit(1);
        }
      }
    );

  // swap sell
  swap
    .command("sell <token-address> <amount>")
    .description("Sell tokens for NSO")
    .option("--decimals <number>", "Token decimals", "6")
    .option("--slippage <number>", "Slippage in basis points", "100")
    .option(
      "--mode <mode>",
      "Swap mode: exact-in|partial-fill|exact-out",
      "partial-fill"
    )
    .option("-e, --export-tx", "Export unsigned transaction", false)
    .action(
      async (
        tokenAddress: string,
        amount: string,
        options: Omit<SwapSellOptions, "tokenAddress" | "amount">
      ) => {
        try {
          await handleSwapSell(tokenAddress, amount, options);
        } catch (error: any) {
          printError(error.message);
          process.exit(1);
        }
      }
    );

  // swap quote
  swap
    .command("quote <token-address> <amount> <direction>")
    .description("Get swap quote (direction: buy|sell)")
    .option("--decimals <number>", "Token decimals (for sell only)", "6")
    .option("--slippage <number>", "Slippage in basis points", "100")
    .action(
      async (
        tokenAddress: string,
        amount: string,
        direction: string,
        options: Omit<SwapQuoteOptions, "tokenAddress" | "amount" | "direction">
      ) => {
        try {
          await handleSwapQuote(tokenAddress, amount, direction, options);
        } catch (error: any) {
          printError(error.message);
          process.exit(1);
        }
      }
    );
}

/**
 * Convert swap mode string to enum
 * @param mode Mode string
 * @returns SwapMode enum value
 */
function parseSwapMode(mode: string): SwapMode {
  const normalized = validateSwapMode(mode);
  switch (normalized) {
    case "exact-in":
      return SwapMode.ExactIn;
    case "partial-fill":
      return SwapMode.PartialFill;
    case "exact-out":
      return SwapMode.ExactOut;
    default:
      return SwapMode.PartialFill;
  }
}

/**
 * Handle swap buy command
 * @param tokenAddress Token address
 * @param amount Amount in SOL
 * @param options Command options
 */
async function handleSwapBuy(
  tokenAddress: string,
  amount: string,
  options: Omit<SwapBuyOptions, "tokenAddress" | "amount">
): Promise<void> {
  // Load wallet
  const wallet = await loadWallet(options.wallet);
  const rpcUrl = getRpcUrl(options.rpcUrl);

  printInfo(`Using RPC: ${rpcUrl}`);
  printInfo(`Wallet: ${wallet.publicKey.toBase58()}`);

  // Validate inputs
  validatePublicKey(tokenAddress);
  const amountInSOL = validatePositiveNumber(amount, "amount");
  const slippage = validateNonNegativeNumber(
    options.slippage || "100",
    "slippage"
  );
  const swapMode = parseSwapMode(options.mode || "partial-fill");

  // Initialize SDK
  const sdk = new NaraSDK({
    rpcUrl,
    commitment: "confirmed",
  });

  printInfo(`Buying tokens with ${amountInSOL} NSO...`);

  // Buy tokens
  const result = await buyToken(sdk, {
    tokenAddress,
    amountInSOL,
    owner: wallet.publicKey,
    slippageBps: slippage,
    swapMode,
  });

  printInfo(`Expected output: ${result.expectedAmountOut} tokens (smallest unit)`);
  printInfo(`Minimum output: ${result.minimumAmountOut} tokens (smallest unit)`);

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
      amountIn: result.amountIn,
      expectedAmountOut: result.expectedAmountOut,
      minimumAmountOut: result.minimumAmountOut,
      ...(txResult.signature && { signature: txResult.signature }),
      ...(txResult.base64 && { transaction: txResult.base64 }),
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(`\nSwap Details:`);
    console.log(`  Input: ${(parseInt(result.amountIn) / 1e9).toFixed(4)} NSO`);
    console.log(`  Expected Output: ${result.expectedAmountOut} tokens`);
    console.log(`  Minimum Output: ${result.minimumAmountOut} tokens`);
    printTransactionResult(txResult, false);
  }
}

/**
 * Handle swap sell command
 * @param tokenAddress Token address
 * @param amount Amount in tokens
 * @param options Command options
 */
async function handleSwapSell(
  tokenAddress: string,
  amount: string,
  options: Omit<SwapSellOptions, "tokenAddress" | "amount">
): Promise<void> {
  // Load wallet
  const wallet = await loadWallet(options.wallet);
  const rpcUrl = getRpcUrl(options.rpcUrl);

  printInfo(`Using RPC: ${rpcUrl}`);
  printInfo(`Wallet: ${wallet.publicKey.toBase58()}`);

  // Validate inputs
  validatePublicKey(tokenAddress);
  const amountInToken = validatePositiveNumber(amount, "amount");
  const decimals = parseInt(String(options.decimals || "6"));
  const slippage = validateNonNegativeNumber(
    options.slippage || "100",
    "slippage"
  );
  const swapMode = parseSwapMode(options.mode || "partial-fill");

  // Initialize SDK
  const sdk = new NaraSDK({
    rpcUrl,
    commitment: "confirmed",
  });

  printInfo(`Selling ${amountInToken} tokens...`);

  // Sell tokens
  const result = await sellToken(sdk, {
    tokenAddress,
    amountInToken,
    owner: wallet.publicKey,
    tokenDecimals: decimals,
    slippageBps: slippage,
    swapMode,
  });

  printInfo(`Expected output: ${(parseInt(result.expectedAmountOut) / 1e9).toFixed(4)} NSO`);
  printInfo(`Minimum output: ${(parseInt(result.minimumAmountOut) / 1e9).toFixed(4)} NSO`);

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
      amountIn: result.amountIn,
      expectedAmountOut: result.expectedAmountOut,
      minimumAmountOut: result.minimumAmountOut,
      ...(txResult.signature && { signature: txResult.signature }),
      ...(txResult.base64 && { transaction: txResult.base64 }),
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(`\nSwap Details:`);
    console.log(`  Input: ${result.amountIn} tokens`);
    console.log(`  Expected Output: ${(parseInt(result.expectedAmountOut) / 1e9).toFixed(4)} NSO`);
    console.log(`  Minimum Output: ${(parseInt(result.minimumAmountOut) / 1e9).toFixed(4)} NSO`);
    printTransactionResult(txResult, false);
  }
}

/**
 * Handle swap quote command
 * @param tokenAddress Token address
 * @param amount Amount
 * @param direction Direction (buy or sell)
 * @param options Command options
 */
async function handleSwapQuote(
  tokenAddress: string,
  amount: string,
  direction: string,
  options: Omit<SwapQuoteOptions, "tokenAddress" | "amount" | "direction">
): Promise<void> {
  const rpcUrl = getRpcUrl(options.rpcUrl);

  printInfo(`Using RPC: ${rpcUrl}`);

  // Validate inputs
  validatePublicKey(tokenAddress);
  const amountNum = validatePositiveNumber(amount, "amount");
  const dir = validateDirection(direction);
  const decimals = parseInt(String(options.decimals || "6"));
  const slippage = validateNonNegativeNumber(
    options.slippage || "100",
    "slippage"
  );

  // Initialize SDK
  const sdk = new NaraSDK({
    rpcUrl,
    commitment: "confirmed",
  });

  // Prepare parameters based on direction
  const swapBaseForQuote = dir === "sell";
  const amountIn = swapBaseForQuote
    ? new BN(amountNum * 10 ** decimals) // Tokens to smallest unit
    : new BN(amountNum * 1e9); // SOL to lamports

  printInfo(`Getting ${dir} quote for ${amountNum} ${swapBaseForQuote ? "tokens" : "NSO"}...`);

  // Get quote
  const quote = await getSwapQuote(
    sdk,
    tokenAddress,
    amountIn,
    swapBaseForQuote,
    slippage
  );

  // Output result
  if (options.json) {
    console.log(JSON.stringify(quote, null, 2));
  } else {
    console.log(`\nQuote:`);
    if (swapBaseForQuote) {
      // Selling tokens for SOL
      console.log(`  Input: ${(parseInt(quote.amountIn) / 10 ** decimals).toFixed(4)} tokens`);
      console.log(`  Expected Output: ${(parseInt(quote.outputAmount) / 1e9).toFixed(4)} NSO`);
      console.log(`  Minimum Output: ${(parseInt(quote.minimumAmountOut) / 1e9).toFixed(4)} NSO`);
    } else {
      // Buying tokens with NSO
      console.log(`  Input: ${(parseInt(quote.amountIn) / 1e9).toFixed(4)} NSO`);
      console.log(`  Expected Output: ${quote.outputAmount} tokens (smallest unit)`);
      console.log(`  Minimum Output: ${quote.minimumAmountOut} tokens (smallest unit)`);
    }
    console.log(`  Trading Fee: ${quote.tradingFee}`);
    console.log(`  Protocol Fee: ${quote.protocolFee}`);
  }
}
