import { Popup, Map as MLMap, NavigationControlOptions, NavigationControl, GeolocateControl, StyleSpecification, MapMouseEvent } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { deserialize as fgbDeserialize } from 'flatgeobuf/lib/mjs/geojson';
import * as params from '@params';
import { getGeoBounds } from './searchContext';
import { isTouch } from './utils';
import { getConfig } from './managers';
import {
  MapConfig,
  BasemapLoadResult,
  getBasemapLoader,
  loadOverlay
} from './map-config';
import {
  BasemapSwitchControl,
  OverlayToggleControl,
  basemapOptionsFromConfig,
  OverlayControlOption
} from './map-controls';
import { updateOptions } from './map-arcgis';
// Import map-arcgis to register the ArcGIS basemap loader
import './map-arcgis';
import { addMarkerImage } from './map-tools';
import { ensureFlatbushLoaded, FlatbushManager } from './fbwrapper';
import { getFlatbushManager, getMap, getSearchManager, resolvePrimaryMapWith, resolveMapManagerWith, IMapManager, ILayerManager } from './managers';
import { loadTemplate } from './handlebar-utils';
import { debug, debugWarn } from './debug';
import { buildIconConfig, preloadCategoryIcons, IconConfig, buildCategoryIconExpressionWithFallback } from './map-icons';

// Get map config from Hugo params, with fallback
const mapConfig: MapConfig | undefined = params.map_config;

// Get icon config from Hugo params, with fallback to defaults
const iconConfig: IconConfig = buildIconConfig(params.map_icons);

// Load the map dialog template
const mapDialogTemplatePromise = loadTemplate('/templates/map-dialog-template.html');

declare global {
  interface Window {
    map: TargetingMap;
  }
  const bootstrap: {
    Offcanvas: {
      getOrCreateInstance: (el: HTMLElement) => { show: () => void; hide: () => void };
    };
  };
}

type TargetingMap = MLMap & { targeting?: number[] | boolean };

async function resultFunction(map: TargetingMap, e: MapMouseEvent & { features?: any[] }) {
  if (!e.features || e.features.length === 0) {
    console.warn('No features found at click location');
    return;
  }

  const feature = e.features[0];
  const title = feature.properties.title;
  const description = feature.properties.description;
  const coordinates: number[] = feature.geometry.coordinates.slice();
  const lngLat = e.lngLat;

  map.stop();
  map.targeting = coordinates;
  const touch = isTouch();

  const mapDialogTemplate = await mapDialogTemplatePromise;
  if (typeof mapDialogTemplate !== 'function') {
    console.error('Map dialog template failed to load');
    return;
  }
  const url = feature.properties.url || '#';
  const renderedHtml = mapDialogTemplate({ title, description, location: coordinates, url });

  if (touch) {
    const offcanvasContent = document.getElementById("map-offcanvas__content");
    if (offcanvasContent) {
      offcanvasContent.innerHTML = renderedHtml;
    }

    const offcanvasEl = document.getElementById("map-offcanvas");
    if (offcanvasEl) {
      const offcanvas = bootstrap.Offcanvas.getOrCreateInstance(offcanvasEl);
      offcanvas.show();
    }
  } else {
    // (maplibre)
    // Ensure that if the map is zoomed out such that multiple
    // copies of the feature are visible, the popup appears
    // over the copy being pointed to.
    while (Math.abs(lngLat.lng - coordinates[0]) > 180) {
      coordinates[0] += lngLat.lng > coordinates[0] ? 360 : -360;
    }

    new Popup()
      .setLngLat(coordinates as [number, number])
      .setHTML(renderedHtml)
      .addTo(window.map);
  }
}

class ResetViewControl extends NavigationControl {
  defaultLatLng: [number, number];
  defaultZoom: number;
  fb: FlatbushManager;
  _resetButton!: HTMLButtonElement;

  constructor(defaultLatLng: [number, number], defaultZoom: number, fb: FlatbushManager, options?: NavigationControlOptions) {
    super(options);
    this.defaultLatLng = defaultLatLng;
    this.defaultZoom = defaultZoom;
    this.fb = fb;
  }

  onAdd(map: MLMap) {
    const container = super.onAdd(map);
    this._resetButton = this._createButton('maplibregl-ctrl-fullscreen', (e) => this.resetView());
    const el = window.document.createElement('span');
    el.className = 'maplibregl-ctrl-icon';
    this._resetButton.appendChild(el);
    return container;
  }

  resetView() {
    this.fb && this.fb.setFiltered(false);
    this._map.setCenter(this.defaultLatLng);
    this._map.setZoom(this.defaultZoom);
  };
}

