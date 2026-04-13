// Alizarin loader — dynamic WASM loading with fallback chain.
// For inline WASM mode (corporate firewalls), mount alizarin-loader-inline.ts
// over this file via hugo.yaml module.mounts.
//
// Strategy:
// 1. Poison alizarin's auto-init with data:, (fails instantly, no network)
// 2. Try /wasm/alizarin_bg.wasm (optimal native loading)
// 3. Fallback: fetch /wasm/alizarin_bg.txt (base64-encoded WASM as plain text)

import { setWasmURL, initWasm, wasmReady as _alizarinAutoInit } from 'alizarin';

export {
  AlizarinModel, client, RDM, graphManager, staticStore,
  staticTypes, viewModels, renderers, slugify, utils
} from 'alizarin';
import '@alizarin/filelist';
import '@alizarin/clm';

setWasmURL('data:,');
_alizarinAutoInit.catch(() => {});

export const wasmReady: Promise<void> = (async () => {
  await new Promise(r => setTimeout(r, 0));

  try {
    setWasmURL('/wasm/alizarin_bg.wasm');
    await initWasm();
    return;
  } catch {
    // .wasm blocked or unavailable
  }

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
