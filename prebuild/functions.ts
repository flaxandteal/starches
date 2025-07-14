import * as fs from "fs";
import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';
import Handlebars from 'handlebars'
import { Marked } from 'marked'
import markedPlaintify from 'marked-plaintify'
import { Asset, ModelEntry, type IAssetFunctions } from '../utils/types.ts';
import { slugify } from '../utils/utils.ts';
import { RDM, GraphManager, staticTypes, interfaces, nodeConfig, staticStore, renderers } from 'alizarin';

const window = new JSDOM('').window;
const purify = DOMPurify(window);

Handlebars.registerHelper("replace", (base, fm, to) => base ? base.replace(fm, to) : "");
Handlebars.registerHelper("await", (val) => val);
Handlebars.registerHelper("default", function (a, b) {return a === undefined || a === null ? b : a;});
Handlebars.registerHelper("in", function (a, b) { return Array.isArray(b) ? b.includes(a) : (a in b);});
Handlebars.registerHelper("toString", function (a) { return a.toString();});
Handlebars.registerHelper("array", function (...args) { return args;});
Handlebars.registerHelper("clean", function (a) {
  if (a instanceof renderers.Cleanable) {
    return a.__clean;
  }

  return a;
});

const registrySymbols: {[key: string]: string} = {
    "Industrial Heritage Record": "(Industrial)",
    "Sites and Monuments Record": "(Monument)",
    "Historic Buildings Record": "(Building)",
    "Defence Heritage Record": "(Defence)",
    "Historic Parks, Gardens and  Demesnes": "(Garden)",
    "Areas of Archaeological Potential": "(AAP)",
    "Areas of Significant Archaeological Interest": "(ASAI)",
    "Gazetteer of Historic Nucleated Urban Settlements": "(GHNUS)",
    "Heritage at Risk": "(HAR) ",
    "Historic Wrecks": "(Wreck)",
};

class AssetFunctions implements IAssetFunctions {
  slugCounter: {[key: string]: number};
  registries: {[key: string]: any};
  templates: {[key: string]: HandlebarsTemplateDelegate<any>} | undefined = undefined;
  permissions: {[key: string]: {[key: string]: boolean | string} | boolean}
  // Nodes to 
  permissionCollectionNodes: {[key: string]: {[alias: string]: staticTypes.StaticCollection | undefined}} = {
    "HeritageAsset": {"role_type": undefined}
  };
  permissionFunctions: {[key: string]: interfaces.CheckPermissions} = {
    publicDescription: (nodegroupId: string, tile: staticTypes.StaticTile | null, nodes: Map<string, staticTypes.StaticNode>) => {
      if (!tile) {
        return true; // we want the nodegroup, just not certain tiles.
      }
      if (!tile.data) {
       return false;
      }
      const node = nodes.get("description_type");
      if (!node || node.nodegroup_id !== nodegroupId) {
        throw Error(`Trying to find description for nodegroup ${nodegroupId} but it does not contain the description_type node`);
      }
      const domainConfig: nodeConfig.StaticNodeConfigDomain = node.config;
      // TODO: does this need adapted for HARev?
      if (domainConfig.options.filter(
        (option: staticTypes.StaticDomainValue) => tile.data.get("ba34557b-b554-11ea-ab95-f875a44e0e11") === option.id && [
          "Notes", "Summary", "Exterior", "History"
        ].includes(option.text.en)).length > 0
      ) {
        return true;
      }
      return false;
    },
    publicHeritageAssetActors: (nodegroupId: string, tile: staticTypes.StaticTile | null, nodes: Map<string, staticTypes.StaticNode>) => {
      if (!tile) {
        return true; // we want the nodegroup, just not certain tiles.
      }
      if (!tile.data) {
       return false;
      }
      const node = nodes.get("role_type");
      if (!node || node.nodegroup_id !== nodegroupId) {
        throw Error(`Trying to find description for nodegroup ${nodegroupId} but it does not contain the description_type node`);
      }
      // This should have been loaded.
      const roleType: staticTypes.StaticCollection = this.permissionCollectionNodes["HeritageAsset"][node.alias];
      const allowedRoles: staticTypes.StaticConcept[] = [
        "Architect"
      ].map(role => roleType.getConceptByValue(role))
      if (allowedRoles.filter(role => !role).length > 0) {
        throw Error(`Could not load roles for public check on Heritage Asset actors.`);
      }
      if (allowedRoles.filter(role => (tile.data.get(node.nodeid) || []).includes(role.conceptid))) {
        return true;
      }
      return false;
    }
    // "219c6377-d9d9-47b3-bea3-269aca0075d4", // "Notes"
    // "3f507168-6411-42b6-a8e6-1e771db53fff", // "Reference"
    // "0fb56869-37af-4573-a978-5fc4dcbb5840", // "Statutory"
    // "467f724e-d36b-4347-8ebf-cf9648fefb96", // "History"
    // "671952e8-7b73-4524-8bcb-3324ed9524e5", // "Exterior"
    // "46907f4a-d7a4-4c4e-b090-23ce70d78ba7", // "Interior"
    // "87c40306-43a1-4522-a496-d0d773029f2f", // "Full"
    // "65a1baef-72e7-45c8-b57b-bd3040c57f49", // "Condition"
    // "d013a32b-e4ad-4d54-99af-bf6d716b8226", // "Abstract"
    // "8b592b30-9002-4940-92fa-ad73a1d19703", // "Summary"
  }

