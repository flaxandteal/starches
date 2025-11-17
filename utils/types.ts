class AssetMetadata {
  [key: string]: string

  constructor(resourceinstanceid: string, geometry: object, location: object, title: string, slug: string, scopes: string) {
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
    this.scopes = scopes;
  }
};

class Asset {
  meta: AssetMetadata;
  content: string;
  slug: string;
  type: string;

  constructor(resourceinstanceid: string, geometry: object, location: object, title: string, slug: string, content: string, type: string, scopes: string[]) {
    this.meta = new AssetMetadata(resourceinstanceid, geometry, location, title, slug, JSON.stringify(scopes));
    this.content = content;
    this.slug = slug;
    this.type = type;
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
  getMeta(asset: any, staticAsset: any, prefix: string | undefined, includePrivate: boolean): Promise<Asset>;
  toSlug(staticAsset: any): string;
  initialize(): Promise<never>;
}

export { Asset, AssetMetadata, ModelEntry };
export type { IAssetFunctions };
