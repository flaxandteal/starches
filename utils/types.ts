class AssetMetadata {
  [key: string]: string

  constructor(resourceinstanceid: string, geometry: object, location: object, title: string, slug: string) {
    this.resourceinstanceid = resourceinstanceid;
    if (geometry) {
      this.geometry = JSON.stringify(geometry);
    }
    if (location) {
      this.location = JSON.stringify(location);
    }
    this.title = title;
    this.slug = slug;
    this.designations = "[]";
  }
};

class Asset {
  meta: AssetMetadata;
  content: string;
  slug: string;

  constructor(resourceinstanceid: string, geometry: object, location: object, title: string, slug: string, content: string) {
    this.meta = new AssetMetadata(resourceinstanceid, geometry, location, title, slug);
    this.content = content;
    this.slug = slug;
  }
};

class ModelEntry {
  graph: string
  resources: {[key: string]: string}

  constructor(graph: string, resources: {[key: string]: string}) {
    this.graph = graph;
    this.resources = resources;
  }
}

interface IAssetFunctions {
  getMeta(staticAsset: any): Promise<Asset>;
  toSlug(staticAsset: any): string;
  initialize(): Promise<never>;
}

export { Asset, AssetMetadata, ModelEntry };
export type { IAssetFunctions };
