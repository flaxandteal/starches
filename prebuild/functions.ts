import * as fs from "fs";
import Handlebars from 'handlebars'
import { Marked } from 'marked'
import markedPlaintify from 'marked-plaintify'
import { Asset, ModelEntry, type IAssetFunctions } from '../utils/types.ts';
import { GraphManager } from 'alizarin';

Handlebars.registerHelper("replace", (base, fm, to) => base ? base.replace(fm, to) : "");
Handlebars.registerHelper("await", (val) => val);
Handlebars.registerHelper("default", function (a, b) {return a === undefined || a === null ? b : a;});

const designationSymbols: {[key: string]: string} = {
    "Listed Building": "🏠",
    "Scheduled Monument": "🪦",
    "Registered Historic Park, Garden or Demesne": "🌳",
    "Protected Wreck": "🚢",
    "Industrial Heritage": "⚙️"
};

class AssetFunctions implements IAssetFunctions {
  slugCounter: {[key: string]: number};
  template: HandlebarsTemplateDelegate<any> | undefined = undefined;

  constructor() {
    this.slugCounter = {};
  }

  async getAll(graphManager: GraphManager) {
    const HeritageAsset = await graphManager.get("HeritageAsset");
    return [
      await HeritageAsset.all({lazy: true}),
      // await MaritimeVessel.all({lazy: true}),
    ].flat();
  }

  async initialize() {
    const md = await fs.promises.readFile(`static/templates/heritage-asset-index-hb.md`, { encoding: "utf8" });
    this.template = Handlebars.compile(md);
  }

  getModelFiles():{[key: string]: ModelEntry} {
    return {
      "076f9381-7b00-11e9-8d6b-80000b44d1d9": new ModelEntry(
          "Heritage Asset.json",
          {
            "Garden": "gardens_merged.json",
            "IHR": "ihr_merged.json",
            "Monuments": "monuments_merged.json",
            "Buildings": "buildings_merged.json"
          }
      ),
      // "b07cfa6f-894d-11ea-82aa-f875a44e0e11": new ModelEntry(
      //     "Archive Source.json",
      //     ["archive_merged.json"]
      // ),
      // "24d7b54f-5464-11e9-a86b-000d3ab1e588": new ModelEntry(
      //     "Bibliographic Source.json",
      //     ["bibliography_merged.json"]
      // ),
      // "22477f01-1a44-11e9-b0a9-000d3ab1e588": new ModelEntry(
      //     "Person.json",
      //     ["person_merged.json"]
      // ),
    }
  }

  toSlug(staticAsset: any, prefix: string | undefined): string {
    let title = staticAsset.root.monument_names[0].monument_name;
    let slug = title.replaceAll(/[^A-Za-z0-9_]/g, "").slice(0, 20);
    slug = `${slug}_${staticAsset.id.slice(0, 6)}`;
    if (prefix) {
      slug = `${prefix}${slug}`;
    }
    let slug_n;
    if (slug in this.slugCounter) {
      slug_n = this.slugCounter[slug] + 1;
      slug = `${slug}_${slug_n}`;
    } else {
      slug_n = 1;
    }
    this.slugCounter[slug] = slug_n;
    return slug;
  }

  async getMeta(staticAsset: any, prefix: string | undefined): Promise<Asset> {
    let designations = [];
    let designationsConcept = [];
    let title = staticAsset.root.monument_names[0].monument_name;

    const geometry = staticAsset.root.location_data.geometry.geospatial_coordinates;
    let location = geometry;
    if (location && location["features"]) {
      if (!location["features"][0]["geometry"]) {
        console.log(location);
      }
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
    for (let d of staticAsset.root.designation_and_protection_assignment) {
      const designation = await d.designation_or_protection_type;
      if (designation) {
        const symbol = designationSymbols[designation.toString()];
        if (symbol) {
          designations.push(symbol);
        } else {
          console.log(designation.toString());
        }
        designationsConcept.push(designation.toString());
      }
    }
    title = `${title} ${designations.join("")}`;

    let slug = this.toSlug(staticAsset, prefix);
    const meta = new Asset(
      staticAsset.id,
      geometry,
      location,
      title,
      slug,
      ""
    );
    meta.meta["designations"] = JSON.stringify(designationsConcept);
    if (!this.template) {
      throw Error("Template not loaded");
    }
    const md = await this.template({ title: meta.meta.title, ha: staticAsset.root }, {
      allowProtoPropertiesByDefault: true,
      allowProtoMethodsByDefault: true,
    });
    const plaintext = await new Marked({ gfm: true })
      .use(markedPlaintify())
      .parse(md);
    meta.content = plaintext.substring(0, 300);
    return meta;
  }
};

const assetFunctions = new AssetFunctions();

export { assetFunctions };
