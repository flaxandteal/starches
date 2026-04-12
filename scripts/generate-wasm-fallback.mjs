#!/usr/bin/env node
// Generates a base64-encoded text file from the alizarin WASM binary.
// This fallback file is served as plain text (.txt) so it passes through
// firewalls that block .wasm files.
//
// Usage: node scripts/generate-wasm-fallback.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WASM_PATH = path.join(__dirname, '../node_modules/alizarin/dist/alizarin_bg.wasm');
const OUTPUT_PATH = path.join(__dirname, '../static/wasm/alizarin_bg.txt');

const wasmBytes = fs.readFileSync(WASM_PATH);
const b64 = wasmBytes.toString('base64');

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, b64);

const wasmKB = (wasmBytes.length / 1024).toFixed(0);
const b64KB = (b64.length / 1024).toFixed(0);
console.log(`Generated ${OUTPUT_PATH}`);
console.log(`  WASM: ${wasmKB} KB → Base64: ${b64KB} KB`);
