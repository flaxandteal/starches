declare module '@esri/maplibre-arcgis' {
  import { Map as MLMap } from 'maplibre-gl';

  export class VectorTileLayer {
    static fromUrl(url: string): Promise<VectorTileLayer>;
    addSourcesAndLayersTo(map: MLMap): void;
  }
}