class LayerManager implements ILayerManager {
  map: Promise<TargetingMap>;
  fb?: FlatbushManager;
  hashToDoc?: (hash: string) => unknown;
  _mapResolve?: (map: TargetingMap) => void;
  registers?: Promise<Map<string, string | boolean> | false>;
  _config?: Awaited<ReturnType<typeof getConfig>>;

  constructor() {
    this.map = new Promise(resolve => { this._mapResolve = resolve; });
  }

  async initialize(map: TargetingMap, fb: FlatbushManager, hashToDoc: (hash: string) => unknown) {
    this.fb = fb;
    this.hashToDoc = hashToDoc;
    this._config = await getConfig();
    this._mapResolve?.(map);
  }

  async blankExcept(except: string[]) {
    const map = await this.map;
    const registers = await this.registers;
    if (registers && map) {
      for (const [register, layerName] of registers.entries()) {
        if (typeof layerName === 'string' && !except.includes(register)) {
          map.setLayoutProperty(layerName, 'visibility', 'none');
        }
      }
    }
  }

  async ensureRegister(register: string): Promise<boolean | undefined> {
    let registers: Map<string, string | boolean>;
    if (this.registers === undefined) {
      this.registers = new Promise(async resolve => {
        try {
          registers = new Map(Object.keys(await (await fetch('/fgb/index.json')).json()).map((key: string) => [key, register === key]));
        } catch (e) {
          resolve(false);
          return false;
        }
        resolve(registers);
      })
      const r = await this.registers;
      if (r === false) {
        throw Error("Could not load fgb");
      }
      registers = r;
    } else {
      const r = await this.registers;
      if (r === false) {
        // Already errored;
        return false;
      }
      registers = r;
      if (registers.get(register) === true) {
        return undefined;
      }
    }
    let layerName = registers.get(register);
    if (layerName === undefined) {
      debugWarn("Layer missing from fgb", layerName, registers);
      return false;
    }
    const map: TargetingMap = await this.map;
    if (layerName === false || layerName === true) {
      let response
      try {
        response = await fetch(`/fgb/${register}.fgb`);
      } catch (e) {
        debugWarn(`Register ${register} fgb missing`, e);
        return false;
      }

      if (!response || !response.body) {
        debugWarn(`Register ${register} fgb empty response`);
        return false;
      }
      const fc: FeatureCollection = {
        type: "FeatureCollection",
        features: []
      };
      let i = 0;
      for await (const f of fgbDeserialize(response.body)) {
        fc.features.push({
          id: i,
          ...f,
        });
      }
      layerName = `register-${register}`;
      map.addSource(layerName, {
        type: 'geojson',
        data: fc,
      });
      map.addLayer({
        'id': layerName,
        'type': 'circle',
        'source': layerName,
        'paint': {
          'circle-color': '#888888',
          'circle-radius': 6,
          "circle-stroke-width": 10,
          "circle-stroke-color": 'rgba(0, 0, 0, 0)'
        },
        'layout': {
          'visibility': 'none',
        }
      }, 'assets-flat');
      map.on('click', layerName, async (e: MapMouseEvent & { features?: any[] }) => {
        if (map.targeting) {
          console.warn("Refusing to search again while still moving to previous tapped location");
        } else if (this._config && map.getZoom() < this._config.minSearchZoom + 1 && this.fb && e.features?.[0]) {
          console.warn("Searching");
          const nearest = await this.fb.nearest(e.lngLat.toArray(), e.features[0].properties.regcode);
          // It is possible that, for example, a result function was hit before nearest was found.
          // previously this was controlled via a if (map.targeting === true) {
          let targeting: [number, number];
          if (nearest) {
            targeting = nearest.geometry.coordinates as [number, number];
          } else {
            targeting = [e.lngLat.lng, e.lngLat.lat];
          }
          map.targeting = targeting;
          // TODO: bubble up nearest to be selected
        }
        if (Array.isArray(map.targeting) && this._config) {
          await map.flyTo({center: map.targeting as [number, number], zoom: this._config.minSearchZoom + 1});
          map.targeting = false;
        }
      });
      registers.set(register, layerName);
    }

    map.setLayoutProperty(layerName, 'visibility', 'visible');
    return true;
  }
}

/**
 * Load all basemaps from config and return load results
 */
async function loadBasemapsFromConfig(
  map: MLMap,
  config: MapConfig,
  insertBefore?: string
): Promise<BasemapLoadResult[]> {
  const results: BasemapLoadResult[] = [];
  const defaultBasemap = config.defaultBasemap ?? config.basemaps[0]?.id;

  for (const basemap of config.basemaps) {
    const loader = getBasemapLoader(basemap.config);
    if (!loader) {
      console.warn(`No loader found for basemap type: ${basemap.config.type}`);
      continue;
    }

    try {
      const result = await loader.load(map, basemap.id, basemap.config, insertBefore);
      results.push(result);

      // Show default basemap, hide others
      const visibility = basemap.id === defaultBasemap ? 'visible' : 'none';
      for (const layerId of result.layerIds) {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, 'visibility', visibility);
        }
      }
    } catch (e) {
      console.warn(`Failed to load basemap ${basemap.id}:`, e);
    }
  }

  return results;
}

