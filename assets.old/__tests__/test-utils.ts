import { vi } from 'vitest';

/**
 * Create a mock DOM element with specified attributes
 */
export function createMockElement(tag: string, attributes: Record<string, any> = {}): HTMLElement {
  const element = document.createElement(tag);
  Object.entries(attributes).forEach(([key, value]) => {
    if (key === 'innerHTML' || key === 'textContent') {
      element[key] = value;
    } else {
      element.setAttribute(key, value);
    }
  });
  return element;
}

/**
 * Create a mock fetch response
 */
export function createMockFetchResponse(data: any, options: Partial<Response> = {}): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
    redirected: false,
    type: 'basic',
    url: '',
    clone: vi.fn(),
    body: null,
    bodyUsed: false,
    arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
    blob: vi.fn().mockResolvedValue(new Blob()),
    formData: vi.fn().mockResolvedValue(new FormData()),
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
    ...options
  } as unknown as Response;
}

/**
 * Create a mock MapLibre map instance
 */
export function createMockMap() {
  return {
    hasImage: vi.fn().mockReturnValue(false),
    addImage: vi.fn(),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    removeSource: vi.fn(),
    getLayer: vi.fn(),
    getSource: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    fitBounds: vi.fn(),
    flyTo: vi.fn(),
    getCenter: vi.fn().mockReturnValue({ lng: 0, lat: 0 }),
    getZoom: vi.fn().mockReturnValue(10),
    getBounds: vi.fn().mockReturnValue({
      getNorth: () => 10,
      getSouth: () => -10,
      getEast: () => 10,
      getWest: () => -10,
      toArray: () => [[-10, -10], [10, 10]]
    }),
    resize: vi.fn(),
    remove: vi.fn()
  };
}

/**
 * Wait for all pending promises to resolve
 */
export function flushPromises(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Mock localStorage with full functionality
 */
export class LocalStorageMock {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.store[key] || null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = value.toString();
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }

  key(index: number): string | null {
    const keys = Object.keys(this.store);
    return keys[index] || null;
  }

  get length(): number {
    return Object.keys(this.store).length;
  }
}

/**
 * Create a mock async generator for testing
 */
export async function* createMockAsyncGenerator<T>(items: T[]) {
  for (const item of items) {
    yield item;
  }
}

/**
 * Mock console methods for cleaner test output
 */
export function mockConsole() {
  const originalConsole = { ...console };
  
  const mocks = {
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
    info: vi.spyOn(console, 'info').mockImplementation(() => {})
  };

  return {
    mocks,
    restore: () => {
      Object.values(mocks).forEach(mock => mock.mockRestore());
    }
  };
}

/**
 * Create a mock GeoJSON Feature
 */
export function createMockFeature(properties: Record<string, any> = {}, coordinates: number[] = [0, 0]) {
  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates
    },
    properties
  };
}

/**
 * Create a mock GeoJSON FeatureCollection
 */
export function createMockFeatureCollection(features: any[] = []) {
  return {
    type: 'FeatureCollection',
    features
  };
}