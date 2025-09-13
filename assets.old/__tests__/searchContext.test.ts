import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  saveSearchResults,
  getNavigation,
  hasSearchContext,
  getSearchContext,
  clearSearchContext,
  getAssetUrlWithContext,
  getSearchBreadcrumbs,
  type SearchParams,
  type SearchContext
} from '../searchContext';

describe('searchContext module', () => {
  const STORAGE_KEY = 'starches_search_context';

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('saveSearchResults', () => {
    it('should save search results to localStorage', () => {
      const ids = ['asset1', 'asset2', 'asset3'];
      const params: SearchParams = {
        searchTerm: 'castle',
        geoBounds: 'bounds-data',
        searchFilters: '{"tags":["Listed Building"]}'
      };

      saveSearchResults(ids, params);

      const stored = localStorage.getItem(STORAGE_KEY);
      expect(stored).toBeTruthy();

      const parsed = JSON.parse(stored!);
      expect(parsed.resultIds).toEqual(ids);
      expect(parsed.searchParams).toEqual(params);
      expect(parsed.timestamp).toBeCloseTo(Date.now(), -2);
    });

    it('should handle empty results', () => {
      saveSearchResults([], {});

      const stored = localStorage.getItem(STORAGE_KEY);
      const parsed = JSON.parse(stored!);
      expect(parsed.resultIds).toEqual([]);
      expect(parsed.searchParams).toEqual({});
    });

    it('should overwrite previous search context', () => {
      saveSearchResults(['old1', 'old2'], { searchTerm: 'old' });
      saveSearchResults(['new1', 'new2'], { searchTerm: 'new' });

      const stored = localStorage.getItem(STORAGE_KEY);
      const parsed = JSON.parse(stored!);
      expect(parsed.resultIds).toEqual(['new1', 'new2']);
      expect(parsed.searchParams.searchTerm).toBe('new');
    });
  });

  describe('getNavigation', () => {
    beforeEach(() => {
      // Set up test context
      const ids = ['asset1', 'asset2', 'asset3', 'asset4'];
      saveSearchResults(ids, { searchTerm: 'test' });
    });

    it('should return previous and next for middle item', () => {
      const nav = getNavigation('asset2');
      expect(nav).toEqual({
        prev: 'asset1',
        next: 'asset3',
        position: 2,
        total: 4
      });
    });

    it('should return null previous for first item', () => {
      const nav = getNavigation('asset1');
      expect(nav).toEqual({
        prev: null,
        next: 'asset2',
        position: 1,
        total: 4
      });
    });

    it('should return null next for last item', () => {
      const nav = getNavigation('asset4');
      expect(nav).toEqual({
        prev: 'asset3',
        next: null,
        position: 4,
        total: 4
      });
    });

    it('should handle ID not in results', () => {
      const nav = getNavigation('not-in-results');
      expect(nav).toEqual({
        prev: null,
        next: null
      });
    });

    it('should handle partial ID matches', () => {
      saveSearchResults(['prefix/asset1', 'prefix/asset2', 'prefix/asset3'], {});
      
      const nav = getNavigation('asset2');
      expect(nav).toEqual({
        prev: 'prefix/asset1',
        next: 'prefix/asset3',
        position: 2,
        total: 3
      });
    });

    it('should return empty navigation when no context exists', () => {
      localStorage.clear();
      const nav = getNavigation('any-id');
      expect(nav).toEqual({
        prev: null,
        next: null
      });
    });
  });

  describe('hasSearchContext', () => {
    it('should return true when context exists', () => {
      saveSearchResults(['asset1'], {});
      expect(hasSearchContext()).toBe(true);
    });

    it('should return false when no context exists', () => {
      expect(hasSearchContext()).toBe(false);
    });

    it('should return false when context has empty results', () => {
      saveSearchResults([], {});
      expect(hasSearchContext()).toBe(false);
    });
  });

  describe('getSearchContext', () => {
    it('should return saved context', () => {
      const ids = ['asset1', 'asset2'];
      const params = { searchTerm: 'test' };
      saveSearchResults(ids, params);

      const context = getSearchContext();
      expect(context.resultIds).toEqual(ids);
      expect(context.searchParams).toEqual(params);
      expect(context.timestamp).toBeCloseTo(Date.now(), -2);
    });

    it('should return empty context when none exists', () => {
      const context = getSearchContext();
      expect(context.resultIds).toEqual([]);
      expect(context.searchParams).toEqual({});
      expect(context.timestamp).toBe(0);
    });
  });

  describe('clearSearchContext', () => {
    it('should clear existing context', () => {
      saveSearchResults(['asset1'], { searchTerm: 'test' });
      expect(hasSearchContext()).toBe(true);

      clearSearchContext();
      expect(hasSearchContext()).toBe(false);
    });

    it('should handle clearing when no context exists', () => {
      expect(() => clearSearchContext()).not.toThrow();
      expect(hasSearchContext()).toBe(false);
    });
  });

  describe('getAssetUrlWithContext', () => {
    it('should create URL with all search parameters', () => {
      saveSearchResults(['asset1'], {
        searchTerm: 'castle',
        geoBounds: 'bounds-data',
        searchFilters: '{"tags":["Monument"]}'
      });

      const url = getAssetUrlWithContext('asset-id');
      expect(url).toContain('slug=asset-id');
      expect(url).toContain('q=castle');
      expect(url).toContain('bounds=bounds-data');
      expect(url).toContain('filters=%7B%22tags%22%3A%5B%22Monument%22%5D%7D');
    });

    it('should create URL with only slug when no context', () => {
      const url = getAssetUrlWithContext('asset-id');
      expect(url).toBe('/asset?slug=asset-id');
    });

    it('should handle partial parameters', () => {
      saveSearchResults(['asset1'], {
        searchTerm: 'test'
        // No bounds or filters
      });

      const url = getAssetUrlWithContext('asset-id');
      expect(url).toContain('slug=asset-id');
      expect(url).toContain('q=test');
      expect(url).not.toContain('bounds=');
      expect(url).not.toContain('filters=');
    });
  });

  describe('getSearchBreadcrumbs', () => {
    it('should return all breadcrumb data', () => {
      saveSearchResults(['asset1'], {
        searchTerm: 'heritage',
        geoBounds: 'bounds-data',
        searchFilters: '{"tags":["Listed Building","Grade II"]}'
      });

      const breadcrumbs = getSearchBreadcrumbs();
      expect(breadcrumbs.searchTerm).toBe('heritage');
      expect(breadcrumbs.geoBounds).toBe('bounds-data');
      expect(breadcrumbs.filters).toEqual(['Listed Building', 'Grade II']);
    });

    it('should handle empty filters object', () => {
      saveSearchResults(['asset1'], {
        searchFilters: '{}'
      });

      const breadcrumbs = getSearchBreadcrumbs();
      expect(breadcrumbs.filters).toBeUndefined();
    });

    it('should handle invalid filter JSON gracefully', () => {
      saveSearchResults(['asset1'], {
        searchFilters: 'invalid-json'
      });

      const breadcrumbs = getSearchBreadcrumbs();
      expect(breadcrumbs.filters).toBeUndefined();
    });

    it('should return empty object when no context exists', () => {
      const breadcrumbs = getSearchBreadcrumbs();
      expect(breadcrumbs).toEqual({});
    });

    it('should handle filters without tags array', () => {
      saveSearchResults(['asset1'], {
        searchFilters: '{"other":"data"}'
      });

      const breadcrumbs = getSearchBreadcrumbs();
      expect(breadcrumbs.filters).toBeUndefined();
    });
  });

  describe('localStorage error handling', () => {
    it('should handle localStorage.setItem errors gracefully', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw new Error('Storage quota exceeded');
        });

      expect(() => {
        saveSearchResults(['asset1'], { searchTerm: 'test' });
      }).not.toThrow();

      setItemSpy.mockRestore();
    });

    it('should handle corrupted localStorage data', () => {
      localStorage.setItem(STORAGE_KEY, 'invalid-json');

      const context = getSearchContext();
      expect(context.resultIds).toEqual([]);
      expect(context.searchParams).toEqual({});
    });
  });
});