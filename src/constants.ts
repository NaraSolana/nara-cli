/**
 * SDK and CLI default constants
 *
 * Priority for all values: CLI flag > env variable > default value
 */

/**
 * Default RPC URL for Nara mainnet
 */
export const DEFAULT_RPC_URL =
  process.env.RPC_URL || "https://mainnet-api.nara.build/";

/**
 * Default wallet path
 */
export const DEFAULT_WALLET_PATH =
  process.env.WALLET_PATH || "~/.config/nara/id.json";

/**
 * Default quest relay URL
 */
export const DEFAULT_QUEST_RELAY_URL =
  process.env.QUEST_RELAY_URL || "https://quest-api.nara.build/";

/**
 * Quest program ID
 */
export const DEFAULT_QUEST_PROGRAM_ID =
  process.env.QUEST_PROGRAM_ID || "Quest11111111111111111111111111111111111111";
