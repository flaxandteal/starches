import * as fs from "fs";
import * as toml from "toml";
import * as pagefind from "pagefind";
import Flatbush from "flatbush";
import { default as matter } from "gray-matter";
import { Marked } from 'marked'
import markedPlaintify from 'marked-plaintify'
import Handlebars from 'handlebars'
import AsyncHandlebars from 'handlebars-async-helpers-ts/index.js'

import { client, RDM, graphManager, staticStore, staticTypes, utils, viewModels } from 'alizarin';

const hb = AsyncHandlebars(Handlebars);
hb.registerHelper("replace", async (base, fm, to) => (await base).replace(fm, to));
hb.registerHelper("await", async (val) => await val);
hb.registerHelper("default", function (a, b) {return a === undefined || a === null ? b : a;});

const PUBLIC_FOLDER = 'docs';
const MODEL_FILES = {
    "076f9381-7b00-11e9-8d6b-80000b44d1d9": {
        graph: "Heritage Asset.json",
        resources: ["Heritage_Asset.json", "Buildings.json"]
    }
};

function initAlizarin() {
    const archesClient = new client.ArchesClientLocal({
        allGraphFile: (() => "static/definitions/resource_models/_all.json"),
        graphIdToGraphFile: ((graphId) => `static/definitions/resource_models/${MODEL_FILES[graphId].graph}`),
        graphIdToResourcesFiles: ((graphId) => MODEL_FILES[graphId].resources.map(resourceFile => `prebuild/business_data/${resourceFile}`)),
        // resourceIdToFile: ((resourceId: string) => `public/resources/${resourceId}.json`),
        collectionIdToFile: ((collectionId) => `static/definitions/collections/${collectionId}.json`)
    });
    archesClient.fs = fs.promises;
    graphManager.archesClient = archesClient;
    staticStore.archesClient = archesClient;
    RDM.archesClient = archesClient;
    return graphManager;
}

