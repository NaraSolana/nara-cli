/**
 * Example: Create a Token Pool
 *
 * This example demonstrates two ways to create a token pool:
 * 1. With initial buy using createPoolWithFirstBuy()
 * 2. Without initial buy using createPool()
 *
 * Set INITIAL_BUY_AMOUNT environment variable to control behavior:
 * - If set (e.g., 0.01): Creates pool with initial buy
 * - If not set or 0: Creates pool without buy
 *
 * Prerequisites:
 * - Run example 1 first to create a config
 * - Set CONFIG_ADDRESS environment variable
 *
 * Run: bun examples/2-create-pool.ts
 */

import {
  NaraSDK,
  createPool,
  createPoolWithFirstBuy,
  Keypair,
} from "../index";
import { getRpcUrl } from "./utils";
import {
  sendAndConfirmTransaction,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";

async function main() {
  // Load environment variables
  const privateKey = process.env.PRIVATE_KEY;
  const configAddress = process.env.CONFIG_ADDRESS;
  const initialBuyAmount = parseFloat(process.env.INITIAL_BUY_AMOUNT || "0");

  if (!privateKey) {
    throw new Error("PRIVATE_KEY environment variable is required");
  }
  if (!configAddress) {
    throw new Error(
      "CONFIG_ADDRESS environment variable is required. Run example 1 first."
    );
  }

  // Load wallet
  const wallet = privateKey.startsWith("[")
    ? Keypair.fromSecretKey(new Uint8Array(JSON.parse(privateKey)))
    : Keypair.fromSecretKey(bs58.decode(privateKey));

  console.log("Wallet:", wallet.publicKey.toBase58());
  console.log("Config:", configAddress);

  // Initialize SDK
  const sdk = new NaraSDK({
    rpcUrl: getRpcUrl(),
    commitment: "confirmed",
  });

  // Choose method based on initial buy amount
  if (initialBuyAmount > 0) {
    console.log(
      `\n🎯 Method 1: Creating pool WITH initial buy (${initialBuyAmount} SOL)...\n`
    );
    await createPoolWithBuy(sdk, wallet, configAddress, initialBuyAmount);
  } else {
    console.log("\n🎯 Method 2: Creating pool WITHOUT initial buy...\n");
    await createPoolOnly(sdk, wallet, configAddress);
  }
}

/**
 * Method 1: Create pool with initial buy
 */
async function createPoolWithBuy(
  sdk: NaraSDK,
  wallet: Keypair,
  configAddress: string,
  initialBuyAmount: number
) {
  console.log("Using createPoolWithFirstBuy()...");

  // Create pool with first buy
  const result = await createPoolWithFirstBuy(sdk, {
    name: "Test Token With Buy",
    symbol: "TESTB",
    uri: "https://example.com/metadata.json",
    configAddress,
    payer: wallet.publicKey,
    poolCreator: wallet.publicKey,
    initialBuyAmountSOL: initialBuyAmount,
    slippageBps: 100, // 1% slippage
  });

  console.log("✅ Transaction prepared (combined)");
  console.log("Pool Address:", result.poolAddress);
  console.log("Token Address (baseMint):", result.baseMint);
  console.log(
    "Initial Buy:",
    (parseInt(result.buyInfo.amountIn) / 1e9).toFixed(4),
    "SOL"
  );

  // Sign and send combined transaction (create pool + initial buy)
  console.log("\n📤 Signing and sending transaction (create pool + initial buy)...");
  let signature: string;

  if (result.createPoolTx instanceof VersionedTransaction) {
    // Handle VersionedTransaction (when ALT is configured)
    result.createPoolTx.sign([wallet, result.baseMintKeypair]);
    signature = await sdk.getConnection().sendTransaction(result.createPoolTx);
    await sdk.getConnection().confirmTransaction(signature, "confirmed");
  } else {
    // Handle regular Transaction
    signature = await sendAndConfirmTransaction(
      sdk.getConnection(),
      result.createPoolTx,
      [wallet, result.baseMintKeypair],
      { commitment: "confirmed", skipPreflight: true }
    );
  }

  console.log("\n🎉 Pool created and initial buy completed in one transaction!");
  console.log("Pool Address:", result.poolAddress);
  console.log("Token Address:", result.baseMint);
  console.log("Transaction:", signature);
  console.log(
    `View on Solscan: https://solscan.io/tx/${signature}?cluster=devnet`
  );

  // Save token address for later use
  console.log("\n💡 Save this token address to use in the next examples:");
  console.log(`export TOKEN_ADDRESS="${result.baseMint}"`);
}

/**
 * Method 2: Create pool only (no initial buy)
 */
async function createPoolOnly(
  sdk: NaraSDK,
  wallet: Keypair,
  configAddress: string
) {
  console.log("Using createPool()...");

  // Create pool without buy
  const result = await createPool(sdk, {
    name: "Test Token No Buy",
    symbol: "TESTN",
    uri: "https://example.com/metadata.json",
    configAddress,
    payer: wallet.publicKey,
    poolCreator: wallet.publicKey,
  });

  console.log("✅ Transaction prepared");
  console.log("Pool Address:", result.poolAddress);
  console.log("Token Address (baseMint):", result.baseMint);

  // Sign and send pool creation transaction
  console.log("\n📤 Signing and sending transaction...");
  let signature: string;

  if (result.transaction instanceof VersionedTransaction) {
    // Handle VersionedTransaction (when ALT is configured)
    result.transaction.sign([wallet, result.baseMintKeypair]);
    signature = await sdk.getConnection().sendTransaction(result.transaction);
    await sdk.getConnection().confirmTransaction(signature, "confirmed");
  } else {
    // Handle regular Transaction
    signature = await sendAndConfirmTransaction(
      sdk.getConnection(),
      result.transaction,
      [wallet, result.baseMintKeypair],
      { commitment: "confirmed", skipPreflight: true }
    );
  }

  console.log("\n✅ Pool created successfully!");
  console.log("Pool Address:", result.poolAddress);
  console.log("Token Address:", result.baseMint);
  console.log("Transaction:", signature);
  console.log(
    `View on Solscan: https://solscan.io/tx/${signature}?cluster=devnet`
  );

  // Save token address for later use
  console.log("\n💡 Save this token address to use in the next examples:");
  console.log(`export TOKEN_ADDRESS="${result.baseMint}"`);
  console.log("\n💡 To buy tokens, run example 4:");
  console.log("bun examples/4-buy-token.ts");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
