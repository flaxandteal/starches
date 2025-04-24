import * as fs from "fs";
import * as pagefind from "pagefind";
import Flatbush from "flatbush";
import Handlebars from 'handlebars'

import { Asset } from './types.ts';

Handlebars.registerHelper("replace", (base, fm, to) => base ? base.replace(fm, to) : "");
Handlebars.registerHelper("await", (val) => val);
Handlebars.registerHelper("default", function (a, b) {return a === undefined || a === null ? b : a;});

const PUBLIC_FOLDER = 'docs';
const DEFAULT_LANGUAGE = 'en';

async function buildPagefind() {
    const { index } = await pagefind.createIndex();
    if (!index) {
      throw Error("Could not create pagefind index");
    }
    await index.addDirectory({
        path: "docs"
    });
    console.log("loading");
    const assetMetadata = (await Promise.all(
      (await fs.promises.readdir('prebuild/preindex').then(
        (files) => files.filter(f => f.endsWith('.pi'))
      )).map(
        f => fs.promises.readFile(`prebuild/preindex/${f}`)
      ).map(
        async f => JSON.parse((await f).toString())
      ))).flat();
    console.log("loaded");

    const language = DEFAULT_LANGUAGE ?? "en";
    for (let asset of assetMetadata) {
      const designations = asset.meta.designations ? JSON.parse(asset.meta.designations) : ["Heritage Asset"];
      await index.addCustomRecord({
          url: `/test?slug=${asset.meta.slug}`,
          // Only taking a bit of the plaintext for now... RMV
          content: asset.content,
          language: language,
          filters: {
              tags: designations
          },
          meta: asset.meta
      });
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

async function getLocations(index: pagefind.PagefindIndex, assetMetadata: Asset[]): Promise<IndexEntry[]> {
  // @ts-expect-error getIndexCatalogue is a local variable
    const catalogue = await index.getIndexCatalogue();
    const hashes = catalogue.entries.reduce((agg: {[key: string]: string}, [hash, entry]: [string, string]) => {
        const resourceinstanceid = JSON.parse(entry).meta.resourceinstanceid;
        if (resourceinstanceid) {
            agg[resourceinstanceid] = hash;
        }
        return agg
    }, {});
    return (await Promise.all(assetMetadata.map(async (asset: Asset) => {
        if (asset.meta.location) {
            try {
                const loc = JSON.parse(asset.meta.location);
                const hash = hashes[asset.meta.resourceinstanceid];
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

    fs.rmSync(`${PUBLIC_FOLDER}/flatbush.bin`, {force: true});
    fs.rmSync(`${PUBLIC_FOLDER}/flatbush.json`, {force: true});
    fs.writeFileSync(
        `${PUBLIC_FOLDER}/flatbush.bin`,
        Buffer.from(flatbushIndex.data)
    );
    fs.writeFileSync(
        `${PUBLIC_FOLDER}/flatbush.json`,
        JSON.stringify(locations.map((loc: IndexEntry) => loc.hash))
    );
}

const { index, assetMetadata }: { index: pagefind.PagefindIndex, assetMetadata: Asset[] } = await buildPagefind();
const locations = await getLocations(index, assetMetadata);
await fs.promises.rm(`${PUBLIC_FOLDER}/definitions/reference_data`, {recursive: true, force: true});
fs.cpSync('prebuild/reference_data', `${PUBLIC_FOLDER}/definitions/reference_data`, {recursive: true});

const resource_models = `${PUBLIC_FOLDER}/definitions/resource_models`;
const all = {"models": {}};
const dir = (await fs.promises.readdir('prebuild/resource_models'));
for (const filename of dir) {
    if (!filename.endsWith('json') || filename.startsWith('_')) {
        continue;
    }
    const file = await fs.promises.readFile(`prebuild/resource_models/${filename}`);
    const model = JSON.parse(file.toString())["graph"][0];
    const meta = {
        author: model["author"],
        cards: model["cards"].length,
        cards_x_nodes_x_widgets: model["cards_x_nodes_x_widgets"].length,
        color: model["color"],
        description: model["description"],
        edges: model["edges"].length,
        graphid: model["graphid"],
        iconclass: model["iconclass"],
        is_editable: model["is_editable"],
        isresource: model["isresource"],
        jsonldcontext: model["jsonldcontext"],
        name: model["name"],
        nodegroups: model["nodegroups"].length,
        nodes: model["nodes"].length,
        ontology_id: model["ontology_id"],
        publication: model["publication"],
        relatable_resource_model_ids: model["relatable_resource_model_ids"],
        resource_2_resource_constraints: model["resource_2_resource_constraints"],
        root: model["root"],
        slug: model["slug"],
        subtitle: model["subtitle"],
        templateid: model["templateid"],
        version: model["version"]
    };
    all["models"][meta.graphid] = meta;
}
await fs.promises.rm(resource_models, {recursive: true, force: true});
fs.cpSync('prebuild/resource_models', resource_models, {recursive: true});
fs.promises.writeFile(resource_models + '/_all.json', JSON.stringify(all, null, 2));

const fgbFiles = (await Promise.all(
  (await fs.promises.readdir('docs/fgb').then(
    (files) => files.filter(f => f.endsWith('.fgb'))
  ))
));
fs.writeFileSync(
    `${PUBLIC_FOLDER}/fgb/index.json`,
    JSON.stringify(fgbFiles)
);

buildFlatbush(locations);
