/**
 * Module for managing search context and navigation between search results.
 * Provides persistent storage for search parameters and results IDs to enable
 * previous/next navigation on detail pages.
 */
import { debug, debugError } from './debug';

// LocalStorage key for search context
const STORAGE_KEY = 'starches_search_context';

export interface SearchParams {
  searchTerm?: string;
  geoBounds?: string;
  searchFilters?: string;
}

let urlSearchParams: SearchParams | undefined;

export interface SearchContext {
  /** Array of asset IDs from search results */
  resultIds: string[];
  /** Search parameters that produced these results */
  searchParams: SearchParams;
  /** Timestamp when search was performed */
  timestamp: number;
}

// Default empty context
const emptyContext: SearchContext = {
  resultIds: [],
  searchParams: {},
  timestamp: 0
};

/**
 * Load search context from localStorage
 */
function loadContextFromStorage(): SearchContext {
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
 * Update search context from URL parameters
 */
function updateParamsFromURL(searchParams?: SearchParams): [SearchParams, boolean] {
  let changed = false;

  // This prevents later URL updates overwriting the original search params
  urlSearchParams = urlSearchParams || new URLSearchParams(window.location.search);
  const urlFilters = urlSearchParams.get('searchFilters');
  const urlBounds = urlSearchParams.get('geoBounds');
  const urlTerm = urlSearchParams.get('searchTerm');

  // If there are no URL parameters set, then there is no comparison needed.
  if (!(urlFilters || urlTerm || urlBounds)) {
    return [searchParams || {}, false];
  }

  searchParams = searchParams || {};

  if (urlTerm && urlTerm != 'null' && /^[_0-9a-z ."'-:{}@]*$/i.exec(urlTerm)) {
    changed ||= (searchParams.searchTerm !== urlTerm);
    searchParams.searchTerm = urlTerm;
  } else {
    searchParams.searchTerm = undefined;
  }
  
  if (urlFilters && urlFilters !== '{}' && /^[_0-9a-z ."'-:{}@\[\]]*$/i.exec(urlFilters)) {
    changed ||= (searchParams.searchFilters !== urlFilters);
    searchParams.searchFilters = urlFilters;
  } else {
    searchParams.searchFilters = undefined;
  }
  
  if (urlBounds && /^[-,\[\]_0-9a-f.{}@]*$/i.exec(urlBounds)) {
    changed ||= (searchParams.geoBounds !== urlBounds);
    searchParams.geoBounds = urlBounds;
  } else {
    searchParams.geoBounds = undefined;
  }
  console.log('sp', searchParams, urlSearchParams, changed, urlTerm, urlFilters, urlBounds);

  return [searchParams, changed];
}

/**
 * Save context to localStorage
 */
function saveContextToStorage(context: SearchContext): void {
  /* TODO: for now, disable this as we need to make it opt-in */
  return;

  // try {
  //   localStorage.setItem(STORAGE_KEY, JSON.stringify(context));
  // } catch (error) {
  //   debugError('Error saving search context to localStorage:', error);
  // }
}

/**
 * Save search results to context
 * @param ids Array of asset IDs from search results
 * @param params Search parameters used to obtain results
 */
export function saveSearchResults(ids: string[], params: SearchParams): void {
  /* TODO: for now, disable this as we need to make it opt-in */
  return;

  // debug('Saving search results to context:', { 
  //   count: ids.length, 
  //   ids, 
  //   params 
  // });
  // 
  // const context: SearchContext = {
  //   resultIds: ids,
  //   searchParams: { ...params },
  //   timestamp: Date.now()
  // };
  // 
  // saveContextToStorage(context);
  // 
  // // Verify storage immediately
  // try {
  //   const storedContext = localStorage.getItem(STORAGE_KEY);
  //   if (storedContext) {
  //     const parsed = JSON.parse(storedContext);
  //     debug('Verified stored context:', { 
  //       count: parsed.resultIds.length,
  //       storedTimestamp: parsed.timestamp
  //     });
  //   }
  // } catch (error) {
  //   debugError('Error verifying stored context:', error);
  // }
}

/**
 * Get the previous and next IDs for an asset in the search results
 * @param currentId Current asset ID
 * @returns Object containing previous and next IDs, position info, or null if not available
 */
export function getNavigation(currentId: string): { 
  prev: string | null; 
  next: string | null;
  position?: number;
  total?: number;
} {
  const context = loadContextFromStorage();
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
export function hasSearchContext(): boolean {
  const context = loadContextFromStorage();
  return context.resultIds.length > 0;
}

/**
 * Get current search context
 */
export function getSearchContext(): SearchContext {
  return loadContextFromStorage();
}

/**
 * Clear the current search context
 */
export function clearSearchContext(): void {
  saveContextToStorage(emptyContext);
}

/**
 * Get URL for repeating a search with preserved search context
 */
export function getSearchUrlWithContext(assetId: string): string {
  const { searchParams } = loadContextFromStorage();
  const params = new URLSearchParams();
  
  if (searchParams.searchTerm) {
    params.set('searchTerm', searchParams.searchTerm);
  }
  
  if (searchParams.geoBounds) {
    params.set('geoBounds', searchParams.geoBounds);
  }
  
  if (searchParams.searchFilters) {
    params.set('searchFilters', searchParams.searchFilters);
  }
  
  return `/?${params.toString()}`;
}

/**
 * Get URL for navigating to asset with preserved search context
 */
export function getAssetUrlWithContext(assetId: string): string {
  const { searchParams } = loadContextFromStorage();
  const params = new URLSearchParams();
  
  params.set('slug', assetId);
  
  if (searchParams.searchTerm) {
    params.set('searchTerm', searchParams.searchTerm);
  }
  
  if (searchParams.geoBounds) {
    params.set('geoBounds', searchParams.geoBounds);
  }
  
  if (searchParams.searchFilters) {
    params.set('searchFilters', searchParams.searchFilters);
  }
  
  return `/asset?${params.toString()}`;
}

/**
 * Get breadcrumb information from search context
 * @returns Object containing search term, filters and geographical bounds
 */
export function getSearchBreadcrumbs(): { 
  searchTerm?: string,
  filters?: string[], 
  geoBounds?: string
} {
  const { searchParams } = loadContextFromStorage();
  const result: { searchTerm?: string, filters?: string[], geoBounds?: string } = {};
  
  if (searchParams.searchTerm) {
    result.searchTerm = searchParams.searchTerm;
  }
  
  if (searchParams.searchFilters) {
    try {
      const parsedFilters = JSON.parse(searchParams.searchFilters);
      if (parsedFilters.tags && Array.isArray(parsedFilters.tags)) {
        result.filters = parsedFilters.tags;
      }
    } catch (e) {
      debugError('Error parsing search filters for breadcrumbs:', e);
    }
  }
  
  if (searchParams.geoBounds) {
    result.geoBounds = searchParams.geoBounds;
  }
  
  return result;
}