async function buildPagefind(graphManager) {
    await graphManager.initialize();
    const HeritageAsset = graphManager.get("HeritageAsset");
    console.log("loading");
    const assets = await HeritageAsset.all({lazy: true});
    console.log("loaded");
    const { index } = await pagefind.createIndex();
    await index.addDirectory({
        path: "docs"
    });
    const designationSymbols = {
        "Listed Building": "🏠",
        "Scheduled Monument": "🪦",
    };
    const counter = {};
    const md = await fs.promises.readFile(`static/templates/heritage-asset-hb.md`, { encoding: "utf8" });
    var template = hb.compile(md);
    let n = 100;
    const batches = assets.length / n;
    const assetMetadata = [];
    let assetBatch;
    function replacer(key, value) {
      if(value instanceof Map) {
        const result = Object.fromEntries(value);
          return result
      }
      return value;
    }

    await fs.promises.mkdir(`${PUBLIC_FOLDER}/definitions/business_data`, {recursive: true});
    for (let b = 0 ; b < batches ; b++) {
      if (b % 5 == 0) {
        console.log(b, "%");
      }
      assetBatch = (await Promise.all(assets.slice(b * n, (b + 1) * n).map(async asset => {
  for (let description of [...await asset.descriptions]) {
    console.log((await description).__parentPseudo.tile.data);
  }
        const geometry = await (await asset.location_data.geometry.geospatial_coordinates).forJson();
        let location = geometry;
        if (location) {
          const polygon = location["features"][0]["geometry"]["coordinates"];
          if (Array.isArray(polygon[0])) {
            const centre = polygon.reduce((c, p) => {
              c[0] += p[0] / polygon.length;
              c[1] += p[1] / polygon.length;
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
        if (location) {
          location = location["features"][0]["geometry"]["coordinates"];
        } else {
          location = null;
        }
        const meta = {
          resourceinstanceid: `${await asset.id}`,
          geometry: JSON.stringify(geometry),
          location: JSON.stringify(location),
          title: await (await asset.monument_names[0].monument_name).forJson()
        };
        let designations = await Promise.all((await asset.designation_and_protection_assignment).map(async d => await d.designation_or_protection_type));
        designations = designations.map(x => designationSymbols[x.toString()]).filter(x => x);
        const id = meta.resourceinstanceid;
        meta.title = `${meta.title} ${designations.join("")}`;
        const language = meta.language ?? "en";

        let slug = meta.title.replaceAll(/[^A-Za-z0-9_]/g, "").slice(0, 20);
        slug = `${slug}_${asset.id.slice(0, 6)}`;
        let slug_n;
        if (slug in counter) {
          slug_n = counter[slug] + 1;
          slug = `${slug}_${slug_n}`;
        } else {
          slug_n = 1;
        }
        counter[slug] = slug_n;
        meta.slug = slug;

        const md = await template({ title: meta.title, ha: asset }, {
          allowProtoPropertiesByDefault: true,
          allowProtoMethodsByDefault: true,
        });
        const plaintext = new Marked({ gfm: true })
          .use(markedPlaintify())
          .parse(md);
        const result = await index.addCustomRecord({
            url: `/test?slug=${slug}`,
            // Only taking a bit of the plaintext for now... RMV
            content: plaintext.substring(0, 300),
            language: language,
            filters: {
                tags: ["historicasset"]
            },
            meta: meta
        });

        const serial = JSON.stringify(asset._.resource, replacer)
        await fs.promises.writeFile(
            `${PUBLIC_FOLDER}/definitions/business_data/${slug}.json`,
            serial
        );

        return meta;
      }))).filter(asset => asset);
      assetMetadata.push(...assetBatch);
    }
    // const assets = (await Promise.all(files.map(async file => {
    //     if (file.endsWith(".md")) {
    //         const text = await fs.promises.readFile(`${prebuild}/${file}`, { encoding: "utf8" });
    //         const data = matter(text, { delims: '+++', language: 'toml', engines: { toml: toml.parse.bind(toml) } });
    //         const meta = ["resourceinstanceid", "geometry", "location", "title"].reduce((agg, field) => {
    //             const value = data.data[field];
    //             if (value) {
    //                 agg[field] = decodeURIComponent(value)
    //             }
    //             return agg;
    //         }, {});
    //         const designations = data.data.designations ? data.data.designations.map(x => designationSymbols[x]).filter(x => x) : [];
    //         const id = data.data.resourceinstanceid;
    //         const filename = file;
    //         meta.title = `${meta.title} ${designations.join("")}`;
    //         const language = data.data.language ?? "en";
    //         const slug = file.replace(".md", "");
    //         const plaintext = new Marked({ gfm: true })
    //           .use(markedPlaintify())
    //           .parse(data.content);
    //         const result = await index.addCustomRecord({
    //             url: `/test?slug=${slug}`,
    //             // Only taking a bit of the plaintext for now... RMV
    //             content: plaintext.substring(0, 300),
    //             language: language,
    //             filters: {
    //                 tags: ["historicasset"]
    //             },
    //             meta: meta
    //         });
    //         return data;
    //     }
    // }))).filter(asset => asset);
    console.log(`Indexed ${assetMetadata.length} assets in pagefind`);

    await index.writeFiles({
        outputPath: "docs/pagefind"
    });

    return { index, assetMetadata };
}

async function getLocations(index, assetMetadata) {
    const catalogue = await index.getIndexCatalogue();
    const hashes = catalogue.entries.reduce((agg, [hash, entry]) => {
        const resourceinstanceid = JSON.parse(entry).meta.resourceinstanceid;
        if (resourceinstanceid) {
            agg[resourceinstanceid] = hash;
        }
        return agg
    }, {});
    return (await Promise.all(assetMetadata.map(async asset => {
        if (asset.location) {
            try {
                const loc = JSON.parse(asset.location);
                const hash = hashes[asset.resourceinstanceid];
                if (Array.isArray(loc)) {
                    return {
                        loc: loc,
                        hash: hash
                    };
                }
            } catch {
                // Ignore badly formed locations
            }
        }
    }))).filter(asset => asset);
};

function buildFlatbush(locations) {
    const flatbushIndex = new Flatbush(locations.length);
    locations.forEach(loc => {
        flatbushIndex.add(loc.loc[0], loc.loc[1], loc.loc[0], loc.loc[1])
    });
    flatbushIndex.finish();

    console.log(`Indexed ${locations.length} assets in flatbush`);

    fs.writeFileSync(
        "docs/flatbush.bin",
        Buffer.from(flatbushIndex.data)
    );
    fs.writeFileSync(
        "docs/flatbush.json",
        JSON.stringify(locations.map(loc => loc.hash))
    );
}

const gm = await initAlizarin();
const { index, assetMetadata } = await buildPagefind(gm);
const locations = await getLocations(index, assetMetadata);
buildFlatbush(locations);
