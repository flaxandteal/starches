import { describe, it, expect } from 'vitest';
import { geometriesFor } from '../geometries';

const PROPS = { slug: 'cat-test-multigeom', title: 'TEST' };

const collection = (...geometries) => JSON.stringify({
  type: 'FeatureCollection',
  features: geometries.map(geometry => ({ type: 'Feature', properties: {}, geometry }))
});

const POINT_A = { type: 'Point', coordinates: [172.687, -43.605] };
const POINT_B = { type: 'Point', coordinates: [172.715, -43.593] };
const LINE = { type: 'LineString', coordinates: [[172.695, -43.6], [172.712, -43.594]] };

describe('geometriesFor', () => {
  it('returns one feature per geometry, not just the first', () => {
    const features = geometriesFor({ geometry: collection(POINT_A, POINT_B, LINE) }, PROPS);
    expect(features).toHaveLength(3);
    expect(features.map(f => f.geometry.type)).toEqual(['Point', 'Point', 'LineString']);
  });

  it('gives every feature the same properties, so slug-keyed updates still work', () => {
    const features = geometriesFor({ geometry: collection(POINT_A, POINT_B) }, PROPS);
    expect(new Set(features.map(f => f.properties.slug))).toEqual(new Set(['cat-test-multigeom']));
  });

  it('falls back to the anchor point when there is no geometry', () => {
    const features = geometriesFor({ location: '[1,2]' }, PROPS);
    expect(features).toHaveLength(1);
    expect(features[0].geometry).toEqual({ type: 'Point', coordinates: [1, 2] });
  });

  it('falls back when the geometry has no usable features', () => {
    const empty = JSON.stringify({ type: 'FeatureCollection', features: [] });
    expect(geometriesFor({ geometry: empty, location: '[1,2]' }, PROPS)).toHaveLength(1);
  });

  it('skips features without coordinates', () => {
    const partial = JSON.stringify({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: null }, { type: 'Feature', geometry: POINT_A }]
    });
    expect(geometriesFor({ geometry: partial }, PROPS)).toHaveLength(1);
  });

  it('survives malformed JSON without throwing', () => {
    const warnings: string[] = [];
    const features = geometriesFor(
      { geometry: '{not json', location: '[3,4]', slug: 'x' }, PROPS,
      (m) => warnings.push(m)
    );
    expect(features[0].geometry.coordinates).toEqual([3, 4]);
    expect(warnings).toHaveLength(1);
  });

  it('returns nothing when there is neither geometry nor location', () => {
    expect(geometriesFor({}, PROPS)).toEqual([]);
  });
});
