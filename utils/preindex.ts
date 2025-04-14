import * as path from 'path';
import * as fs from "fs";
import { Feature, FeatureCollection } from 'geojson';
import { serialize as fgbSerialize } from 'flatgeobuf/lib/mjs/geojson.js';

import { client, RDM, graphManager, staticStore, viewModels } from 'alizarin';

import { Asset } from './types.ts';
import { assetFunctions } from '../prebuild/functions.ts';

const PUBLIC_FOLDER = 'docs';

await assetFunctions.initialize();
const MODEL_FILES = assetFunctions.getModelFiles();


function initAlizarin(resourcesFiles: string[] | null) {
    const archesClient = new client.ArchesClientLocal({
        allGraphFile: (() => "prebuild/graphs.json"),
        graphIdToGraphFile: ((graphId: string) => MODEL_FILES[graphId] && `prebuild/resource_models/${MODEL_FILES[graphId].graph}`),
        graphIdToResourcesFiles: ((graphId: string) => {
          if (resourcesFiles === null) {
            return Object.values(MODEL_FILES[graphId].resources).map((resourceFile: string) => `prebuild/business_data/${resourceFile}`);
          }
          return resourcesFiles;
        }),
        // resourceIdToFile: ((resourceId: string) => `public/resources/${resourceId}.json`),
        // RMV TODO: move collections and graphs to static
        collectionIdToFile: ((collectionId: string) => `prebuild/reference_data/${collectionId}.json`)
    });
    archesClient.fs = fs.promises;
    graphManager.archesClient = archesClient;
    staticStore.archesClient = archesClient;
    RDM.archesClient = archesClient;
    return graphManager;
}

async function processAsset(assetPromise: Promise<viewModels.ResourceInstanceViewModel>): Promise<Asset> {
  const asset = await assetPromise;
  const staticAsset = await asset.forJson(true)
  const meta = await assetFunctions.getMeta(staticAsset);
  const replacer = function (_: string, value: any) {
    if(value instanceof Map) {
      const result = Object.fromEntries(value);
        return result
    }
    return value;
  }

  const serial = JSON.stringify(asset._.resource, replacer, 2)
  await fs.promises.writeFile(
      `${PUBLIC_FOLDER}/definitions/business_data/${meta.slug}.json`,
      serial
  );

  return meta;
}

function extractFeatures(geoJsonString: string): Feature[] {
  const geoJson = JSON.parse(geoJsonString);
  if (geoJson["type"] === "FeatureCollection") {
    return geoJson["features"];
  }
  const feature: Feature = {
    type: geoJson["type"],
    geometry: geoJson["geometry"],
    properties: geoJson["properties"],
  };
  if (!feature.geometry) {
    return [];
  }
  return [feature];
}

async function buildPreindex(graphManager: any, resourceFile: string | null) {
    await graphManager.initialize();
    const HeritageAsset = graphManager.get("HeritageAsset");
    console.log("loading for preindex", resourceFile);
    const assets = await assetFunctions.getAll(graphManager);
    console.log("loaded");
    let n = 25;
    const batches = assets.length / n;
    const geoJson: FeatureCollection = {
      "type": "FeatureCollection",
      "features": []
    };
    const assetMetadata = [];
    for (let b = 0 ; b < batches ; b++) {
      if (b % 5 == 0) {
        console.log(b, ": completed", b * n, "records,", Math.floor(b * n * 100 / assets.length), "%");
      }

      let assetBatch = (await Promise.all(assets.slice(b * n, (b + 1) * n).map(processAsset))).filter(asset => asset);
      assetBatch.map(asset => asset.meta && asset.meta.geometry ? geoJson.features.push(...extractFeatures(asset.meta.geometry)) : null);
      assetMetadata.push(...assetBatch);
    }

    let preindexFile: string;
    let fgbFile: string;
    if (resourceFile) {
      preindexFile = `prebuild/preindex/${path.basename(resourceFile)}.pi`;
      fgbFile = `${PUBLIC_FOLDER}/fgb/${path.basename(resourceFile, '.json')}.fgb`;
    } else {
      preindexFile = `prebuild/preindex/ix.pi`;
      fgbFile = `prebuild/preindex/ix.fgb`;
    }

    return Promise.all([
      fs.promises.writeFile(preindexFile, JSON.stringify(assetMetadata, null, 2)),
      fs.promises.writeFile(fgbFile, fgbSerialize(geoJson)),
    ]);
}

const resourceFile: string | undefined = process.argv[2];
if (resourceFile) {
  if (!resourceFile.endsWith('.json')) {
    console.error(`Tried to run with a non .json file: ${resourceFile}`);
    process.exit(1);
  }
  console.log("Pre-indexing", resourceFile);
}
const gm = await initAlizarin(resourceFile ? [resourceFile] : null);
await buildPreindex(gm, resourceFile || null);
