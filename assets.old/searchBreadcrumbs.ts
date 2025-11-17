/**
 * Module for managing breadcrumb display based on search context
 */
import { debug, debugError } from './debug';

/**
 * Update breadcrumb display in the DOM based on provided search parameters
 * 
 * @param searchTerm Optional search term
 * @param filters Optional array of filter tags
 * @param geoBounds Optional geographical bounds
 */
export function updateBreadcrumbs(
  searchTerm?: string, 
  filters?: string[], 
  geoBounds?: string
): void {
  const searchTermEl = document.getElementById('breadcrumb-search-term');
  const filtersEl = document.getElementById('breadcrumb-filters');
  const geoEl = document.getElementById('breadcrumb-geo');
  
  // Clear existing breadcrumbs
  if (searchTermEl) searchTermEl.innerHTML = '';
  if (filtersEl) filtersEl.innerHTML = '';
  if (geoEl) geoEl.innerHTML = '';
  
  // Set search term if available
  if (searchTerm && searchTermEl) {
    searchTermEl.innerHTML = `
      <span class="breadcrumb-item">
        <span class="breadcrumb-label">Search:</span>
        ${searchTerm}
      </span>
    `;
  }
  
  // Set filters if available
  if (filters && filters.length > 0 && filtersEl) {
    filtersEl.innerHTML = `
      <span class="breadcrumb-item">
        <span class="breadcrumb-label">Filters:</span>
        ${filters.join(', ')}
      </span>
    `;
  }
  
  // Set geo bounds if available (simplified display)
  if (geoBounds && geoEl) {
    geoEl.innerHTML = `
      <span class="breadcrumb-item">
        <span class="breadcrumb-label">Area:</span>
        Map selection applied
      </span>
    `;
  }
}