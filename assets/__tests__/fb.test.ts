import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { FlatbushWrapper } from '../fb';
import Flatbush from 'flatbush';
import { deserialize as fgbDeserialize } from 'flatgeobuf/lib/mjs/geojson.js';
import { nearestPoint } from '@turf/nearest-point';

// Mock dependencies
vi.mock('flatbush');
vi.mock('flatgeobuf/lib/mjs/geojson.js');
vi.mock('@turf/nearest-point');

// Mock fetch globally
global.fetch = vi.fn();

describe('FlatbushWrapper', () => {
  let wrapper: FlatbushWrapper;
  let mockFlatbushInstance: {
    search: Mock;
  };
  let filterWarningElement: HTMLElement;

  beforeEach(() => {
    wrapper = new FlatbushWrapper();
    
    // Mock Flatbush instance
    mockFlatbushInstance = {
      search: vi.fn().mockReturnValue([0, 1, 2])
    };
    
    // Mock Flatbush.from
    (Flatbush.from as Mock).mockReturnValue(mockFlatbushInstance);
    
    // Setup DOM
    filterWarningElement = document.createElement('div');
    filterWarningElement.id = 'filter-warning';
    filterWarningElement.classList.add('filter-warning-hidden');
    document.body.appendChild(filterWarningElement);
    
    // Reset fetch mock
    (global.fetch as Mock).mockReset();
  });

  afterEach(() => {
    document.body.removeChild(filterWarningElement);
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('should load index and locations without bounds', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const mockLocations = [[1, 2], [3, 4], [5, 6]];
      
      (global.fetch as Mock)
        .mockResolvedValueOnce({
          arrayBuffer: vi.fn().mockResolvedValue(mockArrayBuffer)
        })
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue(mockLocations)
        });

      await wrapper.initialize('/path/to/flatbush.bin');

      expect(global.fetch).toHaveBeenCalledWith('/path/to/flatbush.bin');
      expect(global.fetch).toHaveBeenCalledWith('/flatbush.json');
      expect(Flatbush.from).toHaveBeenCalledWith(mockArrayBuffer);
      expect(wrapper.index).toBe(mockFlatbushInstance);
      expect(wrapper.locs).toEqual(mockLocations);
      expect(wrapper.__filtered__).toBe(null);
    });

    it('should apply bounds filter if provided', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const mockLocations = [[1, 2], [3, 4], [5, 6]];
      const bounds: [number, number, number, number] = [0, 0, 10, 10];
      
      (global.fetch as Mock)
        .mockResolvedValueOnce({
          arrayBuffer: vi.fn().mockResolvedValue(mockArrayBuffer)
        })
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue(mockLocations)
        });

      await wrapper.initialize('/path/to/flatbush.bin', bounds);

      expect(wrapper.bounds).toEqual(bounds);
      expect(mockFlatbushInstance.search).toHaveBeenCalledWith(...bounds);
      expect(wrapper.__filtered__).toBeInstanceOf(Set);
    });
  });

  describe('filter', () => {
    beforeEach(async () => {
      // Initialize wrapper first
      const mockArrayBuffer = new ArrayBuffer(8);
      const mockLocations = [[10, 20], [30, 40], [50, 60]];
      
      (global.fetch as Mock)
        .mockResolvedValueOnce({
          arrayBuffer: vi.fn().mockResolvedValue(mockArrayBuffer)
        })
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue(mockLocations)
        });

      await wrapper.initialize('/path/to/flatbush.bin');
    });

    it('should filter locations by bounds', () => {
      const bounds: [number, number, number, number] = [0, 0, 100, 100];
      
      wrapper.filter(bounds);

      expect(mockFlatbushInstance.search).toHaveBeenCalledWith(...bounds);
      expect(wrapper.bounds).toEqual(bounds);
      expect(wrapper.__filtered__).toBeInstanceOf(Set);
      expect(wrapper.__filtered__).toContain(10); // First element of first location
      expect(filterWarningElement.classList.contains('filter-warning-visible')).toBe(true);
    });
  });

  describe('setFiltered', () => {
    it('should show filter warning when filtered', () => {
      const mockSet = new Set([1, 2, 3]);
      
      wrapper.setFiltered(mockSet);

      expect(wrapper.__filtered__).toBe(mockSet);
      expect(wrapper.__filteredWithMetadata__).toBe(null);
      expect(filterWarningElement.classList.contains('filter-warning-visible')).toBe(true);
      expect(filterWarningElement.classList.contains('filter-warning-hidden')).toBe(false);
    });

    it('should hide filter warning when not filtered', () => {
      wrapper.setFiltered(null);

      expect(wrapper.__filtered__).toBe(null);
      expect(wrapper.bounds).toBe(null);
      expect(wrapper.__filteredWithMetadata__).toBe(null);
      expect(filterWarningElement.classList.contains('filter-warning-hidden')).toBe(true);
      expect(filterWarningElement.classList.contains('filter-warning-visible')).toBe(false);
    });
  });

  describe('getFiltered', () => {
    it('should return filtered set without metadata', async () => {
      const mockSet = new Set([1, 2, 3]);
      wrapper.__filtered__ = mockSet;

      const result = await wrapper.getFiltered(false);
      expect(result).toBe(mockSet);
    });

    it('should return null when no bounds set for metadata request', async () => {
      wrapper.bounds = null;

      const result = await wrapper.getFiltered(true);
      expect(result).toBe(null);
    });

    it('should fetch and cache metadata when requested', async () => {
      wrapper.bounds = [0, 0, 10, 10];
      
      const mockFeature = {
        id: 'feature1',
        properties: {
          content: 'Test content',
          filters: ['filter1'],
          otherProp: 'value'
        }
      };

      // Mock async generator for fgbDeserialize
      const mockAsyncGenerator = async function* () {
        yield mockFeature;
      };
      (fgbDeserialize as Mock).mockReturnValue(mockAsyncGenerator());

      const result = await wrapper.getFiltered(true);

      expect(fgbDeserialize).toHaveBeenCalledWith(
        '/fgb/nihed-assets.fgb',
        { minX: 0, minY: 0, maxX: 10, maxY: 10 },
        expect.any(Function)
      );
      
      expect(result).toBeInstanceOf(Array);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'feature1',
        excerpt: 'Test content',
        filters: ['filter1']
      });

      // Test data function
      const data = await result[0].data();
      expect(data).toMatchObject({
        content: 'Test content',
        filters: ['filter1'],
        otherProp: 'value',
        excerpt: 'Test content'
      });
    });
  });

  describe('handleHeader', () => {
    it('should store features count', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      wrapper.handleHeader({ featuresCount: 100, description: 'Test description' });

      expect(wrapper.totalFeatures).toBe(100);
      expect(consoleSpy).toHaveBeenCalledWith('Test description');
      
      consoleSpy.mockRestore();
    });

    it('should handle missing description', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      wrapper.handleHeader({ featuresCount: 50 });

      expect(wrapper.totalFeatures).toBe(50);
      expect(consoleSpy).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });

  describe('nearest', () => {
    it('should find nearest point without regcode filter', async () => {
      const location: [number, number] = [50, 50];
      const mockFeatures = [
        { properties: { regcode: 1 }, geometry: { type: 'Point', coordinates: [50.1, 50.1] } },
        { properties: { regcode: 2 }, geometry: { type: 'Point', coordinates: [49.9, 49.9] } }
      ];
      const mockNearestResult = { properties: { regcode: 2 } };

      // Mock async generator
      const mockAsyncGenerator = async function* () {
        for (const feature of mockFeatures) {
          yield feature;
        }
      };
      (fgbDeserialize as Mock).mockReturnValue(mockAsyncGenerator());
      (nearestPoint as Mock).mockReturnValue(mockNearestResult);

      const result = await wrapper.nearest(location, undefined);

      expect(fgbDeserialize).toHaveBeenCalledWith(
        '/fgb/nihed-assets.fgb',
        { minX: 49.97, minY: 49.97, maxX: 50.03, maxY: 50.03 }
      );
      expect(nearestPoint).toHaveBeenCalledWith(
        location,
        expect.objectContaining({
          type: 'FeatureCollection',
          features: mockFeatures
        })
      );
      expect(result).toBe(mockNearestResult);
    });

    it('should filter by regcode when provided', async () => {
      const location: [number, number] = [50, 50];
      const mockFeatures = [
        { properties: { regcode: 1 }, geometry: { type: 'Point', coordinates: [50.1, 50.1] } },
        { properties: { regcode: 2 }, geometry: { type: 'Point', coordinates: [49.9, 49.9] } }
      ];

      const mockAsyncGenerator = async function* () {
        for (const feature of mockFeatures) {
          yield feature;
        }
      };
      (fgbDeserialize as Mock).mockReturnValue(mockAsyncGenerator());
      (nearestPoint as Mock).mockReturnValue({ properties: { regcode: 1 } });

      await wrapper.nearest(location, 1);

      expect(nearestPoint).toHaveBeenCalledWith(
        location,
        expect.objectContaining({
          type: 'FeatureCollection',
          features: [mockFeatures[0]] // Only features with regcode 1
        })
      );
    });

    it('should return undefined when no features found', async () => {
      const location: [number, number] = [50, 50];
      
      const mockAsyncGenerator = async function* () {
        // No features yielded
      };
      (fgbDeserialize as Mock).mockReturnValue(mockAsyncGenerator());

      const result = await wrapper.nearest(location, 1);

      expect(result).toBeUndefined();
      expect(nearestPoint).not.toHaveBeenCalled();
    });
  });
});