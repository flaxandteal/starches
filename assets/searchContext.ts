/**
 * Module for managing search context and navigation between search results.
 * Provides persistent storage for search parameters and results IDs to enable
 * previous/next navigation on detail pages.
 */
import {
  getConfig,
  getSearchContextManager,
  resolveSearchContextManagerWith,
  SearchParams,
  SearchContext,
  ISearchContextManager
} from './managers';
import { debug, debugError } from './debug';

// LocalStorage key for search context
const STORAGE_KEY = 'starches_search_context';

export interface SearchParamsKV {
  searchTerm?: string;
  geoBounds?: string;
  searchFilters?: string;
}

let urlSearchParams: SearchParams | undefined;

// Default empty context
const emptyContext: SearchContext = {
  resultIds: [],
  searchParams: {},
  timestamp: 0
};


function updateParamsFromURL(searchParams?: SearchParams, compareEmpty: boolean=false): [SearchParams, boolean] {
  let changed = false;

  // This prevents later URL updates overwriting the original search params
  const urlParams = urlSearchParams || new URLSearchParams(window.location.search);
  if (!urlSearchParams) urlSearchParams = searchParams;
  const urlFilters = urlParams instanceof URLSearchParams ? urlParams.get('searchFilters') : undefined;
  const urlBounds = urlParams instanceof URLSearchParams ? urlParams.get('geoBounds') : undefined;
  const urlTerm = urlParams instanceof URLSearchParams ? urlParams.get('searchTerm') : undefined;

  // If there are no URL parameters set, then there is no comparison needed.
  if (!(urlFilters || urlTerm || urlBounds) && !compareEmpty) {
    return [searchParams || {}, false];
  }

  searchParams = searchParams || {};

  if (urlTerm && urlTerm != 'null' && /^[_0-9a-z ."'-:{}@]*$/i.exec(urlTerm)) {
    changed ||= (searchParams.searchTerm !== urlTerm);
    searchParams.searchTerm = urlTerm;
  } else {
    changed ||= !!searchParams.searchTerm;
    searchParams.searchTerm = undefined;
  }
  
  if (urlFilters && urlFilters !== '{}' && /^[_0-9a-z ."'-:{}@\[\]]*$/i.exec(urlFilters)) {
    const parsedUrlFilters = JSON.parse(urlFilters);
    changed ||= (searchParams.searchFilters !== parsedUrlFilters);
    searchParams.searchFilters = parsedUrlFilters;
  } else {
    changed ||= !!searchParams.searchFilters;
    searchParams.searchFilters = undefined;
  }
  
  if (urlBounds && /^[-,\[\]_0-9a-f.{}@]*$/i.exec(urlBounds)) {
    const parsedGeoBounds = JSON.parse(urlBounds);
    changed ||= (searchParams.geoBounds !== parsedGeoBounds);
    searchParams.geoBounds = parsedGeoBounds;
  } else {
    changed ||= !!searchParams.geoBounds;
    searchParams.geoBounds = undefined;
  }

  return [searchParams, changed];
}

class UrlOnlySearchContextManager implements ISearchContextManager {
  /**
   * Update search context from URL parameters
   */
  async loadContext(): Promise<SearchContext> {
    let [searchParams, changed] = updateParamsFromURL({});
    const context = { ...emptyContext };
    context.searchParams = searchParams;
    return context;
  }

  saveContext(context: SearchContext): void {
    // Nothing to do, as we do not keep context
  }

  saveSearchResults(ids: string[], params: SearchParams): void {
    // Nothing to do, as we do not keep context
  }
}
class LocalStorageSearchContextManager implements ISearchContextManager {
  /**
   * Load search context from localStorage
   */
  async loadContext(): Promise<SearchContext> {
    let context;
    try {
      const storedContext = localStorage.getItem(STORAGE_KEY);
      if (storedContext) {
        context = JSON.parse(storedContext);
        debug('Loaded search context from storage:', context);
      } else {
        debug('No search context found in storage, using empty context');
      }
    } catch (error) {
      debug('Error loading search context from localStorage:', error);
    }
    
    let [searchParams, changed] = updateParamsFromURL(context && context.searchParams);
    if (changed || !context) {
      context = { ...emptyContext };
      context.searchParams = searchParams;
    }
    return context || { ...emptyContext };
  }

  /**
   * Save context to localStorage
   */
  saveContext(context: SearchContext): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(context));
    } catch (error) {
      debugError('Error saving search context to localStorage:', error);
    }
  }

  /**
   * Save search results to context
   * @param ids Array of asset IDs from search results
   * @param params Search parameters used to obtain results
   */
  saveSearchResults(ids: string[], params: SearchParams): void {
    debug('Saving search results to context:', { 
      count: ids.length, 
      ids, 
      params 
    });

    const context: SearchContext = {
      resultIds: ids,
      searchParams: { ...params },
      timestamp: Date.now()
    };

    this.saveContext(context);

    // Verify storage immediately
    try {
      const storedContext = localStorage.getItem(STORAGE_KEY);
      if (storedContext) {
        const parsed = JSON.parse(storedContext);
        debug('Verified stored context:', { 
          count: parsed.resultIds.length,
          storedTimestamp: parsed.timestamp
        });
      }
    } catch (error) {
      debugError('Error verifying stored context:', error);
    }
  }

}

