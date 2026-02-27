import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  buildCurveWithMarketCap,
  ActivationType,
  CollectFeeMode,
  BaseFeeMode,
  MigrationFeeOption,
  MigrationOption,
  TokenDecimal,
  TokenType,
  TokenUpdateAuthorityOption,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { NATIVE_MINT } from "@solana/spl-token";
import { NaraDBC } from "./client";

/**
 * Options for creating configuration
 */
export interface CreateConfigOptions {
  /** Fee claimer wallet address */
  feeClaimer: PublicKey;
  /** Leftover token receiver wallet address */
  leftoverReceiver: PublicKey;
  /** Payer wallet address */
  payer: PublicKey;
  // Curve parameters (all optional with defaults)
  /** Total token supply (default: 1,000,000,000) */
  totalTokenSupply?: number;
  /** Initial market cap (default: 30) */
  initialMarketCap?: number;
  /** Migration market cap threshold (default: 540) */
  migrationMarketCap?: number;
}

/**
 * Return type for bonding curve config transaction creation
 */
export interface CreateConfigResult {
  /** Config address */
  configAddress: string;
  /** Unsigned transaction */
  transaction: Transaction;
  /** Config keypair (requires partial signature) */
  configKeypair: Keypair;
}

/**
 * Create bonding curve config transaction (returns unsigned transaction)
 * @param sdk NaraDBC SDK instance
 * @param options Configuration options
 * @returns Config address, unsigned transaction, and config keypair
 */
export async function createConfig(
  sdk: NaraDBC,
  options: CreateConfigOptions
): Promise<CreateConfigResult> {
  const connection = sdk.getConnection();
  const client = sdk.getClient();

  // Generate new config keypair
  const config = Keypair.generate();

  // Build bonding curve configuration
  const curveConfig = buildCurveWithMarketCap({
    totalTokenSupply: options.totalTokenSupply ?? 1_000_000_000, // Total token supply
    initialMarketCap: options.initialMarketCap ?? 30, // Initial market cap
    migrationMarketCap: options.migrationMarketCap ?? 540, // Migration market cap threshold
    migrationOption: MigrationOption.MET_DAMM_V2, // Migration option: use Meteora DAMM V2
    tokenBaseDecimal: TokenDecimal.SIX, // Base token decimals: 6
    tokenQuoteDecimal: TokenDecimal.NINE, // Quote token decimals: 9 (SOL)
    // Locked vesting parameters
    lockedVestingParams: {
      totalLockedVestingAmount: 0, // Total locked vesting amount
      numberOfVestingPeriod: 0, // Number of vesting periods
      cliffUnlockAmount: 0, // Cliff unlock amount
      totalVestingDuration: 0, // Total vesting duration
      cliffDurationFromMigrationTime: 0, // Cliff duration from migration time
    },
    // Base fee parameters
    baseFeeParams: {
      baseFeeMode: BaseFeeMode.FeeSchedulerLinear, // Fee mode: linear scheduler
      feeSchedulerParam: {
        startingFeeBps: 100, // Starting fee (basis points): 1%
        endingFeeBps: 100, // Ending fee (basis points): 1%
        numberOfPeriod: 0, // Number of periods
        totalDuration: 0, // Total duration
      },
    },
    dynamicFeeEnabled: true, // Enable dynamic fees
    activationType: ActivationType.Slot, // Activation type: slot-based
    collectFeeMode: CollectFeeMode.QuoteToken, // Fee collection mode: quote token
    migrationFeeOption: MigrationFeeOption.FixedBps25, // Migration fee option: fixed 1%
    tokenType: TokenType.SPL, // Token type: SPL token
    partnerLiquidityPercentage: 0, // Partner liquidity percentage
    creatorLiquidityPercentage: 0, // Creator liquidity percentage
    partnerPermanentLockedLiquidityPercentage: 100, // Partner permanent locked liquidity: 100%
    creatorPermanentLockedLiquidityPercentage: 0, // Creator permanent locked liquidity: 0%
    creatorTradingFeePercentage: 0, // Creator trading fee percentage: 0%
    leftover: 0, // Leftover token amount
    tokenUpdateAuthority: TokenUpdateAuthorityOption.Immutable, // Token update authority: immutable
    // Migration fee
    migrationFee: {
      feePercentage: 0, // Fee percentage
      creatorFeePercentage: 0, // Creator fee percentage
    },
    poolCreationFee: 0.1, // Pool creation fee
    enableFirstSwapWithMinFee: true, // Enable first swap with minimum fee
  });

  // Create config transaction
  const transaction = await client.partner.createConfig({
    config: config.publicKey, // Config public key
    feeClaimer: options.feeClaimer, // Fee claimer
    leftoverReceiver: options.leftoverReceiver, // Leftover receiver
    payer: options.payer, // Payer
    quoteMint: NATIVE_MINT, // Quote mint: native SOL
    ...curveConfig, // Curve config parameters
  });

  // Get latest blockhash
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = options.payer;
  // Config account partial signature
  transaction.partialSign(config);

  return {
    configAddress: config.publicKey.toBase58(), // Config address
    transaction, // Unsigned transaction (already has config's partial signature)
    configKeypair: config, // Config keypair
  };
}
