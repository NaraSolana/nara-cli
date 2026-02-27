/**
 * Example: Buy Tokens
 *
 * This example demonstrates how to buy tokens with SOL.
 *
 * Prerequisites:
 * - Run example 2 first to create a pool
 * - Set TOKEN_ADDRESS environment variable
 *
 * Run: bun examples/4-buy-token.ts
 */

import { NaraDBC, buyToken, Keypair } from "../index";
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
  const sdk = new NaraDBC({
    rpcUrl: getRpcUrl(),
    commitment: "confirmed",
  });

  // Buy amount
  const amountInSOL = 0.1; // Buy with 0.1 SOL
  console.log(`\n💰 Buying tokens with ${amountInSOL} SOL...\n`);

  // Create buy transaction
  const result = await buyToken(sdk, {
    tokenAddress,
    amountInSOL,
    owner: wallet.publicKey,
    slippageBps: 100, // 1% slippage
  });

  console.log("✅ Buy transaction prepared");
  console.log("Input:", (parseInt(result.amountIn) / 1e9).toFixed(4), "SOL");
  console.log("Expected Output:", result.expectedAmountOut, "tokens (smallest unit)");
  console.log("Minimum Output:", result.minimumAmountOut, "tokens (smallest unit)");

  // Convert to human-readable (assuming 6 decimals)
  const expectedTokens = parseInt(result.expectedAmountOut) / 1e6;
  const minimumTokens = parseInt(result.minimumAmountOut) / 1e6;
  console.log(`\nYou will receive: ~${expectedTokens.toFixed(2)} tokens (min: ${minimumTokens.toFixed(2)})`);

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

  console.log("\n✅ Tokens purchased successfully!");
  console.log("Transaction:", signature);
  console.log(
    `View on Solscan: https://solscan.io/tx/${signature}?cluster=devnet`
  );
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
