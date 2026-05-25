import { Map as MLMap } from 'maplibre-gl';

// Basemap configuration types
export interface RasterBasemapConfig {
  type: 'raster';
  tiles: string | string[];
  tileSize?: number;
  attribution?: string;
}

export interface VectorTileSupplementConfig {
  url: string;
  sourceLayers: string[];
}

export interface ArcGISVectorBasemapConfig {
  type: 'arcgis-vector';
  url: string;
  labelUrl?: string;
  supplements?: VectorTileSupplementConfig[];
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

export interface GeoJSONExtrusionOverlayConfig {
  type: 'geojson-extrusion';
  url: string;
  heightProperty?: string;
  idProperty?: string;
  baseColor?: string;
  highlightColor?: string;
  opacity?: number;
}

export type OverlayConfig = RasterOverlayConfig | GeoJSONExtrusionOverlayConfig;

export interface OverlayDefinition {
  id: string;
  label: string;
  config: OverlayConfig;
  visible?: boolean;
}

// Main map configuration
export interface MapConfig {
  basemaps: BasemapDefinition[];
  defaultBasemap: string;
  overlays?: OverlayDefinition[];
  pitch?: number;
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

// Overlay loader (handles raster and geojson-extrusion types)
export async function loadOverlay(
  map: MLMap,
  overlay: OverlayDefinition
): Promise<{ layerId: string; sourceId: string }> {
  const sourceId = `${overlay.id}-source`;
  const layerId = `${overlay.id}-layer`;
  const config = overlay.config;

  if (config.type === 'geojson-extrusion') {
    return loadGeoJSONExtrusionOverlay(map, overlay, config);
  }

  const rasterConfig = config as RasterOverlayConfig;
  const tiles = Array.isArray(rasterConfig.tiles)
    ? rasterConfig.tiles
    : [rasterConfig.tiles];

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
    layout: { visibility: overlay.visible ? 'visible' : 'none' }
  });

  return { layerId, sourceId };
}

async function loadGeoJSONExtrusionOverlay(
  map: MLMap,
  overlay: OverlayDefinition,
  config: GeoJSONExtrusionOverlayConfig
): Promise<{ layerId: string; sourceId: string }> {
  const sourceId = `${overlay.id}-source`;
  const layerId = `${overlay.id}-layer`;
  const heightProp = config.heightProperty || 'height_m';
  const baseColor = config.baseColor || '#d4d4d4';
  const opacity = config.opacity ?? 0.7;

  const response = await fetch(config.url);
  const geojson = await response.json();

  map.addSource(sourceId, {
    type: 'geojson',
    data: geojson,
  });

  map.addLayer({
    id: layerId,
    type: 'fill-extrusion',
    source: sourceId,
    paint: {
      'fill-extrusion-color': baseColor,
      'fill-extrusion-height': ['get', heightProp],
      'fill-extrusion-base': 0,
      'fill-extrusion-opacity': opacity,
    },
    layout: { visibility: overlay.visible ? 'visible' : 'none' },
  });

  // Listen for search result events to highlight matched features
  const idProp = config.idProperty || 'slug';
  const highlightColor = config.highlightColor || '#e63946';

  map.on('searchresults' as any, (e: any) => {
    if (!map.getLayer(layerId)) return;
    const slugs: string[] = e.slugs || [];
    if (slugs.length > 0) {
      map.setPaintProperty(layerId, 'fill-extrusion-color', [
        'case',
        ['in', ['get', idProp], ['literal', slugs]],
        highlightColor,
        baseColor,
      ]);
    } else {
      map.setPaintProperty(layerId, 'fill-extrusion-color', baseColor);
    }
  });

  return { layerId, sourceId };
}

// Register the built-in raster loader
registerBasemapLoader(new RasterBasemapLoader());
