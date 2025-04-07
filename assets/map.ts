import * as PagefindModularUI from "@pagefind/modular-ui";
import * as L from "leaflet";
import { MarkerClusterGroup } from "leaflet.markercluster/src";
import "@drustack/leaflet.resetview";
import { FlatbushWrapper } from "./fb";

const MAX_MAP_POINTS = 50;
const MIN_SEARCH_LENGTH = 3;
let doSearch = () => (console.error("Not yet loaded"));

function buildMap(fb: FlatbushWrapper) {
    const defaultCentre = L.latLng(54.61, -6.4);
    const defaultZoom = 8;
    var map = L.map('map').setView(defaultCentre, defaultZoom);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    // @ts-ignore
    const resetView = L.control.resetView({
        position: "topleft",
        title: "Reset view",
        latlng: L.latLng(defaultCentre),
        zoom: defaultZoom,
    }).addTo(map);

    resetView._resetViewReal  = resetView._resetView;
    resetView._resetView = () => {
        fb.setFiltered(false);
        resetView._resetViewReal();
    };

    map.on('moveend', function(e) {
       var bounds = map.getBounds();
        if (fb.getFiltered() === false) {
            fb.setFiltered(null);
        } else {
            const sw = bounds.getSouthWest();
            const ne = bounds.getNorthEast();
            fb.setFiltered(new Set(fb.index.search(sw.lng, sw.lat, ne.lng, ne.lat).map((i) => fb.locs[i])));
        }
        doSearch();
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

        pInner += `<a href='${result.url}' role="button" draggable="false" class="govuk-button" data-module="govuk-button">View</a>`
        pInner += `<a href='${result.url}' role="button" draggable="false" class="govuk-button govuk-button--secondary" data-module="govuk-button" target='_blank'>Open tab</a></li>`;
        if (location) {
            location = JSON.parse(location);
            const call = `map.flyTo(new L.LatLng(${location[1]}, ${location[0]}), 13)`;
            pInner += `<button type="submit" class="govuk-button govuk-button--secondary" data-module="govuk-button" onClick='${call}'>Zoom</button>`;
        }
        p.innerHTML = pInner;
        el.children[1].append(p);
        return el;
    };
    instance.add(resultList);
    doSearch = function () {
        instance.triggerSearch(input.inputEl.value);
    };
    return instance;
}

function handleResults(fg: L.MarkerClusterGroup, results) {
      fg.clearLayers();
      let resultCount = document.getElementById("result-count");
      if (results.geofilteredResultCount) {
          resultCount.innerHTML = `Showing <strong>${results.geofilteredResultCount}</strong> / <strong>${results.unfilteredResultCount}</strong> search results`;
      } else {
          resultCount.innerHTML = "";
      }
      results.results.slice(0, MAX_MAP_POINTS).forEach(r => {
          r.data().then(re => {
            if (re.meta.location) {
              const loc = JSON.parse(re.meta.location);
              let marker = L.marker([loc[1], loc[0]]);
              marker.bindPopup(`<b>${re.meta.title}</b><br><a href='${re.url}'>View record...</a><br><a href='${re.url}' target='_blank'>Open in new tab...</a>`).openPopup();
              fg.addLayer(marker);
            }
          });
      });
}

window.addEventListener('DOMContentLoaded', async (event) => {
    const fb = await buildGeoIndex();
    let { fg } = buildMap(fb);

    const searchAction = async function (term: string, settings: object, pagefind) {
      if (term && term.length < MIN_SEARCH_LENGTH) {
          return {results: []};
      }
      const results = await pagefind.search(term, settings);
      const filtered = fb.getFiltered();
      if (filtered) {
          results.results = results.results.filter(r => filtered.has(r.id));
      }
      results.results = results.results.slice(0, MAX_MAP_POINTS);
      results.geofilteredResultCount = results.results.length;
      return results;
    }
    const instance = await buildTextIndex(searchAction);

    instance.on("results", results => handleResults.bind(fg, results));
});
