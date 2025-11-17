/**
 * Debug utility functions for the browser environment.
 * These functions only output in development mode, not in production.
 */

// This variable should be defined at build time from environment
// Defaults to false for safety
export const isDebug = typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEBUG === 'true';

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
