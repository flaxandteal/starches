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
