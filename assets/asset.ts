import { marked } from 'marked';
import dompurify from 'dompurify';
import markedPlaintify from 'marked-plaintify'
import { Popup, Source, Marker, Map, IControl, NavigationControlOptions, NavigationControl } from 'maplibre-gl';
import * as Handlebars from 'handlebars';
import { AlizarinModel, client, RDM, graphManager, staticStore, staticTypes, utils, viewModels, renderers } from 'alizarin';
import { addMarkerImage } from './map-tools';
import { getNavigation, hasSearchContext, getAssetUrlWithContext, getSearchBreadcrumbs } from './searchContext';
import { updateBreadcrumbs } from './searchBreadcrumbs';
import { debug, debugError } from './debug';

viewModels.CUSTOM_DATATYPES.set("tm65centrepoint", "non-localized-string");

Handlebars.registerHelper("replace", (base, fm, to) => base ? base.replaceAll(fm, to) : base);
Handlebars.registerHelper("nl", (base, nl) => base ? base.replaceAll("\n", nl) : base);
Handlebars.registerHelper("plus", (a, b) => a + b);
Handlebars.registerHelper("default", function (a, b) { return a === undefined || a === null ? b : a; });
Handlebars.registerHelper("defaulty", function (a, b) { return a != undefined && a != null && a != false ? a : b; });
Handlebars.registerHelper("equal", function (a, b) { return a == b; });
Handlebars.registerHelper("or", function (a, b) { return a || b; });
Handlebars.registerHelper("join", function (...args) {
  if (args.length == 3 && Array.isArray(args[0])) {
    return args.join(args[1]);
  }
  return args.slice(0, args.length - 2).join(args[args.length - 2]);
});
Handlebars.registerHelper("and", function (a, b) { return a && b; });
Handlebars.registerHelper("not", function (a, b) { return a != b; });
Handlebars.registerHelper("in", function (a, b) { return Array.isArray(b) ? b.includes(a) : (a in b); });
Handlebars.registerHelper("nospace", function (a) { return a.replaceAll(" ", "%20") });
Handlebars.registerHelper("escapeExpression", function (a) { return Handlebars.Utils.escapeExpression(a); });
Handlebars.registerHelper("clean", function (a) {
  if (a instanceof renderers.Cleanable) {
    return a.__clean;
  }

  return a;
});
Handlebars.registerHelper("concat", function (...args) { return args.slice(0, args.length - 1).join(""); });
Handlebars.registerHelper("array", function (...args) { return args; });
Handlebars.registerHelper("dialogLink", function (options) { return new Handlebars.SafeString(`<button class="govuk-button dialog-link" data-dialog-id="${options.hash.id}">Show</button>`); });

const archesUrl = window.archesUrl;

const MODEL_FILES = {
  "076f9381-7b00-11e9-8d6b-80000b44d1d9": {
    graph: "Heritage Asset.json",
    template: '/templates/heritage-asset-public-hb.md'
  },
  "b9e0701e-5463-11e9-b5f5-000d3ab1e588": {
    graph: "Activity.json",
    template: '/templates/activity.md'
  },
  "49bac32e-5464-11e9-a6e2-000d3ab1e588": {
    graph: "Maritime Vessel.json",
    template: '/templates/maritime-vessel-public-hb.md'
  },
  "22477f01-1a44-11e9-b0a9-000d3ab1e588": {
    graph: "Person.json",
  },
  "3a6ce8b9-0357-4a72-b9a9-d8fdced04360": {
    graph: "Registry.json",
  }
};