  constructor() {
    this.slugCounter = {};
    this.permissions = {};
    this.registries = {};
  }

  getPermittedNodegroups(modelName: string) {
    if (!this.permissions[modelName]) {
      return null;
    }
    return new Map(Object.entries(this.permissions[modelName]).map(([k, v]: [k: string, v: string | boolean]) => {
      if (typeof v === "boolean") {
        return [k, v];
      }
      return [k, this.permissionFunctions[v]];
    }));
  }

  async getAllFrom(graphManager: GraphManager, filename: string, includePrivate: boolean) {
    const resourceFile = JSON.parse((await fs.promises.readFile(filename, { encoding: "utf8" })).toString())
    const resourceList: staticTypes.StaticResource[] = resourceFile.business_data.resources;
    const graphs = resourceList.reduce((set: Set<string>, resource: staticTypes.StaticResource) => { set.add(resource.resourceinstance.graph_id); return set; }, new Set());
    const resources = [];
    const models: {[graphId: string]: any} = {};
    for (const modelToLoad of graphs) {
      this.registries = Object.fromEntries(await Promise.all((await (await graphManager.get("Registry")).all()).map(async (reg) => {
        const nameCount = await reg.names.length;
        let names = [];
        let indexedNames = [];
        for (let i = 0 ; i < nameCount ; i++) {
          names.push([
            (await reg.names[i].name_use_type).toString(),
            (await reg.names[i].name).toString(),
          ]);
        }
        indexedNames = Object.fromEntries(names);
        return [await reg.id, indexedNames['Primary']];
      })));
      const Model = await graphManager.get(modelToLoad);
      const modelClassName = Model.wkrm.modelClassName;
      let permissions = this.permissions;
      if (includePrivate) {
        console.warn("Still publishing ALL nodegroups for", modelToLoad);
      } else {
        if (modelClassName in permissions && permissions[modelClassName] !== false) {
          if (permissions[modelClassName] !== true) {
            if (modelClassName in this.permissionCollectionNodes) {
              const nodes = Model.getNodeObjectsByAlias();
              for (const [alias] of Object.entries(this.permissionCollectionNodes[modelClassName])) {
                const node = nodes.get(alias);
                this.permissionCollectionNodes[modelClassName][alias] = await RDM.retrieveCollection(node.config.rdmCollection);
              }
            }
            Model.setPermittedNodegroups(this.getPermittedNodegroups(modelClassName));
          }
        } else {
          Model.setPermittedNodegroups([]);
        }
      }

      for (const model of Object.keys(this.getModelFiles())) {
        await graphManager.loadGraph(model);
      }

      for (const model of Object.keys(this.getModelFiles())) {
        console.log("Loading graph", model);
        for await (const res of staticStore.loadAll(model)) {
          // FIXME: remove this loop but ensure loading happens
        }
      }

      models[modelToLoad] = Model;
    }

    for (const staticResource of resourceList) {
      const Model = models[staticResource.resourceinstance.graph_id];
      const resource = Model.find(staticResource.resourceinstance.resourceinstanceid);
      resources.push(resource);
    }
    return Promise.all(resources);
  }

  async initialize() {
    const md = {
      "HeritageAsset": await fs.promises.readFile(`static/templates/heritage-asset-index-hb.md`, { encoding: "utf8" }),
      "MaritimeVessel": await fs.promises.readFile(`static/templates/maritime-vessel-index-hb.md`, { encoding: "utf8" }),
      "_unknown": await fs.promises.readFile(`static/templates/_unknown-index-hb.md`, { encoding: "utf8" })
    };
    this.permissions = JSON.parse(await fs.promises.readFile('prebuild/permissions.json', { encoding: "utf8" }));
    this.templates = Object.fromEntries(Object.entries(md).map(([mdn, file]: [string, ReadableStream]) => [mdn, Handlebars.compile(file)]));
  }

