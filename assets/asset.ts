import { marked } from 'marked';
import dompurify from 'dompurify';
import markedPlaintify from 'marked-plaintify'
import { Popup, Source, Marker, Map, IControl, NavigationControlOptions, NavigationControl } from 'maplibre-gl';
import * as Handlebars from 'handlebars';
import { client, RDM, graphManager, staticStore, staticTypes, utils, viewModels, renderers } from 'alizarin';
import { addMarkerImage } from './map-tools';

Handlebars.registerHelper("replace", (base, fm, to) => base ? base.replaceAll(fm, to) : base);
Handlebars.registerHelper("plus", (a, b) => a + b);
Handlebars.registerHelper("default", function (a, b) {return a === undefined || a === null ? b : a;});
Handlebars.registerHelper("defaulty", function (a, b) {return a != undefined && a != null && a != false ? a : b;});
Handlebars.registerHelper("equal", function (a, b) {return a == b;});
Handlebars.registerHelper("not", function (a, b) { return a != b;});
Handlebars.registerHelper("nospace", function (a) { return a.replaceAll(" ", "%20")});
Handlebars.registerHelper("clean", function (a) {
  if (a instanceof renderers.Cleanable) {
    return a.__clean;
  }

  return a;
});
Handlebars.registerHelper("concat", function (...args) { return args.slice(0, args.length-1).join(""); });
Handlebars.registerHelper("dialogLink", function (options) { return new Handlebars.SafeString(`<button class="govuk-button dialog-link" data-dialog-id="${options.hash.id}">Show</button>`); });

const archesUrl = window.archesUrl;

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
  return new SearchParams(slug, publicView);
}

class Dialog {
  title: string
  body: string

  constructor(title: string, body: string) {
    this.title = title;
    this.body = body;
  }
}

