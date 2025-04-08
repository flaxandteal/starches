import * as fs from "fs";
import * as pagefind from "pagefind";
import Flatbush from "flatbush";
import { Marked } from 'marked'
import markedPlaintify from 'marked-plaintify'
import Handlebars from 'handlebars'

import { client, RDM, graphManager, staticStore, staticTypes, viewModels } from 'alizarin';

Handlebars.registerHelper("replace", (base, fm, to) => base ? base.replace(fm, to) : "");
Handlebars.registerHelper("await", (val) => val);
Handlebars.registerHelper("default", function (a, b) {return a === undefined || a === null ? b : a;});

const PUBLIC_FOLDER = 'docs';
const DEFAULT_LANGUAGE = 'en';

class ModelEntry {
  graph: string
  resources: Array<string>

  constructor(graph: string, resources: Array<string>) {
    this.graph = graph;
    this.resources = resources;
  }
}

const MODEL_FILES: {[key: string]: ModelEntry} = {
    "076f9381-7b00-11e9-8d6b-80000b44d1d9": new ModelEntry(
        "Heritage Asset.json",
        ["Heritage_Asset.json", "Buildings.json"]
    )
}


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
  }
};

function initAlizarin() {
    const archesClient = new client.ArchesClientLocal({
        allGraphFile: (() => "static/definitions/resource_models/_all.json"),
        graphIdToGraphFile: ((graphId: string) => `static/definitions/resource_models/${MODEL_FILES[graphId].graph}`),
        graphIdToResourcesFiles: ((graphId: string) => MODEL_FILES[graphId].resources.map((resourceFile: string) => `prebuild/business_data/${resourceFile}`)),
        // resourceIdToFile: ((resourceId: string) => `public/resources/${resourceId}.json`),
        collectionIdToFile: ((collectionId: string) => `static/definitions/collections/${collectionId}.json`)
    });
    archesClient.fs = fs.promises;
    graphManager.archesClient = archesClient;
    staticStore.archesClient = archesClient;
    RDM.archesClient = archesClient;
    return graphManager;
}

const counter: {[key: string]: number} = {};
function toSlug(id: string, title: string): string {
  let slug = title.replaceAll(/[^A-Za-z0-9_]/g, "").slice(0, 20);
  slug = `${slug}_${id.slice(0, 6)}`;
  let slug_n;
  if (slug in counter) {
    slug_n = counter[slug] + 1;
    slug = `${slug}_${slug_n}`;
  } else {
    slug_n = 1;
  }
  counter[slug] = slug_n;
  return slug;
}

