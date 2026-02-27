/**
 * Example: Using Address Lookup Tables (ALT)
 *
 * This example demonstrates how to use Address Lookup Tables to compress transaction size
 *
 * Run: bun examples/example-with-alt.ts
 */

import { NaraDBC, buyToken, Keypair } from "../index";
import { getRpcUrl } from "./utils";
import {
  sendAndConfirmTransaction,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  const tokenAddress = process.env.TOKEN_ADDRESS;
  const altAddress = process.env.ALT_ADDRESS; // Address Lookup Table address

  if (!privateKey) {
    throw new Error("PRIVATE_KEY environment variable is required");
  }
  if (!tokenAddress) {
    throw new Error("TOKEN_ADDRESS environment variable is required");
  }

  const wallet = privateKey.startsWith("[")
    ? Keypair.fromSecretKey(new Uint8Array(JSON.parse(privateKey)))
    : Keypair.fromSecretKey(bs58.decode(privateKey));

  console.log("Wallet:", wallet.publicKey.toBase58());
  console.log("Token:", tokenAddress);

  // Initialize SDK with ALT configuration
  const sdk = new NaraDBC({
    rpcUrl: getRpcUrl(),
    commitment: "confirmed",
    addressLookupTableAddresses: altAddress ? [altAddress] : [], // Optional: configure ALT address
  });

  const altAddresses = sdk.getAddressLookupTableAddresses();
  console.log(
    "Address Lookup Tables:",
    altAddresses.length > 0
      ? altAddresses.map((a) => a.toBase58()).join(", ")
      : "Not configured"
  );

  console.log("\n💰 Buying tokens...\n");

  try {
    // Create buy transaction
    const result = await buyToken(sdk, {
      tokenAddress,
      amountInSOL: 0.1,
      owner: wallet.publicKey,
      slippageBps: 100,
    });

    console.log("✅ Transaction prepared");

    // Note: Starting from v1.x, all transaction functions automatically compile with ALT
    // If SDK is configured with ALT, result.transaction will automatically be a VersionedTransaction
    // No need to manually call compileTransactionWithALT()

    if (result.transaction instanceof VersionedTransaction) {
      console.log("🔧 Using Address Lookup Table to compress transaction");

      // Sign VersionedTransaction
      result.transaction.sign([wallet]);

      // Send VersionedTransaction
      const signature = await sdk
        .getConnection()
        .sendTransaction(result.transaction, {
          maxRetries: 3,
        });

      // Confirm transaction
      await sdk.getConnection().confirmTransaction(signature, "confirmed");

      console.log("\n✅ Transaction successful!");
      console.log("Transaction:", signature);
    } else {
      // Not using ALT, using regular transaction
      console.log("📦 Using regular transaction (ALT not configured)");

      const signature = await sendAndConfirmTransaction(
        sdk.getConnection(),
        result.transaction,
        [wallet],
        { commitment: "confirmed", skipPreflight: true }
      );

      console.log("\n✅ Transaction successful!");
      console.log("Transaction:", signature);
    }
  } catch (err: any) {
    console.error("\n❌ Failed:", err.message || err);
    if (err.logs) {
      console.error("\nLogs:");
      err.logs.forEach((log: string) => console.error(log));
    }
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
