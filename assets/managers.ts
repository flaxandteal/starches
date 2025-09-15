/**
 * Shared managers module to break circular dependencies
 */

// Map manager types and instances
export interface IMapManager {
  addMaps(): Promise<void>;
  setMapCover(status: boolean): void;
}

export interface ISearchManager {
  search(term: string): Promise<any>;
  getPagefindInstance(): Promise<any>;
}

// Global manager promises
let resolvePrimaryMap: Function;
export const primaryMap: Promise<any> = new Promise((resolve) => { resolvePrimaryMap = resolve; });

let resolveMapManager: Function;
export const mapManager: Promise<IMapManager> = new Promise((resolve) => { resolveMapManager = resolve; });

let resolveSearchManager: Function;
export const searchManager: Promise<ISearchManager> = new Promise((resolve) => { resolveSearchManager = resolve; });

// Resolver functions
export function resolvePrimaryMapWith(map: any): void {
  resolvePrimaryMap(map);
}

export function resolveMapManagerWith(manager: IMapManager): void {
  resolveMapManager(manager);
}

export function resolveSearchManagerWith(manager: ISearchManager): void {
  resolveSearchManager(manager);
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