  shouldIndex(asset: Asset) {
    if (asset && (asset.type == 'HeritageAsset' || asset.type == 'MaritimeVessel')) {
      return true;
    }
    return false;
  }

  getModelFiles():{[key: string]: ModelEntry} {
    return {
      "076f9381-7b00-11e9-8d6b-80000b44d1d9": new ModelEntry(
          "Heritage Asset.json",
          {
          //  "Garden": "gardens_merged.json",
          //  "IHR": "ihr_merged_mp.json",
          //  "Monuments": "monuments_merged.json",
          //  "Buildings": "buildings_merged.json"
          }
      ),
      "65b1be1a-dfa4-49cf-a736-a1a88c0bb289": new ModelEntry(
          "Heritage Asset Revision.json",
          {}
      ),
      "3a6ce8b9-0357-4a72-b9a9-d8fdced04360": new ModelEntry(
          "Registry.json",
          {
            "Registry": "registries.json"
          }
      ),
      "49bac32e-5464-11e9-a6e2-000d3ab1e588": new ModelEntry(
          "Maritime Vessel.json",
          {
            "Wreck": "marine_merged.json",
            "Lost": "marine_merged_loss.json",
          }
      ),
      "b9e0701e-5463-11e9-b5f5-000d3ab1e588": new ModelEntry(
          "Activity.json",
          {}
      ),
      "8d41e49e-a250-11e9-9eab-00224800b26d": new ModelEntry(
          "Consultation.json",
          {}
      ),
      "47172858-3530-406f-88b8-58b4702363d1": new ModelEntry(
          "Action.json",
          {}
      ),
      "b07cfa6f-894d-11ea-82aa-f875a44e0e11": new ModelEntry(
          "Archive Source.json",
          {
            // "Excavation Licences": "excavations_merged_licence.json",
          }
      ),
      "cc5da227-24e7-4088-bb83-a564c4331efd": new ModelEntry(
          "Licence.json",
          {
            // "Excavation Licences": "excavations_merged_licence.json",
          }
      ),
      "d4a88461-5463-11e9-90d9-000d3ab1e588": new ModelEntry(
          "Organization.json",
          {
            // "Company Organization": "company_organization.json",
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
      "22477f01-1a44-11e9-b0a9-000d3ab1e588": new ModelEntry(
          "Person.json",
          {}
      ),
      "24d7b54f-5464-11e9-a86b-000d3ab1e588": new ModelEntry(
          "Bibliographic Source.json",
          {}
      ),
    }
  }

  async toSlug(title: string, staticAsset: any, prefix: string | undefined): Promise<string> {
    let slug = slugify(title);
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

  async getMeta(asset: any, staticAsset: any, prefix: string | undefined, includePrivate: boolean): Promise<Asset> {
    const modelType = (asset && asset.__.wkrm.modelClassName) ?? 'HeritageAsset';
    let names: string[][] = [];
    let indexedNames: {[key: string]: string} = {};
    let nameCount: number;
    let scopes: string[] = includePrivate ? ["full"] : ["public"];
    let displayName: string | undefined = undefined;
    if (await asset.$?.getName) {
      displayName = await asset.$.getName();
    }
    switch (modelType) {
      case 'HeritageAsset':
        displayName = await staticAsset.display_name;
        nameCount = await staticAsset.monument_names.length;
        for (let i = 0 ; i < nameCount ; i++) {
          names.push([
            (await staticAsset.monument_names[i].monument_name_use_type ?? "").toString(),
            (await staticAsset.monument_names[i].monument_name).toString(),
          ]);
        }
        indexedNames = Object.fromEntries(names);
        break;
      case 'MaritimeVessel':
        nameCount = await staticAsset.names.length;
        for (let i = 0 ; i < nameCount ; i++) {
          names.push([
            (await staticAsset.names[i].name_use_type ?? "").toString(),
            (await staticAsset.names[i].name).toString(),
          ]);
        }
        indexedNames = Object.fromEntries(names);
        break;
      case 'Person':
        displayName = await staticAsset.name[0].full_name;
        if (!displayName) {
          displayName = `${await staticAsset.name[0].forenames.forename} ${await staticAsset.name[0].surnames.surname}`;
        }
        return new Asset(
          staticAsset.id,
          undefined,
          undefined,
          displayName,
          null,
          "",
          modelType,
          scopes
        );
      case 'Registry':
        names.push([
          (await staticAsset.names[0].name_use_type).toString(),
          (await staticAsset.names[0].name).toString(),
        ]);
        names.push([
          (await staticAsset.names[1].name_use_type).toString(),
          (await staticAsset.names[1].name).toString(),
        ]);
        indexedNames = Object.fromEntries(names);
        return new Asset(
          staticAsset.id,
          undefined,
          undefined,
          indexedNames['Primary'],
          `REG_${indexedNames['Alternative']}`,
          "",
          modelType,
          scopes
        );
      default:
    };
    let registries = [];
    let registryNames = [];
    let designationsConcept = [];
    let title = displayName ?? indexedNames['Primary'] ?? (names[0] ? names[0][1] : null) ?? modelType;

    let geometryParent;
    let location = null;
    let geometry = null;
    if (
      ((staticAsset.__has && await staticAsset.__has('location_data')) || 'location_data' in staticAsset) &&
      (((await staticAsset.location_data).__has && (await staticAsset.location_data).__has('geometry')) || 'geometry' in staticAsset.location_data)
    ) {
      geometryParent = await staticAsset.location_data.geometry;
      if (!geometryParent) {
        console.warn("No geometry node for", staticAsset);
      } else {
        geometry = await staticAsset.location_data.geometry.geospatial_coordinates;
        location = geometry;
        const assignments = await staticAsset.designation_and_protection_assignment;

        if (assignments) {
          for (const assignment of assignments) {
            const extents = (
              assignment &&
              await assignment.extent_of_designation_or_protection
            ) || [];
            for (const extent of extents) {
              const geospatial_extent = extent && await extent.geospatial_extent;
              if (geospatial_extent) {
                if (!geometry || !geometry["features"]) {
                  geometry = {
                    "features": []
                  }
                }
                for (const feature of geospatial_extent['features']) {
                  feature.properties = {};
                  feature.properties['starches_type'] = 'extent_of_designation_or_protection';
                  feature.properties['starches_description_of_extent'] = await extent.description_of_extent;
                  feature.properties['starches_designation_type'] = (await assignment.designation_or_protection_type || '').toString();
                  geometry["features"].push(feature);
                }
              }
            }
          }
        }

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
      }
      if (location && location["features"]) {
        location = location["features"][0]["geometry"]["coordinates"];
      } else {
        location = null;
      }
    }
    const records = (!staticAsset.__has || await staticAsset.__has('record_and_registry_membership')) ? await staticAsset.record_and_registry_membership : null;
    if (records) {
      for (let d of records) {
        const registry = this.registries[await d.record_or_registry.id];
        if (registry) {
          const symbol = registrySymbols[registry.toString()];
          if (symbol) {
            registries.push(symbol);
          } else {
            console.log(registry.toString());
          }
          registryNames.push(registry.toString());
        }
      }
      title = `${title} ${registries.join("")}`;
    }
    const designations = (!staticAsset.__has || await staticAsset.__has('designation_and_protection_assignments')) ? await staticAsset.designation_and_protection_assignments : [];
    if (designations) {
      for (let d of designations) {
        const designation = await d.designation_or_protection_type;
        if (designation) {
          designationsConcept.push(designation.toString());
        }
      }
    }

    let slug = await this.toSlug(title, asset, prefix);
    const meta = new Asset(
      staticAsset.id,
      geometry,
      location,
      title,
      slug,
      "",
      modelType,
      scopes
    );
    meta.meta["registries"] = JSON.stringify(registryNames);
    meta.meta["designations"] = JSON.stringify(designationsConcept);
    if (!this.templates) {
      throw Error("Template not loaded");
    }
    let template = this.templates[modelType] || this.templates['_unknown'];
    const md = await template({ type: modelType, title: meta.meta.title, ha: staticAsset }, {
      allowProtoPropertiesByDefault: true,
      allowProtoMethodsByDefault: true,
    });
    const plaintext = await new Marked({ gfm: true })
      .use(markedPlaintify())
      .parse(purify.sanitize(md, { USE_PROFILES: {html: false} }));
    const [indexOnly, description] = plaintext.split('$$$');
    if (description) {
      meta.content = indexOnly.substring(0, 300) + ' $$$ ' + description.substring(0, 300);
    } else {
      meta.content = indexOnly.substring(0, 300);
    }
    return meta;
  }
};

const assetFunctions = new AssetFunctions();

export { assetFunctions };
