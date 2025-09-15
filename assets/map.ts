import { Popup, Source, Marker, Map, IControl, NavigationControlOptions, NavigationControl, GeolocateControl } from 'maplibre-gl';
import { getGeoBounds } from './searchContext';
import { isTouch } from './utils';
import { getFlatbushWrapper, FlatbushWrapper } from './fbwrapper';
import { getConfig } from './config';
import { addMarkerImage } from './map-tools';
import { getSearchManager, resolvePrimaryMapWith, resolveMapManagerWith, IMapManager } from './managers';

function resultFunction(map, e) {
    map.stop();
    const coordinates = e.features[0].geometry.coordinates.slice();
    map.targeting = coordinates;
    const touch = isTouch();

    if (touch) {
        document.getElementById("map-dialog__heading").innerHTML = `<h3>${e.features[0].properties.title}</h3>`;
        document.getElementById("map-dialog__content").innerHTML = e.features[0].properties.description;

        const modalElt = document.getElementById("map-dialog");
        if (!modalElt.classList.contains("peeking")) {
            modalElt.classList.toggle("peeking");
        }
        modalElt.showModal();
    } else {
        let description = `<h3>${e.features[0].properties.title}</h3>`;
        description += `<div class='map-popup-body'>`;
        description += e.features[0].properties.description;
        description += '</div>';

        // (maplibre)
        // Ensure that if the map is zoomed out such that multiple
        // copies of the feature are visible, the popup appears
        // over the copy being pointed to.
        while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
            coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
        }

        new Popup()
            .setLngLat(coordinates)
            .setHTML(description)
            .addTo(window.map);
    }
}

class ResetViewControl extends NavigationControl {
    defaultLatLng: [number, number];
    defaultZoom: number;
    fb: FlatbushWrapper;
    _resetButton: HTMLButtonElement;

    constructor(defaultLatLng: [number, number], defaultZoom: number, fb: FlatbushWrapper, options?: NavigationControlOptions) {
        super(options);
        this.defaultLatLng = defaultLatLng;
        this.defaultZoom = defaultZoom;
        this.fb = fb;
    }