async function loadAsset(slug: string, graphManager): Promise<Asset> {
  console.log("Loading Heritage Asset graph");
  const HeritageAsset = graphManager.get("HeritageAsset");
  console.log("Loaded", HeritageAsset);
  console.log("Loading alizarin asset");
  const asset = (await HeritageAsset.find(slug, false));
  console.log("Loaded asset", asset);
  console.log("Loading metadata");
  const meta = await getAssetMetadata(asset);
  console.log("Loaded metadata", meta);
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


async function renderAsset(asset: Asset, template): Promise<{[key: string]: Dialog}> {
  const alizarinRenderer = new renderers.MarkdownRenderer({
    conceptValueToUrl: async (conceptValue: viewModels.ConceptValueViewModel) => {
      const value = await conceptValue.getValue()
      const text = await value.toString();

      if (value.__concept) {
        return `${archesUrl}search?term-filter=` + encodeURI(`
          [{"context_label":"${conceptValue.describeFieldGroup()}","nodegroupid":"${conceptValue.__parentPseudo.node.nodegroup_id}","text":"${text}","type":"concept","value":"${value.__concept.id}","inverted":false,"selected":true}]
        `.replace(/\n/g, ' '))
      }
      return null;
    },
    domainValueToUrl: async (domainValue: viewModels.DomainValueViewModel) => {
      const value = await domainValue.getValue();
      return `${archesUrl}search?term-filter=` + encodeURI(`
        [{"context_label":"${domainValue.describeFieldGroup()}","nodegroupid":"${domainValue.__parentPseudo.node.nodegroup_id}","text":"${value.toString()}","type":"term","value":"${value.toString()}","inverted":false,"selected":true}]
      `.replace(/\n/g, ' '))
    },
    resourceReferenceToUrl: async (value: viewModels.ResourceInstanceViewModel) => `${archesUrl}report/${await value.id}`
  });
  const nonstaticAsset = await alizarinRenderer.render(asset.asset);
  const staticAsset = JSON.stringify(nonstaticAsset, null, 2);
  const images = [];
  const files = [];
  const ecrs = nonstaticAsset.external_cross_references;
  const otherEcrs = [];
  if (ecrs.length) {
    for (const [n, ecr] of ecrs.entries()) {
      if (ecr.url && (ecr.url.endsWith("JPG") || ecr.url.endsWith("jpg"))) { // RMV
        images.push({
          image: ecr,
          index: n
        });
      } else if (ecr.url && (ecr.url.endsWith("PDF") || ecr.url.endsWith("pdf"))) { // RMV
        files.push(ecr)
      } else {
        otherEcrs.push(ecr)
      }
    }
  }

  const markdown = template({ title: await asset.meta.title, ha: nonstaticAsset, js: staticAsset, images: images, files: files, ecrs: otherEcrs }, {
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
  const dialogLinks = document.getElementsByClassName("dialog-link");
  for (const link of dialogLinks) {
    link.addEventListener("click", (function () { showDialog(this.getAttribute("data-dialog-id")); }).bind(link));
  };
  addAssetToMap(asset);
  const dialogs = {};
  for (const image of images) {
    dialogs[`image_${image.index}`] =  new Dialog(
      `<h3>Image for ${asset.meta.title}</h3>\n<h4>${await image.image.external_cross_reference}</h4>`,
      `<img src='${image.image.url}' />`
    );
  }
  return dialogs;
}

function addAssetToMap(asset: Asset) {
  const location = asset.meta.location;
  if (location) {
    var centre = location;
    const zoom = 16;
    var map = new Map({
        style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
        container: 'map',
        center: centre,
        zoom: zoom
    });
    window.map = map;
    map.on('load', async () => {
      console.log(asset.meta.geometry);
      await addMarkerImage(map);
      const source = map.addSource('assets', {
          type: 'geojson',
          data: asset.meta.geometry,
      });
      map.addLayer({
          'id': 'asset-boundaries',
          'type': 'fill',
          'source': 'assets',
          'paint': {
              'fill-color': '#888888',
              'fill-opacity': 0.4
          },
          'filter': ['==', '$type', 'Polygon']
      });
      map.addLayer({
          'id': 'assets',
          'type': 'symbol',
          'source': 'assets',
          'layout': {
              'icon-image': 'marker',
              'text-offset': [0, 1.25],
              'text-anchor': 'top'
          },
          'filter': ['==', '$type', 'Point']
      });
    });
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
  console.log("Loaded asset", asset, gm);
  console.log("Asset being added");
  window.alizarinAsset = asset;
  console.log("Asset added to window: window.alizarinAsset", window.alizarinAsset);

  const template = await fetchTemplate(publicView);
  console.log("Loaded template", template, publicView);

  console.log("Looping through descriptions");
  for (let description of [...await asset.asset.descriptions]) {
    console.log(description);
    const node = (await description.description_type).__parentPseudo.node;
    console.log(node);
    const data = (await description.description_type).__parentPseudo.tile.data;
    console.log(data);
  }
  console.log("Rendering asset");
  console.log(asset, template);
  const dialogs: {[key: string]: Dialog} = await renderAsset(asset, template);
  console.log("Dialogs:", dialogs);

  const swapLink: HTMLAnchorElement | null = document.querySelector("a#swap-link");
  console.log("Swap Link:", swapLink);
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
  console.log("URL Search Params", urlSearchParams);
  const geoBounds = urlSearchParams.get("geoBounds");
  const searchTerm = urlSearchParams.get("searchTerm");
  let backUrl = "/?";

  if (geoBounds && /^[-,\[\]_0-9a-f.]*$/i.exec(geoBounds)) {
    backUrl += `&geoBounds=${geoBounds}`;
  }

  if (searchTerm && /^[_0-9a-z ."'-]*$/i.exec(searchTerm)) {
    backUrl += `&searchTerm=${searchTerm}`;
  }
  console.log(backUrl, 'back', searchTerm);
  document.getElementById("back-link").href = backUrl;
  const archesRoot = document.getElementById("arches-link").getAttribute("data-arches-root");
  document.getElementById("arches-link").href = `${archesRoot}report/${asset.meta.resourceinstanceid}`;

  window.showDialog = (dialogId) => {
    const image = dialogs[dialogId];
    if (!image) {
      throw Error("Could not find dialog for image");
    }
    document.getElementById("asset-dialog__heading").innerHTML = image.title;
    document.getElementById("asset-dialog__content").innerHTML = image.body;
    document.getElementById("asset-dialog").showModal();
  };

  const legacyData = await asset.asset._legacy_record;
  console.log("Legacy data", legacyData);
  if (legacyData != false) {
    const legacyRecord = JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(legacyData)).map(([key, block]) => {
      let text;
      try {
        text = JSON.parse(block);
      } catch {
        text = block;
      }
      return [key, text];
    })), null, 2); // RMV
    console.log(legacyRecord);
    document.getElementById("legacy-record").innerText = legacyRecord;
  }
});
