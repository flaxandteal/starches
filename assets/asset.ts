import { marked } from 'marked';
import dompurify from 'dompurify';
import * as HandlebarsSync from 'handlebars';
window.global = {Symbol: Symbol};
import AsyncHandlebars from 'handlebars-async-helpers-ts';
import { client, RDM, graphManager, staticStore, staticTypes, utils, viewModels } from 'alizarin';

const Handlebars = AsyncHandlebars(HandlebarsSync);

Handlebars.registerHelper("replace", async (base, fm, to) => (await base).replace(fm, to));
Handlebars.registerHelper("await", async (val) => await val);
Handlebars.registerHelper("default", function (a, b) {return a === undefined || a === null ? b : a;});
Handlebars.registerHelper("defaulty", async function (a, b) {return await a != undefined && await a != null && await a != false ? a : b;});
Handlebars.registerHelper("equal", async function (a, b) {return await a == await b;});
Handlebars.registerHelper("not", async function (a, b) { return await a != await b;});

const MODEL_FILES = {
  "076f9381-7b00-11e9-8d6b-80000b44d1d9": {
    graph: "Heritage Asset.json",
  }
};

async function initializeAlizarin() {
    const archesClient = new client.ArchesClientRemoteStatic('', {
      allGraphFile: (() => "definitions/resource_models/_all.json"),
      graphIdToGraphFile: ((graphId) => `definitions/resource_models/${MODEL_FILES[graphId].graph}`),
      resourceIdToFile: ((resourceId) => `definitions/business_data/${resourceId}.json`),
      collectionIdToFile: ((collectionId) => `definitions/collections/${collectionId}.json`)
    });
    graphManager.archesClient = archesClient;
    staticStore.archesClient = archesClient;
    RDM.archesClient = archesClient;

    await graphManager.initialize();
    return graphManager;
}

class SearchParams {
  slug: string
  publicView: boolean | undefined

  constructor(slug: string, publicView: boolean | undefined) {
    this.slug = slug;
    this.publicView = publicView;
  }
};

class Asset {
  asset: any
  meta: any

  constructor(asset: any, meta: any) {
    this.asset = asset;
    this.meta = meta;
  }
}

function getSearchParams() {
  const searchParams = new URLSearchParams(window.location.search);
  if (!searchParams.has("slug") || !searchParams.get("slug").match(/^[a-z0-9_]+$/i)) {
    console.error("Bad slug");
  }
  const slug = searchParams.get("slug");
  let publicView = true;
  if (searchParams.get("full") === "true") {
    publicView = false;
  }
  console.log(publicView, 'pv', searchParams.get("full"));
  return new SearchParams(slug, publicView);
}

async function loadAsset(slug: string, graphManager) {
  const HeritageAsset = graphManager.get("HeritageAsset");
  console.log("loading");
  const asset = (await HeritageAsset.find(slug, false));
  console.log("loaded", await asset.monument_names[0].monument_name);
  const meta = await getAssetMetadata(asset);
  return new Asset(asset, meta);
}

async function fetchTemplate(publicView: boolean) {
  const templateFile = publicView ? "/templates/heritage-asset-public-hb.md" : "/templates/heritage-asset-hb.md";
  const md = await fetch(templateFile);
  return Handlebars.compile(await md.text());
}

async function getAssetMetadata(asset) {
  let location = null;
  let geometry = null;
  if (await asset.location_data && await asset.location_data.geometry && await asset.location_data.geometry.geospatial_coordinates) {
    geometry = await (await asset.location_data.geometry.geospatial_coordinates).forJson();
    location = geometry;
    if (location) {
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
    if (location) {
      location = location["features"][0]["geometry"]["coordinates"];
    }
  }

  return {
    resourceinstanceid: `${await asset.id}`,
    geometry: geometry,
    location: location,
    title: await (await asset.monument_names[0].monument_name).forJson()
  };
}

async function renderAsset(asset: Asset, template) {
  const staticAsset = JSON.stringify(await asset.asset.forJson(true), null, 2);
  const markdown = await template({ title: asset.meta.title, ha: asset.asset, js: staticAsset }, {
    allowProtoPropertiesByDefault: true,
    allowProtoMethodsByDefault: true,
  });

  // <pre>{{ js }}</pre>
  const renderer = {
    hr(token) {
      return '<hr class="govuk-section-break govuk-section-break--visible">';
    },
    table(token) {
      const headers = token.header.map(
        header => `
          <th scope="col" class="govuk-table__header">${this.parser.parseInline(header.tokens)}</th>
        `
      ).join('\n');
      const rows = token.rows.map(
        row => {
          const rowText = row.map(col => {
            return `<td class="govuk-table__cell">${this.parser.parseInline(col.tokens)}</td>`;
          }).join('\n');
          return `
            <tr class="govuk-table__row">
              ${rowText}
            </tr>
          `;
        }).join('\n');
      return `
        <table class="govuk-table">
          <thead class="govuk-table__head">
            <tr class="govuk-table__row">
              ${headers}
            </tr>
          </thead>
          <tbody class="govuk-table__body">
            ${rows}
          </tbody>
        </table>
      `;
    }
  };
  marked.use({ renderer });
  const parsed = await marked.parse(markdown);
  document.getElementById('asset').innerHTML = dompurify.sanitize(parsed);
  addAssetToMap(asset);
}

function addAssetToMap(asset: Asset) {
  const location = asset.meta.location;
  if (location) {
    var centre = location;
    centre = [centre[1], centre[0]];
    const zoom = 16;
    var map = L.map('map').setView(centre, zoom);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    L.geoJSON(asset.meta.geometry).addTo(map);
  } else {
    document.getElementById('map').classList = 'map-hidden';
  }
}

window.addEventListener('DOMContentLoaded', async (event) => {
  const gm = await initializeAlizarin();
  const searchParams = getSearchParams();
  const publicView = searchParams.publicView || false;
  const slug = searchParams.slug;

  console.log("Displaying for public view (NB: full data loaded regardless!):", publicView);
  const asset: Asset = await loadAsset(slug, gm);
  const template = await fetchTemplate(publicView);

  for (let description of [...await asset.asset.descriptions]) {
    const node = (await description.description_type).__parentPseudo.node;
    const data = (await description.description_type).__parentPseudo.tile.data;
  }
  renderAsset(asset, template);

  const swapLink: HTMLAnchorElement | null = document.querySelector("a#swap-link");
  if (swapLink) {
    if (publicView) {
      swapLink.href = `?slug=${slug}&full=true`;
      swapLink.innerHTML = "visit full view";
    } else {
      swapLink.href = `?slug=${slug}&full=false`;
      swapLink.innerHTML = "visit public view";
    }
  }

  const urlSearchParams = new URLSearchParams(window.location.search);
  const geoBounds = urlSearchParams.get("geoBounds");
  const searchTerm = urlSearchParams.get("searchTerm");
  let backUrl = "/?";

  if (geoBounds && /^[-,\[\]_0-9a-f.]*$/i.exec(geoBounds)) {
    backUrl += `&geoBounds=${geoBounds}`;
  }

  if (searchTerm && /^[_0-9a-z]*$/i.exec(searchTerm)) {
    backUrl += `&searchTerm=${searchTerm}`;
  }
  document.getElementById("back-link").href = backUrl;
  window.alizarinAsset = asset;
});
