import * as PagefindModularUI from "@pagefind/modular-ui";
import { deserialize as fgbDeserialize } from 'flatgeobuf/lib/mjs/geojson.js';
import { FeatureCollection, Feature } from 'geojson';
import { Popup, Source, Marker, Map as MLMap, IControl, NavigationControlOptions, NavigationControl, GeolocateControl } from 'maplibre-gl';
// import * as L from "leaflet";
import { FlatbushWrapper } from './fb';
import { addMarkerImage } from './map-tools';
import { nearestPoint } from "@turf/nearest-point";
import { saveSearchResults, SearchParams } from './searchContext';
import { updateBreadcrumbs } from './searchBreadcrumbs';
import { debug, debugWarn, debugError } from './debug';

function slugify(name: string) {
    return `${name}`.replaceAll(/[^A-Za-z0-9_]/g, "").slice(0, 20);
}
const DEFAULT_ZOOM = 8;
const DEFAULT_MOBILE_ZOOM = 6;
const MAX_MAP_POINTS = 300;
const MIN_SEARCH_LENGTH = 4;
const MIN_SEARCH_ZOOM = 13;
const TIME_TO_SHOW_LOADING_MS = 50;
let doSearch = (withFilters?: [{[key: string]: string}][]) => (debugError("Not yet loaded"));

// @ts-expect-error No resetView on window
window.resetView = () => {};

function setMapCover(status: boolean) {
    document.getElementById("map-cover").style.display = status ? "block" : "none";
}

function isTouch() {
    return (('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0));
}

function mapDialogClickedOutside() {
    const modalElt = document.getElementById("map-dialog");
    modalElt.close();
}

function mapDialogClicked(event) {
    const modalElt = document.getElementById("map-dialog");
    modalElt.classList.toggle("peeking");
    event.stopPropagation()
}
function resultFunction(e) {
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
                } else if (map.getZoom() < MIN_SEARCH_ZOOM + 1 && this.fb) {
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
                    await map.flyTo({center: map.targeting, zoom: MIN_SEARCH_ZOOM + 1});
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

const LAYER_MANAGER = new LayerManager();

async function buildMap(fb: FlatbushWrapper, fg: FeatureCollection, hashToDoc: Function): Promise<MLMap> {
    const defaultCentre: [number, number] = [-6.4, 54.61];
    const searchParams = new URLSearchParams(window.location.search);
    let geoBounds = searchParams.get("geoBounds");
    let searchFilters = searchParams.get("searchFilters");
    const touch = isTouch();
    const defaultZoom = touch ? DEFAULT_MOBILE_ZOOM : DEFAULT_ZOOM;
    var map = new MLMap({
        style: 'https://tiles.openfreemap.org/styles/bright',
        container: 'map',
        center: defaultCentre,
        zoom: defaultZoom,
        cooperativeGestures: touch,
    });
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    window.map = map;
    map.targeting = false;

    return new Promise((resolve) => {
        map.on('load', async () => {
            LAYER_MANAGER.initialize(map, fb, hashToDoc);
            const fg: FeatureCollection = {
                'type': 'FeatureCollection',
                'features': []
            };

            const fsSourceId = 'featureserver-src'

            const resetViewControl = new ResetViewControl(
                defaultCentre,
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
            map.addControl(
                new GeolocateControl({
                    fitBoundsOptions: {
                        maxZoom: MIN_SEARCH_ZOOM + 1
                    },
                    positionOptions: {
                        enableHighAccuracy: true
                    },
                    trackUserLocation: true
                })
            );
            // @ts-expect-error No resetView on window
            window.resetView = resetViewControl.resetView.bind(resetViewControl);

            if (geoBounds && /^[-,\[\]_0-9a-f.]*$/i.exec(geoBounds)) {
                const bounds: [number, number, number, number] = JSON.parse(geoBounds);
                map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]]);
            }
            map.addSource('osm', {
                type: 'raster',
                tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                tileSize: 256,
            });
            map.addLayer({
                id: 'osm-layer',
                type: 'raster',
                source: 'osm',
            });

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
                'maxzoom': MIN_SEARCH_ZOOM,
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
                'minzoom': MIN_SEARCH_ZOOM,
                'layout': {
                    'icon-image': 'marker-new',
                    'icon-allow-overlap': true,
                    'text-allow-overlap': true,
                    'text-offset': [0, 1.25],
                    'text-anchor': 'top'
                },
                'filter': ['==', '$type', 'Point']
            });

            map.on('click', 'assets', resultFunction);
            map.on('click', 'assets-flat', resultFunction);

            map.on('mouseenter', 'assets', () => {
                map.getCanvas().style.cursor = 'pointer';
            });

            map.on('mouseleave', 'assets', () => {
                map.getCanvas().style.cursor = '';
            });

            resolve(map);
        });

        const moveEnd = async function(e) {
           var bounds = map.getBounds();
            if (fb && (await fb.getFiltered()) === false) {
                fb.setFiltered(null);
            } else {
                const sw = bounds.getSouthWest();
                const ne = bounds.getNorthEast();
                fb && fb.filter([sw.lng, sw.lat, ne.lng, ne.lat]);
            }
            doSearch();
            map.targeting = false;
        };
        map.on('dragend', moveEnd);
        map.on('zoomend', moveEnd);
    });
}

