import { Map as MLMap } from 'maplibre-gl';

export type TargetingMap = MLMap & {
  targeting?: number[] | boolean;
  resetViewControl?: any;
};

declare global {
  interface Window {
    map: TargetingMap;
  }
  const bootstrap: {
    Offcanvas: {
      getOrCreateInstance: (el: HTMLElement) => { show: () => void; hide: () => void };
    };
  };
}
