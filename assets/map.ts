import * as PagefindModularUI from "@pagefind/modular-ui";
import { FeatureCollection, Feature } from 'geojson';
import { Popup, Source, Marker, Map, IControl, NavigationControlOptions, NavigationControl } from 'maplibre-gl';
// import * as L from "leaflet";
import { FlatbushWrapper } from './fb';
import { addMarkerImage } from './map-tools';

const MAX_MAP_POINTS = 500;
const MIN_SEARCH_LENGTH = 4;
const TIME_TO_SHOW_LOADING_MS = 50;
let doSearch = (geoOnly: boolean) => (console.error("Not yet loaded", geoOnly));

// @ts-expect-error No resetView on window
window.resetView = () => {};

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
        this.fb.setFiltered(false);
        this._map.setCenter(this.defaultLatLng);
        this._map.setZoom(this.defaultZoom);
    };
}

async function buildMap(fb: FlatbushWrapper, fg: FeatureCollection): Promise<Map> {
    const defaultCentre: [number, number] = [-6.4, 54.61];
    const defaultZoom = 8;
    const searchParams = new URLSearchParams(window.location.search);
    let geoBounds = searchParams.get("geoBounds");
    var map = new Map({
        style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
        container: 'map',
        center: defaultCentre,
        zoom: defaultZoom
    });
    window.map = map;

    return new Promise((resolve) => {
        map.on('load', async () => {
            const fg: FeatureCollection = {
                'type': 'FeatureCollection',
                'features': []
            };

            const fsSourceId = 'featureserver-src'

            const image = await map.loadImage('https://maplibre.org/maplibre-gl-js/docs/assets/osgeo-logo.png');
            map.addImage('custom-marker', image.data);
            const resetViewControl = new ResetViewControl(
                defaultCentre,
                defaultZoom,
                fb,
                {
                    visualizePitch: true,
                    visualizeRoll: true,
                    showZoom: true,
                    showCompass: true
                }
            )
            map.addControl(resetViewControl);

            // @ts-expect-error No resetView on window
            window.resetView = resetViewControl.resetView.bind(resetViewControl);

            if (geoBounds && /^[-,\[\]_0-9a-f.]*$/i.exec(geoBounds)) {
                const bounds: [number, number, number, number] = JSON.parse(geoBounds);
                map.fitBounds([[bounds[1], bounds[0]], [bounds[3], bounds[2]]]);
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
                'id': 'assets',
                'type': 'symbol',
                'source': 'assets',
                'layout': {
                    'icon-image': 'marker',
                    'text-offset': [0, 1.25],
                    'text-anchor': 'top'
                },
                'filter': ['==', '$type', 'Point']
            });

            map.on('click', 'assets', (e) => {
                const coordinates = e.features[0].geometry.coordinates.slice();
                const description = e.features[0].properties.description;

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
                    .addTo(map);
            });

            map.on('mouseenter', 'assets', () => {
                map.getCanvas().style.cursor = 'pointer';
            });

            map.on('mouseleave', 'assets', () => {
                map.getCanvas().style.cursor = '';
            });

            resolve(map);
        });

        const moveEnd = function(e) {
           var bounds = map.getBounds();
            if (fb.getFiltered() === false) {
                fb.setFiltered(null);
            } else {
                const sw = bounds.getSouthWest();
                const ne = bounds.getNorthEast();
                fb.filter([sw.lng, sw.lat, ne.lng, ne.lat]);
            }
            doSearch(true);
        };
        map.on('dragend', moveEnd);
        map.on('zoomend', moveEnd);
    });
}

async function buildGeoIndex() {
    const fb = new FlatbushWrapper();
    await fb.initialize('/flatbush.bin');
    return fb;
}

