// Configuration
export { getConfig, resolveConfigurationWith, StarchesConfiguration } from './managers';

// Manager interfaces
export type {
  ILayerManager,
  IMapManager,
  ISearchManager,
  ISearchContextManager,
  IFlatbushManager,
  IAssetManager,
  SearchParams,
  SearchContext,
  AssetMetadata,
} from './managers';

// Manager accessors
export {
  getMap,
  getMapManager,
  getSearchManager,
  getFlatbushManager,
  getSearchContextManager,
  getAssetManager,
} from './managers';

// Manager resolvers
export {
  resolvePrimaryMapWith,
  resolveMapManagerWith,
  resolveSearchManagerWith,
  resolveFlatbushManagerWith,
  resolveSearchContextManagerWith,
  resolveAssetManagerWith,
} from './managers';

// Debug
export { debug, debugWarn, debugError, isDebug, isDevelopment } from './debug';

// Dialog
export { registerDialogs, showDialog, setupDialogLinks } from './dialog';
export type { DialogContent } from './dialog';

// Types
export type { ImageInput, CarouselProvider } from './types';

// Handlebars
export { getPrecompiledTemplate, loadTemplate } from './handlebar-utils';

// Utils
export { isTouch } from './utils';