async function buildGeoIndex() {
    const fb = new FlatbushWrapper();
    if (await fb.initialize('/flatbush.bin')) {
        return fb;
    } else {
        return null;
    }
}

function makeSearchQuery(url: string) {
    return `${url}&searchTerm=${lastTerm ?? ''}&geoBounds=${fb && fb.bounds ? JSON.stringify(fb.bounds) : ''}&searchFilters=${lastFilters ? JSON.stringify(lastFilters) : ''}`;
}

class GeoSearchFilter {
    [key: string]: any

    constructor(searchFilters: {[key: string]: any}) {
        for (let [k, v] of Object.entries(searchFilters)) {
            this[k] = v;
        }
    }
};
async function buildTextIndex(searchAction: (term: string, settings: object, pagefind: any) => Promise<any>) {
    const instance = new PagefindModularUI.Instance({
        showImages: false,
        debounceTimeoutMs: 800,
        bundlePath: "/pagefind/"
    });
    const input = new PagefindModularUI.Input({
        containerElement: "#search",
    });
    // const designationFilters = new PagefindModularUI.FilterPills({
    //     containerElement: "#filter-designation",
    //     filter: "designations",
    //     alwaysShow: true
    // });
    const filters = new PagefindModularUI.FilterPills({
        containerElement: "#filter",
        filter: "tags",
        alwaysShow: true
    });
    const pillInner = filters.pillInner.bind(filters);
    const pillContainer = document.createElement("div");
    pillContainer.classList.add("govuk-radios");
    pillContainer.classList.add("govuk-radios--inline");
    pillContainer.setAttribute("data-module", "govuk-radios");
    filters.wrapper = document.getElementById("filter");
    filters.pillContainer = pillContainer;
    filters.wrapper.appendChild(pillContainer);
    filters.pillInner = (function(val, count) {
        const ariaChecked = this.selected.includes(val);
        return `
            <input class="govuk-radios__input" ${ariaChecked ? 'checked' : ''} aria-checked="${ariaChecked}" id="chosenRecord" name="chosenRecord" type="radio" value="${val}">
            <label class="govuk-label govuk-radios__label" for="chosenRecord">
                ${pillInner(val, count)}
            </label>
        `;
    }).bind(filters);
    filters.renderNew = (function() {
        this.available.forEach(([val, count]) => {
            const button = document.createElement("div");
            button.innerHTML = this.pillInner(val, count);
            button.classList.add("govuk-radios__item");
            button.addEventListener("click", () => {
                if (val === "All") {
                    this.selected = ["All"];
                } else if (this.selected.includes(val)) {
                    this.selected = this.selected.filter(v => v !== val);
                } else if (this.selectMultiple) {
                    this.selected.push(val);
                } else {
                    this.selected = [val];
                }
                if (!this.selected?.length) {
                    this.selected = ["All"];
                } else if (this.selected?.length > 1) {
                    this.selected = this.selected.filter(v => v !== "All");
                }
                this.update();
                this.pushFilters();
            });
            this.pillContainer.appendChild(button);
        });
    }).bind(filters);
    // instance.add(designationFilters);
    instance.add(filters);

    instance.add(input);
    instance.on("loading", () => {
        let rc = document.getElementById("result-count");
        rc.innerHTML = "";
        let p = document.createElement("p");
        p.classList = 'fade';
        p.innerText = 'Searching...';
        rc.append(p);
    });
    await instance.__load__();
    const pagefind = instance.__pagefind__;
    instance.__pagefind__ = {
        filters: pagefind.filters,
        search: async (term, settings) => searchAction(term, settings, pagefind)
    };
    const resultList = new PagefindModularUI.ResultList({
        containerElement: "#results",
    });
    // This routine from pagefind.
    instance.__search__ = async function (term, filters) {
        this.__dispatch__("loading");
        await this.__load__();
        const thisSearch = ++this.__searchID__;

        const results = await this.__pagefind__.search(term, { filters });
        if (results && this.__searchID__ === thisSearch) {
          if (results.filters && Object.keys(results.filters)?.length) {
            this.availableFilters = results.filters;
            this.totalFilters = results.totalFilters;
            this.__dispatch__("filters", {
              available: this.availableFilters,
              total: this.totalFilters,
            });
          }
          this.searchResult = results;
          this.__dispatch__("results", this.searchResult);
        }
      }
    resultList._resultTemplateReal = resultList.resultTemplate;
    resultList.resultTemplate = (result) => {
        let [indexOnly, description] = result.excerpt.split('$$$');
        if (description && description.trim().length > 0) {
            result.excerpt = description;
        } else {
            result.excerpt = indexOnly;
        }
        const el = resultList._resultTemplateReal(result);
        let p = document.createElement("p");
        p.classList = "result-links"
        let location = result.meta.location;
        let pInner = "<div class='govuk-button-group'>";

        const url = makeSearchQuery(result.url);
        pInner += `<a href='${url}' role="button" draggable="false" class="govuk-button" data-module="govuk-button">View</a>`;
        // Use window.open with a JavaScript event instead of target='_blank' to ensure localStorage is properly shared
        pInner += `<a href='${url}' role="button" draggable="false" class="govuk-button govuk-button--secondary" data-module="govuk-button" onclick="window.open('${url}', '_blank'); return false;">Open tab</a></li>`;
        if (location) {
            location = JSON.parse(location);
            if (location) {
              const call = `map.flyTo({center: [${location[0]}, ${location[1]}], zoom: ${MIN_SEARCH_ZOOM + 1}})`;
              pInner += `<button type="submit" class="govuk-button govuk-button--secondary" data-module="govuk-button" onClick='${call}'>Zoom</button>`;
            }
        }
        p.innerHTML = pInner;
        el.children[1].append(p);
        return el;
    };
    instance.add(resultList);
    doSearch = function (withFilters?: [{[key: string]: string}][], term?: string) {
        if (withFilters) {
            instance.searchFilters = withFilters;
        }
        let filters = instance.searchFilters;
        instance.__search__(term || input.inputEl.value, filters);
    };
    return instance;
}

