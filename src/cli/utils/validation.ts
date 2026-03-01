/**
 * Input validation utilities
 */

import { PublicKey } from "@solana/web3.js";

/**
 * Validate that a string is a valid Solana public key
 * @param address Address string to validate
 * @returns PublicKey if valid
 * @throws Error if invalid
 */
export function validatePublicKey(address: string): PublicKey {
  try {
    return new PublicKey(address);
  } catch (error) {
    throw new Error(`Invalid Solana address: ${address}`);
  }
}

/**
 * Validate that a value is a positive number
 * @param value Value to validate
 * @param name Parameter name for error message
 * @returns Parsed number if valid
 * @throws Error if invalid
 */
export function validatePositiveNumber(
  value: string | number,
  name: string
): number {
  const num = typeof value === "string" ? parseFloat(value) : value;

  if (isNaN(num)) {
    throw new Error(`${name} must be a valid number`);
  }

  if (num <= 0) {
    throw new Error(`${name} must be greater than 0`);
  }

  return num;
}

/**
 * Validate that a value is a non-negative number
 * @param value Value to validate
 * @param name Parameter name for error message
 * @returns Parsed number if valid
 * @throws Error if invalid
 */
export function validateNonNegativeNumber(
  value: string | number,
  name: string
): number {
  const num = typeof value === "string" ? parseFloat(value) : value;

  if (isNaN(num)) {
    throw new Error(`${name} must be a valid number`);
  }

  if (num < 0) {
    throw new Error(`${name} must be non-negative`);
  }

  return num;
}

/**
 * Validate required option
 * @param value Option value
 * @param name Option name
 * @throws Error if value is undefined
 */
export function validateRequired<T>(value: T | undefined, name: string): T {
  if (value === undefined || value === null) {
    throw new Error(`${name} is required`);
  }
  return value;
}
