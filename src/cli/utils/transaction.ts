/**
 * Transaction handling utilities
 */

import {
  sendAndConfirmTransaction,
  Transaction,
  VersionedTransaction,
  Keypair,
} from "@solana/web3.js";
import { NaraSDK } from "../../client";
import { printInfo, printSuccess } from "./output";

/**
 * Result of transaction handling
 */
export interface TransactionResult {
  /** Transaction signature (if sent) */
  signature?: string;
  /** Base64-encoded transaction (if exported) */
  base64?: string;
}

/**
 * Handle transaction signing and sending or exporting
 *
 * @param sdk NaraSDK SDK instance
 * @param transaction Transaction or VersionedTransaction
 * @param signers Array of keypairs to sign with
 * @param exportMode Whether to export unsigned transaction
 * @returns Transaction result with signature or base64
 */
export async function handleTransaction(
  sdk: NaraSDK,
  transaction: Transaction | VersionedTransaction,
  signers: Keypair[],
  exportMode: boolean = false
): Promise<TransactionResult> {
  if (exportMode) {
    // Export unsigned transaction as base64
    return exportTransaction(transaction);
  }

  // Sign and send transaction
  return await signAndSendTransaction(sdk, transaction, signers);
}

/**
 * Export unsigned transaction as base64
 * @param transaction Transaction to export
 * @returns Base64-encoded transaction
 */
function exportTransaction(
  transaction: Transaction | VersionedTransaction
): TransactionResult {
  try {
    const serialized = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    const base64 = Buffer.from(serialized).toString("base64");

    return { base64 };
  } catch (error: any) {
    throw new Error(`Failed to serialize transaction: ${error.message}`);
  }
}

/**
 * Sign and send transaction
 * @param sdk NaraSDK SDK instance
 * @param transaction Transaction to sign and send
 * @param signers Keypairs to sign with
 * @returns Transaction signature
 */
async function signAndSendTransaction(
  sdk: NaraSDK,
  transaction: Transaction | VersionedTransaction,
  signers: Keypair[]
): Promise<TransactionResult> {
  const connection = sdk.getConnection();

  try {
    printInfo("Signing transaction...");

    let signature: string;

    if (transaction instanceof VersionedTransaction) {
      // Handle VersionedTransaction
      transaction.sign(signers);

      printInfo("Sending transaction...");
      signature = await connection.sendTransaction(transaction, {
        maxRetries: 3,
      });

      printInfo("Confirming transaction...");
      await connection.confirmTransaction(signature, "confirmed");
    } else {
      // Handle regular Transaction
      printInfo("Sending transaction...");
      signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        signers,
        {
          commitment: "confirmed",
          skipPreflight: true,
        }
      );
    }

    return { signature };
  } catch (error: any) {
    throw new Error(`Transaction failed: ${error.message}`);
  }
}

/**
 * Print transaction result
 * @param result Transaction result
 * @param jsonMode Whether to output in JSON format
 */
export function printTransactionResult(
  result: TransactionResult,
  jsonMode: boolean = false
): void {
  if (result.signature) {
    if (jsonMode) {
      console.log(JSON.stringify({ signature: result.signature }, null, 2));
    } else {
      printSuccess("Transaction successful!");
      console.log(`Signature: ${result.signature}`);
      console.log(
        `View on Solscan: https://solscan.io/tx/${result.signature}?cluster=devnet`
      );
    }
  } else if (result.base64) {
    if (jsonMode) {
      console.log(JSON.stringify({ transaction: result.base64 }, null, 2));
    } else {
      printSuccess("Transaction exported!");
      console.log(`\nBase64 transaction:\n${result.base64}`);
    }
  }
}
