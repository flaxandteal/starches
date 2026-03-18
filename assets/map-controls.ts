import { Map as MLMap, IControl } from 'maplibre-gl';
import { BasemapDefinition, OverlayDefinition, BasemapLoadResult } from './map-config';

export interface BasemapControlOption {
  id: string;
  label: string;
}

export class BasemapSwitchControl implements IControl {
  _container!: HTMLDivElement;
  _map!: MLMap;
  _basemaps: BasemapControlOption[];
  _currentBasemap: string;
  _basemapLayers: Map<string, string[]> = new Map();

  constructor(basemaps: BasemapControlOption[], defaultBasemap: string) {
    this._basemaps = basemaps;
    this._currentBasemap = defaultBasemap;
  }

  /**
   * Register the layer IDs associated with a basemap
   */
  registerBasemapLayers(basemapId: string, layerIds: string[]): void {
    this._basemapLayers.set(basemapId, layerIds);
  }

  /**
   * Register multiple basemaps from load results
   */
  registerBasemapResults(results: BasemapLoadResult[]): void {
    for (const result of results) {
      this.registerBasemapLayers(result.basemapId, result.layerIds);
    }
  }

  onAdd(map: MLMap): HTMLDivElement {
    this._map = map;
    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group basemap-switch-ctrl';
    this._container.style.padding = '10px';
    this._container.style.background = 'white';

    this._basemaps.forEach(basemap => {
      const label = document.createElement('label');
      label.style.display = 'block';
      label.style.cursor = 'pointer';
      label.style.whiteSpace = 'nowrap';

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'basemap';
      radio.value = basemap.id;
      radio.checked = basemap.id === this._currentBasemap;
      radio.style.marginRight = '6px';
      radio.onchange = () => this._switchBasemap(basemap.id);

      label.appendChild(radio);
      label.appendChild(document.createTextNode(basemap.label));
      this._container.appendChild(label);
    });

    return this._container;
  }

  _switchBasemap(basemapId: string): void {
    const map = this._map;
    this._currentBasemap = basemapId;

    // Hide all basemap layers, show only the selected one
    for (const [id, layerIds] of this._basemapLayers.entries()) {
      const visibility = id === basemapId ? 'visible' : 'none';
      for (const layerId of layerIds) {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, 'visibility', visibility);
        }
      }
    }

    // Also handle the background layer if it exists
    if (map.getLayer('background')) {
      // Show background for vector-type basemaps, hide for raster
      const selectedBasemap = this._basemaps.find(b => b.id === basemapId);
      // For now, assume non-raster basemaps want the background visible
      // This could be made configurable per basemap if needed
    }
  }

  onRemove(): void {
    this._container.parentNode?.removeChild(this._container);
  }
}

export interface OverlayControlOption {
  id: string;
  layerId: string;
  label: string;
  visible?: boolean;
}

export class OverlayToggleControl implements IControl {
  _container!: HTMLDivElement;
  _map!: MLMap;
  _layers: OverlayControlOption[];

  constructor(layers: OverlayControlOption[]) {
    this._layers = layers;
  }

  onAdd(map: MLMap): HTMLDivElement {
    this._map = map;
    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group overlay-toggle-ctrl';
    this._container.style.padding = '10px';
    this._container.style.background = 'white';

    this._layers.forEach(layer => {
      const label = document.createElement('label');
      label.style.display = 'block';
      label.style.cursor = 'pointer';
      label.style.whiteSpace = 'nowrap';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = layer.visible === true;
      checkbox.style.marginRight = '6px';
      checkbox.onchange = () => {
        if (map.getLayer(layer.layerId)) {
          map.setLayoutProperty(layer.layerId, 'visibility',
            checkbox.checked ? 'visible' : 'none');
        }
      };

      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(layer.label));
      this._container.appendChild(label);
    });

    return this._container;
  }

  onRemove(): void {
    this._container.parentNode?.removeChild(this._container);
  }
}

/**
 * Factory to create control options from config definitions
 */
export function basemapOptionsFromConfig(basemaps: BasemapDefinition[]): BasemapControlOption[] {
  return basemaps.map(b => ({ id: b.id, label: b.label }));
}

export function overlayOptionsFromConfig(
  overlays: OverlayDefinition[],
  layerIdMap: Map<string, string>
): OverlayControlOption[] {
  return overlays.map(o => ({
    id: o.id,
    layerId: layerIdMap.get(o.id) || `${o.id}-layer`,
    label: o.label,
    visible: o.visible
  }));
}
