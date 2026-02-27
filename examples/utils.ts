/**
 * Shared utilities for examples
 */

import { DEFAULT_RPC_URL } from "../src/constants";
import {
  Connection,
  Keypair,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";

/**
 * Get RPC URL from environment variable or default
 */
export function getRpcUrl(): string {
  return DEFAULT_RPC_URL;
}

/**
 * Poll for transaction confirmation via HTTP (no WebSocket needed)
 */
async function pollConfirmation(
  connection: Connection,
  signature: string,
  timeoutMs = 15000,
  intervalMs = 1000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value?.[0];
    if (status) {
      if (status.err) throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
      if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") return;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Transaction confirmation timeout");
}

/**
 * Sign, send, and confirm a transaction (polling, no WebSocket)
 */
export async function sendAndConfirm(
  connection: Connection,
  transaction: Transaction | VersionedTransaction,
  signers: Keypair[]
): Promise<string> {
  let signature: string;
  if (transaction instanceof VersionedTransaction) {
    transaction.sign(signers);
    signature = await connection.sendTransaction(transaction, { maxRetries: 3 });
  } else {
    transaction.sign(...signers);
    signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: true });
  }
  await pollConfirmation(connection, signature);
  return signature;
}
