/**
 * Example: Get Swap Quote
 *
 * This example demonstrates how to get a price quote for buying or selling tokens.
 * This is useful for showing users the expected output before they execute a trade.
 *
 * Prerequisites:
 * - Run example 2 first to create a pool
 * - Set TOKEN_ADDRESS environment variable
 *
 * Run: npx tsx examples/3-get-quote.ts
 */

import { NaraSDK, getSwapQuote, BN } from "../index";
import { getRpcUrl } from "./utils";

async function main() {
  // Load environment variables
  const tokenAddress = process.env.TOKEN_ADDRESS;

  if (!tokenAddress) {
    throw new Error(
      "TOKEN_ADDRESS environment variable is required. Run example 2 first."
    );
  }

  // Initialize SDK
  const sdk = new NaraSDK({
    rpcUrl: getRpcUrl(),
    commitment: "confirmed",
  });

  console.log("Token Address:", tokenAddress);
  console.log("\n💱 Getting swap quotes...\n");

  // Get buy quote (SOL -> Token)
  const buyAmountSOL = 0.1; // 0.1 SOL
  const buyAmountLamports = new BN(buyAmountSOL * 1e9);

  console.log("--- Buy Quote ---");
  console.log(`Input: ${buyAmountSOL} SOL`);

  const buyQuote = await getSwapQuote(
    sdk,
    tokenAddress,
    buyAmountLamports,
    false, // false = buy (SOL -> Token)
    100 // 1% slippage
  );

  console.log("Expected Output:", buyQuote.outputAmount, "tokens (smallest unit)");
  console.log("Minimum Output:", buyQuote.minimumAmountOut, "tokens (smallest unit)");
  console.log("Trading Fee:", (parseInt(buyQuote.tradingFee) / 1e9).toFixed(6), "SOL");
  console.log("Protocol Fee:", (parseInt(buyQuote.protocolFee) / 1e9).toFixed(6), "SOL");

  // Convert to human-readable (assuming 6 decimals)
  const expectedTokens = parseInt(buyQuote.outputAmount) / 1e6;
  const minimumTokens = parseInt(buyQuote.minimumAmountOut) / 1e6;
  console.log(`\nHuman-readable: ${expectedTokens.toFixed(2)} tokens (min: ${minimumTokens.toFixed(2)})`);

  console.log("\n--- Sell Quote ---");
  const sellAmountTokens = 1000; // 1000 tokens
  const sellAmountSmallest = new BN(sellAmountTokens * 1e6); // Assuming 6 decimals

  console.log(`Input: ${sellAmountTokens} tokens`);

  const sellQuote = await getSwapQuote(
    sdk,
    tokenAddress,
    sellAmountSmallest,
    true, // true = sell (Token -> SOL)
    100 // 1% slippage
  );

  console.log("Expected Output:", sellQuote.outputAmount, "lamports");
  console.log("Minimum Output:", sellQuote.minimumAmountOut, "lamports");
  console.log("Trading Fee:", sellQuote.tradingFee, "lamports");
  console.log("Protocol Fee:", sellQuote.protocolFee, "lamports");

  // Convert to human-readable SOL
  const expectedSOL = parseInt(sellQuote.outputAmount) / 1e9;
  const minimumSOL = parseInt(sellQuote.minimumAmountOut) / 1e9;
  console.log(`\nHuman-readable: ${expectedSOL.toFixed(6)} SOL (min: ${minimumSOL.toFixed(6)})`);

  console.log("\n✅ Quotes retrieved successfully!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
