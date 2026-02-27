import {
  Connection,
  PublicKey,
  Transaction,
  AddressLookupTableAccount,
  MessageV0,
  VersionedTransaction,
} from "@solana/web3.js";
import { DynamicBondingCurveClient } from "@meteora-ag/dynamic-bonding-curve-sdk";

export interface NaraSDKConfig {
  rpcUrl: string;
  commitment?: "processed" | "confirmed" | "finalized";
  /** Address Lookup Table addresses array for compressing transaction size */
  addressLookupTableAddresses?: string[];
}

export class NaraSDK {
  private connection: Connection;
  private client: DynamicBondingCurveClient;
  private addressLookupTableAddresses: PublicKey[];

  constructor(config: NaraSDKConfig) {
    this.connection = new Connection(
      config.rpcUrl,
      config.commitment || "confirmed"
    );
    this.client = new DynamicBondingCurveClient(
      this.connection,
      config.commitment || "confirmed"
    );
    this.addressLookupTableAddresses = (
      config.addressLookupTableAddresses || []
    ).map((addr) => new PublicKey(addr));
  }

  getConnection(): Connection {
    return this.connection;
  }

  getClient(): DynamicBondingCurveClient {
    return this.client;
  }

  getAddressLookupTableAddresses(): PublicKey[] {
    return this.addressLookupTableAddresses;
  }

  /**
   * Compile transaction with Address Lookup Tables
   * Converts Transaction to VersionedTransaction if ALT is configured
   * @param transaction Original transaction
   * @param feePayer Fee payer public key
   * @returns VersionedTransaction or original Transaction
   */
  async compileTransactionWithALT(
    transaction: Transaction,
    feePayer: PublicKey
  ): Promise<Transaction | VersionedTransaction> {
    if (this.addressLookupTableAddresses.length === 0) {
      // No ALT configured, return original transaction
      return transaction;
    }

    // Fetch Address Lookup Table accounts
    const lookupTableAccounts: AddressLookupTableAccount[] = [];
    for (const address of this.addressLookupTableAddresses) {
      const accountInfo =
        await this.connection.getAddressLookupTable(address);
      if (accountInfo.value) {
        lookupTableAccounts.push(accountInfo.value);
      }
    }

    if (lookupTableAccounts.length === 0) {
      // No valid ALT accounts, return original transaction
      return transaction;
    }

    // Get latest blockhash
    const { blockhash } = await this.connection.getLatestBlockhash(
      this.connection.commitment
    );

    // Create MessageV0
    const messageV0 = MessageV0.compile({
      payerKey: feePayer,
      instructions: transaction.instructions,
      recentBlockhash: blockhash,
      addressLookupTableAccounts: lookupTableAccounts,
    });

    // Create VersionedTransaction
    return new VersionedTransaction(messageV0);
  }
}
