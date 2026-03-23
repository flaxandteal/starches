import * as params from '@params';
import * as Handlebars from 'handlebars';
import { AlizarinModel, client, graphManager, staticStore, staticTypes, viewModels, RDM, wasmReady, slugify } from 'alizarin/inline';
export { graphManager, staticTypes, renderers } from 'alizarin/inline';
import '@alizarin/filelist';
import '@alizarin/clm';
import { debug } from '../shared';
import type { AssetMetadata } from '../shared';
import { getPrecompiledTemplate } from '../shared';

export interface Asset {
  asset: AlizarinModel<any>;
  meta: AssetMetadata;
}

interface ModelFileConfig {
  graph: string;
  template?: string;
}

// Configuration
const MODEL_FILES: Record<string, ModelFileConfig> = {
  "076f9381-7b00-11e9-8d6b-80000b44d1d9": {
    graph: "Heritage Asset.json",
    template: '/templates/heritage-asset-public-hb.md'
  },
  "8d41e49e-a250-11e9-9eab-00224800b26d": {
    graph: "Consultation.json",
    template: '/templates/heritage-asset-public-hb.md'
  },
  "b9e0701e-5463-11e9-b5f5-000d3ab1e588": {
    graph: "Activity.json",
    template: '/templates/activity.md'
  },
  "49bac32e-5464-11e9-a6e2-000d3ab1e588": {
    graph: "Maritime Vessel.json",
    template: '/templates/maritime-vessel-public-hb.md'
  },
  "22477f01-1a44-11e9-b0a9-000d3ab1e588": {
    graph: "Person.json",
  },
  "3a6ce8b9-0357-4a72-b9a9-d8fdced04360": {
    graph: "Registry.json",
  }
};

export function initializeAlizarinConfig(): void {
  viewModels.CUSTOM_DATATYPES.set("tm65centrepoint", "non-localized-string");
}

interface AssetUrlParams {
  slug: string;
  publicView: boolean;
}

export function parseAssetUrlParams(): AssetUrlParams {
  const urlParams = new URLSearchParams(window.location.search);
  const slug = urlParams.get("slug");
  const fullParam = urlParams.get("full");

  if (!slug || slug !== slugify(slug)) {
    console.error("Bad slug");
  }
  console.log("params", params)
  return {
    slug: slug || '',
    publicView: fullParam ? fullParam === "false" : params.default_show_full_asset ? params.default_show_full_asset === "false" : true
  };
}

export async function initializeAlizarin(): Promise<typeof graphManager> {
  await wasmReady;

  const archesClient = new client.ArchesClientRemoteStatic('', {
    allGraphFile: () => "definitions/graphs/_all.json",
    graphToGraphFile: (graph: staticTypes.StaticGraphMeta) =>
      `definitions/graphs/resource_models/${graph.name.toString()}.json`,
    resourceIdToFile: (resourceId: string) =>
      `definitions/business_data/${resourceId}.json`,
    collectionIdToFile: (collectionId: string) =>
      `definitions/reference_data/collections/${collectionId}.json`
  });

  graphManager.archesClient = archesClient;
  staticStore.archesClient = archesClient;
  RDM.archesClient = archesClient;

  await graphManager.initialize({ graphs: null, defaultAllowAllNodegroups: true });
  return graphManager;
}

export async function loadAsset(slug: string, gm: typeof graphManager): Promise<Asset> {
  const asset = await gm.getResource(slug, false);
  debug('Loaded asset from graph manager');
  const meta = await getAssetMetadata(asset);
  return { asset, meta };
}

export async function loadMaritimeAsset(slug: string, gm: typeof graphManager): Promise<Asset> {
  const MaritimeVessel = await gm.get("MaritimeVessel");
  const asset = await MaritimeVessel.find(slug, false);
  const meta = await getAssetMetadata(asset);
  return { asset, meta };
}

export async function fetchTemplate(asset: AlizarinModel<any>): Promise<Handlebars.TemplateDelegate | undefined> {
  const graphId = asset.__.wkrm.graphId;
  const config = MODEL_FILES[graphId];
  if (config?.template) {
    try {
      return getPrecompiledTemplate(config.template);
    } catch (e) {
      console.warn(`Precompiled template not found for ${config.template}, falling back to runtime compilation`);
      const response = await fetch(config.template);
      return Handlebars.compile(await response.text());
    }
  }
}

async function getAssetMetadata(asset: AlizarinModel<any>): Promise<AssetMetadata> {
  let location: [number, number] | null = null;
  let geometry: any = null;

  if (await asset.__has('location_data') && await asset.location_data) {
    const locationData = await asset.location_data;

    if (await locationData.geometry[0] && await locationData.geometry[0].geospatial_coordinates) {
      geometry = await (await asset.location_data.geometry[0].geospatial_coordinates).forJson();
      location = extractCentrePoint(geometry);
    }

    const lastGeometry = (await locationData.geometry).length - 1;
    if (await locationData.geometry[lastGeometry] && await locationData.geometry[lastGeometry].geospatial_coordinates) {
      geometry = await (await asset.location_data.geometry[lastGeometry].geospatial_coordinates).forJson();
    }
  }

  return {
    resourceinstanceid: `${await asset.id}`,
    geometry,
    location,
    title: await asset.$.getName()
  };
}

function extractCentrePoint(geometry: any): [number, number] | null {
  if (!geometry?.features?.[0]?.geometry?.coordinates) {
    return null;
  }

  const coordinates = geometry.features[0].geometry.coordinates;

  if (!Array.isArray(coordinates[0])) {
    return coordinates as [number, number];
  }

  let polygons = coordinates[0];
  if (Array.isArray(polygons[0]?.[0])) {
    polygons = polygons.flat();
  }

  const centre = polygons.reduce(
    (c: [number, number], p: [number, number]) => {
      c[0] += p[0] / polygons.length;
      c[1] += p[1] / polygons.length;
      return c;
    },
    [0, 0] as [number, number]
  );

  return centre;
}
