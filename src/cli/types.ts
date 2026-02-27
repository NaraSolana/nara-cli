/**
 * CLI-specific types and interfaces
 */

import { PublicKey } from "@solana/web3.js";

/**
 * Global options available on all commands
 */
export interface GlobalOptions {
  /** RPC endpoint URL */
  rpcUrl?: string;
  /** Path to wallet keypair JSON file */
  wallet?: string;
  /** Output in JSON format */
  json?: boolean;
}

/**
 * Config create command options
 */
export interface ConfigCreateOptions extends GlobalOptions {
  /** Fee claimer wallet address */
  feeClaimer?: string;
  /** Leftover token receiver wallet address */
  leftoverReceiver?: string;
  /** Total token supply */
  totalSupply?: number;
  /** Initial market cap */
  initialMcap?: number;
  /** Migration market cap */
  migrationMcap?: number;
  /** Export unsigned transaction */
  exportTx?: boolean;
}

/**
 * Pool create command options
 */
export interface PoolCreateOptions extends GlobalOptions {
  /** Token name */
  name: string;
  /** Token symbol */
  symbol: string;
  /** Metadata URI */
  uri: string;
  /** DBC config address */
  dbcConfig: string;
  /** Pool creator address */
  creator?: string;
  /** Export unsigned transaction */
  exportTx?: boolean;
}

/**
 * Pool create with buy command options
 */
export interface PoolCreateWithBuyOptions extends PoolCreateOptions {
  /** Initial buy amount in SOL */
  amount: number;
  /** Buyer address */
  buyer?: string;
  /** Token receiver address */
  receiver?: string;
  /** Slippage in basis points */
  slippage?: number;
}

/**
 * Pool info command options
 */
export interface PoolInfoOptions extends GlobalOptions {
  /** Token address */
  tokenAddress: string;
}

/**
 * Swap buy command options
 */
export interface SwapBuyOptions extends GlobalOptions {
  /** Token address */
  tokenAddress: string;
  /** Amount in SOL */
  amount: number;
  /** Slippage in basis points */
  slippage?: number;
  /** Swap mode */
  mode?: string;
  /** Export unsigned transaction */
  exportTx?: boolean;
}

/**
 * Swap sell command options
 */
export interface SwapSellOptions extends GlobalOptions {
  /** Token address */
  tokenAddress: string;
  /** Amount in tokens */
  amount: number;
  /** Token decimals */
  decimals?: number;
  /** Slippage in basis points */
  slippage?: number;
  /** Swap mode */
  mode?: string;
  /** Export unsigned transaction */
  exportTx?: boolean;
}

/**
 * Swap quote command options
 */
export interface SwapQuoteOptions extends GlobalOptions {
  /** Token address */
  tokenAddress: string;
  /** Amount */
  amount: number;
  /** Direction: buy or sell */
  direction: string;
  /** Token decimals (for sell only) */
  decimals?: number;
  /** Slippage in basis points */
  slippage?: number;
}

/**
 * Migrate launch command options
 */
export interface MigrateLaunchOptions extends GlobalOptions {
  /** Token address */
  tokenAddress: string;
  /** Export unsigned transaction */
  exportTx?: boolean;
}

/**
 * Migrate create locker command options
 */
export interface MigrateCreateLockerOptions extends GlobalOptions {
  /** Token address */
  tokenAddress: string;
  /** Export unsigned transaction */
  exportTx?: boolean;
}

/**
 * Migrate check command options
 */
export interface MigrateCheckOptions extends GlobalOptions {
  /** Token address */
  tokenAddress: string;
}

/**
 * Wallet balance command options
 */
export interface WalletBalanceOptions extends GlobalOptions {
  /** Wallet address (optional, defaults to current wallet) */
  address?: string;
}

/**
 * Token balance command options
 */
export interface TokenBalanceOptions extends GlobalOptions {
  /** Token address */
  tokenAddress: string;
  /** Owner address (optional, defaults to current wallet) */
  owner?: string;
}

/**
 * Transaction status command options
 */
export interface TxStatusOptions extends GlobalOptions {
  /** Transaction signature */
  signature: string;
}

/**
 * Transfer SOL command options
 */
export interface TransferSolOptions extends GlobalOptions {
  /** Recipient address */
  to: string;
  /** Amount in SOL */
  amount: number;
  /** Export unsigned transaction */
  exportTx?: boolean;
}

/**
 * Transfer token command options
 */
export interface TransferTokenOptions extends GlobalOptions {
  /** Token address */
  tokenAddress: string;
  /** Recipient address */
  to: string;
  /** Amount in tokens */
  amount: number;
  /** Token decimals */
  decimals?: number;
  /** Export unsigned transaction */
  exportTx?: boolean;
}
