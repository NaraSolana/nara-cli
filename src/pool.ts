import {
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";
import { deriveDbcPoolAddress } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { NaraSDK } from "./client";

export interface CreatePoolParams {
  name: string;
  symbol: string;
  uri: string;
  configAddress: string;
  payer: PublicKey;
  poolCreator: PublicKey;
}

export interface CreatePoolResult {
  /** Pool address */
  poolAddress: string;
  /** Token address (baseMint) */
  baseMint: string;
  /** Unsigned transaction for pool creation (returns VersionedTransaction if ALT is configured) */
  transaction: Transaction | VersionedTransaction;
  /** baseMint keypair (requires signature) */
  baseMintKeypair: Keypair;
}

export interface CreatePoolWithFirstBuyParams extends CreatePoolParams {
  /** Initial buy amount in SOL */
  initialBuyAmountSOL: number;
  /** Buyer (defaults to payer) */
  buyer?: PublicKey;
  /** Token receiver (defaults to buyer) */
  receiver?: PublicKey;
  /** Slippage in basis points (default 100 = 1%) */
  slippageBps?: number;
}

export interface CreatePoolWithFirstBuyResult {
  /** Pool address */
  poolAddress: string;
  /** Token address (baseMint) */
  baseMint: string;
  /** Pool creation transaction (returns VersionedTransaction if ALT is configured) */
  createPoolTx: Transaction | VersionedTransaction;
  /** First buy transaction (returns VersionedTransaction if ALT is configured) */
  firstBuyTx: Transaction | VersionedTransaction;
  /** baseMint keypair (requires signature) */
  baseMintKeypair: Keypair;
  /** Buy information */
  buyInfo: {
    amountIn: string;
    minimumAmountOut: string;
  };
}

/**
 * Create token pool transaction (returns unsigned transaction)
 *
 * Note: If you want to make an initial buy, wait for this transaction to confirm
 * before using the buyToken() function
 *
 * @param sdk NaraSDK SDK instance
 * @param params Pool parameters
 * @returns Pool address, token address, unsigned transaction, and baseMint keypair
 */
export async function createPool(
  sdk: NaraSDK,
  params: CreatePoolParams
): Promise<CreatePoolResult> {
  const connection = sdk.getConnection();
  const client = sdk.getClient();

  const baseMint = Keypair.generate();
  const configPubkey = new PublicKey(params.configAddress);

  // Create pool transaction
  const createPoolTx = await client.pool.createPool({
    baseMint: baseMint.publicKey,
    config: configPubkey,
    name: params.name,
    symbol: params.symbol,
    uri: params.uri,
    payer: params.payer,
    poolCreator: params.poolCreator,
  });

  // Get latest blockhash
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  createPoolTx.recentBlockhash = blockhash;
  createPoolTx.feePayer = params.payer;

  // Derive pool address
  const poolPubkey = deriveDbcPoolAddress(
    NATIVE_MINT,
    baseMint.publicKey,
    configPubkey
  );

  // Compile transaction with ALT if configured
  const compiledTx = await sdk.compileTransactionWithALT(
    createPoolTx,
    params.payer
  );

  return {
    poolAddress: poolPubkey.toBase58(),
    baseMint: baseMint.publicKey.toBase58(),
    transaction: compiledTx,
    baseMintKeypair: baseMint,
  };
}

/**
 * Create token pool and perform first buy (one-step completion)
 *
 * Uses SDK's createPoolWithFirstBuy method to complete creation and buy in one transaction
 *
 * @param sdk NaraSDK SDK instance
 * @param params Pool and buy parameters
 * @returns Pool address, token address, unsigned transactions, and baseMint keypair
 */
export async function createPoolWithFirstBuy(
  sdk: NaraSDK,
  params: CreatePoolWithFirstBuyParams
): Promise<CreatePoolWithFirstBuyResult> {
  const connection = sdk.getConnection();
  const client = sdk.getClient();

  const baseMint = Keypair.generate();
  const configPubkey = new PublicKey(params.configAddress);
  const buyer = params.buyer ?? params.payer;
  const receiver = params.receiver ?? buyer;

  // Calculate buy amount
  const buyAmount = new BN(params.initialBuyAmountSOL * 1e9); // SOL to lamports
  const slippageBps = params.slippageBps ?? 100;

  // For first buy, use conservative minimumAmountOut
  // Set to 0 since this is the first buy with optimal price
  const minimumAmountOut = new BN(0);

  // Use SDK's createPoolWithFirstBuy method
  const result = await client.pool.createPoolWithFirstBuy({
    createPoolParam: {
      baseMint: baseMint.publicKey,
      config: configPubkey,
      name: params.name,
      symbol: params.symbol,
      uri: params.uri,
      payer: params.payer,
      poolCreator: params.poolCreator,
    },
    firstBuyParam: {
      buyer,
      receiver,
      buyAmount,
      minimumAmountOut,
      referralTokenAccount: null,
    },
  });

  // Get latest blockhash
  const { blockhash } = await connection.getLatestBlockhash("confirmed");

  // Combine two transactions into one
  const combinedTx = new Transaction();

  // Add pool creation instructions
  combinedTx.add(...result.createPoolTx.instructions);

  // If first buy transaction exists, add buy instructions
  if (result.swapBuyTx) {
    combinedTx.add(...result.swapBuyTx.instructions);
  }

  // Set transaction metadata
  combinedTx.recentBlockhash = blockhash;
  combinedTx.feePayer = params.payer;

  // Derive pool address
  const poolPubkey = deriveDbcPoolAddress(
    NATIVE_MINT,
    baseMint.publicKey,
    configPubkey
  );

  // Compile transaction with ALT if configured
  const compiledTx = await sdk.compileTransactionWithALT(
    combinedTx,
    params.payer
  );

  return {
    poolAddress: poolPubkey.toBase58(),
    baseMint: baseMint.publicKey.toBase58(),
    createPoolTx: compiledTx, // Return combined transaction
    firstBuyTx: compiledTx, // Same as createPoolTx since they are combined
    baseMintKeypair: baseMint,
    buyInfo: {
      amountIn: buyAmount.toString(),
      minimumAmountOut: minimumAmountOut.toString(),
    },
  };
}

/**
 * Get pool information
 * @param sdk NaraSDK SDK instance
 * @param tokenAddress Token address (baseMint)
 * @returns Pool information
 */
export async function getPoolInfo(sdk: NaraSDK, tokenAddress: string) {
  const client = sdk.getClient();
  const tokenPubkey = new PublicKey(tokenAddress);

  // Get pool by token (baseMint) address
  const poolAccount = await client.state.getPoolByBaseMint(tokenPubkey);
  if (!poolAccount) {
    throw new Error(`Pool not found for token: ${tokenAddress}`);
  }

  return {
    ...poolAccount.account,
    poolAddress: poolAccount.publicKey.toBase58(),
  };
}

/**
 * Get pool curve progress
 * @param sdk NaraSDK SDK instance
 * @param tokenAddress Token address (baseMint)
 * @returns Curve progress information
 */
export async function getPoolProgress(sdk: NaraSDK, tokenAddress: string) {
  const client = sdk.getClient();
  const tokenPubkey = new PublicKey(tokenAddress);

  // Get pool by token (baseMint) address
  const poolAccount = await client.state.getPoolByBaseMint(tokenPubkey);
  if (!poolAccount) {
    throw new Error(`Pool not found for token: ${tokenAddress}`);
  }

  const progress = await client.state.getPoolCurveProgress(
    poolAccount.publicKey
  );
  const pool = poolAccount.account;

  return {
    progress,
    quoteReserve: pool.quoteReserve?.toString() ?? "0",
    isMigrated: pool.isMigrated ?? false,
  };
}
