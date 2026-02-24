import { Map as MLMap } from 'maplibre-gl';
import { VectorTileLayer } from '@esri/maplibre-arcgis';
import {
  BasemapConfig,
  ArcGISVectorBasemapConfig,
  MapLibreStyleBasemapConfig,
  BasemapLoadResult,
  IBasemapLoader,
  registerBasemapLoader
} from './map-config';

// ArcGIS REST API URL patterns
const ARCGIS_PATH_PATTERNS = [
  '/arcgis/rest/services/',
  '/ArcGIS/rest/services/',  // some servers use different casing
  '/MapServer',
  '/FeatureServer',
  '/VectorTileServer',
  '/ImageServer',
  '/GeocodeServer'
];

// File extensions that shouldn't get f=json appended
const BINARY_EXTENSIONS = ['.pbf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.mvt'];

function isArcGISRestUrl(url: string): boolean {
  return ARCGIS_PATH_PATTERNS.some(pattern => url.includes(pattern));
}

function isBinaryRequest(url: string): boolean {
  const urlLower = url.toLowerCase();
  return BINARY_EXTENSIONS.some(ext => urlLower.includes(ext));
}

// ArcGIS-specific request transformation
function transformRequest(url: string, resourceType: string) {
  // ArcGIS server returns HTML by default - add f=json for JSON responses
  if (isArcGISRestUrl(url) && !url.includes('f=json') && !isBinaryRequest(url)) {
    const separator = url.includes('?') ? '&' : '?';
    return { url: url + separator + 'f=json' };
  }
}

export function updateOptions(options: Record<string, any>): Record<string, any> {
  return {
    ...options,
    transformRequest
  };
}

// ArcGIS Vector Tile basemap loader
export class ArcGISVectorBasemapLoader implements IBasemapLoader {
  canLoad(config: BasemapConfig): boolean {
    return config.type === 'arcgis-vector';
  }

  async load(map: MLMap, basemapId: string, config: BasemapConfig, insertBefore?: string): Promise<BasemapLoadResult> {
    const arcgisConfig = config as ArcGISVectorBasemapConfig;

    // Track layers before adding
    const layersBefore = new Set(map.getStyle().layers.map(l => l.id));

    try {
      const vectorLayer = await VectorTileLayer.fromUrl(arcgisConfig.url);
      vectorLayer.addSourcesAndLayersTo(map);

      // Capture layer IDs added by the basemap
      const allLayers = map.getStyle().layers.map(l => l.id);
      const addedLayerIds = allLayers.filter(id => !layersBefore.has(id));

      // Get source IDs from the added layers
      const sourceIds = new Set<string>();
      for (const layerId of addedLayerIds) {
        const layer = map.getLayer(layerId);
        if (layer && 'source' in layer) {
          sourceIds.add(layer.source as string);
        }
      }

      return {
        basemapId,
        layerIds: addedLayerIds,
        sourceIds: Array.from(sourceIds)
      };
    } catch (e) {
      console.warn(`Failed to load ArcGIS vector basemap ${basemapId}:`, e);
      return {
        basemapId,
        layerIds: [],
        sourceIds: []
      };
    }
  }
}

// MapLibre style URL basemap loader
export class MapLibreStyleBasemapLoader implements IBasemapLoader {
  canLoad(config: BasemapConfig): boolean {
    return config.type === 'style';
  }

  async load(map: MLMap, basemapId: string, config: BasemapConfig, insertBefore?: string): Promise<BasemapLoadResult> {
    const styleConfig = config as MapLibreStyleBasemapConfig;

    try {
      const response = await fetch(styleConfig.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch style: ${response.status}`);
      }
      const style = await response.json();

      const addedSourceIds: string[] = [];
      const addedLayerIds: string[] = [];

      // Add sources from the style
      for (const [sourceId, sourceDef] of Object.entries(style.sources || {})) {
        const prefixedId = `${basemapId}-${sourceId}`;
        if (!map.getSource(prefixedId)) {
          map.addSource(prefixedId, sourceDef as any);
          addedSourceIds.push(prefixedId);
        }
      }

      // Add layers from the style, remapping source references
      for (const layer of (style.layers || [])) {
        const prefixedLayerId = `${basemapId}-${layer.id}`;
        const layerDef = { ...layer, id: prefixedLayerId };
        if (layer.source) {
          layerDef.source = `${basemapId}-${layer.source}`;
        }
        if (!map.getLayer(prefixedLayerId)) {
          map.addLayer(layerDef, insertBefore);
          addedLayerIds.push(prefixedLayerId);
        }
      }

      return {
        basemapId,
        layerIds: addedLayerIds,
        sourceIds: addedSourceIds
      };
    } catch (e) {
      console.warn(`Failed to load style basemap ${basemapId}:`, e);
      return {
        basemapId,
        layerIds: [],
        sourceIds: []
      };
    }
  }
}

// Register the ArcGIS loader
registerBasemapLoader(new ArcGISVectorBasemapLoader());
registerBasemapLoader(new MapLibreStyleBasemapLoader());
