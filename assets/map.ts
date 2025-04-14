import * as PagefindModularUI from "@pagefind/modular-ui";
import * as L from "leaflet";
import { MarkerClusterGroup } from "leaflet.markercluster/src";
import "@drustack/leaflet.resetview";
import { FlatbushWrapper } from "./fb";

const MAX_MAP_POINTS = 500;
const MIN_SEARCH_LENGTH = 4;
const TIME_TO_SHOW_LOADING_MS = 50;
let doSearch = (geoOnly: boolean) => (console.error("Not yet loaded", geoOnly));

// @ts-expect-error No resetView on window
window.resetView = () => {};

function buildMap(fb: FlatbushWrapper) {
    const defaultCentre = L.latLng(54.61, -6.4);
    const defaultZoom = 8;
    const searchParams = new URLSearchParams(window.location.search);
    let geoBounds = searchParams.get("geoBounds");
    var map = L.map('map').setView(defaultCentre, defaultZoom);
    if (geoBounds && /^[-,\[\]_0-9a-f.]*$/i.exec(geoBounds)) {
        const bounds: [number, number, number, number] = JSON.parse(geoBounds);
        map.fitBounds(L.latLngBounds(L.latLng(bounds[1], bounds[0]), L.latLng(bounds[3], bounds[2])));
    }
    window.map = map;

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    // @ts-ignore
    const resetViewControl = L.control.resetView({
        position: "topleft",
        title: "Reset view",
        latlng: L.latLng(defaultCentre),
        zoom: defaultZoom,
    }).addTo(map);

    resetViewControl._resetViewReal  = resetViewControl._resetView;
    resetViewControl._resetView = () => {
        fb.setFiltered(false);
        resetViewControl._resetViewReal();
    };
    // @ts-expect-error No resetView on window
    window.resetView = resetViewControl._resetView;

    map.on('moveend', function(e) {
       var bounds = map.getBounds();
        if (fb.getFiltered() === false) {
            fb.setFiltered(null);
        } else {
            const sw = bounds.getSouthWest();
            const ne = bounds.getNorthEast();
            fb.filter([sw.lng, sw.lat, ne.lng, ne.lat]);
        }
        doSearch(true);
    });

    // @ts-ignore
    var fg = new MarkerClusterGroup({
        maxClusterRadius: 20
    });
    fg.addTo(map);

    return {
        map: map,
        fg: fg
    };
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
              const call = `map.flyTo(new L.LatLng(${location[1]}, ${location[0]}), 13)`;
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
        console.log(input.inputEl);
        instance.__search__(input.inputEl.value, filters);
    };
    return instance;
}

function handleResults(fg: L.MarkerClusterGroup, results) {
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
      const visibleIds = new Set(fg.getLayers().map(marker => marker.id).filter(marker => marker));
      Promise.all(results.results.slice(0, MAX_MAP_POINTS).map(r => {
          return r.data().then(re => {
            if (re.meta.location) {
              const loc = JSON.parse(re.meta.location);
              const id = re.meta.resourceinstanceid;
              if (loc && !visibleIds.has(id)) {
                let marker = L.marker(L.latLng(loc[1], loc[0]));
                const url = makeAssetUrl(re.url);
                marker.bindPopup(`<b>${re.meta.title}</b><br><a href='${url}'>View record...</a><br><a href='${url}' target='_blank'>Open in new tab...</a>`).openPopup();
                marker.id = id;
                fg.addLayer(marker);
              }
            visibleIds.delete(id);
            }
          });
      })).then(() => {;
          fg.getLayers().forEach(marker => {
            if (marker.id && visibleIds.has(marker.id)) {
              fg.removeLayer(marker);
            }
          });
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
    let { fg } = buildMap(fb);

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

    instance.on("results", results => handleResults(fg, results));

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
        console.log(target.childNodes);
        if (target.childNodes.length === 0) {
            instructions.classList = "";
        } else {
            instructions.classList = "instructions-hidden";
        }
    });
    var config = { characterData: true, attributes: false, childList: true, subtree: true };
    observer.observe(target, config);
    console.log(target);
});