/**
 * Load all overlays from config and return layer ID mapping
 */
async function loadOverlaysFromConfig(
  map: MLMap,
  config: MapConfig
): Promise<Map<string, string>> {
  const layerIdMap = new Map<string, string>();

  if (!config.overlays) return layerIdMap;

  for (const overlay of config.overlays) {
    try {
      const { layerId } = await loadOverlay(map, overlay);
      layerIdMap.set(overlay.id, layerId);
    } catch (e) {
      console.warn(`Failed to load overlay ${overlay.id}:`, e);
    }
  }

  return layerIdMap;
}

class MapManager implements IMapManager {
  fb!: Promise<FlatbushManager | undefined>;
  lm!: Promise<LayerManager | undefined>;
  layerManager?: Promise<LayerManager | undefined>;

  async getLayerManager() {
    if (this.layerManager) {
      return this.layerManager;
    }

    this.layerManager = new Promise<LayerManager | undefined>(async (resolve) => {
      const lm = new LayerManager();
      const map = await getMap(); // We only build the layer manager for the "primary" map
      const fb = await getFlatbushManager();
      const sm = await getSearchManager();
      if (sm) {
        const hashToDoc = sm.getDocByHash
        lm.initialize(map, fb, hashToDoc);
        resolve(lm);
      } else {
        resolve(undefined);
      }
    });
    return this.layerManager;
  }

  async addMap(container: HTMLElement, center: [number, number], zoom: number, geoBounds: [number, number, number, number] | undefined, touch: boolean) {
    const fallbackStyle: StyleSpecification = {
      version: 8,
      sources: {},
      layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#f0f0f0' } }]
    };

    const map: TargetingMap = new MLMap(updateOptions({
      style: fallbackStyle,
      pitch: 0,
      bearing: 0,
      container: container,
      center: center,
      zoom: zoom,
      cooperativeGestures: touch,
    }) as any);

    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.targeting = false;

    return new Promise<TargetingMap>((resolve) => {
      map.on('load', () => this.onMapLoad(map, resolve, center, zoom, geoBounds));
      const moveEnd = async function() {
        var bounds = map.getBounds();
        const fb = await getFlatbushManager();
        if (fb && (await fb.getFiltered()) === false) {
          fb.setFiltered(null);
        } else {
          const sw = bounds.getSouthWest();
          const ne = bounds.getNorthEast();
          fb && fb.filter([sw.lng, sw.lat, ne.lng, ne.lat]);
        }
        const sm = await getSearchManager();
        const instance = await sm.getPagefindInstance();
        instance.retriggerSearch();
        map.targeting = false;
      };
      map.on('dragend', moveEnd);
      map.on('zoomend', moveEnd);
    });
  }