/**
 * Save search results to context
 * @param ids Array of asset IDs from search results
 * @param params Search parameters used to obtain results
 */
export async function updateSearchParams(searchParams: SearchParams): Promise<void> {
  let [mergedSearchParams, changed] = updateParamsFromURL(Object.assign({}, searchParams), true);

  if (changed) {
    const flattenedSearchParams: SearchParamsKV = {
      searchTerm: searchParams.searchTerm,
      searchFilters: searchParams.searchFilters ? JSON.stringify(searchParams.searchFilters) : undefined,
      geoBounds: searchParams.geoBounds ? JSON.stringify(searchParams.geoBounds) : undefined,
    };
    const url = await makeSearchQuery("?", searchParams);
    history.pushState(flattenedSearchParams, "", url);
    updateBreadcrumbs(searchParams);
  }
}

/**
 * Save search results to context
 * @param ids Array of asset IDs from search results
 * @param params Search parameters used to obtain results
 */
export async function saveSearchResults(ids: string[], params: SearchParams): void {
  (await getSearchContextManager()).saveSearchResults(ids, params);
}

/**
 * Get the previous and next IDs for an asset in the search results
 * @param currentId Current asset ID
 * @returns Object containing previous and next IDs, position info, or null if not available
 */
export async function getNavigation(currentId: string): Promise<{
  prev: string | null;
  next: string | null;
  position?: number;
  total?: number;
}> {
  const context = await (await getSearchContextManager()).loadContext();
  const { resultIds } = context;
  
  debug('Getting navigation for ID:', currentId);
  debug('Available result IDs:', resultIds);
  debug('Storage context timestamp:', context.timestamp);
  
  if (!resultIds.length) {
    debug('No result IDs available');
    return { prev: null, next: null };
  }
  
  // Try with exact match
  let currentIndex = resultIds.indexOf(currentId);
  debug('Current index in results (exact match):', currentIndex);
  
  // If current ID is not in results, try to find a partial match
  // This helps with IDs that might be stored with different formats
  if (currentIndex === -1) {
    debug('Exact match not found, trying partial matches...');
    
    // Try to find a match by checking if any result ID contains or is contained in the current ID
    for (let i = 0; i < resultIds.length; i++) {
      const resultId = resultIds[i];
      if (resultId.includes(currentId) || currentId.includes(resultId)) {
        debug(`Found partial match: Current ID "${currentId}" matches with result ID "${resultId}"`);
        currentIndex = i;
        break;
      }
    }
    
    // Still not found
    if (currentIndex === -1) {
      debug('Current ID not found in results, even with partial matching');
      return { prev: null, next: null };
    }
  }
  
  const prev = currentIndex > 0 ? resultIds[currentIndex - 1] : null;
  const next = currentIndex < resultIds.length - 1 ? resultIds[currentIndex + 1] : null;
  
  // Calculate position (1-based) and total for display
  const position = currentIndex + 1;
  const total = resultIds.length;
  
  debug('Navigation results:', { prev, next, position, total });
  return { prev, next, position, total };
}

/**
 * Check if search context is available
 */
export async function hasSearchContext(): Promise<boolean> {
  const context = await (await getSearchContextManager()).loadContext();
  return context.resultIds.length > 0;
}

