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
  wasmReady, initWasm, setWasmURL
} from 'alizarin/inline';
import '@alizarin/filelist';
import '@alizarin/clm';
