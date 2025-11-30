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

export interface SearchParams {
  searchTerm?: string;
  geoBounds?: [number, number, number, number];
  searchFilters?: {[k: string]: string[]};
}

export interface SearchContext {
  /** Array of asset IDs from search results */
  resultIds: string[];
  /** Search parameters that produced these results */
  searchParams: SearchParams;
  /** Timestamp when search was performed */
  timestamp: number;
}

export interface ISearchContextManager {
  loadContext(): Promise<SearchContext>;
  saveContext(context: SearchContext): void;
  saveSearchResults(ids: string[], params: SearchParams): void;
}

export interface IFlatbushManager {
  bounds: null | [number, number, number, number];
  getFiltered(withMetadata?: boolean): Promise<any>;
  nearest(loc: [number, number], regcode: number | undefined): Promise<any>;
  setFiltered(val: any): void;
}

export interface AssetMetadata {
  resourceinstanceid: string;
  geometry: any;
  location: [number, number] | null;
  title: string;
}

export interface IAssetManager {
  initialize(): Promise<void>;
  loadAssetFromUrl(): Promise<{ asset: any; meta: AssetMetadata }>;
  render(publicView: boolean): Promise<void>;
  getAsset(): { asset: any; meta: AssetMetadata } | null;
}

export class StarchesConfiguration {
  [key: string]: any;
  showGeolocateControl?: boolean;
  minSearchZoom?: number;
  minSearchLength?: number;
  maxMapPoints?: number;
  timeToShowLoadingMs?: number;
  hasSearch?: boolean;
  allowSearchContext?: boolean;
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
      flatbushManager?: Promise<IFlatbushManager>;
      resolveFlatbushManager?: Function;
      searchContextManager?: Promise<ISearchContextManager>;
      resolveSearchContextManager?: Function;
      assetManager?: Promise<IAssetManager>;
      resolveAssetManager?: Function;
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

let resolveFlatbushManager: Function;
export const flatbushManager: Promise<IFlatbushManager> = window.__starchesManagers.flatbushManager ||
  (window.__starchesManagers.flatbushManager = new Promise((resolve) => {
    resolveFlatbushManager = window.__starchesManagers.resolveFlatbushManager = resolve;
  }));
if (!window.__starchesManagers.resolveFlatbushManager) {
  resolveFlatbushManager = (value: any) => { /* already resolved */ };
} else {
  resolveFlatbushManager = window.__starchesManagers.resolveFlatbushManager;
}

let resolveSearchContextManager: Function;
export const searchContextManager: Promise<ISearchContextManager> = window.__starchesManagers.searchContextManager ||
  (window.__starchesManagers.searchContextManager = new Promise((resolve) => {
    resolveSearchContextManager = window.__starchesManagers.resolveSearchContextManager = resolve;
  }));
if (!window.__starchesManagers.resolveSearchContextManager) {
  resolveSearchContextManager = (value: any) => { /* already resolved */ };
} else {
  resolveSearchContextManager = window.__starchesManagers.resolveSearchContextManager;
}

let resolveAssetManager: Function;
export const assetManager: Promise<IAssetManager> = window.__starchesManagers.assetManager ||
  (window.__starchesManagers.assetManager = new Promise((resolve) => {
    resolveAssetManager = window.__starchesManagers.resolveAssetManager = resolve;
  }));
if (!window.__starchesManagers.resolveAssetManager) {
  resolveAssetManager = (value: any) => { /* already resolved */ };
} else {
  resolveAssetManager = window.__starchesManagers.resolveAssetManager;
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

export function resolveFlatbushManagerWith(manager?: IFlatbushManager): void {
  resolveFlatbushManager(manager);
  // Clear the resolver from window to prevent duplicate calls
  delete window.__starchesManagers.resolveFlatbushManager;
}

export function resolveSearchContextManagerWith(manager: ISearchContextManager): void {
  resolveSearchContextManager(manager);
  // Clear the resolver from window to prevent duplicate calls
  delete window.__starchesManagers.resolveSearchContextManager;
}

export function resolveAssetManagerWith(manager: IAssetManager): void {
  resolveAssetManager(manager);
  // Clear the resolver from window to prevent duplicate calls
  delete window.__starchesManagers.resolveAssetManager;
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

export async function getFlatbushManager(): Promise<IFlatbushManager> {
  return flatbushManager;
}

export async function getSearchContextManager(): Promise<ISearchContextManager> {
  return searchContextManager;
}

export async function getAssetManager(): Promise<IAssetManager> {
  return assetManager;
}

export async function getConfig(): Promise<StarchesConfiguration> {
  return configuration;
}

import './config';