async function initializeAlizarin() {
  const archesClient = new client.ArchesClientRemoteStatic('', {
    allGraphFile: (() => "definitions/graphs/_all.json"),
    graphToGraphFile: ((graph: staticTypes.StaticGraphMeta) => `definitions/graphs/resource_models/${graph.name.en}.json`),
    resourceIdToFile: ((resourceId) => `definitions/business_data/${resourceId}.json`),
    collectionIdToFile: ((collectionId) => `definitions/reference_data/collections/${collectionId}.json`)
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
    console.error("Bad slug"); // Keep this as a real error
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

class HeritageAsset extends AlizarinModel<HeritageAsset> { };

async function loadAsset(slug: string, graphManager): Promise<Asset> {
  const asset = await graphManager.getResource(slug, false);
  const meta = await getAssetMetadata(asset);
  return new Asset(asset, meta);
}

async function loadMaritimeAsset(slug: string, graphManager): Promise<Asset> {
  const MaritimeVessel = await graphManager.get("MaritimeVessel");
  const asset = (await MaritimeVessel.find(slug, false));
  const meta = await getAssetMetadata(asset);
  return new Asset(asset, meta);
}

async function fetchTemplate(asset: AlizarinModel) {
  const graphId = asset.__.wkrm.graphId;
  if (graphId in MODEL_FILES) {
    const templateFile = MODEL_FILES[graphId].template;
    if (templateFile) {
      const md = await fetch(templateFile);
      return Handlebars.compile(await md.text());
    }
  }
}

async function getAssetMetadata(asset) {
  let location = null;
  let geometry = null;
  if (await asset.__has('location_data') && await asset.location_data) {
    const locationData = await asset.location_data;
    if (await locationData.__has('statistical_output_areas') && await locationData.statistical_output_areas) {
      for await (const outputArea of await locationData.statistical_output_areas) {
        debug(outputArea);
      }
    }
    if (await locationData.geometry && await locationData.geometry.geospatial_coordinates) {
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
  }

  let title = await asset.$.getName(true);

  return {
    resourceinstanceid: `${await asset.id}`,
    geometry: geometry,
    location: location,
    title: title
  };
}

async function renderAssetForDebug(asset: Asset): Promise<{ [key: string]: Dialog }> {
  const alizarinRenderer = new renderers.FlatMarkdownRenderer({
    conceptValueToUrl: async (conceptValue: viewModels.ConceptValueViewModel) => {
      return null; // No URLs for now.
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
      return null; // No URLs for now.
      const value = await domainValue.getValue();
      return `${archesUrl}search?term-filter=` + encodeURI(`
        [{"context_label":"${domainValue.describeFieldGroup()}","nodegroupid":"${domainValue.__parentPseudo.node.nodegroup_id}","text":"${value.toString()}","type":"term","value":"${value.toString()}","inverted":false,"selected":true}]
      `.replace(/\n/g, ' '))
    },
    resourceReferenceToUrl: async (value: viewModels.ResourceInstanceViewModel) => null, // `${archesUrl}report/${await value.id}`
    nodeToUrl: (node: staticTypes.StaticNode) => `@${node.alias}`
  });
  let markdown = await alizarinRenderer.render(asset.asset);
  if (Array.isArray(markdown)) {
    markdown = markdown.join("\n\n");
  }

  const nodes = asset.asset.__.getNodeObjectsByAlias();

  // <pre>{{ js }}</pre>
  const renderer = {
    link(token) {
      if (token.href && token.href.startsWith("@")) {
        const alias = token.href.substr(1);
        const node = nodes.get(alias);
        return `
        <details class="govuk-details">
          <summary class="govuk-details__summary">
            <span class="govuk-details__summary-text">
              ${token.text}
            </span>
          </summary>
          <div class="govuk-details__text node-description">
            <strong>Alias: ${node.alias}<strong><br/>
            <strong>Type: ${node.datatype}<strong><br/>
            <p>Description: ${node.description}</p>
          </div>
        </details>
        `;
      }
      return `<a title="${token.title}" href="${token.href}">${token.text}</a>`;
    },
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
  return {};
}

async function renderAsset(asset: Asset, template): Promise<{ [key: string]: Dialog }> {
  const alizarinRenderer = new renderers.MarkdownRenderer({
    conceptValueToUrl: async (conceptValue: viewModels.ConceptValueViewModel) => {
      return null; // No URLs for now.
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
      return null; // No URLs for now.
      const value = await domainValue.getValue();
      return `${archesUrl}search?term-filter=` + encodeURI(`
        [{"context_label":"${domainValue.describeFieldGroup()}","nodegroupid":"${domainValue.__parentPseudo.node.nodegroup_id}","text":"${value.toString()}","type":"term","value":"${value.toString()}","inverted":false,"selected":true}]
      `.replace(/\n/g, ' '))
    },
    resourceReferenceToUrl: async (value: viewModels.ResourceInstanceViewModel) => null // `${archesUrl}report/${await value.id}`
  });
  const nonstaticAsset = await alizarinRenderer.render(asset.asset);
  const staticAsset = JSON.stringify(nonstaticAsset, null, 2);
  const images = [];
  const files = [];
  const ecrs = nonstaticAsset.external_cross_references;
  const otherEcrs = [];
  if (ecrs && ecrs.length) {
    for (const [n, ecr] of ecrs.entries()) {
      const type = ecr.external_cross_reference_notes && ecr.external_cross_reference_notes.external_cross_reference_description &&
        ecr.external_cross_reference_notes.external_cross_reference_description.toLowerCase();
      if (ecr.url && (type === 'image')) {
        images.push({
          image: ecr,
          index: n
        });
      } else if (ecr.url && (type === 'pdf' || type === 'doc' || type === 'docx')) {
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

  const nodes = asset.asset.__.getNodeObjectsByAlias();

  // <pre>{{ js }}</pre>
  const renderer = {
    link(token) {
      if (token.href && token.href.startsWith("@")) {
        const alias = token.href.substr(1);
        const node = nodes.get(alias);
        if (!node) {
          debugError(`${alias} not found in nodes`);
        }
        return `
        <details class="govuk-details">
          <summary class="govuk-details__summary">
            <span class="govuk-details__summary-text">
              ${token.text}
            </span>
          </summary>
          <div class="govuk-details__text">
            <p>${node.description || node.name}</p>
          </div>
        </details>
        `;
      }
      return `<a title="${token.title}" href="${token.href}">${token.text}</a>`;
    },
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
    dialogs[`image_${image.index}`] = new Dialog(
      `<h3>Image for ${asset.meta.title}</h3>\n<h4>${await image.image.external_cross_reference}</h4>`,
      `<img src='${image.image.url.__clean}' />`
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
      style: 'https://tiles.openfreemap.org/styles/bright',
      pitch: 20,
      bearing: 0,
      container: 'map',
      center: centre,
      zoom: zoom
    });
    window.map = map;
    map.on('load', async () => {
      await addMarkerImage(map);
      const source = map.addSource('assets', {
        type: 'geojson',
        data: asset.meta.geometry,
      });
      const sourceMarker = map.addSource('assets-marker', {
        type: 'geojson',
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            "type": "Point",
            "coordinates": asset.meta.location,
          }
        }
      });
      let paint: {
        'fill-color': string,
        'fill-opacity': number,
        'fill-outline-color'?: string | null
      } = {
        'fill-color': '#a88',
        'fill-opacity': 0.8,
      };
      if (asset.meta.geometry.type === "FeatureCollection" && asset.meta.geometry.features.length == 1) {
        const feature = asset.meta.geometry.features[0];
        if (feature.properties && feature.properties.type === 'Grid Square') {
          paint = {
            'fill-color': 'rgba(255, 255, 255, 0.1)',
            'fill-outline-color': '#aa4444',
            'fill-opacity': 0.4
          }
        }
      }
      map.addLayer({
        'id': '3d-buildings',
        'source': 'openmaptiles',
        'source-layer': 'building',
        'filter': [
          "!",
          ["to-boolean",
            ["get", "hide_3d"]
          ]
        ],
        'type': 'fill-extrusion',
        'minzoom': 13,
        'paint': {
          'fill-extrusion-color': 'lightgray',
          'fill-extrusion-opacity': 0.5,
          'fill-extrusion-height': [
            'interpolate',
            ['linear'],
            ['zoom'],
            13,
            0,
            16,
            ['get', 'render_height']
          ],
          'fill-extrusion-base': ['case',
            ['>=', ['get', 'zoom'], 16],
            ['get', 'render_min_height'], 0
          ]
        }
      });
      map.addLayer({
        'id': 'asset-boundaries',
        'type': 'fill',
        'source': 'assets',
        'paint': paint,
        'filter': ['==', '$type', 'Polygon']
      });
      map.addLayer({
        'id': 'assets-marker',
        'type': 'symbol',
        'source': 'assets-marker',
        'layout': {
          'icon-image': 'marker-new',
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
  let publicView = true;
  if (searchParams.publicView === false) {
    publicView = false;
  }
  const slug = searchParams.slug;

  debug("Displaying for public view (NB: full data loaded regardless!):", publicView);
  let asset: Asset;
  // TODO: switch to generic loading.
  const isMaritime: boolean = (slug.startsWith('MAR') || slug.startsWith('MAL'));

  if (isMaritime) {
    asset = await loadMaritimeAsset(slug, gm);
  } else {
    asset = await loadAsset(slug, gm);
  }
  debug("Loaded asset", asset);
  debug("Asset being added");
  window.alizarinAsset = asset;
  debug("Asset added to window: window.alizarinAsset", window.alizarinAsset);

  // Set up navigation buttons if we have search context
  // Add a slight delay to ensure localStorage is fully available
  setTimeout(() => {
    console.log('Setting up navigation with delay');
    setupAssetNavigation(slug);
  }, 500);

  if (await asset.asset.__has('record_and_registry_membership')) {
    document.getElementById('dfc-registry').innerHTML = "<ul>" + (await Promise.all((await asset.asset.record_and_registry_membership).map(async membership => {
      return `<li>${(await (await membership.record_or_registry).forJson()).meta.title}</li>`
    }))).join("\n") + "</ul>";
  } else {
    document.getElementById('dfc-registry').innerHTML = "<ul><li>" + asset.asset.__.wkrm.modelClassName + "</li></ul>";
  }

  const template = await fetchTemplate(asset.asset);
  debug("Loaded template", template, publicView, isMaritime);

  debug("Rendering asset");
  const dialogs: { [key: string]: Dialog } = publicView && template ? (
    await renderAsset(asset, template)
  ) : (
    await renderAssetForDebug(asset)
  );
  debug("Dialogs:", dialogs);

  const swapLink: HTMLAnchorElement | null = document.querySelector("a#swap-link");
  debug("Swap Link:", swapLink);
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
  debug("URL Search Params", urlSearchParams);
  const geoBounds = urlSearchParams.get("geoBounds");
  const searchTerm = urlSearchParams.get("searchTerm");
  const searchFilters = urlSearchParams.get("searchFilters");
  let backUrl = "/?";

  if (geoBounds && /^[-,\[\]_0-9a-f.]*$/i.exec(geoBounds)) {
    backUrl += `&geoBounds=${geoBounds}`;
  }

  if (searchTerm && searchTerm != 'null' && /^[_0-9a-z ."'-:]*$/i.exec(searchTerm)) {
    backUrl += `&searchTerm=${searchTerm}`;
  }

  if (searchFilters && searchFilters != '{}' && /^[_0-9a-z ."'-:]*$/i.exec(searchTerm)) {
    backUrl += `&searchFilters=${searchFilters}`;
  }

  // const archesRoot = document.getElementById("arches-link").getAttribute("data-arches-root");
  // document.getElementById("arches-link").href = `${archesRoot}report/${asset.meta.resourceinstanceid}`;
  document.getElementById("asset-title").innerText = `${asset.meta.title}`;

  /**
   * Setup navigation elements based on search context
   */
  function setupAssetNavigation(currentId: string): void {
    debug("Setting up asset navigation for:", currentId);
    
    // Setup breadcrumbs
    setupBreadcrumbs();
    
    if (hasSearchContext()) {
      debug("Search context found");
      const { prev, next, position, total } = getNavigation(currentId);
      debug("Navigation:", { prev, next, position, total });

      // Set up both top and bottom navigation sections
      const navigationSections = [
        {
          prev: document.getElementById('prev-asset-top') as HTMLAnchorElement,
          next: document.getElementById('next-asset-top') as HTMLAnchorElement,
          counter: document.getElementById('position-counter-top'),
          location: 'top'
        },
        {
          prev: document.getElementById('prev-asset-bottom') as HTMLAnchorElement,
          next: document.getElementById('next-asset-bottom') as HTMLAnchorElement,
          counter: document.getElementById('position-counter-bottom'),
          location: 'bottom'
        }
      ];

      // Configure each navigation section
      navigationSections.forEach(section => {
        const { prev: prevButton, next: nextButton, counter, location } = section;
        
        // Set position counter if available
        if (counter && position && total) {
          counter.innerHTML = `Result ${position} of ${total}`;
          counter.style.display = 'block';
        } else if (counter) {
          counter.style.display = 'none';
        }
        
        if (prevButton && nextButton) {
          debug(`Setting up ${location} navigation buttons`);
          
          if (prev) {
            prevButton.href = getAssetUrlWithContext(prev);
            prevButton.style.display = 'inline-block';
            debug(`Showing ${location} prev button to:`, prev);
          } else {
            prevButton.style.display = 'none';
            debug(`Hiding ${location} prev button`);
          }

          if (next) {
            nextButton.href = getAssetUrlWithContext(next);
            nextButton.style.display = 'inline-block';
            debug(`Showing ${location} next button to:`, next);
          } else {
            nextButton.style.display = 'none';
            debug(`Hiding ${location} next button`);
          }
        } else {
          debug(`Navigation buttons for ${location} not found in DOM`);
        }
      });
    } else {
      debug("No search context available");
      // Hide counters if no context
      document.getElementById('position-counter-top').style.display = 'none';
      document.getElementById('position-counter-bottom').style.display = 'none';
    }
  };
  
  /**
   * Setup breadcrumb information from search context
   */
  function setupBreadcrumbs(): void {
    const breadcrumbs = getSearchBreadcrumbs();
    updateBreadcrumbs(
      breadcrumbs.searchTerm,
      breadcrumbs.filters,
      breadcrumbs.geoBounds
    );
  };

  window.showDialog = (dialogId) => {
    const image = dialogs[dialogId];
    if (!image) {
      throw Error("Could not find dialog for image");
    }
    document.getElementById("map-dialog__heading").innerHTML = image.title;
    document.getElementById("map-dialog__content").innerHTML = image.body;
    document.getElementById("map-dialog").showModal();
  };

  let legacyRecord: null | any[] = null;
  if (!publicView && (await asset.asset.__has('_legacy_record'))) {
    let legacyData = await asset.asset._legacy_record;
    if (legacyData != false) {
      if (!Array.isArray(legacyData)) {
        legacyData = [legacyData];
      }
      legacyRecord = [];
      for (let record of legacyData) {
        const dataString = await record;
        legacyRecord.push(
          Object.fromEntries(Object.entries(JSON.parse(dataString)).map(([key, block]) => {
            let text;
            try {
              text = JSON.parse(block);
            } catch {
              text = block;
            }
            return [key, text];
          }))
        ); // RMV
      }
      document.getElementById("legacy-record").innerText = JSON.stringify(legacyRecord, null, 2);
    }
  }

  if (legacyRecord === null) {
    document.getElementById("legacy-record-container").style.display = 'none';
  }

  document.getElementById("demo-warning").style.display = 'block';
  if (Array.isArray(asset.asset.$.scopes) && asset.asset.$.scopes.includes('public') && publicView && !legacyRecord) {
    document.getElementById("demo-warning").style.display = 'none';
  }

  document.querySelectorAll('time').forEach(elt => {
    const date = new Date(elt.dateTime);
    elt.innerHTML = date.toLocaleDateString();
  });
  history.pushState({}, "", `?slug=${slug}&full=${!publicView}`);
});
