import { getConfig } from './managers';
import { getFilters, getTerm, updateSearchParams } from './searchContext';
import { getFlatbushWrapper, FlatbushWrapper } from './fbwrapper';
import { debug, debugWarn, debugError } from './debug';
import { buildPagefind } from './pagefind';
import { slugify } from './utils';
import { saveSearchResults, makeSearchQuery } from "./searchContext";
import { resolveSearchManagerWith, getMap, getMapManager } from './managers';

let resolveSearchManager;
const searchManager: Promise<SearchManager> = new Promise((resolve) => { resolveSearchManager = resolve });

async function handleResults(fg: FeatureCollection, results): Promise<FeatureCollection> {
  const config = await getConfig();
  // fg.clearLayers();
  let resultCount = document.getElementById("result-count");
  const map = await getMap();
  if (results.geofilteredResultCount) {
      const layer = map.getLayer('assets-flat');
      if (results.geofilteredResultCount == results.unfilteredResultCount) {
        if (layer) {
            map.setLayoutProperty('assets-flat', 'visibility', 'visible');
        }
        resultCount.innerHTML = `Showing all <strong>${results.unfilteredResultCount}</strong> search results`;
      } else if (results.unfilteredResultCount === 0 && results.geofilteredResultCount < config.maxMapPoints) {
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
  return Promise.all(results.results.slice(0, config.maxMapPoints).map(r => {
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
                const call = `map.flyTo({center: [${loc[0]}, ${loc[1]}], zoom: ${config.minSearchZoom + 1}})`;
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
  })).then((promises) => {
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

class SearchManager {
  pagefind;
  lastTerm;
  lastFilters;
  cachedResults;
  fb;

  async initialize() {
      return this.getPagefindInstance()
  }

  async makePagefindInstance() {
      let instance;
      let term = await getTerm();
      const fg: FeatureCollection = {
          'type': 'FeatureCollection',
          'features': []
      };

      try {
          instance = await buildPagefind((pagefind, term, settings) => this.searchAction(pagefind, term, settings), term);
      } catch (e) {
          console.error(`Could not load pagefind: ${e}`);
          instance = null;
      }

      const searchFilters = await getFilters();
      if (searchFilters && searchFilters.tags && searchFilters.tags.length) {
          searchFilters.tags.forEach(aria => {
            const elt = document.querySelector(`[aria-label="${aria}"]`);
            elt.parentElement.click();
          });
      }

      this.fb = await getFlatbushWrapper();
      const geoBounds = this.fb && this.fb.bounds;

      if (instance) {
          instance.on("results", async (results) => {
              await getMap();
              return handleResults(fg, results).then(async (fg) => {
                  const m = await getMap();
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
                      searchTerm: this.lastTerm,
                      geoBounds: geoBounds,
                      searchFilters: this.lastFilters
                    };
                    
                    saveSearchResults(slugs, searchContextParams);
                    debug("Saved search context with " + slugs.length + " slugs", slugs);
                  });

                  await updateSearchParams({
                    searchTerm: this.lastTerm, 
                    searchFilters: this.lastFilters,
                    geoBounds
                  });
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
      updateSearchParams({
          searchTerm: term,
          searchFilters,
          geoBounds
      });

      if ((term || searchFilters) && instance) {
          instance.retriggerSearch();
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
      return instance;
  }

  async getPagefindInstance() {
    if (!this.pagefind) {
      this.pagefind = await this.makePagefindInstance();
    }
    return this.pagefind;
  }

  async getDocByHash(hsh: string) {
    return (await this.getPagefindInstance()).__pagefind__.loadChunk(hsh);
  }

  async searchAction(pagefind, term: string, settings: SearchFilters) {
    const mapManager = await getMapManager();
    if (settings && settings.filters) {
        updateSearchParams({
            searchTerm: term,
            searchFilters: settings.filters,
            geoBounds: this.fb && this.fb.bounds
        });
        if (settings.filters.tags) {
            const registers = settings.filters.tags.map(t => slugify(t));
            const layerManager = await mapManager.getLayerManager();
            await layerManager.blankExcept(registers);
            registers.map(t => layerManager.ensureRegister(t));
        }
    }

    const map = await getMap();
    const zoom = map && map.getZoom();
    const config = await getConfig();

    // if (!(settings && settings.filters && Object.keys(settings.filters).length) && term && term.length < MIN_SEARCH_LENGTH) {
    if (
        (!zoom || zoom < config.minSearchZoom) &&
        (!term || term.trim().length < config.minSearchLength)
    ) {
        mapManager.setMapCover(true);
        return {results: []};
    }
    mapManager.setMapCover(false);
    if (!term) {
        term = null;
    }
    let results;
    let filtersChanged = true;
    let hasFilters = settings && settings.filters && Object.values(settings.filters).reduce((acc, flt) => acc || flt.length > 0, false);
    let hadFilters = this.lastFilters && Object.values(this.lastFilters).reduce((acc, flt) => acc || flt.length > 0, false);

    if (hasFilters && hadFilters) {
      filtersChanged = false;
      const filters = new Set([...Object.keys(this.lastFilters), ...Object.keys(settings.filters)]);
      for (const filter of filters) {
          if (settings.filters[filter] && this.lastFilters[filter]) {
              filtersChanged = filtersChanged || (JSON.stringify(settings.filters[filter]) !== JSON.stringify(this.lastFilters[filter]));
          }
      }
    } else {
      filtersChanged = hasFilters !== hadFilters;
    }

    if (!term) {
      // We have no filtering critera, except bounding box (if that was not present,
      // we would have exited already.
      results = {
          results: this.fb && await this.fb.getFiltered(true),
          unfilteredResultCount: this.fb && this.fb.totalFeatures
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
      if (!this.cachedResults || this.lastTerm !== term || filtersChanged) {
        // We have changes (beyond potentially bounding box), so assume results do not exist
        results = await pagefind.search(term, settings);
        this.cachedResults = results;
        results.unfilteredResults = results.results;
      } else {
        results = this.cachedResults;
        results.results = results.unfilteredResults;
      }
      const filtered = this.fb && await this.fb.getFiltered();
      if (filtered) {
          results.results = results.results.filter(r => filtered.has(r.id));
      }
    }
    this.lastTerm = term;
    // Ensure we have an independent copy
    this.lastFilters = JSON.parse(JSON.stringify(settings && settings.filters));
    results.context = {term, settings};
    results.results = results.results.slice(0, config.maxMapPoints);
    results.geofilteredResultCount = results.results.length;
    return results;
  }
};

// SearchManager getter is now in managers.ts

window.addEventListener('DOMContentLoaded', async (event) => {
  const config = await getConfig();
  if (config.hasSearch) {
    const searchManagerInstance = new SearchManager();
    await searchManagerInstance.initialize();
    resolveSearchManagerWith(searchManagerInstance);
  } else {
    resolveSearchManagerWith(undefined);
  }
});