async function buildPagefind(graphManager: any) {
    await graphManager.initialize();
    const HeritageAsset = graphManager.get("HeritageAsset");
    console.log("loading");
    const assets = await HeritageAsset.all({lazy: true});
    console.log("loaded");
    const { index } = await pagefind.createIndex();
    if (!index) {
      throw Error("Could not create pagefind index");
    }
    await index.addDirectory({
        path: "docs"
    });
    const designationSymbols: {[key: string]: string} = {
        "Listed Building": "🏠",
        "Scheduled Monument": "🪦",
    };
    const md = await fs.promises.readFile(`static/templates/heritage-asset-index-hb.md`, { encoding: "utf8" });
    var template = Handlebars.compile(md);
    let n = 25;
    const batches = assets.length / n;
    const assetMetadata = [];
    let assetBatch;
    function replacer(_: string, value: any) {
      if(value instanceof Map) {
        const result = Object.fromEntries(value);
          return result
      }
      return value;
    }

    await fs.promises.rm(`${PUBLIC_FOLDER}/definitions/business_data`, { recursive: true, force: true });
    await fs.promises.mkdir(`${PUBLIC_FOLDER}/definitions/business_data`, {recursive: true});
    for (let b = 0 ; b < batches ; b++) {
      if (b % 5 == 0) {
        console.log(b, ": completed", b * n, "records,", Math.floor(b * n * 100 / assets.length), "%");
      }
      assetBatch = (await Promise.all(assets.slice(b * n, (b + 1) * n).map(async (asset: viewModels.ResourceInstanceViewModel) => {
        const staticAsset = await asset.forJson(true)
        const geometry = staticAsset.root.location_data.geometry.geospatial_coordinates;
        let location = geometry;
        if (location && location["features"]) {
          const polygon = location["features"][0]["geometry"]["coordinates"];
          if (Array.isArray(polygon[0])) {
            let polygons = polygon[0];
            if ((Array.isArray(polygons[0][0]))) {
              polygons = polygons.flat();
            }
            const centre = polygons.reduce((c: Array<number>, p: Array<number>) => {
              c[0] += p[0] / polygons.length;
              c[1] += p[1] / polygons.length;
              return c;
            }, [0, 0]);
            location = {
                "features": [{
                    "geometry": {
                        "type": "Point",
                        "coordinates": centre
                    }
                }]
            }
          }
        }
        if (location && location["features"]) {
          location = location["features"][0]["geometry"]["coordinates"];
        } else {
          location = null;
        }
        let title = staticAsset.root.monument_names[0].monument_name;
        let designations = staticAsset.root.designation_and_protection_assignment.map((d: {[key: string]: any}) => d.designation_or_protection_type).filter((d: string) => d);
        designations = designations.map((x: string) => designationSymbols[x.toString()]).filter((x: string) => x);
        title = `${title} ${designations.join("")}`;
        const language = DEFAULT_LANGUAGE ?? "en";

        let slug = toSlug(asset.id, title);
        const meta = new AssetMetadata(
          staticAsset.id,
          geometry,
          location,
          title,
          slug
        );

        const md = await template({ title: meta.title, ha: staticAsset.root }, {
          allowProtoPropertiesByDefault: true,
          allowProtoMethodsByDefault: true,
        });
        const plaintext = await new Marked({ gfm: true })
          .use(markedPlaintify())
          .parse(md);
        await index.addCustomRecord({
            url: `/test?slug=${slug}`,
            // Only taking a bit of the plaintext for now... RMV
            content: plaintext.substring(0, 300),
            language: language,
            filters: {
                tags: ["historicasset"]
            },
            meta: meta
        });

        const serial = JSON.stringify(asset._.resource, replacer, 2)
        await fs.promises.writeFile(
            `${PUBLIC_FOLDER}/definitions/business_data/${slug}.json`,
            serial
        );

        return meta;
      }))).filter(asset => asset);
      assetMetadata.push(...assetBatch);
    }
    console.log(`Indexed ${assetMetadata.length} assets in pagefind`);

    await fs.promises.rm(`${PUBLIC_FOLDER}/pagefind`, { recursive: true, force: true });
    await index.writeFiles({
        outputPath: `${PUBLIC_FOLDER}/pagefind`
    });

    return { index, assetMetadata };
}

class IndexEntry {
  loc: Array<number>
  hash: string

  constructor(loc: Array<number>, hash: string) {
    this.loc = loc;
    this.hash = hash;
  }
};

async function getLocations(index: pagefind.PagefindIndex, assetMetadata: AssetMetadata[]): Promise<IndexEntry[]> {
  // @ts-expect-error getIndexCatalogue is a local variable
    const catalogue = await index.getIndexCatalogue();
    const hashes = catalogue.entries.reduce((agg: {[key: string]: string}, [hash, entry]: [string, string]) => {
        const resourceinstanceid = JSON.parse(entry).meta.resourceinstanceid;
        if (resourceinstanceid) {
            agg[resourceinstanceid] = hash;
        }
        return agg
    }, {});
    return (await Promise.all(assetMetadata.map(async (asset: viewModels.ResourceInstanceViewModel) => {
        if (asset.location) {
            try {
                const loc = JSON.parse(asset.location);
                const hash = hashes[asset.resourceinstanceid];
                if (Array.isArray(loc)) {
                    return new IndexEntry(
                        loc,
                        hash
                    );
                }
            } catch {
                // Ignore badly formed locations
            }
        }
    }))).filter(asset => asset !== undefined);
};

function buildFlatbush(locations: IndexEntry[]) {
    const flatbushIndex = new Flatbush(locations.length);
    locations.forEach((loc: IndexEntry) => {
        flatbushIndex.add(loc.loc[0], loc.loc[1], loc.loc[0], loc.loc[1])
    });
    flatbushIndex.finish();

    console.log(`Indexed ${locations.length} assets in flatbush`);

    fs.rmSync(`${PUBLIC_FOLDER}/flatbush.bin`);
    fs.rmSync(`${PUBLIC_FOLDER}/flatbush.json`);
    fs.writeFileSync(
        `${PUBLIC_FOLDER}/flatbush.bin`,
        Buffer.from(flatbushIndex.data)
    );
    fs.writeFileSync(
        `${PUBLIC_FOLDER}/flatbush.json`,
        JSON.stringify(locations.map((loc: IndexEntry) => loc.hash))
    );
}

const gm = await initAlizarin();
const { index, assetMetadata }: { index: pagefind.PagefindIndex, assetMetadata: AssetMetadata[] } = await buildPagefind(gm);
const locations = await getLocations(index, assetMetadata);
buildFlatbush(locations);
