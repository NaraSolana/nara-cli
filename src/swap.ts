import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import BN from "bn.js";
import { NaraSDK } from "./client";
import {
  deriveDammV2PoolAddress,
  DAMM_V2_MIGRATION_FEE_ADDRESS,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  CpAmm,
  SwapMode as CpAmmSwapMode,
  getCurrentPoint,
  ActivationType,
} from "@meteora-ag/cp-amm-sdk";

/**
 * Swap mode enum
 * - ExactIn: Exact input mode
 * - PartialFill: Partial fill mode (recommended, can precisely fill the pool)
 * - ExactOut: Exact output mode
 */
export enum SwapMode {
  ExactIn = 0,
  PartialFill = 1,
  ExactOut = 2,
}

export interface SwapQuoteResponse {
  amountIn: string;
  outputAmount: string;
  minimumAmountOut: string;
  nextSqrtPrice: string;
  tradingFee: string;
  protocolFee: string;
  referralFee: string;
}

/**
 * Check if pool has migrated to DAMM V2 and return relevant information
 */
async function checkPoolMigration(
  sdk: NaraSDK,
  tokenAddress: string
): Promise<{
  isMigrated: boolean;
  dammV2Pool?: PublicKey;
  dammConfig?: PublicKey;
}> {
  const client = sdk.getClient();
  const tokenPubkey = new PublicKey(tokenAddress);

  const poolAccount = await client.state.getPoolByBaseMint(tokenPubkey);
  if (!poolAccount) {
    throw new Error(`Pool not found for token: ${tokenAddress}`);
  }

  // Check if already migrated
  if (poolAccount.account.isMigrated) {
    // Get DAMM config
    const virtualPool = poolAccount.account;
    const poolConfig = await client.state.getPoolConfig(virtualPool.config);
    const migrationFeeOption = (poolConfig as any).migrationFeeOption || 0;

    // Get correct config address from array
    const dammConfig = DAMM_V2_MIGRATION_FEE_ADDRESS[migrationFeeOption];

    if (!dammConfig) {
      throw new Error(
        `Invalid migration fee option: ${migrationFeeOption}. Cannot determine DAMM V2 config address.`
      );
    }

    // Derive DAMM V2 pool address
    const dammV2Pool = deriveDammV2PoolAddress(
      dammConfig,
      NATIVE_MINT, // tokenA = SOL
      tokenPubkey // tokenB = token
    );

    // Verify pool account actually exists
    const connection = sdk.getConnection();
    const poolAccountInfo = await connection.getAccountInfo(dammV2Pool);

    if (!poolAccountInfo) {
      // Pool marked as migrated but account doesn't exist, migration not yet complete
      return { isMigrated: false };
    }

    return {
      isMigrated: true,
      dammV2Pool,
      dammConfig,
    };
  }

  return { isMigrated: false };
}

/**
 * Get swap quote
 * @param sdk NaraSDK SDK instance
 * @param tokenAddress Token address (baseMint)
 * @param amountIn Input amount
 * @param swapBaseForQuote true=sell token for SOL, false=buy token with SOL
 * @param slippageBps Slippage in basis points (default 100 = 1%)
 * @returns Swap quote information
 */
export async function getSwapQuote(
  sdk: NaraSDK,
  tokenAddress: string,
  amountIn: BN,
  swapBaseForQuote: boolean,
  slippageBps: number = 100
): Promise<SwapQuoteResponse> {
  const client = sdk.getClient();
  const tokenPubkey = new PublicKey(tokenAddress);

  // Get pool by token (baseMint) address
  const poolAccount = await client.state.getPoolByBaseMint(tokenPubkey);
  if (!poolAccount) {
    throw new Error(`Pool not found for token: ${tokenAddress}`);
  }

  const virtualPool = poolAccount.account;
  const poolConfig = await client.state.getPoolConfig(virtualPool.config);

  const quote = client.pool.swapQuote({
    virtualPool,
    config: poolConfig,
    swapBaseForQuote,
    amountIn,
    slippageBps,
    hasReferral: false,
    eligibleForFirstSwapWithMinFee: false,
    currentPoint: new BN(0),
  });

  // Cast to any to access IDL-derived properties that exist at runtime
  const quoteResult = quote as any;

  return {
    amountIn: amountIn.toString(),
    outputAmount: quoteResult.outputAmount.toString(),
    minimumAmountOut: quote.minimumAmountOut.toString(),
    nextSqrtPrice: quoteResult.nextSqrtPrice.toString(),
    tradingFee: quoteResult.tradingFee.toString(),
    protocolFee: quoteResult.protocolFee.toString(),
    referralFee: quoteResult.referralFee.toString(),
  };
}

