import * as path from 'path';
import * as fs from "fs";
import { type Feature, type FeatureCollection, type Point } from 'geojson';
import { serialize as fgbSerialize } from 'flatgeobuf/lib/mjs/geojson.js';

import { staticTypes, interfaces, client, RDM, graphManager, staticStore, viewModels } from 'alizarin';

import { Asset } from './types.ts';
import { NON_PUBLIC, slugify } from './utils.ts';
import { assetFunctions } from '../prebuild/functions.ts';

const PUBLIC_FOLDER = 'docs';

await assetFunctions.initialize();
const MODEL_FILES = assetFunctions.getModelFiles();
viewModels.CUSTOM_DATATYPES.set("tm65centrepoint", "non-localized-string");

function initAlizarin(resourcesFiles: string[] | null) {
    const archesClient = new client.ArchesClientLocal({
        allGraphFile: (() => "prebuild/graphs.json"),
        graphIdToGraphFile: ((graphId: string) => MODEL_FILES[graphId] && `prebuild/graphs/resource_models/${MODEL_FILES[graphId].graph}`),
        graphToGraphFile: ((graph: staticTypes.StaticGraphMeta) => graph.name && `prebuild/graphs/resource_models/${graph.name}.json`),
        graphIdToResourcesFiles: ((graphId: string) => {
          // If this is not a heritage, or we have been given no specific files, get the whole resource model.
          let files: string[] = [];
          if ((graphId !== '076f9381-7b00-11e9-8d6b-80000b44d1d9' && graphId !== '49bac32e-5464-11e9-a6e2-000d3ab1e588') || resourcesFiles === null) {
            files = [...files, ...Object.values(MODEL_FILES[graphId].resources).map((resourceFile: string) => `prebuild/business_data/${resourceFile}`)];
          }
          if (resourcesFiles !== null) {
            files = [...files, ...resourcesFiles];
          }
          return files;
        }),
        // resourceIdToFile: ((resourceId: string) => `public/resources/${resourceId}.json`),
        // RMV TODO: move collections and graphs to static
        collectionIdToFile: ((collectionId: string) => `prebuild/reference_data/collections/${collectionId}.json`)
    });
    archesClient.fs = fs;
    graphManager.archesClient = archesClient;
    staticStore.archesClient = archesClient;
    staticStore.cacheMetadataOnly = false;
    RDM.archesClient = archesClient;
    return graphManager;
}

let warned = false;
async function processAsset(assetPromise: Promise<viewModels.ResourceInstanceViewModel>, resourcePrefix: string | undefined): Promise<Asset | null> {
  const asset = await assetPromise;
  if (asset.__.wkrm.modelClassName !== "HeritageAsset") {
    if (!warned) {
      console.warn("No soft deletion, assuming all present", asset.__.wkrm.modelClassName)
    }
    warned = true;
  } else if (await asset.soft_deleted) {
    return null;
  }
  // TODO: there is an issue where if the awaits do not happen in sequence, the same tile will appear multiple times in a pseudo-list
  // const names = [
  //   [await asset.monument_names[0].monument_name, (await asset.monument_names[0]).__parentPseudo.tile.sortorder],
  //   [await asset.monument_names[1].monument_name, (await asset.monument_names[1]).__parentPseudo.tile.sortorder],
  // ].sort((a, b) => b[1] - a[1]).map(a => a[0]);
  const staticAsset = await asset.forJson(true);
  const meta = await assetFunctions.getMeta(asset, staticAsset.root, resourcePrefix, NON_PUBLIC);
  const replacer = function (_: string, value: any) {
    if(value instanceof Map) {
      const result = Object.fromEntries(value);
        return result
    }
    return value;
  }

  await fs.promises.mkdir(`${PUBLIC_FOLDER}/definitions/business_data`, {"recursive": true});
  const resource = asset.$.resource;
  const cache = await asset.$.getValueCache(true, async (value: interfaces.IViewModel) => {
    if (value instanceof viewModels.ResourceInstanceViewModel) {
      const meta = await assetFunctions.getMeta(await value, await value, undefined, NON_PUBLIC);
      return {
        title: meta.meta.title,
        slug: meta.meta.slug,
        location: meta.meta.location,
        type: meta.type,
      };
    }
  });
  if (cache && Object.values(cache).length > 0) {
    resource.__cache = cache;
  }
  resource.__scopes = JSON.parse(meta.meta.scopes);
  resource.metadata = meta.meta;
  const serial = JSON.stringify(resource, replacer, 2)
  await fs.promises.writeFile(
      `${PUBLIC_FOLDER}/definitions/business_data/${meta.slug}.json`,
      serial
  );

  return meta;
}

