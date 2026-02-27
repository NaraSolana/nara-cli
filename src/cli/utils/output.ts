/**
 * Output formatting utilities
 */

/**
 * Format output based on mode
 * @param data Data to output
 * @param jsonMode Whether to output in JSON format
 */
export function formatOutput(data: any, jsonMode: boolean = false): void {
  if (jsonMode) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    // Human-readable output
    formatHumanReadable(data);
  }
}

/**
 * Format data in human-readable format
 * @param data Data to format
 */
function formatHumanReadable(data: any): void {
  if (typeof data === "object" && data !== null) {
    for (const [key, value] of Object.entries(data)) {
      const label = formatLabel(key);

      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        console.log(`\n${label}:`);
        formatHumanReadable(value);
      } else {
        console.log(`${label}: ${formatValue(value)}`);
      }
    }
  } else {
    console.log(data);
  }
}

/**
 * Format object key as human-readable label
 * @param key Object key
 * @returns Formatted label
 */
function formatLabel(key: string): string {
  // Convert camelCase to Title Case
  const words = key.replace(/([A-Z])/g, " $1").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Format value for display
 * @param value Value to format
 * @returns Formatted value string
 */
function formatValue(value: any): string {
  if (value === null || value === undefined) {
    return "N/A";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "number") {
    // Format large numbers with commas
    if (value >= 1000) {
      return value.toLocaleString();
    }
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return value.toString();
}

/**
 * Print success message
 * @param message Success message
 */
export function printSuccess(message: string): void {
  console.log(`✅ ${message}`);
}

/**
 * Print error message
 * @param message Error message
 */
export function printError(message: string): void {
  console.error(`❌ Error: ${message}`);
}

/**
 * Print info message
 * @param message Info message
 */
export function printInfo(message: string): void {
  console.log(`ℹ️  ${message}`);
}

/**
 * Print warning message
 * @param message Warning message
 */
export function printWarning(message: string): void {
  console.log(`⚠️  ${message}`);
}