export interface BuyTokenParams {
  tokenAddress: string;
  amountInSOL: number;
  owner: PublicKey;
  slippageBps?: number;
  /** Swap mode, defaults to PartialFill (recommended) */
  swapMode?: SwapMode;
}

export interface BuyTokenResult {
  /** Unsigned transaction (returns VersionedTransaction if ALT is configured) */
  transaction: Transaction | VersionedTransaction;
  /** Input amount in lamports */
  amountIn: string;
  /** Expected output amount */
  expectedAmountOut: string;
  /** Minimum output amount */
  minimumAmountOut: string;
}

/**
 * Create buy token transaction (returns unsigned transaction)
 * @param sdk NaraSDK SDK instance
 * @param params Buy parameters
 * @returns Unsigned transaction and related information
 */
export async function buyToken(
  sdk: NaraSDK,
  params: BuyTokenParams
): Promise<BuyTokenResult> {
  const client = sdk.getClient();
  const connection = sdk.getConnection();

  const tokenPubkey = new PublicKey(params.tokenAddress);
  const amountIn = new BN(params.amountInSOL * 1e9); // Convert SOL to lamports
  const slippageBps = params.slippageBps ?? 100;
  const swapMode = params.swapMode ?? SwapMode.PartialFill; // Default to PartialFill mode

  // Check if pool has migrated to DAMM V2
  const migrationInfo = await checkPoolMigration(sdk, params.tokenAddress);

  if (migrationInfo.isMigrated && migrationInfo.dammV2Pool) {
    console.log("🚀 Pool launched to DAMM V2, using CP-AMM for swap");

    // Use CP-AMM SDK for swap
    const cpAmm = new CpAmm(connection);

    // Get pool state
    const poolState = await cpAmm.fetchPoolState(migrationInfo.dammV2Pool);

    // Get current point (based on pool's activation type)
    const currentPoint = await getCurrentPoint(
      connection,
      poolState.activationType as ActivationType
    );

    // Determine input/output tokens (SOL = tokenA, Token = tokenB)
    const isAToB = poolState.tokenAMint.equals(NATIVE_MINT);
    const inputTokenMint = isAToB ? poolState.tokenAMint : poolState.tokenBMint;

    // Convert SwapMode
    const cpAmmSwapMode =
      swapMode === SwapMode.PartialFill
        ? CpAmmSwapMode.PartialFill
        : swapMode === SwapMode.ExactOut
        ? CpAmmSwapMode.ExactOut
        : CpAmmSwapMode.ExactIn;

    // Build quote parameters
    const quoteBaseParams = {
      inputTokenMint,
      slippage: slippageBps / 10000,
      currentPoint,
      poolState,
      tokenADecimal: 9, // SOL decimals
      tokenBDecimal: 6, // Token decimals (assumed)
      hasReferral: false,
    };

    // Calculate quote
    let quote: any;
    if (cpAmmSwapMode === CpAmmSwapMode.ExactOut) {
      quote = cpAmm.getQuote2({
        ...quoteBaseParams,
        swapMode: cpAmmSwapMode,
        amountOut: amountIn, // ExactOut: desired output amount
      });
    } else {
      quote = cpAmm.getQuote2({
        ...quoteBaseParams,
        swapMode: cpAmmSwapMode,
        amountIn,
      });
    }

    // Build swap parameters
    const swapBaseParams = {
      payer: params.owner,
      pool: migrationInfo.dammV2Pool,
      inputTokenMint,
      outputTokenMint: isAToB ? poolState.tokenBMint : poolState.tokenAMint,
      tokenAMint: poolState.tokenAMint,
      tokenBMint: poolState.tokenBMint,
      tokenAVault: poolState.tokenAVault,
      tokenBVault: poolState.tokenBVault,
      tokenAProgram: TOKEN_PROGRAM_ID,
      tokenBProgram: TOKEN_PROGRAM_ID,
      referralTokenAccount: null,
      poolState,
    };

    // Create transaction (TxBuilder returns Promise<Transaction>)
    let transaction: Transaction;
    if (cpAmmSwapMode === CpAmmSwapMode.ExactOut) {
      transaction = await cpAmm.swap2({
        ...swapBaseParams,
        swapMode: cpAmmSwapMode,
        amountOut: amountIn,
        maximumAmountIn: quote.maxSwapInAmount || amountIn.muln(2), // 2x as max
      });
    } else {
      transaction = await cpAmm.swap2({
        ...swapBaseParams,
        swapMode: cpAmmSwapMode,
        amountIn,
        minimumAmountOut: quote.minSwapOutAmount || new BN(0),
      });
    }

    // Compile transaction with ALT if configured
    const compiledTx = await sdk.compileTransactionWithALT(
      transaction,
      params.owner
    );

    return {
      transaction: compiledTx,
      amountIn: quote.swapInAmount?.toString() || amountIn.toString(),
      expectedAmountOut: quote.swapOutAmount?.toString() || "0",
      minimumAmountOut: quote.minSwapOutAmount?.toString() || "0",
    };
  }

  // Not migrated, use DBC swap
  const poolAccount = await client.state.getPoolByBaseMint(tokenPubkey);
  if (!poolAccount) {
    throw new Error(`Pool not found for token: ${params.tokenAddress}`);
  }

  // Get quote first for minimumAmountOut
  // In PartialFill mode, continue even if insufficient liquidity
  let quote: SwapQuoteResponse;
  try {
    quote = await getSwapQuote(
      sdk,
      params.tokenAddress,
      amountIn,
      false,
      slippageBps
    );
  } catch (err: any) {
    if (swapMode === SwapMode.PartialFill && err.message?.includes("Insufficient Liquidity")) {
      // PartialFill mode: set minimumAmountOut to 0 when insufficient liquidity
      console.warn("⚠️  Insufficient liquidity, using PartialFill mode to accept any available amount");
      quote = {
        amountIn: amountIn.toString(),
        outputAmount: "0",
        minimumAmountOut: "0",
        nextSqrtPrice: "0",
        tradingFee: "0",
        protocolFee: "0",
        referralFee: "0",
      };
    } else {
      throw err;
    }
  }

  // Use swap2 method to support different swap modes
  let transaction: Transaction;

  if (swapMode === SwapMode.PartialFill) {
    transaction = await client.pool.swap2({
      owner: params.owner,
      pool: poolAccount.publicKey,
      swapBaseForQuote: false,
      referralTokenAccount: null,
      swapMode: SwapMode.PartialFill,
      amountIn,
      minimumAmountOut: new BN(quote.minimumAmountOut),
    });
  } else if (swapMode === SwapMode.ExactOut) {
    transaction = await client.pool.swap2({
      owner: params.owner,
      pool: poolAccount.publicKey,
      swapBaseForQuote: false,
      referralTokenAccount: null,
      swapMode: SwapMode.ExactOut,
      amountOut: new BN(quote.outputAmount),
      maximumAmountIn: amountIn,
    });
  } else {
    // SwapMode.ExactIn
    transaction = await client.pool.swap2({
      owner: params.owner,
      pool: poolAccount.publicKey,
      swapBaseForQuote: false,
      referralTokenAccount: null,
      swapMode: SwapMode.ExactIn,
      amountIn,
      minimumAmountOut: new BN(quote.minimumAmountOut),
    });
  }

  // Compile transaction with ALT if configured
  const compiledTx = await sdk.compileTransactionWithALT(
    transaction,
    params.owner
  );

  return {
    transaction: compiledTx,
    amountIn: amountIn.toString(),
    expectedAmountOut: quote.outputAmount,
    minimumAmountOut: quote.minimumAmountOut,
  };
}

