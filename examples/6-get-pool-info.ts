/**
 * Example: Get Pool Information
 *
 * This example demonstrates how to query pool information and curve progress.
 *
 * Prerequisites:
 * - Run example 2 first to create a pool
 * - Set TOKEN_ADDRESS environment variable
 *
 * Run: npx tsx examples/6-get-pool-info.ts
 */

import { NaraSDK, getPoolInfo, getPoolProgress } from "../index";
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
  console.log("\n📊 Fetching pool information...\n");

  // Get pool info
  const poolInfo = await getPoolInfo(sdk, tokenAddress);

  console.log("--- Pool Information ---");
  console.log("Pool Address:", poolInfo.poolAddress);
  console.log("Base Mint (Token):", poolInfo.baseMint?.toBase58());
  console.log("Config:", poolInfo.config?.toBase58());
  console.log("\nReserves:");
  console.log("  Base Reserve:", poolInfo.baseReserve?.toString());
  console.log("  Quote Reserve:", poolInfo.quoteReserve?.toString());
  console.log("\nState:");
  console.log("  Is Migrated:", poolInfo.isMigrated ?? false);
  console.log("  Creator:", poolInfo.creator?.toBase58());

  // Get curve progress
  console.log("\n--- Bonding Curve Progress ---");
  const progress = await getPoolProgress(sdk, tokenAddress);

  console.log("Progress:", (progress.progress * 100).toFixed(2) + "%");
  console.log("Quote Reserve:", progress.quoteReserve, "lamports");
  console.log(
    "Quote Reserve (SOL):",
    (parseInt(progress.quoteReserve) / 1e9).toFixed(6)
  );
  console.log("Is Migrated:", progress.isMigrated);

  if (progress.progress >= 1) {
    console.log("\n🎉 Pool has reached migration threshold!");
  } else {
    const remaining = (1 - progress.progress) * 100;
    console.log(`\n📈 ${remaining.toFixed(2)}% remaining until migration`);
  }

  console.log("\n✅ Pool information retrieved successfully!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
