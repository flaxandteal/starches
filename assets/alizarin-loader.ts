// Wraps alizarin to try loading WASM from file, with data-URI fallback
// for environments where .wasm files are blocked (e.g. corporate firewalls).
//
// Strategy:
// 1. Poison alizarin's auto-init with data:, (fails instantly, no network)
// 2. Try /wasm/alizarin_bg.wasm (optimal native loading)
// 3. Fallback: fetch /wasm/alizarin_bg.txt (base64-encoded WASM as plain text),
//    construct a data: URI, and init from that

import { setWasmURL, initWasm, wasmReady as _alizarinAutoInit, viewModels as _viewModels } from 'alizarin';

// Re-export all symbols consumers need (wasmReady is overridden below)
export {
  AlizarinModel, client, RDM, graphManager, staticStore,
  staticTypes, viewModels, renderers, slugify, utils
} from 'alizarin';
import '@alizarin/filelist'; // Registers file-list type (images)
import '@alizarin/clm'; // Registers reference type

// Fail loudly if either custom datatype extension failed to register. Without these,
// alizarin silently falls back to non-localized-string which stringifies reference
// objects as "[object Object]" — templates render empty and nothing tells you why.
const REQUIRED_CUSTOM_DATATYPES = ['file-list', 'reference'] as const;
for (const dt of REQUIRED_CUSTOM_DATATYPES) {
  if (!_viewModels.CUSTOM_DATATYPES.has(dt)) {
    const msg = `[alizarin-loader] Required custom datatype "${dt}" is not registered. ` +
      `Template values of this type will render incorrectly. ` +
      `Check that the @alizarin/${dt === 'file-list' ? 'filelist' : 'clm'} import succeeded.`;
    console.error(msg);
    if (typeof window !== 'undefined' && window.document) {
      window.addEventListener('DOMContentLoaded', () => {
        const banner = document.createElement('div');
        banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;' +
          'background:#b00020;color:#fff;padding:8px 16px;font:14px sans-serif;' +
          'border-bottom:2px solid #600';
        banner.textContent = msg;
        document.body.prepend(banner);
      });
    }
  }
}

// Disable alizarin's auto-init by giving it an immediately-failing data URL.
// This prevents a real network request and lets us control init timing.
setWasmURL('data:,');

// Swallow the auto-init rejection — we intentionally poisoned it above
// and will handle initialization ourselves below.
_alizarinAutoInit.catch(() => {});

// Controlled initialization with fallback chain
export const wasmReady: Promise<void> = (async () => {
  // Let auto-init's immediate failure complete (it runs as a microtask).
  // We use setTimeout rather than awaiting _alizarinAutoInit because older
  // alizarin builds leave wasmReady permanently pending on failure.
  await new Promise(r => setTimeout(r, 0));

  // Primary: try .wasm file (native WASM loading, best performance)
  try {
    setWasmURL('/wasm/alizarin_bg.wasm');
    await initWasm();
    return;
  } catch {
    // .wasm blocked or unavailable — fall through to data-URI fallback
  }

  // Fallback: fetch base64-encoded WASM as a plain .txt file (passes any firewall),
  // then construct a data: URI for wasm-bindgen to consume
  try {
    console.warn('[alizarin] .wasm file blocked, loading base64 text fallback');
    const response = await fetch('/wasm/alizarin_bg.txt');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const b64 = (await response.text()).trim();
    setWasmURL(`data:application/wasm;base64,${b64}`);
    await initWasm();
    return;
  } catch (e) {
    console.error('[alizarin] All WASM loading methods failed:', e);
    throw new Error(
      'Could not load WASM module. If you are behind a corporate firewall, ' +
      'it may be blocking WebAssembly files.'
    );
  }
})();