export interface SellTokenParams {
  tokenAddress: string;
  amountInToken: number;
  owner: PublicKey;
  tokenDecimals?: number;
  slippageBps?: number;
  /** Swap mode, defaults to PartialFill (recommended) */
  swapMode?: SwapMode;
}

export interface SellTokenResult {
  /** Unsigned transaction (returns VersionedTransaction if ALT is configured) */
  transaction: Transaction | VersionedTransaction;
  /** Input amount in token's smallest unit */
  amountIn: string;
  /** Expected output amount in lamports */
  expectedAmountOut: string;
  /** Minimum output amount in lamports */
  minimumAmountOut: string;
}

/**
 * Create sell token transaction (returns unsigned transaction)
 * @param sdk NaraSDK SDK instance
 * @param params Sell parameters
 * @returns Unsigned transaction and related information
 */
export async function sellToken(
  sdk: NaraSDK,
  params: SellTokenParams
): Promise<SellTokenResult> {
  const client = sdk.getClient();
  const connection = sdk.getConnection();

  const tokenPubkey = new PublicKey(params.tokenAddress);
  const tokenDecimals = params.tokenDecimals ?? 6;
  const amountIn = new BN(params.amountInToken * 10 ** tokenDecimals);
  const slippageBps = params.slippageBps ?? 100;
  const swapMode = params.swapMode ?? SwapMode.PartialFill; // Default to PartialFill mode

  // Check if pool has migrated to DAMM V2
  const migrationInfo = await checkPoolMigration(sdk, params.tokenAddress);

  if (migrationInfo.isMigrated && migrationInfo.dammV2Pool) {
    console.log("🚀 Pool launched to DAMM V2, using CP-AMM for swap");

    // Use CP-AMM SDK for swap
    const cpAmm = new CpAmm(connection);

    // Get pool state
    const poolState = await cpAmm.fetchPoolState(migrationInfo.dammV2Pool);

    // Get current point (based on pool's activation type)
    const currentPoint = await getCurrentPoint(
      connection,
      poolState.activationType as ActivationType
    );

    // Determine input/output tokens (Token = tokenB, SOL = tokenA)
    const isAToB = poolState.tokenAMint.equals(tokenPubkey); // If token is A, then A->B (Token->SOL)
    const inputTokenMint = isAToB ? poolState.tokenAMint : poolState.tokenBMint;

    // Convert SwapMode
    const cpAmmSwapMode =
      swapMode === SwapMode.PartialFill
        ? CpAmmSwapMode.PartialFill
        : swapMode === SwapMode.ExactOut
        ? CpAmmSwapMode.ExactOut
        : CpAmmSwapMode.ExactIn;

    // 构建报价参数
    const quoteBaseParams = {
      inputTokenMint,
      slippage: slippageBps / 10000,
      currentPoint,
      poolState,
      tokenADecimal: 9, // SOL decimals
      tokenBDecimal: tokenDecimals,
      hasReferral: false,
    };

    // Calculate quote
    let quote: any;
    if (cpAmmSwapMode === CpAmmSwapMode.ExactOut) {
      quote = cpAmm.getQuote2({
        ...quoteBaseParams,
        swapMode: cpAmmSwapMode,
        amountOut: amountIn, // ExactOut: desired output amount
      });
    } else {
      quote = cpAmm.getQuote2({
        ...quoteBaseParams,
        swapMode: cpAmmSwapMode,
        amountIn,
      });
    }

    // Build swap parameters
    const swapBaseParams = {
      payer: params.owner,
      pool: migrationInfo.dammV2Pool,
      inputTokenMint,
      outputTokenMint: isAToB ? poolState.tokenBMint : poolState.tokenAMint,
      tokenAMint: poolState.tokenAMint,
      tokenBMint: poolState.tokenBMint,
      tokenAVault: poolState.tokenAVault,
      tokenBVault: poolState.tokenBVault,
      tokenAProgram: TOKEN_PROGRAM_ID,
      tokenBProgram: TOKEN_PROGRAM_ID,
      referralTokenAccount: null,
      poolState,
    };

    // Create transaction
    let transaction: Transaction;
    if (cpAmmSwapMode === CpAmmSwapMode.ExactOut) {
      transaction = await cpAmm.swap2({
        ...swapBaseParams,
        swapMode: cpAmmSwapMode,
        amountOut: amountIn,
        maximumAmountIn: quote.maxSwapInAmount || amountIn.muln(2),
      });
    } else {
      transaction = await cpAmm.swap2({
        ...swapBaseParams,
        swapMode: cpAmmSwapMode,
        amountIn,
        minimumAmountOut: quote.minSwapOutAmount || new BN(0),
      });
    }

    // Compile transaction with ALT if configured
    const compiledTx = await sdk.compileTransactionWithALT(
      transaction,
      params.owner
    );

    return {
      transaction: compiledTx,
      amountIn: quote.swapInAmount?.toString() || amountIn.toString(),
      expectedAmountOut: quote.swapOutAmount?.toString() || "0",
      minimumAmountOut: quote.minSwapOutAmount?.toString() || "0",
    };
  }

  // Not migrated, use DBC swap
  const poolAccount = await client.state.getPoolByBaseMint(tokenPubkey);
  if (!poolAccount) {
    throw new Error(`Pool not found for token: ${params.tokenAddress}`);
  }

  // Get quote first for minimumAmountOut
  // In PartialFill mode, continue even if insufficient liquidity
  let quote: SwapQuoteResponse;
  try {
    quote = await getSwapQuote(
      sdk,
      params.tokenAddress,
      amountIn,
      true,
      slippageBps
    );
  } catch (err: any) {
    if (swapMode === SwapMode.PartialFill && err.message?.includes("Insufficient Liquidity")) {
      // PartialFill mode: set minimumAmountOut to 0 when insufficient liquidity
      console.warn("⚠️  Insufficient liquidity, using PartialFill mode to accept any available amount");
      quote = {
        amountIn: amountIn.toString(),
        outputAmount: "0",
        minimumAmountOut: "0",
        nextSqrtPrice: "0",
        tradingFee: "0",
        protocolFee: "0",
        referralFee: "0",
      };
    } else {
      throw err;
    }
  }

  // Use swap2 method to support different swap modes
  let transaction: Transaction;

  if (swapMode === SwapMode.PartialFill) {
    transaction = await client.pool.swap2({
      owner: params.owner,
      pool: poolAccount.publicKey,
      swapBaseForQuote: true, // Token -> SOL (sell)
      referralTokenAccount: null,
      swapMode: SwapMode.PartialFill,
      amountIn,
      minimumAmountOut: new BN(quote.minimumAmountOut),
    });
  } else if (swapMode === SwapMode.ExactOut) {
    transaction = await client.pool.swap2({
      owner: params.owner,
      pool: poolAccount.publicKey,
      swapBaseForQuote: true,
      referralTokenAccount: null,
      swapMode: SwapMode.ExactOut,
      amountOut: new BN(quote.outputAmount),
      maximumAmountIn: amountIn,
    });
  } else {
    // SwapMode.ExactIn
    transaction = await client.pool.swap2({
      owner: params.owner,
      pool: poolAccount.publicKey,
      swapBaseForQuote: true,
      referralTokenAccount: null,
      swapMode: SwapMode.ExactIn,
      amountIn,
      minimumAmountOut: new BN(quote.minimumAmountOut),
    });
  }

  // Compile transaction with ALT if configured
  const compiledTx = await sdk.compileTransactionWithALT(
    transaction,
    params.owner
  );

  return {
    transaction: compiledTx,
    amountIn: amountIn.toString(),
    expectedAmountOut: quote.outputAmount,
    minimumAmountOut: quote.minimumAmountOut,
  };
}
