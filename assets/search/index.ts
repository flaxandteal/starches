// Search context (cross-module public API)
export {
  getNavigation,
  hasSearchContext,
  getAssetUrlWithContext,
  getSearchUrlWithContext,
  getSearchParams,
  getGeoBounds,
  getSelectionPolygon,
  hasSelectionPolygon,
  getFilters,
  getTerm,
  updateSearchParams,
  updateBreadcrumbs,
  saveSearchResults,
  makeSearchQuery,
  clearSearchContext,
} from './searchContext';

export type { SearchParamsKV } from './searchContext';
