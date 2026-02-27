/**
 * Example: Migrate Pool to DAMM V2 (Launch/Graduate)
 *
 * This example demonstrates how to migrate a token pool to DAMM V2
 * after the bonding curve is complete (reached 100%).
 *
 * Prerequisites:
 * - Token pool must exist (run example 2 first)
 * - Bonding curve must be at 100% (buy enough tokens to fill the curve)
 * - Set TOKEN_ADDRESS environment variable
 *
 * Note: DAMM config address is automatically determined from pool configuration
 *
 * Run: npx tsx examples/7-migrate-to-damm.ts
 */

import { NaraSDK, migrateToDAMMV2, canMigrate, Keypair } from "../index";
import { getRpcUrl, sendAndConfirm } from "./utils";
import bs58 from "bs58";

async function main() {
  // Load environment variables
  const privateKey = process.env.PRIVATE_KEY;
  const tokenAddress = process.env.TOKEN_ADDRESS;

  if (!privateKey) {
    throw new Error("PRIVATE_KEY environment variable is required");
  }
  if (!tokenAddress) {
    throw new Error(
      "TOKEN_ADDRESS environment variable is required. Run example 2 first."
    );
  }

  // Load wallet
  const wallet = privateKey.startsWith("[")
    ? Keypair.fromSecretKey(new Uint8Array(JSON.parse(privateKey)))
    : Keypair.fromSecretKey(bs58.decode(privateKey));

  console.log("Wallet:", wallet.publicKey.toBase58());
  console.log("Token:", tokenAddress);

  // Initialize SDK
  const sdk = new NaraSDK({
    rpcUrl: getRpcUrl(),
    commitment: "confirmed",
  });

  // Check if pool can be migrated
  console.log("\n🔍 Checking migration eligibility...\n");
  const eligibility = await canMigrate(sdk, tokenAddress);

  console.log("Can Migrate:", eligibility.canMigrate);
  console.log("Progress:", (eligibility.progress * 100).toFixed(2) + "%");
  if (eligibility.reason) {
    console.log("Reason:", eligibility.reason);
  }

  if (!eligibility.canMigrate) {
    console.log(
      "\n❌ Pool cannot be migrated yet. Make sure the bonding curve is at 100%."
    );
    process.exit(1);
  }

  // Migrate to DAMM V2
  console.log("\n🚀 Migrating pool to DAMM V2...\n");

  try {
    const result = await migrateToDAMMV2(sdk, {
      tokenAddress,
      payer: wallet.publicKey,
    });

    console.log("✅ Migration transaction prepared");
    console.log("Pool Address:", result.poolAddress);
    console.log(
      "First Position NFT:",
      result.firstPositionNftKeypair.publicKey.toBase58()
    );
    console.log(
      "Second Position NFT:",
      result.secondPositionNftKeypair.publicKey.toBase58()
    );

    // Sign and send migration transaction
    console.log("\n📤 Signing and sending migration transaction...");
    const signature = await sendAndConfirm(
      sdk.getConnection(),
      result.transaction,
      [wallet, result.firstPositionNftKeypair, result.secondPositionNftKeypair]
    );

    console.log("\n🎉 Pool successfully migrated to DAMM V2!");
    console.log("Pool Address:", result.poolAddress);
    console.log("Transaction:", signature);
    console.log(
      `View on Solscan: https://solscan.io/tx/${signature}?cluster=devnet`
    );

    console.log("\n💡 Your token has graduated to DAMM V2!");
    console.log(
      "The token can now be traded on the full AMM with deeper liquidity."
    );
  } catch (err: any) {
    if (err.message?.includes("Locker needs to be created")) {
      console.log(
        "\n⚠️  This pool has locked vesting parameters. Creating locker first...\n"
      );
      // Note: In a real implementation, you would handle locker creation here
      // For now, we just inform the user
      console.log(
        "Please create a locker first using the createLocker function,"
      );
      console.log("then run this migration again.");
      process.exit(1);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
