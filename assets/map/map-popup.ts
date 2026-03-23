import { Popup, MapMouseEvent } from 'maplibre-gl';
import { marked } from 'marked';
import { isTouch, loadTemplate } from '../shared';
import type { TargetingMap } from './map-types';

declare const bootstrap: {
  Offcanvas: {
    getOrCreateInstance: (el: HTMLElement) => { show: () => void; hide: () => void };
  };
};

const mapDialogTemplatePromise = loadTemplate('/templates/map-dialog-template.html');

export async function resultFunction(map: TargetingMap, e: MapMouseEvent & { features?: any[] }): Promise<void> {
  if (!e.features || e.features.length === 0) {
    console.warn('No features found at click location');
    return;
  }

  const feature = e.features[0];
  console.log('Clicked feature:', feature);
  const title = feature.properties.title;
  const description = feature.properties.description;
  const excerpt = await marked.parse(description.trim());
  const coordinates: number[] = feature.geometry.coordinates.slice();
  const lngLat = e.lngLat;

  map.stop();
  map.targeting = coordinates;
  const touch = isTouch();

  const mapDialogTemplate = await mapDialogTemplatePromise;
  if (typeof mapDialogTemplate !== 'function') {
    console.error('Map dialog template failed to load');
    return;
  }
  const url = feature.properties.url || '#';
  const renderedHtml = mapDialogTemplate({ title, excerpt, location: coordinates, url });

  if (touch) {
    const offcanvasContent = document.getElementById("map-offcanvas__content");
    if (offcanvasContent) {
      offcanvasContent.innerHTML = renderedHtml;
    }

    const offcanvasEl = document.getElementById("map-offcanvas");
    if (offcanvasEl) {
      const offcanvas = bootstrap.Offcanvas.getOrCreateInstance(offcanvasEl);
      offcanvas.show();
    }
  } else {
    while (Math.abs(lngLat.lng - coordinates[0]) > 180) {
      coordinates[0] += lngLat.lng > coordinates[0] ? 360 : -360;
    }

    new Popup({ maxWidth: '320px' })
      .setLngLat(coordinates as [number, number])
      .setHTML(renderedHtml)
      .addTo(window.map);
  }
}
