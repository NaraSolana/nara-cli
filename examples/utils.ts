/**
 * Shared utilities for examples
 */

import { DEFAULT_RPC_URL } from "../src/constants";

/**
 * Get RPC URL from environment variable or default
 * @returns RPC URL string
 */
export function getRpcUrl(): string {
  return DEFAULT_RPC_URL;
}
