import {
  PublicKey,
  Transaction,
  Keypair,
  VersionedTransaction,
} from "@solana/web3.js";
import BN from "bn.js";
import { NaraDBC } from "./client";
import { DAMM_V2_MIGRATION_FEE_ADDRESS } from "@meteora-ag/dynamic-bonding-curve-sdk";

export interface MigrateToDAMMV2Params {
  /** Token address (baseMint) */
  tokenAddress: string;
  /** Payer */
  payer: PublicKey;
}

export interface MigrateToDAMMV2Result {
  /** Migration transaction (returns VersionedTransaction if ALT is configured) */
  transaction: Transaction | VersionedTransaction;
  /** First Position NFT keypair (requires signature) */
  firstPositionNftKeypair: Keypair;
  /** Second Position NFT keypair (requires signature) */
  secondPositionNftKeypair: Keypair;
  /** Pool address */
  poolAddress: string;
}

export interface CreateLockerParams {
  /** Token address (baseMint) */
  tokenAddress: string;
  /** Payer */
  payer: PublicKey;
}

export interface CreateLockerResult {
  /** Locker creation transaction (returns VersionedTransaction if ALT is configured) */
  transaction: Transaction | VersionedTransaction;
  /** Pool address */
  poolAddress: string;
}

/**
 * Launch token pool to DAMM V2 (graduation)
 *
 * Call this function to migrate the pool to DAMM V2 after the bonding curve is complete (100%)
 *
 * Notes:
 * - dammConfig address is automatically derived from pool config's migrationFeeOption
 * - If token has locked vesting parameters, may need to call createLocker() first
 * - Requires signatures from three keypairs: payer, firstPositionNftKeypair, secondPositionNftKeypair
 *
 * @param sdk NaraDBC SDK instance
 * @param params Migration parameters
 * @returns Migration transaction, Position NFT keypairs, and pool address
 */
export async function migrateToDAMMV2(
  sdk: NaraDBC,
  params: MigrateToDAMMV2Params
): Promise<MigrateToDAMMV2Result> {
  const connection = sdk.getConnection();
  const client = sdk.getClient();
  const tokenPubkey = new PublicKey(params.tokenAddress);

  // Get pool account
  const poolAccount = await client.state.getPoolByBaseMint(tokenPubkey);
  if (!poolAccount) {
    throw new Error(`Pool not found for token: ${params.tokenAddress}`);
  }

  // Check if pool has already been migrated
  if (poolAccount.account.isMigrated) {
    throw new Error("Pool has already been migrated");
  }

  // Get pool config and read migrationFeeOption
  const virtualPool = poolAccount.account;
  const poolConfig = await client.state.getPoolConfig(virtualPool.config);

  // Get corresponding config address from DAMM_V2_MIGRATION_FEE_ADDRESS array
  // Using 'any' type since poolConfig's migrationFeeOption is IDL-derived
  const migrationFeeOption = (poolConfig as any).migrationFeeOption || 0;
  const dammConfig = DAMM_V2_MIGRATION_FEE_ADDRESS[migrationFeeOption];

  if (!dammConfig) {
    throw new Error(
      `Invalid migration fee option: ${migrationFeeOption}. Cannot determine DAMM config address.`
    );
  }

  // Note: If the pool has locked vesting parameters, a locker might need to be created first
  // Use createLocker() if the migration fails due to missing locker

  // Call SDK's migrateToDammV2 method
  const result = await client.migration.migrateToDammV2({
    payer: params.payer,
    virtualPool: poolAccount.publicKey,
    dammConfig,
  });

  // Get latest blockhash
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  result.transaction.recentBlockhash = blockhash;
  result.transaction.feePayer = params.payer;

  // Compile transaction with ALT if configured
  const compiledTx = await sdk.compileTransactionWithALT(
    result.transaction,
    params.payer
  );

  return {
    transaction: compiledTx,
    firstPositionNftKeypair: result.firstPositionNftKeypair,
    secondPositionNftKeypair: result.secondPositionNftKeypair,
    poolAddress: poolAccount.publicKey.toBase58(),
  };
}

/**
 * Create Locker (for token pools with locked vesting parameters)
 *
 * If the token pool has locked vesting parameters (amountPerPeriod > 0 or cliffUnlockAmount > 0),
 * a locker must be created before migrating to DAMM V2
 *
 * @param sdk NaraDBC SDK instance
 * @param params Locker parameters
 * @returns Locker creation transaction and pool address
 */
export async function createLocker(
  sdk: NaraDBC,
  params: CreateLockerParams
): Promise<CreateLockerResult> {
  const connection = sdk.getConnection();
  const client = sdk.getClient();
  const tokenPubkey = new PublicKey(params.tokenAddress);

  // Get pool account
  const poolAccount = await client.state.getPoolByBaseMint(tokenPubkey);
  if (!poolAccount) {
    throw new Error(`Pool not found for token: ${params.tokenAddress}`);
  }

  // Create locker
  const transaction = await client.migration.createLocker({
    payer: params.payer,
    virtualPool: poolAccount.publicKey,
  });

  // Get latest blockhash
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = params.payer;

  // Compile transaction with ALT if configured
  const compiledTx = await sdk.compileTransactionWithALT(
    transaction,
    params.payer
  );

  return {
    transaction: compiledTx,
    poolAddress: poolAccount.publicKey.toBase58(),
  };
}

/**
 * Check if pool can be launched to DAMM V2
 *
 * @param sdk NaraDBC SDK instance
 * @param tokenAddress Token address (baseMint)
 * @returns Whether pool can be launched
 */
export async function canMigrate(
  sdk: NaraDBC,
  tokenAddress: string
): Promise<{
  canMigrate: boolean;
  reason?: string;
  progress: number;
}> {
  const client = sdk.getClient();
  const tokenPubkey = new PublicKey(tokenAddress);

  // Get pool account
  const poolAccount = await client.state.getPoolByBaseMint(tokenPubkey);
  if (!poolAccount) {
    return {
      canMigrate: false,
      reason: "Pool not found",
      progress: 0,
    };
  }

  // Check if already migrated
  if (poolAccount.account.isMigrated) {
    return {
      canMigrate: false,
      reason: "Pool has already been migrated",
      progress: 1,
    };
  }

  // Get curve progress
  const progress = await client.state.getPoolCurveProgress(
    poolAccount.publicKey
  );

  // Check if 100% complete
  if (progress >= 1.0) {
    return {
      canMigrate: true,
      progress,
    };
  }

  return {
    canMigrate: false,
    reason: `Curve not complete. Current progress: ${(progress * 100).toFixed(2)}%`,
    progress,
  };
}
