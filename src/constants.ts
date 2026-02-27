/**
 * SDK and CLI default constants
 *
 * Priority for all values: CLI flag > env variable > default value
 */

/**
 * Default RPC URL for Nara testnet
 */
export const DEFAULT_RPC_URL =
  process.env.RPC_URL || "https://testnet.naraso.org/";

/**
 * Default bonding curve config address
 */
export const DEFAULT_DBC_CONFIG_ADDRESS =
  process.env.DBC_CONFIG_ADDRESS || "";

/**
 * Default wallet path
 */
export const DEFAULT_WALLET_PATH =
  process.env.WALLET_PATH || "~/.config/nara/id.json";

/**
 * Default quest relay URL
 */
export const DEFAULT_QUEST_RELAY_URL =
  process.env.QUEST_RELAY_URL || "https://quest-relay.naraso.org";
