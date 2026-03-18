import { Map as MLMap } from 'maplibre-gl';

// Basemap configuration types
export interface RasterBasemapConfig {
  type: 'raster';
  tiles: string | string[];
  tileSize?: number;
  attribution?: string;
}

export interface ArcGISVectorBasemapConfig {
  type: 'arcgis-vector';
  url: string;
  attribution?: string;
}

export interface MapLibreStyleBasemapConfig {
  type: 'style';
  url: string;
  attribution?: string;
}

export type BasemapConfig = RasterBasemapConfig | ArcGISVectorBasemapConfig | MapLibreStyleBasemapConfig;

export interface BasemapDefinition {
  id: string;
  label: string;
  config: BasemapConfig;
}

// Overlay configuration types
export interface RasterOverlayConfig {
  type: 'raster' | 'wms-export';
  tiles: string | string[];
  tileSize?: number;
  attribution?: string;
}

export interface OverlayDefinition {
  id: string;
  label: string;
  config: RasterOverlayConfig;
  visible?: boolean;
}

// Main map configuration
export interface MapConfig {
  basemaps: BasemapDefinition[];
  defaultBasemap: string;
  overlays?: OverlayDefinition[];
}

// Basemap loader result - tracks what was added to the map
export interface BasemapLoadResult {
  basemapId: string;
  layerIds: string[];
  sourceIds: string[];
}

// Abstract interface for basemap loaders
export interface IBasemapLoader {
  canLoad(config: BasemapConfig): boolean;
  load(map: MLMap, basemapId: string, config: BasemapConfig, insertBefore?: string): Promise<BasemapLoadResult>;
}

// Registry of basemap loaders
const basemapLoaders: IBasemapLoader[] = [];

export function registerBasemapLoader(loader: IBasemapLoader): void {
  basemapLoaders.push(loader);
}

export function getBasemapLoader(config: BasemapConfig): IBasemapLoader | undefined {
  return basemapLoaders.find(loader => loader.canLoad(config));
}

// Raster basemap loader (built-in)
export class RasterBasemapLoader implements IBasemapLoader {
  canLoad(config: BasemapConfig): boolean {
    return config.type === 'raster';
  }

  async load(map: MLMap, basemapId: string, config: BasemapConfig, insertBefore?: string): Promise<BasemapLoadResult> {
    const rasterConfig = config as RasterBasemapConfig;
    const sourceId = `${basemapId}-source`;
    const layerId = `${basemapId}-layer`;

    const tiles = Array.isArray(rasterConfig.tiles) ? rasterConfig.tiles : [rasterConfig.tiles];

    map.addSource(sourceId, {
      type: 'raster',
      tiles,
      tileSize: rasterConfig.tileSize || 256,
      attribution: rasterConfig.attribution
    });

    map.addLayer({
      id: layerId,
      type: 'raster',
      source: sourceId,
      layout: { visibility: 'none' }
    }, insertBefore);

    return {
      basemapId,
      layerIds: [layerId],
      sourceIds: [sourceId]
    };
  }
}

// Overlay loader (similar to raster basemap but for overlays)
export async function loadOverlay(
  map: MLMap,
  overlay: OverlayDefinition
): Promise<{ layerId: string; sourceId: string }> {
  const sourceId = `${overlay.id}-source`;
  const layerId = `${overlay.id}-layer`;

  const tiles = Array.isArray(overlay.config.tiles)
    ? overlay.config.tiles
    : [overlay.config.tiles];

  map.addSource(sourceId, {
    type: 'raster',
    tiles,
    tileSize: overlay.config.tileSize || 256,
    attribution: overlay.config.attribution
  });

  map.addLayer({
    id: layerId,
    type: 'raster',
    source: sourceId,
    layout: { visibility: overlay.visible ? 'visible' : 'none' }
  });

  return { layerId, sourceId };
}

// Register the built-in raster loader
registerBasemapLoader(new RasterBasemapLoader());
