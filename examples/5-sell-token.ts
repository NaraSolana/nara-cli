/**
 * Example: Sell Tokens
 *
 * This example demonstrates how to sell tokens for SOL.
 *
 * Prerequisites:
 * - Run example 2 first to create a pool
 * - Run example 4 to buy some tokens first
 * - Set TOKEN_ADDRESS environment variable
 *
 * Run: bun examples/5-sell-token.ts
 */

import { NaraSDK, sellToken, Keypair } from "../index";
import { getRpcUrl } from "./utils";
import {
  sendAndConfirmTransaction,
  VersionedTransaction,
} from "@solana/web3.js";
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

  // Sell amount
  const amountInToken = 100; // Sell 100 tokens
  console.log(`\n💰 Selling ${amountInToken} tokens...\n`);

  // Create sell transaction
  const result = await sellToken(sdk, {
    tokenAddress,
    amountInToken,
    owner: wallet.publicKey,
    tokenDecimals: 6, // Default token decimals
    slippageBps: 100, // 1% slippage
  });

  console.log("✅ Sell transaction prepared");
  console.log("Input:", (parseInt(result.amountIn) / 1e6).toFixed(2), "tokens");
  console.log("Expected Output:", result.expectedAmountOut, "lamports");
  console.log("Minimum Output:", result.minimumAmountOut, "lamports");

  // Convert to human-readable SOL
  const expectedSOL = parseInt(result.expectedAmountOut) / 1e9;
  const minimumSOL = parseInt(result.minimumAmountOut) / 1e9;
  console.log(`\nYou will receive: ~${expectedSOL.toFixed(6)} SOL (min: ${minimumSOL.toFixed(6)})`);

  // Sign and send transaction
  console.log("\n📤 Signing and sending transaction...");
  let signature: string;

  if (result.transaction instanceof VersionedTransaction) {
    // Handle VersionedTransaction (when ALT is configured)
    result.transaction.sign([wallet]);
    signature = await sdk.getConnection().sendTransaction(result.transaction);
    await sdk.getConnection().confirmTransaction(signature, "confirmed");
  } else {
    // Handle regular Transaction
    signature = await sendAndConfirmTransaction(
      sdk.getConnection(),
      result.transaction,
      [wallet],
      { commitment: "confirmed", skipPreflight: true }
    );
  }

  console.log("\n✅ Tokens sold successfully!");
  console.log("Transaction:", signature);
  console.log(
    `View on Solscan: https://solscan.io/tx/${signature}?cluster=devnet`
  );
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
