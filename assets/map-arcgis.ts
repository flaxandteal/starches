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

// ArcGIS-specific request transformation.
// ArcGIS server returns HTML by default — f=json forces JSON responses.
// Binary requests (.pbf, .png, etc.) are excluded; JSON endpoints like
// VectorTileServer root (TileJSON), style JSON, and sprite JSON all
// tolerate f=json harmlessly.
function transformRequest(url: string, resourceType: string) {
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

      // Load supplementary vector tile sources (e.g. roads/buildings from another tileset)
      if (arcgisConfig.supplements) {
        for (let i = 0; i < arcgisConfig.supplements.length; i++) {
          const supp = arcgisConfig.supplements[i];
          try {
            const suppLayer = await VectorTileLayer.fromUrl(supp.url);

            // Rename sources to avoid collision with base layer
            for (const srcId of Object.keys(suppLayer.sources)) {
              suppLayer.setSourceId(srcId, `${basemapId}-supp${i}-${srcId}`);
            }

            // Add tile sources only (not layers — we'll cherry-pick)
            suppLayer.addSourcesTo(map);

            const renamedSourceId = Object.keys(suppLayer.sources)[0];
            const matchedSourceLayers = new Set<string>();

            // Add style layers that reference configured source-layers (skip symbol/text layers)
            for (const layer of suppLayer.layers as any[]) {
              if (layer['source-layer'] && layer.type !== 'symbol' && supp.sourceLayers.includes(layer['source-layer'])) {
                map.addLayer({ ...layer });
                addedLayerIds.push(layer.id);
                matchedSourceLayers.add(layer['source-layer']);
              }
            }

            // Add fallback layers for source-layers with no matching style
            // (e.g. tile data uses a different name than the style references)
            for (const sl of supp.sourceLayers) {
              if (!matchedSourceLayers.has(sl)) {
                const fallbackId = `${basemapId}-supp${i}-${sl}`;
                map.addLayer({
                  id: fallbackId,
                  type: 'fill',
                  source: renamedSourceId,
                  'source-layer': sl,
                  paint: {
                    'fill-color': 'rgba(230,230,230,0.8)',
                    'fill-outline-color': '#CCCCCC'
                  }
                });
                addedLayerIds.push(fallbackId);
              }
            }
          } catch (e) {
            console.warn(`Failed to load supplement ${i} for basemap ${basemapId}:`, e);
          }
        }
      }

      // Load label overlay if configured
      if (arcgisConfig.labelUrl) {
        try {
          const layersBeforeLabels = new Set(map.getStyle().layers.map(l => l.id));
          const labelLayer = await VectorTileLayer.fromUrl(arcgisConfig.labelUrl);

          // Rename source IDs to avoid collision with the base layer (both use "esri")
          for (const sourceId of Object.keys(labelLayer.sources)) {
            labelLayer.setSourceId(sourceId, `${basemapId}-labels-${sourceId}`);
          }

          labelLayer.addSourcesAndLayersTo(map);

          // Capture label layer IDs and restyle for light background
          const allLayersAfterLabels = map.getStyle().layers.map(l => l.id);
          const labelLayerIds = allLayersAfterLabels.filter(id => !layersBeforeLabels.has(id));

          for (const layerId of labelLayerIds) {
            const layer = map.getLayer(layerId);
            if (layer && layer.type === 'symbol') {
              map.setPaintProperty(layerId, 'text-color', '#333333');
              map.setPaintProperty(layerId, 'text-halo-color', 'rgba(255,255,255,0.85)');
            }
          }

          addedLayerIds.push(...labelLayerIds);
        } catch (e) {
          console.warn(`Failed to load label layer for basemap ${basemapId}:`, e);
        }
      }

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
