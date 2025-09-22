/**
 * Shared managers module to break circular dependencies
 */

export interface ILayerManager {
    blankExcept(except: string[]): Promise<void>;
    ensureRegister(register: string): Promise<boolean | undefined>;
}

// Map manager types and instances
export interface IMapManager {
  addMaps(): Promise<void>;
  setMapCover(status: boolean): void;
  getLayerManager(): Promise<ILayerManager>;
}

export interface ISearchManager {
  search(term: string): Promise<any>;
  getPagefindInstance(): Promise<any>;
}

export class StarchesConfiguration {
  [key: string]: any;
  showGeolocateControl?: boolean;
  minSearchZoom?: number;
  minSearchLength?: number;
  maxMapPoints?: number;
  timeToShowLoadingMs?: number;
  hasSearch?: boolean;
}

// Store managers on window to ensure singleton behavior across module instances
declare global {
  interface Window {
    __starchesManagers: {
      primaryMap?: Promise<any>;
      resolvePrimaryMap?: Function;
      mapManager?: Promise<IMapManager>;
      resolveMapManager?: Function;
      searchManager?: Promise<ISearchManager>;
      resolveSearchManager?: Function;
      configuration?: Promise<StarchesConfiguration>;
      resolveConfiguration?: Function;
    };
    STARCHES_BASE_CONFIGURATION?: string;
    STARCHES_HAS_SEARCH?: boolean;
  }
}

// Initialize the global storage
if (!window.__starchesManagers) {
  window.__starchesManagers = {};
}

// Global manager promises - use window storage to ensure singleton
let resolvePrimaryMap: Function;
export const primaryMap: Promise<any> = window.__starchesManagers.primaryMap ||
  (window.__starchesManagers.primaryMap = new Promise((resolve) => {
    resolvePrimaryMap = window.__starchesManagers.resolvePrimaryMap = resolve;
  }));
if (!window.__starchesManagers.resolvePrimaryMap) {
  resolvePrimaryMap = (value: any) => { /* already resolved */ };
} else {
  resolvePrimaryMap = window.__starchesManagers.resolvePrimaryMap;
}

let resolveMapManager: Function;
export const mapManager: Promise<IMapManager> = window.__starchesManagers.mapManager ||
  (window.__starchesManagers.mapManager = new Promise((resolve) => {
    resolveMapManager = window.__starchesManagers.resolveMapManager = resolve;
  }));
if (!window.__starchesManagers.resolveMapManager) {
  resolveMapManager = (value: any) => { /* already resolved */ };
} else {
  resolveMapManager = window.__starchesManagers.resolveMapManager;
}

let resolveSearchManager: Function;
export const searchManager: Promise<ISearchManager> = window.__starchesManagers.searchManager ||
  (window.__starchesManagers.searchManager = new Promise((resolve) => {
    resolveSearchManager = window.__starchesManagers.resolveSearchManager = resolve;
  }));
if (!window.__starchesManagers.resolveSearchManager) {
  resolveSearchManager = (value: any) => { /* already resolved */ };
} else {
  resolveSearchManager = window.__starchesManagers.resolveSearchManager;
}

let resolveConfiguration: Function;
export const configuration: Promise<StarchesConfiguration> = window.__starchesManagers.configuration ||
  (window.__starchesManagers.configuration = new Promise((resolve) => {
    resolveConfiguration = window.__starchesManagers.resolveConfiguration = resolve;
  }));
if (!window.__starchesManagers.resolveConfiguration) {
  resolveConfiguration = (value: any) => { /* already resolved */ };
} else {
  resolveConfiguration = window.__starchesManagers.resolveConfiguration;
}

// Resolver functions
export function resolvePrimaryMapWith(map: any): void {
  resolvePrimaryMap(map);
  // Clear the resolver from window to prevent duplicate calls
  delete window.__starchesManagers.resolvePrimaryMap;
}

export function resolveMapManagerWith(manager: IMapManager): void {
  resolveMapManager(manager);
  // Clear the resolver from window to prevent duplicate calls
  delete window.__starchesManagers.resolveMapManager;
}

export function resolveSearchManagerWith(manager: ISearchManager): void {
  resolveSearchManager(manager);
  // Clear the resolver from window to prevent duplicate calls
  delete window.__starchesManagers.resolveSearchManager;
}

export function resolveConfigurationWith(config: StarchesConfiguration): void {
  resolveConfiguration(config);
  // Clear the resolver from window to prevent duplicate calls
  delete window.__starchesManagers.resolveConfiguration;
}

// Getter functions
export async function getMap(): Promise<any> {
  return primaryMap;
}

export async function getMapManager(): Promise<IMapManager> {
  return mapManager;
}

export async function getSearchManager(): Promise<ISearchManager> {
  return searchManager;
}

export async function getConfig(): Promise<StarchesConfiguration> {
  return configuration;
}