  async onMapLoad(map: TargetingMap, resolve: (map: TargetingMap) => void, defaultCenter: [number, number], defaultZoom: number, bounds?: [number, number, number, number]) {
    // Track layers before adding basemap (for insertion ordering)
    const layersBefore = map.getStyle().layers.map(l => l.id);

    // Load basemaps and overlays from config
    let basemapResults: BasemapLoadResult[] = [];
    let overlayLayerMap = new Map<string, string>();

    if (mapConfig) {
      // Load basemaps
      basemapResults = await loadBasemapsFromConfig(map, mapConfig, layersBefore[0]);

      // Load overlays
      overlayLayerMap = await loadOverlaysFromConfig(map, mapConfig);

      // Create basemap switcher control if we have basemaps
      if (mapConfig.basemaps.length > 0) {
        const defaultBasemap = mapConfig.defaultBasemap || mapConfig.basemaps[0]?.id || 'vector';
        const basemapControl = new BasemapSwitchControl(
          basemapOptionsFromConfig(mapConfig.basemaps),
          defaultBasemap
        );
        basemapControl.registerBasemapResults(basemapResults);
        map.addControl(basemapControl, 'top-left');
      }

      // Create overlay toggle control if we have overlays
      if (mapConfig.overlays && mapConfig.overlays.length > 0) {
        const overlayOptions: OverlayControlOption[] = mapConfig.overlays.map(o => ({
          id: o.id,
          layerId: overlayLayerMap.get(o.id) || `${o.id}-layer`,
          label: o.label,
          visible: o.visible
        }));
        map.addControl(new OverlayToggleControl(overlayOptions), 'top-left');
      }
    } else {
      console.warn('No map_config found in params - map will have no basemaps or overlays');
    }

    const fg: FeatureCollection = {
      'type': 'FeatureCollection',
      'features': []
    };

    const fb = await getFlatbushManager();
    const resetViewControl = new ResetViewControl(
      defaultCenter,
      defaultZoom,
      fb,
      {
        visualizePitch: false,
        visualizeRoll: false,
        showZoom: true,
        showCompass: true
      }
    )
    map.addControl(resetViewControl);
    const config = await getConfig();

    if (config.showGeolocateControl) {
      map.addControl(
        new GeolocateControl({
          fitBoundsOptions: {
            maxZoom: config.minSearchZoom + 1
          },
          positionOptions: {
            enableHighAccuracy: true
          },
          trackUserLocation: true
        })
      );
    }

    // @ts-expect-error No resetView on window
    window.resetView = resetViewControl.resetView.bind(resetViewControl);

    if (bounds) {
      map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]]);
    }

    await addMarkerImage(map);

    // Preload category icons for heritage assets
    // Icons are loaded from Google Material Symbols
    preloadCategoryIcons(map, iconConfig).catch(e => {
      debugWarn('Failed to preload category icons:', e);
    });

    const source = map.addSource('assets', {
      type: 'geojson',
      data: fg,
    });
    map.addLayer({
      'id': 'asset-boundaries',
      'type': 'fill',
      'source': 'assets',
      'paint': {
        'fill-color': '#888888',
        'fill-opacity': 0.4
      },
      'filter': ['==', '$type', 'Polygon']
    });
    map.addLayer({
      'id': 'assets-flat',
      'maxzoom': config.minSearchZoom,
      'type': 'circle',
      'source': 'assets',
      'paint': {
        'circle-color': '#ff8888',
        'circle-radius': 12,
        "circle-stroke-width": 1,
        "circle-stroke-color": '#fff'
      },
      'layout': {
        'visibility': 'none',
      },
      'filter': ['==', '$type', 'Point']
    });
    map.addLayer({
      'id': 'assets',
      'type': 'symbol',
      'source': 'assets',
      'minzoom': config.minSearchZoom,
      'layout': {
        // Use category-based icons if available, fallback to default marker
        'icon-image': buildCategoryIconExpressionWithFallback(iconConfig, 'category', 'marker-new'),
        'icon-allow-overlap': true,
        'text-allow-overlap': true,
        'text-offset': [0, 1.25],
        'text-anchor': 'top'
      },
      'filter': ['==', '$type', 'Point']
    });

    map.on('click', 'assets', (e) => resultFunction(map, e));
    map.on('click', 'assets-flat', (e) => resultFunction(map, e));

    map.on('mouseenter', 'assets', () => {
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'assets', () => {
      map.getCanvas().style.cursor = '';
    });

    resolve(map);
  }

  async addMaps() {
    let geoBounds = await getGeoBounds();

    const maps = document.querySelectorAll<HTMLElement>(".map");
    let foundPrimaryMap: Promise<TargetingMap> | undefined;

    for (const mapElt of maps) {
      const center = JSON.parse(mapElt.dataset.center || '[]');
      const zoom = JSON.parse(mapElt.dataset.zoom || '5');
      const primary = !!mapElt.dataset.primary;
      let mobileZoom: number | undefined;
      if (mapElt.dataset.mobileZoom) {
        try {
          mobileZoom = JSON.parse(mapElt.dataset.mobileZoom);
          if (isNaN(mobileZoom as number)) {
            mobileZoom = undefined;
          }
        } catch (e) {
          console.error(e, 'Could not parse mobile zoom default');
        }
      }
      const touch = isTouch();
      const defaultZoom = touch ? (mobileZoom ?? zoom) : zoom;

      const map = this.addMap(mapElt, center, defaultZoom, geoBounds, touch);
      if (map && (!foundPrimaryMap || primary)) {
        foundPrimaryMap = map;
      }
    }
    if (foundPrimaryMap) {
      foundPrimaryMap.then(map => {
        window.map = map;
        resolvePrimaryMapWith(map);
      });
    } else {
      resolvePrimaryMapWith(undefined); // TODO: handle map load failure
    }
  }

  setMapCover(status: boolean) {
    const cover = document.getElementById("map-cover");
    if (cover) {
      cover.style.display = status ? "block" : "none";
    }
  }
}

// Map getter is now in managers.ts
// MapManager getter is now in managers.ts

document.addEventListener('DOMContentLoaded', async (event) => {
  const mapManagerInstance = new MapManager();
  await mapManagerInstance.addMaps();
  resolveMapManagerWith(mapManagerInstance);

  ensureFlatbushLoaded();
}, { once: true });