/**
 * Clear the current search context
 */
export async function clearSearchContext(): Promise<void> {
  (await getSearchContextManager()).saveContext(emptyContext);
}

/**
 * Get URL for repeating a search with preserved search context
 */
export async function getSearchUrlWithContext(assetId: string): Promise<string> {
  return makeSearchQuery("?");
}

/**
 * Get URL for navigating to asset with preserved search context
 */
export async function getAssetUrlWithContext(assetId: string): Promise<string> {
  return makeSearchQuery("asset?");
}

/**
 * Update breadcrumb display in the DOM based on provided search parameters
 * 
 * @param searchTerm Optional search term
 * @param filters Optional array of filter tags
 * @param geoBounds Optional geographical bounds
 */
export function updateBreadcrumbs(searchParams: SearchParams): void {
  const searchTermEl = document.getElementById('breadcrumb-search-term');
  const filtersEl = document.getElementById('breadcrumb-filters');
  const geoEl = document.getElementById('breadcrumb-geo');
  
  // Clear existing breadcrumbs
  if (searchTermEl) searchTermEl.innerHTML = '';
  if (filtersEl) filtersEl.innerHTML = '';
  if (geoEl) geoEl.innerHTML = '';
  
  // Set search term if available
  if (searchParams.searchTerm && searchTermEl) {
    searchTermEl.innerHTML = `
      <span class="breadcrumb-item">
        <span class="breadcrumb-label">Search:</span>
        ${searchParams.searchTerm}
      </span>
    `;
  }
  
  // Set filters if available
  if (searchParams.searchFilters && Object.keys(searchParams.searchFilters).length > 0 && filtersEl) {
    let html = `
      <span class="breadcrumb-item">
    `;
    for (const [filter, values] of Object.entries(searchParams.searchFilters)) {
      console.log(filter, values);
      html += `
          <span class="breadcrumb-label">${filter.charAt(0).toUpperCase() + filter.substr(1)}:</span>
          ${values.join(', ')}
        </span>
      `;
    }
    filtersEl.innerHTML = html;
  }
  
  // Set geo bounds if available (simplified display)
  if (searchParams.geoBounds && geoEl) {
    geoEl.innerHTML = `
      <span class="breadcrumb-item">
        <span class="breadcrumb-label">Area:</span>
        Map selection applied
      </span>
    `;
  }
}

/**
 * Get breadcrumb information from search context
 * @returns Object containing search term, filters and geographical bounds
 */
export async function getSearchParams(): Promise<SearchParams> {
  // TODO: stop reloading so much
  const { searchParams } = await (await getSearchContextManager()).loadContext();
  return searchParams;
}

export async function getGeoBounds(): Promise<[number, number, number, number] | undefined> {
  const { geoBounds } = await getSearchParams();
  return geoBounds;
}

export async function getFilters(): Promise<{[k: string]: string[]} | undefined> {
  const { searchFilters } = await getSearchParams();
  return searchFilters;
}

export async function getTerm(): Promise<string | undefined> {
  const { searchTerm } = await getSearchParams();
  return searchTerm;
}

export async function makeSearchQuery(url: string, searchParams?: SearchParams) {
  let term;
  let geoBounds;
  let filters;
  if (!searchParams) {
    searchParams = await getSearchParams();
  }

  let fullUrl = url;
  if (url.includes("?")) {
    fullUrl += "&";
  } else {
    fullUrl += "?";
  }

  const params = new URLSearchParams();

  if (searchParams.searchTerm) {
    params.set('searchTerm', searchParams.searchTerm);
  }
  
  if (searchParams.geoBounds) {
    params.set('geoBounds', JSON.stringify(searchParams.geoBounds));
  }
  
  if (searchParams.searchFilters) {
    params.set('searchFilters', JSON.stringify(searchParams.searchFilters));
  }

  return `${fullUrl}${params.toString()}`;
}

window.addEventListener('DOMContentLoaded', async (event) => {
  const config = await getConfig();

  let contextManager: ISearchContextManager;
  if (config.allowSearchContext) {
    contextManager = new LocalStorageSearchContextManager();
  } else {
    contextManager = new UrlOnlySearchContextManager();
  }
  resolveSearchContextManagerWith(contextManager);
});