function handleResults(fg: FeatureCollection, results): Promise<FeatureCollection> {
      // fg.clearLayers();
      let resultCount = document.getElementById("result-count");
      const map = window.map;
      if (results.geofilteredResultCount) {
          const layer = map.getLayer('assets-flat');
          if (results.geofilteredResultCount == results.unfilteredResultCount) {
            if (layer) {
                map.setLayoutProperty('assets-flat', 'visibility', 'visible');
            }
            resultCount.innerHTML = `Showing all <strong>${results.unfilteredResultCount}</strong> search results`;
          } else if (results.unfilteredResultCount === 0 && results.geofilteredResultCount < MAX_MAP_POINTS) {
            if (layer) {
                map.setLayoutProperty('assets-flat', 'visibility', 'visible');
            }
            resultCount.innerHTML = `Showing all <strong>${results.geofilteredResultCount}</strong> search results`;
          } else if (results.geofilteredResultCount > results.unfilteredResultCount) { // when there is no term
            if (layer) {
                map.setLayoutProperty('assets-flat', 'visibility', 'none');
            }
            resultCount.innerHTML = `Showing first <strong>${results.geofilteredResultCount}</strong> search results`;
          } else {
            if (layer) {
                map.setLayoutProperty('assets-flat', 'visibility', 'visible');
            }
            resultCount.innerHTML = `Showing first <strong>${results.geofilteredResultCount}</strong> / <strong>${results.unfilteredResultCount}</strong> search results`;
          }

      } else {
          resultCount.innerHTML = "";
      }
      const visibleIds = new Set(fg.features.map(marker => marker.properties.slug).filter(marker => marker));
      return Promise.all(results.results.slice(0, MAX_MAP_POINTS).map(r => {
          let data = null;
          try {
              data = r.data().then(re => {
                if (re.meta.location) {
                  const loc = JSON.parse(re.meta.location);
                  const slug = re.meta.slug;
                  if (loc && !visibleIds.has(slug)) {
                    const url = makeSearchQuery(re.url);
                    let [indexOnly, description] = re.content.split('$$$');
                    if (!(description && description.trim().length > 0)) {
                        description = indexOnly;
                    }
                    let text = '';
                    if (re.meta.registries) {
                        const registries = JSON.parse(re.meta.registries);
                        text += `<p class='registry'>${registries.join(', ')}</p>`;
                    }
                    text += `<p class='description'>${description}</p>`;
                    text += `<a href='${url}' role="button" draggable="false" class="govuk-button" data-module="govuk-button">View</a>`
                    text += `<a href='${url}' role="button" draggable="false" class="govuk-button govuk-button--secondary" data-module="govuk-button" onclick="window.open('${url}', '_blank'); return false;">Open tab</a></li>`;
                    const call = `map.flyTo({center: [${loc[0]}, ${loc[1]}], zoom: ${MIN_SEARCH_ZOOM + 1}})`;
                    text += `<button type="submit" class="govuk-button govuk-button--secondary" data-module="govuk-button" onClick='${call}'>Zoom</button>`;
                    let marker = {
                        'type': 'Feature',
                        'geometry': {
                            'type': 'Point',
                            'coordinates': [loc[0], loc[1]]
                        },
                        'properties': {
                            'slug': slug,
                            'title': re.meta.title,
                            'description': text,
                        },
                    };
                    fg.features.push(marker);
                  }
                visibleIds.delete(slug);
                }
              }).catch(err => {
                return null;
              });
        } catch (e) {
            console.log(e);
            return null;
        }
        return data;
      })).then((promises) => {;
        const emptyPromises = promises.filter(p => p === null);
        if (emptyPromises.length > 0) {
            debugError("Some results could not be retrieved:", emptyPromises.length);
        }
        fg.features = fg.features.filter(marker => {
          if (marker.properties.slug && visibleIds.has(marker.properties.slug)) {
              return false;
          }
          return true;
        });
        return fg;
      });
}

