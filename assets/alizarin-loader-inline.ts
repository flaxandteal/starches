// Alizarin loader — inline WASM mode.
// WASM is embedded as a base64 data URI in the alizarin/inline build.
// No separate network request for WASM — works through corporate firewalls.
//
// To activate: in hugo.yaml add a mount that overlays this file:
//   module:
//     mounts:
//       - source: assets/alizarin-loader-inline.ts
//         target: assets/alizarin-loader.ts

export {
  AlizarinModel, client, RDM, graphManager, staticStore,
  staticTypes, viewModels, renderers, slugify, utils,
  initWasm, setWasmURL, version as alizarinVersion
} from 'alizarin/inline';
import { wasmReady as _wasmReady, version } from 'alizarin/inline';
import '@alizarin/filelist';
import '@alizarin/clm';

export const wasmReady: Promise<void> = _wasmReady.then(() => {
  console.log(`[alizarin] v${version}`);
});