function makeAssetUrl(url: string) {
    return `${url}&searchTerm=${lastTerm}&geoBounds=${JSON.stringify(fb.bounds)}`;
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
    const filters = new PagefindModularUI.FilterPills({
        containerElement: "#filter",
        filter: "tags",
        alwaysShow: true
    });
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
    resultList._resultTemplateReal = resultList.resultTemplate;
    resultList.resultTemplate = (result) => {
        const el = resultList._resultTemplateReal(result);
        let p = document.createElement("p");
        p.classList = "result-links"
        let location = result.meta.location;
        let pInner = "<div class='govuk-button-group'>";

        const url = makeAssetUrl(result.url);
        pInner += `<a href='${url}' role="button" draggable="false" class="govuk-button" data-module="govuk-button">View</a>`
        pInner += `<a href='${url}' role="button" draggable="false" class="govuk-button govuk-button--secondary" data-module="govuk-button" target='_blank'>Open tab</a></li>`;
        if (location) {
            location = JSON.parse(location);
            if (location) {
              const call = `map.flyTo({center: [${location[0]}, ${location[1]}], zoom: 13})`;
              pInner += `<button type="submit" class="govuk-button govuk-button--secondary" data-module="govuk-button" onClick='${call}'>Zoom</button>`;
            }
        }
        p.innerHTML = pInner;
        el.children[1].append(p);
        return el;
    };
    instance.add(resultList);
    doSearch = function (geoOnly: boolean=true) {
        let filters = instance.searchFilters;
        if (geoOnly) {
            filters = new GeoSearchFilter(filters);
        }
        // TODO: find a cleaner approach
        instance.__search__(input.inputEl.value, filters);
    };
    return instance;
}

function handleResults(fg: FeatureCollection, results): Promise<FeatureCollection> {
      // fg.clearLayers();
      let resultCount = document.getElementById("result-count");
      if (results.geofilteredResultCount) {
          if (results.geofilteredResultCount == results.unfilteredResultCount) {
            resultCount.innerHTML = `Showing all <strong>${results.unfilteredResultCount}</strong> search results`;
          } else {
            resultCount.innerHTML = `Showing first <strong>${results.geofilteredResultCount}</strong> / <strong>${results.unfilteredResultCount}</strong> search results`;
          }
      } else {
          resultCount.innerHTML = "";
      }
      const visibleIds = new Set(fg.features.map(marker => marker.properties.id).filter(marker => marker));
      return Promise.all(results.results.slice(0, MAX_MAP_POINTS).map(r => {
          return r.data().then(re => {
            if (re.meta.location) {
              const loc = JSON.parse(re.meta.location);
              const id = re.meta.resourceinstanceid;
              if (loc && !visibleIds.has(id)) {
                const url = makeAssetUrl(re.url);
                let marker = {
                    'type': 'Feature',
                    'geometry': {
                        'type': 'Point',
                        'coordinates': [loc[0], loc[1]]
                    },
                    'properties': {
                        'id': id,
                        'title': re.meta.title,
                        'description':
                            `<p>${re.meta.title}</p><p><a href='${url}'>View record...</a><br><a href='${url}' target='_blank'>Open in new tab...</a></p>`,
                        'icon': 'theatre'
                    },
                };
                fg.features.push(marker);
              }
            visibleIds.delete(id);
            }
          });
      })).then(() => {;
          fg.features = fg.features.filter(marker => {
            if (marker.properties.id && visibleIds.has(marker.properties.id)) {
                return false;
            }
            return true;
          });
          return fg;
      });
}

var cachedResults;
var lastTerm;
class SearchFilters {
    filters: object | GeoSearchFilter | undefined = undefined
}

var fb;
window.addEventListener('DOMContentLoaded', async (event) => {
    fb = await buildGeoIndex();
    const fg: FeatureCollection = {
        'type': 'FeatureCollection',
        'features': []
    };

    const map = buildMap(fb, fg);
    const searchAction = async function (term: string, settings: SearchFilters, pagefind) {
      if (term && term.length < MIN_SEARCH_LENGTH) {
          return {results: []};
      }

      let results;
      lastTerm = term;
      if (settings && settings.filters && settings.filters instanceof GeoSearchFilter) {
        // We are doing a geo update, so assume results exist;
        results = cachedResults;
        results.results = results.unfilteredResults;
      } else {
        results = await pagefind.search(term, settings);
        cachedResults = results;
        results.unfilteredResults = results.results;
      }
      results.context = {term, settings};
      const filtered = fb.getFiltered();
      if (filtered) {
          results.results = results.results.filter(r => filtered.has(r.id));
      }
      results.results = results.results.slice(0, MAX_MAP_POINTS);
      results.geofilteredResultCount = results.results.length;
      return results;
    }
    const instance = await buildTextIndex(searchAction);

    instance.on("results", results => handleResults(fg, results).then(async (fg) => {
        const m = await map;
        console.log(m.loaded());
        m.getSource('assets').setData(fg);
    }));

    const searchParams = new URLSearchParams(window.location.search);
    const term = searchParams.get("searchTerm");
    if (term && /^[_0-9a-z]*$/i.exec(term)) {
        const input = document.getElementById("pfmod-input-0");
        input.value = term;
        doSearch(false);
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
});