async function searchAction(term: string, settings: SearchFilters, pagefind) {
  if (settings && settings.filters && 'tags' in settings.filters) {
      history.pushState({searchTerm: term, searchFilters: settings.filters, geoBounds: fb && fb.bounds}, "", makeSearchQuery("/?"));
      const registers = settings.filters.tags.map(t => slugify(t));
      await LAYER_MANAGER.blankExcept(registers);
      registers.map(t => LAYER_MANAGER.ensureRegister(t));
  }

  const zoom = window.map && window.map.getZoom();

  // if (!(settings && settings.filters && Object.keys(settings.filters).length) && term && term.length < MIN_SEARCH_LENGTH) {
  if (
      (!zoom || zoom < MIN_SEARCH_ZOOM) &&
      (!term || term.trim().length < MIN_SEARCH_LENGTH)
  ) {
      setMapCover(true);
      return {results: []};
  }
  setMapCover(false);
  if (!term) {
      term = null;
  }
  let results;
  let filtersChanged = true;
  let hasFilters = settings && settings.filters && Object.values(settings.filters).reduce((acc, flt) => acc || flt.length > 0, false);
  let hadFilters = lastFilters && Object.values(lastFilters).reduce((acc, flt) => acc || flt.length > 0, false);

  if (hasFilters && hadFilters) {
    filtersChanged = false;
    const filters = new Set([...Object.keys(lastFilters), ...Object.keys(settings.filters)]);
    for (const filter of filters) {
        if (settings.filters[filter] && lastFilters[filter]) {
            filtersChanged = filtersChanged || (JSON.stringify(settings.filters[filter]) !== JSON.stringify(lastFilters[filter]));
        }
    }
  } else {
    filtersChanged = hasFilters !== hadFilters;
  }

  if (!term) {
    // We have no filtering critera, except bounding box (if that was not present,
    // we would have exited already.
    results = {
        results: fb && await fb.getFiltered(true),
        unfilteredResultCount: fb && fb.totalFeatures
    };
    if (hasFilters) {
        results.results = results.results?.filter(result => Object.entries(settings.filters).reduce((match, [flt, vals]) => {
            // AND on filters, OR on individual filter values
            return match && (result.filters && result.filters[flt] && (new Set(result.filters[flt])).intersection(new Set(vals)).size);
        }, true));
    }
    // TODO: prevent searching again if no change and cachedResults
    // i.e. if !hadFilters and !lastTerm, then we could do sometimes without reloading geo
  } else {
    if (!cachedResults || lastTerm !== term || filtersChanged) {
      // We have changes (beyond potentially bounding box), so assume results do not exist
      results = await pagefind.search(term, settings);
      cachedResults = results;
      results.unfilteredResults = results.results;
    } else {
      results = cachedResults;
      results.results = results.unfilteredResults;
    }
    const filtered = fb && await fb.getFiltered();
    if (filtered) {
        results.results = results.results.filter(r => filtered.has(r.id));
    }
  }
  lastTerm = term;
  // Ensure we have an independent copy
  lastFilters = JSON.parse(JSON.stringify(settings && settings.filters));
  results.context = {term, settings};
  results.results = results.results.slice(0, MAX_MAP_POINTS);
  results.geofilteredResultCount = results.results.length;
  return results;
}


