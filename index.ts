/**
 * Nara CLI & SDK - CLI and SDK for the Nara chain (Solana-compatible)
 *
 * This SDK provides functions to interact with the Nara chain.
 * All transaction-related functions return unsigned transactions that
 * must be signed and sent by the caller.
 */

// Export main client
export { NaraSDK, type NaraSDKConfig } from "./src/client";

// Export constants
export { DEFAULT_RPC_URL, DEFAULT_QUEST_PROGRAM_ID } from "./src/constants";

// Export config functions and types
export {
  createConfig,
  type CreateConfigOptions,
  type CreateConfigResult,
} from "./src/config";

// Export pool functions and types
export {
  createPool,
  createPoolWithFirstBuy,
  getPoolInfo,
  getPoolProgress,
  type CreatePoolParams,
  type CreatePoolResult,
  type CreatePoolWithFirstBuyParams,
  type CreatePoolWithFirstBuyResult,
} from "./src/pool";

// Export swap functions and types
export {
  buyToken,
  sellToken,
  getSwapQuote,
  SwapMode,
  type BuyTokenParams,
  type BuyTokenResult,
  type SellTokenParams,
  type SellTokenResult,
  type SwapQuoteResponse,
} from "./src/swap";

// Export migrate functions and types
export {
  migrateToDAMMV2,
  createLocker,
  canMigrate,
  type MigrateToDAMMV2Params,
  type MigrateToDAMMV2Result,
  type CreateLockerParams,
  type CreateLockerResult,
} from "./src/migrate";

// Export quest functions and types
export {
  getQuestInfo,
  hasAnswered,
  generateProof,
  submitAnswer,
  submitAnswerViaRelay,
  parseQuestReward,
  type QuestInfo,
  type ZkProof,
  type ZkProofHex,
  type SubmitAnswerResult,
  type SubmitRelayResult,
  type QuestOptions,
} from "./src/quest";

// Re-export commonly used types from dependencies
export { PublicKey, Keypair, Transaction } from "@solana/web3.js";
export { default as BN } from "bn.js";
