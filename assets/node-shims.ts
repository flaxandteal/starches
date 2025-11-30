// Node.js module shims for browser/Hugo esbuild
// These are empty stubs that prevent build errors when Node.js modules are referenced
// The actual alizarin code conditionally checks for Node.js environment before using these

export const fs = null;
export const path = null;
export const url = null;
export const crypto = null;
export const stream = null;
export const util = null;
export const events = null;
export const buffer = null;
export const os = null;

export default {
  fs: null,
  path: null,
  url: null,
  crypto: null,
  stream: null,
  util: null,
  events: null,
  buffer: null,
  os: null
};