var cachedResults;
var lastTerm;
var lastFilters;
class SearchFilters {
    filters: object | GeoSearchFilter | undefined = undefined
}

var fb;
window.addEventListener('DOMContentLoaded', async (event) => {
    const searchParams = new URLSearchParams(window.location.search);
    let term = searchParams.get("searchTerm");
    let searchFilterString = searchParams.get("searchFilters");
    let searchFilters = undefined;

    fb = await buildGeoIndex();
    const fg: FeatureCollection = {
        'type': 'FeatureCollection',
        'features': []
    };

    if (term && /^[_0-9a-z ."'-:]*$/i.exec(term)) {
        lastTerm = term;
    } else {
        term = null;
    }

    let instance;
    try {
        instance = await buildTextIndex(searchAction, term);
    } catch (e) {
        console.error(`Could not load pagefind: ${e}`);
        instance = null;
    }

    const map = buildMap(fb, fg, (hsh: string) => instance.__pagefind__.loadChunk(hsh));

    if (searchFilterString && searchFilterString != '{}') {
        searchFilters = JSON.parse(searchFilterString);
        lastFilters = searchFilters;
        (searchFilters?.tags || []).forEach(aria => {
          const elt = document.querySelector(`[aria-label="${aria}"]`);
          elt.parentElement.click();
        });
        (searchFilters?.designations || []).forEach(aria => {
          const elt = document.querySelector(`[aria-label="${aria}"]`);
          elt.parentElement.click();
        });
    }

    const geoBounds = fb && fb.bounds ? JSON.stringify(fb.bounds) : undefined;

    if (instance) {
        instance.on("results", async (results) => {
            await map;
            console.log("Results and map ready");
            return handleResults(fg, results).then(async (fg) => {
                const m = await map;
                m.getSource('assets').setData(fg);
                
                // Save search results to context for prev/next navigation
                debug("Raw search results:", results.results);
                
                // Extract slugs from results - we need to collect these before saving to context
                const collectSlugs = async () => {
                  const slugs = [];
                  for (const result of results.results) {
                    try {
                      const data = await result.data();
                      debug("Result data for ID", result.id, "has slug:", data.meta.slug);
                      if (data.meta.slug) {
                        slugs.push(data.meta.slug);
                      }
                    } catch (e) {
                      debugError("Error getting result data:", e);
                    }
                  }
                  return slugs;
                };
                
                collectSlugs().then(slugs => {
                  debug("Extracted slugs for navigation:", slugs);
                  
                  const searchContextParams: SearchParams = {
                    searchTerm: lastTerm,
                    geoBounds: geoBounds,
                    searchFilters: lastFilters ? JSON.stringify(lastFilters) : undefined
                  };
                  
                  saveSearchResults(slugs, searchContextParams);
                  debug("Saved search context with " + slugs.length + " slugs", slugs);
                  
                  // Update breadcrumbs
                  let filterTags = [];
                  if (lastFilters && lastFilters.tags) {
                    filterTags = lastFilters.tags;
                  }
                  updateBreadcrumbs(
                    lastTerm, 
                    filterTags,
                    geoBounds
                  );
                });
                
                history.pushState({searchTerm: lastTerm, searchFilters: lastFilters, geoBounds: fb && fb.bounds}, "", makeSearchQuery("/?"));
            })
        });
    }

    if (term) {
        const input = document.getElementById("pfmod-input-0");
        input.value = term;
        if (instance) {
            instance.searchTerm = term;
        }
    }

    // Initial breadcrumbs setup
    let initialFilterTags = [];
    if (searchFilters && searchFilters.tags) {
        initialFilterTags = searchFilters.tags;
    }
    updateBreadcrumbs(
        term, 
        initialFilterTags,
        geoBounds
    );

    if (term || searchFilters) {
        doSearch();
    }

    var target = document.querySelector('div#results')
    var instructions = document.querySelector('div#instructions')
    var observer = new MutationObserver(() => {
        if (target.childNodes.length === 0) {
            instructions.classList = "";
        } else {
            instructions.classList = "instructions-hidden";
        }
    });
    var config = { characterData: true, attributes: false, childList: true, subtree: true };
    observer.observe(target, config);

    const modalElt = document.getElementById("map-dialog");
    modalElt.addEventListener("click", () => modalElt.close());
    const modalInnerElt = document.getElementById("map-dialog__inner");
    modalInnerElt.addEventListener("click", mapDialogClicked);
});
