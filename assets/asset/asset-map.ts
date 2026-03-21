import { Map as MLMap } from 'maplibre-gl';
import { addMarkerImage } from '../map-icons';
import { AssetMetadata } from '../shared/managers';

interface AssetWithMeta {
  meta: AssetMetadata;
}

function getBoundaryPaint(geometry: any) {
  if (geometry?.type === "FeatureCollection"
    && geometry.features?.length === 1
    && geometry.features[0].properties?.type === 'Grid Square') {
    return {
      'fill-color': 'rgba(255, 255, 255, 0.1)',
      'fill-outline-color': '#aa4444',
      'fill-opacity': 0.4
    };
  }
  return {
    'fill-color': '#a88',
    'fill-opacity': 0.8,
  };
}

function addMapLayers(map: MLMap, asset: AssetWithMeta) {
  map.addSource('assets', {
    type: 'geojson',
    data: asset.meta.geometry,
  });

  map.addSource('assets-marker', {
    type: 'geojson',
    data: {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Point",
        coordinates: asset.meta.location!,
      }
    }
  });

  map.addLayer({
    id: '3d-buildings',
    source: 'openmaptiles',
    'source-layer': 'building',
    filter: ["!", ["to-boolean", ["get", "hide_3d"]]],
    type: 'fill-extrusion',
    minzoom: 13,
    paint: {
      'fill-extrusion-color': 'lightgray',
      'fill-extrusion-opacity': 0.5,
      'fill-extrusion-height': [
        'interpolate', ['linear'], ['zoom'],
        13, 0,
        16, ['get', 'render_height']
      ],
      'fill-extrusion-base': [
        'case',
        ['>=', ['get', 'zoom'], 16],
        ['get', 'render_min_height'], 0
      ]
    }
  });

  map.addLayer({
    id: 'asset-boundaries',
    type: 'fill',
    source: 'assets',
    paint: getBoundaryPaint(asset.meta.geometry),
    filter: ['==', '$type', 'Polygon']
  });

  map.addLayer({
    id: 'assets-marker',
    type: 'symbol',
    source: 'assets-marker',
    layout: {
      'icon-image': 'marker-new',
      'text-offset': [0, 1.25],
      'text-anchor': 'top'
    },
    filter: ['==', '$type', 'Point']
  });
}

export function addAssetToMap(asset: AssetWithMeta) {
  const location = asset.meta.location;
  if (!location) {
    document.getElementById('map')?.classList.add('map-hidden');
    return;
  }

  const map = new MLMap({
    style: 'https://tiles.openfreemap.org/styles/bright',
    pitch: 20,
    bearing: 0,
    container: 'map',
    center: location,
    zoom: 16
  });

  map.on('load', async () => {
    await addMarkerImage(map as any);
    addMapLayers(map, asset);
  });
}
