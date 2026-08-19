/**
 * Map features for a search result.
 *
 * A resource can hold several geometry tiles — two points, or a point and a
 * line — and all of them belong on the map. meta.geometry is the merged
 * FeatureCollection built by starches-builder; meta.location is the single
 * anchor point, used on its own only when there is no geometry to draw.
 *
 * Every feature carries the same properties, including the slug that
 * handleResults keys its incremental add/remove on, so several features per
 * resource is expected downstream.
 */
export function geometriesFor(
  meta: { geometry?: string; location?: string; slug?: string },
  properties: Record<string, unknown>,
  onWarning?: (message: string, error: unknown) => void
): GeoJSON.Feature[] {
  if (meta.geometry) {
    let collection;
    try {
      collection = JSON.parse(meta.geometry);
    } catch (e) {
      onWarning?.(`Could not parse geometry for ${meta.slug}`, e);
    }
    if (collection && Array.isArray(collection.features)) {
      const features = collection.features
        .filter((f) => f?.geometry?.coordinates)
        .map((f) => ({ type: 'Feature', geometry: f.geometry, properties }) as GeoJSON.Feature);
      if (features.length) {
        return features;
      }
    }
  }

  if (!meta.location) {
    return [];
  }
  let loc;
  try {
    loc = JSON.parse(meta.location);
  } catch (e) {
    onWarning?.(`Could not parse location for ${meta.slug}`, e);
    return [];
  }
  if (!Array.isArray(loc) || !Number.isFinite(loc[0]) || !Number.isFinite(loc[1])) {
    return [];
  }
  return [{
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [loc[0], loc[1]] },
    properties
  } as GeoJSON.Feature];
}