function extractFeatures(geoJsonString: string): Feature[] {
  const geoJson = JSON.parse(geoJsonString);
  if (geoJson["type"] === "FeatureCollection") {
    const features = geoJson["features"].filter(feat => feat);
    return features;
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

async function buildPreindex(graphManager: any, resourceFile: string | null, resourcePrefix: string | undefined) {
    await graphManager.initialize();
    const Registry = await graphManager.get("Registry");
    await Registry.all();
    const Person = await graphManager.get("Person");
    await Person.all();
    console.log("loading for preindex", resourceFile);
    if (NON_PUBLIC) {
      console.warn("Building for NON-PUBLIC assets");
    }
    const assets = await assetFunctions.getAllFrom(graphManager, resourceFile, NON_PUBLIC);
    console.log("loaded", assets.length);
    let n = 25;
    const batches = assets.length / n;
    const assetMetadata = [];
    const assocMetadata = [];
    const registries: {[key: string]: [number, number][]} = {};
    for (let b = 0 ; b < batches ; b++) {
      if (b % 5 == 0) {
        console.log(b, ": completed", b * n, "records,", Math.floor(b * n * 100 / assets.length), "%");
      }

      let assetBatch: Asset[] = (await Promise.all(assets.slice(b * n, (b + 1) * n).map(asset => processAsset(asset, resourcePrefix)))).filter(asset => asset !== null);

      function addFeatures(asset: Asset) {
        try {
          JSON.parse(asset.meta.registries).forEach((reg: string) => {
            if (asset.meta.location) {
              if (!registries[reg]) {
                registries[reg] = [];
              }
              registries[reg].push(JSON.parse(asset.meta.location));
            }
          });
        } catch (e) {
            throw e;
        }
      }
      assetBatch.map((asset: Asset) => asset.meta && asset.meta.geometry ? addFeatures(asset) : null)
      assocMetadata.push(...assetBatch.filter(asset => !assetFunctions.shouldIndex(asset, NON_PUBLIC)));
      assetBatch = assetBatch.filter(asset => assetFunctions.shouldIndex(asset, NON_PUBLIC));
      assetMetadata.push(...assetBatch);
    }

    let preindexFile: string;
    let fgbFile: string;
    let assocFile: string;
    // let fgbFile: string;
    await fs.promises.mkdir('prebuild/fgb', {"recursive": true});
    await fs.promises.mkdir('prebuild/preindex', {"recursive": true});
    if (resourceFile) {
      preindexFile = `prebuild/preindex/${path.basename(resourceFile)}.pi`;
      assocFile = `prebuild/preindex/${path.basename(resourceFile)}.pi.assoc`;
      fgbFile = `prebuild/fgb/REGISTER---${path.basename(resourceFile, '.json')}.json`;
    } else {
      preindexFile = `prebuild/preindex/ix.pi`;
      assocFile = `prebuild/preindex/ix.pi.assoc`;
      fgbFile = `prebuild/preindex/REGISTER---ix.json`;
    }

    const promises = [];
    if (assetMetadata.length) {
      promises.push(
        fs.promises.writeFile(preindexFile, JSON.stringify(assetMetadata, null, 2)),
      );
      for (const [registry, points] of Object.entries(registries)) {
        if (points.length > 0) {
          promises.push(fs.promises.writeFile(
            fgbFile.replace('REGISTER', slugify(registry)), JSON.stringify(points)
          ));
        }
      }
    }
    if (assocMetadata.length) {
      promises.push(
        fs.promises.writeFile(assocFile, JSON.stringify(assocMetadata, null, 2)),
      );
    }
    return Promise.all(promises);
}

async function buildOnePreindex(resourceFile: string, additionalFiles: string[], resourcePrefix: string) {
  let resourceFiles = [];
  if (resourceFile.indexOf('%') !== -1) {
    let i = 0;
    let filename;
    let complete = false;
    while (!complete) {
      filename = resourceFile.replace('%', `${i}`);
      try {
        await fs.promises.access(filename)
        resourceFiles.push(filename);
      } catch {
        complete = true;
      }
      i += 1;
    }
  } else {
    resourceFiles = [resourceFile];
  }
  resourceFiles = [...resourceFiles, ...additionalFiles];
  console.log("Resource files:", resourceFiles);
  const gm = await initAlizarin(resourceFile ? resourceFiles : null);
  await buildPreindex(gm, resourceFile || null, resourcePrefix);
}

const resourceFile: string | undefined = process.argv[2];

if (resourceFile) {
  const resourcePrefix: string | undefined = process.argv[3];
  const additionalFiles: string[] = [];
  let next = false;
  for (const arg of process.argv) {
    if (next) {
      additionalFiles.push(arg);
      next = false;
    }
    if (arg === '-a') {
      next = true;
    }
  }
  if (!resourceFile.endsWith('.json')) {
    console.error(`Tried to run with a non .json file: ${resourceFile}`);
    process.exit(1);
  }
  console.log("Pre-indexing", resourceFile);
  await buildOnePreindex(resourceFile, additionalFiles, resourcePrefix);
} else {
  const prebuildList: any[] = JSON.parse((await fs.promises.readFile('prebuild/prebuild.json')).toString());
  for (const prebuildItem of prebuildList) {
    if (NON_PUBLIC || prebuildItem.public) {
      await buildOnePreindex(prebuildItem.resources, prebuildItem.supplementary || [], prebuildItem.slugPrefix);
    }
  }
}
