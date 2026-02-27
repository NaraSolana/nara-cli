/**
 * Example: Create a DBC Configuration
 *
 * This example demonstrates how to create a Dynamic Bonding Curve configuration.
 * The config defines the curve parameters for token pools.
 *
 * Run: npx tsx examples/1-create-config.ts
 */

import { NaraSDK, createConfig, Keypair } from "../index";
import { getRpcUrl } from "./utils";
import { sendAndConfirmTransaction } from "@solana/web3.js";
import bs58 from "bs58";

async function main() {
  // Load environment variables
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("PRIVATE_KEY environment variable is required");
  }

  // Load wallet
  const wallet = privateKey.startsWith("[")
    ? Keypair.fromSecretKey(new Uint8Array(JSON.parse(privateKey)))
    : Keypair.fromSecretKey(bs58.decode(privateKey));

  console.log("Wallet:", wallet.publicKey.toBase58());

  // Initialize SDK
  const sdk = new NaraSDK({
    rpcUrl: getRpcUrl(),
    commitment: "confirmed",
  });

  console.log("\n📝 Creating DBC configuration...\n");

  // Create config
  const result = await createConfig(sdk, {
    feeClaimer: wallet.publicKey,
    leftoverReceiver: wallet.publicKey,
    payer: wallet.publicKey,
    totalTokenSupply: 1_000_000_000, // 1 billion tokens
    initialMarketCap: 30, // $30 initial market cap
    migrationMarketCap: 540, // $540 migration threshold
  });

  console.log("✅ Config transaction prepared");
  console.log("Config Address:", result.configAddress);

  // Sign and send transaction
  console.log("\n📤 Signing and sending transaction...");
  const signature = await sendAndConfirmTransaction(
    sdk.getConnection(),
    result.transaction,
    [wallet, result.configKeypair],
    { commitment: "confirmed", skipPreflight: true }
  );

  console.log("\n✅ Config created successfully!");
  console.log("Config Address:", result.configAddress);
  console.log("Transaction:", signature);
  console.log(
    `View on Solscan: https://solscan.io/tx/${signature}?cluster=devnet`
  );

  // Save config address for later use
  console.log("\n💡 Save this config address to use in the next example:");
  console.log(`export CONFIG_ADDRESS="${result.configAddress}"`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
