import * as fs from "fs";
import path from 'path';
import * as pagefind from "pagefind";
import Flatbush from "flatbush";
import Handlebars from 'handlebars'
import { WKRM, ResourceModelWrapper } from 'alizarin';

import { Asset } from './types.ts';
import { NON_PUBLIC, slugify } from './utils.ts';
import { assetFunctions } from '../prebuild/functions.ts';
import { type FeatureCollection, type Feature } from 'geojson';
import { serialize as fgbSerialize } from 'flatgeobuf/lib/mjs/geojson.js';
import { groupByCounty } from './counties.ts';

Handlebars.registerHelper("replace", (base, fm, to) => base ? base.replace(fm, to) : "");
Handlebars.registerHelper("await", (val) => val);
Handlebars.registerHelper("default", function (a, b) {return a === undefined || a === null ? b : a;});

const FOR_ARCHES = process.argv.includes('--for-arches');
const PUBLIC_FOLDER = FOR_ARCHES ? 'export' : 'docs';
const DEFAULT_LANGUAGE = 'en';
const CHUNK_SIZE_CHARS = 10000000;

const REGISTRIES: string[] = [];

let next = false;

const PUBLIC_MODELS = [
    "HeritageAsset",
    "MaritimeVessel",
    "Registry"
];

async function buildPagefind(files: string[] | null) {
    const { index } = await pagefind.createIndex();
    if (!index) {
      throw Error("Could not create pagefind index");
    }
    await index.addDirectory({
        path: "docs"
    });
    console.log("loading", files ? `${files.length} files` : 'all');
    const loadedFiles = files ? files : await fs.promises.readdir('prebuild/preindex').then(
      (files) => files.filter(f => f.endsWith('.pi')).map(f => `prebuild/preindex/${f}`)
    );
    const assetMetadata = (await Promise.all(
      loadedFiles.map(
        f => fs.promises.readFile(f)
      ).map(
        async f => JSON.parse((await f).toString())
      ))).flat();
    console.log("loaded", assetMetadata.length);

    const language = DEFAULT_LANGUAGE ?? "en";
    const registriesSet: Set<string> = new Set();
    for (let asset of assetMetadata) {
        if (NON_PUBLIC || PUBLIC_MODELS.includes(asset.type)) {
            const registries = asset.meta.registries ? JSON.parse(asset.meta.registries) : [];
            for (const registry of registries) {
                registriesSet.add(registry);
            }
            const designations = asset.meta.designations ? JSON.parse(asset.meta.designations) : [];
            const regcode = registriesToRegcode(registries);
            await index.addCustomRecord({
                url: `/asset/?slug=${asset.meta.slug}`,
                // Only taking a bit of the plaintext for now... RMV
                content: asset.content,
                language: language,
                regcode: regcode,
                filters: {
                    tags: registries,
                    designations: designations
                },
                meta: asset.meta
            });
        }
    }
    for (const registry of registriesSet) {
        const slug = slugify(registry);
        if (!REGISTRIES.includes(slug)) {
            REGISTRIES.push(slug);
        }
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
  regcode: number

  constructor(loc: Array<number>, hash: string, regcode: number) {
    this.loc = loc;
    this.hash = hash;
    this.regcode = regcode;
  }
};

function registriesToRegcode(registries: string[]) {
    return registries.map((r: string) => REGISTRIES.indexOf(slugify(r))).reduce((acc: number, n: number) => {
        if (n >= 0) {
            acc += 2**n;
        }
        return acc;
    }, 0);
}
async function getLocations(index: pagefind.PagefindIndex, assetMetadata: Asset[]): Promise<[IndexEntry, Feature][]> {
    const catalogue = await index.getIndexCatalogue();
    const hashes = catalogue.entries.reduce((agg: {[key: string]: string}, [hash, entry]: [string, string]) => {
        const slug = JSON.parse(entry).meta.slug;
        if (slug) {
            agg[slug] = hash;
        }
        return agg
    }, {});
    return (await Promise.all(assetMetadata.map(async (asset: Asset) => {
        if (asset.meta.location && (NON_PUBLIC || PUBLIC_MODELS.includes(asset.type))) {
            {
                const loc = JSON.parse(asset.meta.location);
                const registries = asset.meta.registries ? JSON.parse(asset.meta.registries) : [];
                console.log('registries', registries);
                const designations = asset.meta.designations ? JSON.parse(asset.meta.designations) : [];
                const regcode = registriesToRegcode(registries);
                const language = DEFAULT_LANGUAGE ?? "en";
                const hash = hashes[asset.meta.slug];
                if (Array.isArray(loc)) {
                    return [
                        new IndexEntry(
                            loc,
                            hash,
                            regcode
                        ),
                        {
                            id: hash,
                            type: 'Feature',
                            properties: {
                                url: `/asset/?slug=${asset.meta.slug}`,
                                // Only taking a bit of the plaintext for now... RMV
                                content: asset.content,
                                language: language,
                                regcode: regcode,
                                filters: {
                                    tags: registries,
                                    designations: designations
                                },
                                meta: asset.meta
                            },
                            geometry: {
                                type: 'Point',
                                coordinates: loc
                            }
                        }
                    ];
                }
            } 
                // Ignore badly formed locations
        }
    }))).filter(asset => asset !== undefined);
};

function buildFlatbush(locpairs: [IndexEntry, Feature][]) {
    const locations = locpairs.map((locpair: [IndexEntry, Feature]) => locpair[0]);
    const features = locpairs.map((locpair: [IndexEntry, Feature]) => locpair[1]);
    console.log(features);
    const geoJsonAll: FeatureCollection = {
      "type": "FeatureCollection",
      "features": features
    };
    fs.writeFileSync(
        `${PUBLIC_FOLDER}/fgb/nihed-assets-wo-index.fgb`,
        fgbSerialize(geoJsonAll)
    );

    const flatbushIndex = new Flatbush(locations.length);
    locations.forEach((loc: IndexEntry) => {
        flatbushIndex.add(loc.loc[0], loc.loc[1], loc.loc[0], loc.loc[1])
    });
    flatbushIndex.finish();
    // Slow - move to preindex, or to ingestion.
    // const byCounty = groupByCounty(locations.map(loc => loc.loc));

    console.log(`Indexed ${locations.length} assets in flatbush`);

    fs.rmSync(`${PUBLIC_FOLDER}/flatbush.bin`, {force: true});
    fs.rmSync(`${PUBLIC_FOLDER}/flatbush.json`, {force: true});
    fs.rmSync(`${PUBLIC_FOLDER}/flatbushByCounty.json`, {force: true});
    fs.writeFileSync(
        `${PUBLIC_FOLDER}/flatbush.bin`,
        Buffer.from(flatbushIndex.data)
    );
    fs.writeFileSync(
        `${PUBLIC_FOLDER}/flatbush.json`,
        JSON.stringify(locations.map((loc: IndexEntry) => [loc.hash, loc.regcode]))
    );
    // fs.writeFileSync(
    //     `${PUBLIC_FOLDER}/flatbushByCounty.json`,
    //     JSON.stringify(byCounty)
    // );
}

async function reindex(files: string[] | null) {
    const { index, assetMetadata }: { index: pagefind.PagefindIndex, assetMetadata: Asset[] } = await buildPagefind(files);
    const locations = await getLocations(index, assetMetadata);

    const destination = `${PUBLIC_FOLDER}/definitions`;
    const all = {"models": {}};
    const dir: [string, string][] = [
        ['models', 'prebuild/graphs/resource_models'],
    ];
    if (FOR_ARCHES) {
        dir.push(['branches', 'prebuild/graphs/branches']);
    }
    const graphs = [];
    for (const [type, location] of dir) {
        for (const filename of (await fs.promises.readdir(location))) {
            if (!filename.endsWith('json') || filename.startsWith('_')) {
                continue;
            }
            const filePath = `${location}/${filename}`;
            const file = await fs.promises.readFile(filePath);
            const graph = JSON.parse(file.toString())["graph"][0];

            graphs.push({
                type: type,
                filepath: filePath,
                graph: graph,
                location: location
            });
        }
        const target =`${destination}/graphs/${path.basename(location)}`;
        await fs.promises.rm(target, {recursive: true, force: true});
        await fs.promises.mkdir(target, {"recursive": true});
    }

    await assetFunctions.initialize();

    const models = [];
    const branches: Set<string> = new Set();
    const branchesFound: Set<string> = new Set();

    for (const {type, filepath, graph, location} of graphs) {
        const target =`${destination}/graphs/${path.basename(location)}`;
        const filename = path.basename(filepath);
        const wkrm = new WKRM(graph);
        const rmw = new ResourceModelWrapper(wkrm, graph, null);
        if (!NON_PUBLIC) {
            switch (type.toString()) {
                case 'models':
                    if (!PUBLIC_MODELS.includes(wkrm.modelClassName)) {
                        continue;
                    }
                    break;
                case 'branches':
                    const publicationId = graph.publication.publicationid;
                    if (!publicationId) {
                        console.warn("Branch", filename, "has no publication ID");
                    }
                    if (!branches.has(publicationId)) {
                        continue;
                    }
                    branchesFound.add(publicationId);
                    break;
                default:
                    throw Error(`Unknown graph type: ${type}`);
            }
        } else {
            console.warn("Building NON-PUBLIC reindex so including", type, wkrm.modelClassName);
        }
        const meta = {
            author: graph["author"],
            cards: graph["cards"].length,
            cards_x_nodes_x_widgets: graph["cards_x_nodes_x_widgets"].length,
            color: graph["color"],
            description: graph["description"],
            edges: graph["edges"].length,
            graphid: graph["graphid"],
            iconclass: graph["iconclass"],
            is_editable: graph["is_editable"],
            isresource: graph["isresource"],
            jsonldcontext: graph["jsonldcontext"],
            name: graph["name"],
            nodegroups: graph["nodegroups"].length,
            nodes: graph["nodes"].length,
            ontology_id: graph["ontology_id"],
            publication: graph["publication"],
            relatable_resource_model_ids: graph["relatable_resource_model_ids"],
            resource_2_resource_constraints: graph["resource_2_resource_constraints"],
            root: graph["root"],
            slug: graph["slug"],
            subtitle: graph["subtitle"],
            templateid: graph["templateid"],
            version: graph["version"]
        };
        // TODO: is branch filtering really helpful?
        if (NON_PUBLIC || type == "branches") {
            // This does not require node filtering.
            // Why does Alizarin not filter by default? Because Alizarin is primarily a front-end
            // library and so filtering out visible tiles from loaded data does not add security,
            // but makes issues invisible.
        } else {
            const ngs = assetFunctions.getPermittedNodegroups(wkrm.modelClassName);
            if (!ngs) {
                console.warn("Not exporting", wkrm.modelClassName, "as no nodes available");
                // Do not export a graph with no available nodegroups
                continue;
            }
            rmw.setPermittedNodegroups(ngs);
        }
        rmw.pruneGraph(["e7362891-3b9a-46a9-a39d-2f03222771c4", "60000000-0000-0000-0000-000000000001"]);
        const prunedGraph = rmw.exportGraph();
        console.log("Loaded graph", target, filename);
        await fs.promises.writeFile(`${target}/${filename}`, JSON.stringify({
            graph: [prunedGraph],
            __scope: ['public']
        }, undefined, 2));
        if (type === "models") {
            models.push(rmw);
            all["models"][meta.graphid] = meta;
        }
        // TODO: What if branches have branches?
        rmw.getBranchPublicationIds().forEach((branchId: string) => branchId && branches.add(branchId));
    }
    await fs.promises.writeFile(`${PUBLIC_FOLDER}/definitions/graphs/_all.json`, JSON.stringify(all, null, 2));

    await fs.promises.rm(`${PUBLIC_FOLDER}/definitions/reference_data`, {recursive: true, force: true});
    await fs.promises.mkdir(`${PUBLIC_FOLDER}/definitions/reference_data/collections`, {"recursive": true});
    const collections = 'prebuild/reference_data/collections';
    const missingPaths: Set<string> = new Set();
    if (NON_PUBLIC && !FOR_ARCHES) {
        console.warn("Running without --include-xml as a NON-PUBLIC build, so including even unused collections");
        fs.cpSync(collections, `${PUBLIC_FOLDER}/definitions/reference_data/collections`, {recursive: true, dereference: true});
    } else {
        const xmls: {[key: string]: Set<string>} = {
            concepts: new Set(),
            collections: new Set()
        };
        const collectionCount = (await Promise.all(models.map((model: ResourceModelWrapper) => {
            return model.getCollections(true).map(async (collectionId: string) => {
                const collectionFile = `${collections}/${collectionId}.json`;
                const collectionString = await fs.promises.readFile(collectionFile);
                const collection = JSON.parse(collectionString.toString());
                if (FOR_ARCHES && collection.__source) {
                    const collectionSource = collection.__source.collection;
                    xmls.collections.add(collectionSource);
                    collection.__source = {
                        collection: path.basename(collectionSource),
                        concepts: [...collection.__source.concepts].map(s => {
                            xmls.concepts.add(s);
                            return path.basename(s);
                        })
                    };
                }
                return fs.promises.writeFile(
                    `${PUBLIC_FOLDER}/definitions/reference_data/collections/${collectionId}.json`,
                    JSON.stringify(collection, undefined, 2),
                );
            });
        }).flat())).length;

        if (NON_PUBLIC && FOR_ARCHES) {
            console.warn("Running with --for-arches, so only copying the (${collectionCount}) referenced collections, included in used graphs");
        } else {
            console.warn(`Building for PUBLIC, only including (${collectionCount}) referenced collections, but these are not essential, as required values should be cached`);
        }

        for (const [type, xmlSet] of Object.entries(xmls)) {
            await fs.promises.mkdir(`${PUBLIC_FOLDER}/definitions/reference_data/${type}`, {"recursive": true});
            await Promise.all([...xmlSet].map(async (xml: string): Promise<void> => {
                const xmlName = path.basename(xml);
                const xmlPath = path.join(collections, xml);
                if (!fs.existsSync(xmlPath)) {
                    console.log("Referenced", type, "missing, assuming in an upstream repo:", xml);
                } else {
                    fs.cpSync(xmlPath, `${PUBLIC_FOLDER}/definitions/reference_data/${type}/${xmlName}`);
                }
            }));
        }
    }

    if (FOR_ARCHES) {
        await fs.promises.mkdir(`${PUBLIC_FOLDER}/definitions/business_data`, {"recursive": true});
        const modelFileLengths: Map<string, number> = new Map();
        const modelBusinessData = new Map();
        const modelNames = new Map(models.map(rmw => {
            return [
                rmw.wkrm.graphId,
                rmw.wkrm.modelClassName
            ];
        }));
        const resources = await Promise.all(assetMetadata.map((asset) => {
            const resourceFile = `docs/definitions/business_data/${asset.slug}.json`;
            if (!fs.existsSync(resourceFile)) {
                console.warn("Missing resource file", resourceFile, "referenced in metadata");
                return [0, undefined];
            }
            return fs.promises.readFile(resourceFile).then((content: Buffer<ArrayBufferLike>) => {
                return [content.length, JSON.parse(content.toString())];
            });
        }));
        for (const [contentLength, resource] of resources) {
            if (!resource) {
                continue;
            }
            const end = (modelFileLengths.get(resource.resourceinstance.graph_id) || 0) + contentLength;
            modelFileLengths.set(resource.resourceinstance.graph_id, end);
            const chunk = Math.floor(end / CHUNK_SIZE_CHARS);
            let resourceFile = modelBusinessData.get(`${resource.resourceinstance.graph_id}:${chunk}`);
            if (resourceFile === undefined) {
                resourceFile = {
                    business_data: {resources: []}
                }
                modelBusinessData.set(`${resource.resourceinstance.graph_id}:${chunk}`, resourceFile);
            }
            resourceFile.business_data.resources.push(resource);
        }
        await Promise.all([...modelBusinessData].map(([code, businessData]) => {
            const [graphId, chunk] = code.split(':');
            if (businessData.business_data.resources.length === 0) {
                return;
            }
            const modelName = modelNames.get(graphId);
            if (!modelName) {
                console.warn("Found business data for unknown model", graphId);
                return;
            }
            return fs.promises.writeFile(`${PUBLIC_FOLDER}/definitions/business_data/${modelName}_${chunk}.json`, `
                {
                    "business_data": {
                        "resources": [
                            ${businessData.business_data.resources.map(res => JSON.stringify(res)).join(",\n")}
                        ]
                    }
                }
            `);
        }));
        const missingBranches = [...branches].filter(pubId => !branchesFound.has(pubId));
        if (missingBranches.length) {
            console.log("Branches missing (publication IDs):", ...missingBranches);
        }
    } else {
        let fgbFiles: {[key: string]: any} = {};
        fgbFiles = (await Promise.all(
          (await fs.promises.readdir('prebuild/fgb').then(
            (files) => files.filter(f => f.endsWith('.json'))
          ))
        )).reduce((acc, file) => {
            const [registry, _] = file.split('---');
            acc[registry] = acc[registry] || [];
            acc[registry].push(file);
            return acc;
        }, fgbFiles);
        await fs.promises.mkdir(`${PUBLIC_FOLDER}/fgb`, {"recursive": true});
        const registries: {[key: string]: number} = {};
        for (const [registry, filenames] of Object.entries(fgbFiles)) {
            const regcode = registriesToRegcode([registry]);
            registries[registry] = regcode;
            const points = filenames.reduce((acc: string[], filename: string) => {
                return [...acc, ...JSON.parse(fs.readFileSync(`prebuild/fgb/${filename}`).toString())];
            }, []);
            const geoJson: FeatureCollection = {
              "type": "FeatureCollection",
              "features": [{
                "type": "Feature",
                "properties": {
                  "registry": registry,
                  "regcode": regcode
                },
                "geometry": {
                  "type": "MultiPoint",
                  "coordinates": points
                }
              }]
            };
            fs.writeFileSync(
                `${PUBLIC_FOLDER}/fgb/${registry}.fgb`,
                fgbSerialize(geoJson)
            );
        }
        fs.writeFileSync(
            `${PUBLIC_FOLDER}/fgb/index.json`,
            JSON.stringify(registries)
        );

        buildFlatbush(locations);
    }
}

const files = [];
let loading = false;
for (const arg of process.argv) {
  if (loading) {
    if (arg.startsWith('-')) {
        loading = false;
    } else {
        files.push(arg);
    }
  }
  if (arg === '-a') {
    loading = true;
  }
}
if (files.length) {
    console.log("Loading only", files);
}
await reindex(files.length ? files : null);