    onAdd(map) {
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

class LayerManager {
    map: Promise<MLMap>;
    fb?: FlatbushWrapper;
    hashToDoc?: Function;
    _mapResolve?: Function;
    registers?: Promise<Map<string, string | boolean> | false>;

    constructor() {
        this.map = new Promise(resolve => { this._mapResolve = resolve; });
    }

    initialize(map: MLMap, fb: FlatbushWrapper, hashToDoc: Function) {
        this.fb = fb;
        this.hashToDoc = hashToDoc;
        this._mapResolve(map);
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
        let resolver;
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
        const map = await this.map;
        if (layerName === false || layerName === true) {
            let response
            try {
                response = await fetch(`/fgb/${register}.fgb`);
            } catch (e) {
                debugWarn(`Register ${register} fgb missing`, e);
                return false;
            }

            if (!response) {
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
            const source = map.addSource(layerName, {
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
            map.on('click', layerName, async (e) => {
                if (map.targeting) {
                    console.warn("Refusing to search again while still moving to previous tapped location");
                } else if (map.getZoom() < config.minSearchZoom + 1 && this.fb) {
                    console.warn("Searching");
                    map.targeting = true;
                    const nearest = await this.fb.nearest(e.lngLat.toArray(), e.features[0].properties.regcode);
                    // It is possible that, for example, a result function was hit before nearest was found.
                    if (map.targeting === true) {
                        let targeting;
                        if (nearest) {
                            targeting = nearest.geometry.coordinates;
                        } else {
                            targeting = e.lngLat;
                        }
                        map.targeting = targeting;
                    }
                    // TODO: bubble up nearest to be selected
                }
                if (Array.isArray(map.targeting)) {
                    await map.flyTo({center: map.targeting, zoom: config.minSearchZoom + 1});
                    map.targeting = false;
                }
            });
            registers.set(register, layerName);
        }

        map.setLayoutProperty(layerName, 'visibility', 'visible');
        if (resolver) {
            resolver(registers);
        }
        return true;
    }
}

class MapManager implements IMapManager {
  fb: Promise<FlatbushWrapper | undefined>;
  lm: Promise<LayerManager | undefined>;

  async getLayerManager() {
    if (this.layerManager) {
      return this.layerManager;
    }

    this.layerManager = new Promise(async (resolve) => {
      const lm = new LayerManager();
      const map = await getMap(); // We only build the layer manager for the "primary" map
      const fb = await getFlatbushWrapper();
      const sm = await getSearchManager();
      if (sm) {
        const hashToDoc = sm.getDocByHash
        lm.initialize(map, fb, hashToDoc);
        resolve(lm);
      }
      resolve();
    });
  }

  async addMap(container: HTMLElement, center: [number, number], zoom: number, geoBounds?: [number, number, number, number], touch: boolean) {
    var map = new Map({
      style: 'https://tiles.openfreemap.org/styles/bright',
      pitch: 0,
      bearing: 0,
      container: container,
      center: center,
      zoom: zoom,
      cooperativeGestures: touch,
    });
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.targeting = false;

    return new Promise((resolve) => {
        map.on('load', () => this.onMapLoad(map, resolve, center, zoom, geoBounds));
        const moveEnd = async function(e) {
          var bounds = map.getBounds();
          const fb = await getFlatbushWrapper();
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

  async onMapLoad(map, resolve, defaultCenter, defaultZoom, bounds) {
    const fg: FeatureCollection = {
        'type': 'FeatureCollection',
        'features': []
    };

    const fsSourceId = 'featureserver-src'

    const fb = await getFlatbushWrapper();
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
            'icon-image': 'marker-new',
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

    const maps = document.querySelectorAll(".map");
    const mapPromises = [];
    let foundPrimaryMap;

    for (const mapElt of maps) {
      const center = JSON.parse(mapElt.dataset.center);
      const zoom = JSON.parse(mapElt.dataset.zoom);
      const primary = !!mapElt.dataset.primary;
      let mobileZoom: number;
      if (mobileZoom) {
        try {
          mobileZoom = JSON.parse(mapElt.dataset.zoom);
          if (isNaN(parseInt(mobileZoom))) {
            mobileZoom = undefined;
          }
        } catch (e: Exception) {
          console.error(e, 'Could not parse mobile zoom default');
        }
      }
      const touch = isTouch();
      const defaultZoom = touch ? (mobileZoom | zoom) : zoom;

      const map = this.addMap(mapElt, center, defaultZoom, geoBounds, touch);
      if (map && (!foundPrimaryMap || primary)) {
        foundPrimaryMap = map;
      }
    }
    if (foundPrimaryMap) {
      foundPrimaryMap.then(map => resolvePrimaryMapWith(map));
    } else {
      resolvePrimaryMapWith(undefined); // TODO: handle map load failure
    }
  }

  setMapCover(status: boolean) {
      document.getElementById("map-cover").style.display = status ? "block" : "none";
  }
}

// Map getter is now in managers.ts

function mapDialogClickedOutside() {
    const modalElt = document.getElementById("map-dialog");
    modalElt.close();
}

function mapDialogClicked(event) {
    const modalElt = document.getElementById("map-dialog");
    modalElt.classList.toggle("peeking");
    event.stopPropagation()
}

// MapManager getter is now in managers.ts

document.addEventListener('DOMContentLoaded', async (event) => {
  const mapManagerInstance = new MapManager();
  await mapManagerInstance.addMaps();
  resolveMapManagerWith(mapManagerInstance);

  const modalElt = document.getElementById("map-dialog");
  modalElt.addEventListener("click", () => modalElt.close());
  const modalInnerElt = document.getElementById("map-dialog__inner");
  modalInnerElt.addEventListener("click", mapDialogClicked);
}, { once: true });
