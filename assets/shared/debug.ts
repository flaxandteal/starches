/**
 * Debug utility functions for the browser environment.
 * These functions only output in development mode, not in production.
 */

// This variable is injected by Hugo via a global script tag
// @ts-ignore
export const isDebug = typeof window !== 'undefined' && window.STARCHES_IS_PRODUCTION === false;

/**
 * Log debug messages (only in development mode)
 */
export function debug(...args: any[]): void {
  if (isDebug) {
    console.log(...args);
  }
}

/**
 * Log warning messages (only in development mode)
 */
export function debugWarn(...args: any[]): void {
  if (isDebug) {
    console.warn(...args);
  }
}

/**
 * Log error messages (only in development mode)
 * Note: For critical errors, use console.error directly
 */
export function debugError(...args: any[]): void {
  if (isDebug) {
    console.error(...args);
  }
}

/**
 * Check if code is running in development mode
 */
export function isDevelopment(): boolean {
  return isDebug;
}
