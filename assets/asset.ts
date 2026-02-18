import { marked, Token, Tokens } from 'marked';
import * as params from '@params';
import * as Handlebars from 'handlebars';
import { Map as MLMap } from 'maplibre-gl';
import { AlizarinModel, client, RDM, graphManager, staticStore, staticTypes, viewModels, renderers, wasmReady, slugify } from 'alizarin/inline';
// import { AlizarinModel, client, RDM, graphManager, staticStore, staticTypes, viewModels, renderers, wasmReady, slugify, setWasmURL } from 'alizarin';
// setWasmURL('/wasm/alizarin_bg.wasm');
import '@alizarin/filelist'; // Registers file-list type (images)
import '@alizarin/clm'; // Registers reference type
import { addMarkerImage } from 'map-tools';
import {
  getNavigation,
  hasSearchContext,
  getAssetUrlWithContext,
  getSearchParams as getSearchContextParams,
  updateBreadcrumbs,
  makeSearchQuery
} from './searchContext';
import { debug, debugError } from './debug';
import { IAssetManager, AssetMetadata, resolveAssetManagerWith } from './managers';
import { loadTemplate, getPrecompiledTemplate } from 'handlebar-utils';
import { initSwiper, ImageInput, ImageSet } from 'swiper';
import { markdownToPdf, PdfImage } from 'pdf-make';

// Types and interfaces
interface AssetUrlParams {
  slug: string;
  publicView: boolean;
}

interface Asset {
  asset: AlizarinModel<any>;
  meta: AssetMetadata;
}

interface Dialog {
  title: string;
  body: string;
}

interface ModelFileConfig {
  graph: string;
  template?: string;
}

// Configuration
const MODEL_FILES: Record<string, ModelFileConfig> = {
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

declare global {
  interface Window {
    archesUrl?: string;
    alizarinAsset?: Asset;
    showDialog?: (dialogId: string) => void;
  }
}

// Alizarin-specific setup (Handlebars helpers are registered in static/js/handlebars-helpers.js)
function initializeAlizarinConfig(): void {
  viewModels.CUSTOM_DATATYPES.set("tm65centrepoint", "non-localized-string");
}

// URL parameter parsing (distinct from search context params)
function parseAssetUrlParams(): AssetUrlParams {
  const urlParams = new URLSearchParams(window.location.search);
  const slug = urlParams.get("slug");

  if (!slug || slug !== slugify(slug)) {
    console.error("Bad slug");
  }

  return {
    slug: slug || '',
    publicView: urlParams.get("full") !== "true"
  };
}

// Alizarin initialization
async function initializeAlizarin(): Promise<typeof graphManager> {
  await wasmReady;

  const archesClient = new client.ArchesClientRemoteStatic('', {
    allGraphFile: () => "definitions/graphs/_all.json",
    graphToGraphFile: (graph: staticTypes.StaticGraphMeta) =>
      `definitions/graphs/resource_models/${graph.name.toString()}.json`,
    resourceIdToFile: (resourceId: string) =>
      `definitions/business_data/${resourceId}.json`,
    collectionIdToFile: (collectionId: string) =>
      `definitions/reference_data/collections/${collectionId}.json`
  });

  graphManager.archesClient = archesClient;
  staticStore.archesClient = archesClient;
  RDM.archesClient = archesClient;

  await graphManager.initialize({ graphs: null, defaultAllowAllNodegroups: true });
  return graphManager;
}

// Asset loading
async function loadAsset(slug: string, gm: typeof graphManager): Promise<Asset> {
  const asset = await gm.getResource(slug, false);
  debug('Loaded asset from graph manager');
  const meta = await getAssetMetadata(asset);
  return { asset, meta };
}

async function loadMaritimeAsset(slug: string, gm: typeof graphManager): Promise<Asset> {
  const MaritimeVessel = await gm.get("MaritimeVessel");
  const asset = await MaritimeVessel.find(slug, false);
  const meta = await getAssetMetadata(asset);
  return { asset, meta };
}

async function fetchTemplate(asset: AlizarinModel<any>): Promise<HandlebarsTemplateDelegate | undefined> {
  const graphId = asset.__.wkrm.graphId;
  const config = MODEL_FILES[graphId];
  if (config?.template) {
    // Use precompiled template if available
    try {
      return getPrecompiledTemplate(config.template);
    } catch (e) {
      console.warn(`Precompiled template not found for ${config.template}, falling back to runtime compilation`);
      const response = await fetch(config.template);
      return Handlebars.compile(await response.text());
    }
  }
}

async function getAssetMetadata(asset: AlizarinModel<any>): Promise<AssetMetadata> {
  let location: [number, number] | null = null;
  let geometry: any = null;

  if (await asset.__has('location_data') && await asset.location_data) {
    const locationData = await asset.location_data;

    if (await locationData.geometry[0] && await locationData.geometry[0].geospatial_coordinates) {
      geometry = await (await asset.location_data.geometry[0].geospatial_coordinates).forJson();
      location = extractCentrePoint(geometry);
    }

    const lastGeometry = (await locationData.geometry).length - 1; // Will be the polygon, if one.
    if (await locationData.geometry[lastGeometry] && await locationData.geometry[lastGeometry].geospatial_coordinates) {
      geometry = await (await asset.location_data.geometry[lastGeometry].geospatial_coordinates).forJson();
    }
  }

  return {
    resourceinstanceid: `${await asset.id}`,
    geometry,
    location,
    title: await asset.$.getName()
  };
}

function extractCentrePoint(geometry: any): [number, number] | null {
  if (!geometry?.features?.[0]?.geometry?.coordinates) {
    return null;
  }

  const coordinates = geometry.features[0].geometry.coordinates;

  // If it's already a point, return coordinates directly
  if (!Array.isArray(coordinates[0])) {
    return coordinates as [number, number];
  }

  // Handle polygon - calculate centroid
  let polygons = coordinates[0];
  if (Array.isArray(polygons[0]?.[0])) {
    polygons = polygons.flat();
  }

  const centre = polygons.reduce(
    (c: [number, number], p: [number, number]) => {
      c[0] += p[0] / polygons.length;
      c[1] += p[1] / polygons.length;
      return c;
    },
    [0, 0] as [number, number]
  );

  return centre;
}

// Shared renderer options (URLs disabled for now)
const RENDERER_OPTIONS = {
  conceptValueToUrl: async () => null,
  domainValueToUrl: async () => null,
  resourceReferenceToUrl: async () => null
};

// Create GOV.UK-styled marked renderer
// Note: Using explicit `this` typing for table method to access parser
function createGovukMarkedRenderer(
  nodes: Map<string, any>,
  options: { showNodeDetails?: boolean } = {}
) {
  return {
    link(token: { href?: string; title?: string; text: string }) {
      if (token.href?.startsWith("@")) {
        const alias = token.href.substring(1);
        const node = nodes.get(alias);

        if (!node) {
          debugError(`${alias} not found in nodes`);
          return `<span>${token.text}</span>`;
        }

        const detailsContent = options.showNodeDetails
          ? `<strong>Alias: ${node.alias}</strong><br/>
             <strong>Type: ${node.datatype}</strong><br/>
             <p>Description: ${node.description}</p>`
          : `<p>${node.description || node.name}</p>`;

        return `
          <details class="govuk-details">
            <summary class="govuk-details__summary">
              <span class="govuk-details__summary-text">${token.text}</span>
            </summary>
            <div class="govuk-details__text${options.showNodeDetails ? ' node-description' : ''}">
              ${detailsContent}
            </div>
          </details>
        `;
      }
      return `<a title="${token.title || ''}" href="${token.href}">${token.text}</a>`;
    },

    hr() {
      return '<hr class="govuk-section-break govuk-section-break--visible">';
    },

    table(this: { parser: { parseInline: (tokens: any[]) => string } }, token: { header: any[]; rows: any[][] }) {
      const headers = token.header
        .map((header: { tokens: any[] }) =>
          `<th scope="col" class="govuk-table__header">${this.parser.parseInline(header.tokens)}</th>`
        )
        .join('\n');

      const rows = token.rows
        .map((row: { tokens: any[] }[]) => {
          const cells = row
            .map((col: { tokens: any[] }) =>
              `<td class="govuk-table__cell">${this.parser.parseInline(col.tokens)}</td>`
            )
            .join('\n');
          return `<tr class="govuk-table__row">${cells}</tr>`;
        })
        .join('\n');

      return `
        <table class="govuk-table">
          <thead class="govuk-table__head">
            <tr class="govuk-table__row">${headers}</tr>
          </thead>
          <tbody class="govuk-table__body">${rows}</tbody>
        </table>
      `;
    }
  };
}

// Return type for sectioned HTML output
interface SectionedHtml {
  [sectionId: string]: string;
}

async function renderToHtml(markdown: string, nodes: Map<string, any>, showNodeDetails = false): Promise<SectionedHtml> {
  const nodeTemplate = await loadTemplate('/templates/asset-nodegroup-template.html', true) as HandlebarsTemplateDelegate;

  // Custom token type for nodeBlock
  interface NodeBlockField {
    alias: string;      // The node alias (from @alias)
    label: string;      // Display label
    value: string;      // The value after the colon
    slug?: string;      // The url slug for the related resource
    node?: any;         // Looked up node data
  }

  interface NodeBlockToken {
    type: 'nodeBlock';
    raw: string;
    title: string;
    icon?: string;
    body: string;
    fields: NodeBlockField[];
    tokens: Token[];
    initiallyCollapsed: boolean;
    sectionId?: string;
  }

  interface SectionToken {
    type: 'section';
    raw: string;
    sectionId: string;
    tokens: Token[];
  }

  // Track sections and their content
  const sections: SectionedHtml = {};
  let currentSectionId: string = 'default';
  sections[currentSectionId] = '';

  // Register extensions for sections and nodeBlocks
  marked.use({
    extensions: [
      {
        name: 'section',
        level: 'block',
        start(src: string) {
          return src.match(/^<!--section:/)?.index;
        },
        tokenizer(this: any, src: string): SectionToken | undefined {
          // Match <!--section:id--> followed by content until next section or end
          const match = src.match(/^<!--section:([\w-]+)-->\n?([\s\S]*?)(?=<!--section:|\s*$)/);
          if (match) {
            const sectionId = match[1];
            const content = match[2];

            currentSectionId = sectionId;

            const token: SectionToken = {
              type: 'section',
              raw: match[0],
              sectionId: sectionId,
              tokens: []
            };

            // Tokenize the inner content
            this.lexer.blockTokens(content, token.tokens);

            return token;
          }
        },
        renderer(this: any, token: SectionToken) {
          const innerHtml = this.parser.parse(token.tokens);
          // Store in sections map and return with marker for later extraction
          return `<!--section:${token.sectionId}-->${innerHtml}`;
        }
      },
      // NodeBlock extension
      {
        name: 'nodeBlock',
        level: 'block',
        start(src: string) {
          return src.match(/^::/)?.index;
        },
        tokenizer(src: string): NodeBlockToken | undefined {
          // Match ::Title{icon}::\n...content...\n::end:: (icon is optional)
          const match = src.match(/^::([^:{]+)(?:\{([^}]+)\})?::\n([\s\S]*?)::end::/);
          if (match) {
            const title = match[1].trim();
            const icon = match[2]?.trim();
            let body = match[3].trim();
            const id = `${slugify(title)}-${currentSectionId}`;
            let initiallyCollapsed = params.node_config?.collapsednodes?.includes(id);

            // Parse fields - capture multi-line values until next [field] or end
            // Use multiline mode with ^ to only match [label] at start of line
            const fields: NodeBlockField[] = [];
            const fieldPattern = /^\[([^\]]+)\]\s+([\s\S]*?)(?=\n\[|$)/gm;
            let fieldMatch: RegExpExecArray | null;

            while ((fieldMatch = fieldPattern.exec(body)) !== null) {
              const label = fieldMatch[1].trim();
              const value = fieldMatch[2].trim();

              // Check if it's a node reference (starts with @)
              const isNodeRef = label.startsWith('@');
              const alias = isNodeRef ? label.substring(1) : null;
              const node = alias ? nodes.get(alias) : null;

              // Extract data-id from alizarin-resource-instance spans to build slug
              const dataIdMatch = value.match(/data-id=['"]([^'"]+)['"]/);
              const resourceId = dataIdMatch ? dataIdMatch[1] : null;
              const slug = resourceId ? `?slug=${resourceId}` : null

              fields.push({
                alias: alias || '',
                label: isNodeRef ? (node?.name || alias) : label,
                value,
                slug,
                node
              });
            }

            if (!body) {
              body = '<p><strong>No data available</strong></p>';
            }

            const token: NodeBlockToken = {
              type: 'nodeBlock',
              raw: match[0],
              title,
              icon,
              body,
              fields,
              tokens: [],
              initiallyCollapsed,
              sectionId: currentSectionId
            };

            return token;
          }
        },
        renderer(token) {
          const nodeToken = token as NodeBlockToken;
          const titleId = slugify(nodeToken.title);
          const sectionId = nodeToken.sectionId || 'default';
          const id = `${titleId}-${sectionId}`;

          return nodeTemplate({
            title: nodeToken.title,
            icon: nodeToken.icon,
            fields: nodeToken.fields,
            body: nodeToken.body,
            id: id,
            initiallyExpanded: !nodeToken.initiallyCollapsed,
            sectionId: sectionId
          });
        }
      }
    ]
  });

  const renderer = createGovukMarkedRenderer(nodes, { showNodeDetails }) as Parameters<typeof marked.use>[0]['renderer'];
  marked.use({ renderer });

  const parsed = await marked.parse(markdown);

  // Split the parsed output by section markers and collect into sections object
  const sectionPattern = /<!--section:([\w-]+)-->/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let activeSectionId = 'default';

  while ((match = sectionPattern.exec(parsed)) !== null) {
    // Add content before this marker to the active section
    const content = parsed.slice(lastIndex, match.index);
    if (content.trim()) {
      sections[activeSectionId] = (sections[activeSectionId] || '') + content;
    }
    // Switch to new section
    activeSectionId = match[1];
    if (!sections[activeSectionId]) {
      sections[activeSectionId] = '';
    }
    lastIndex = match.index + match[0].length;
  }

  // Add remaining content to the last active section
  const remainingContent = parsed.slice(lastIndex);
  if (remainingContent.trim()) {
    sections[activeSectionId] = (sections[activeSectionId] || '') + remainingContent;
  }

  // Remove empty default section if other sections exist
  if (sections['default']?.trim() === '' && Object.keys(sections).length > 1) {
    delete sections['default'];
  }

  return sections;
}

// Helper to inject sectioned HTML into the DOM
function injectSections(sections: SectionedHtml): void {
  console.log("Injecting Section")
  for (const [sectionId, html] of Object.entries(sections)) {
    const element = document.getElementById(sectionId);
    if (element) {
      element.innerHTML = html;
    } else {
      console.log("Fallback section injection for", sectionId);
      // Fallback: if no matching element, append to 'asset' element
      const assetElement = document.getElementById('asset');
      if (assetElement) {
        assetElement.innerHTML += html;
      }
    }
  }
}

// Rendering functions
async function renderAssetForDebug(asset: Asset): Promise<Record<string, Dialog>> {
  const alizarinRenderer = new renderers.FlatMarkdownRenderer({
    ...RENDERER_OPTIONS,
    nodeToUrl: (node: staticTypes.StaticNode) => `@${node.alias}`
  });

  let markdown = await alizarinRenderer.render(asset.asset);
  if (Array.isArray(markdown)) {
    markdown = markdown.join("\n\n");
  }

  const nodes = asset.asset.__.getNodeObjectsByAlias();
  const sections = await renderToHtml(markdown, nodes, true);

  injectSections(sections);

  return {};
}

interface ImageRef {
  image: any;
  index: number;
}

async function fetchImageAsDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

async function ensurePdfMake(): Promise<typeof import('pdfmake/build/pdfmake')['default']> {
  if (!(window as any).pdfMake) {
    await loadScript('/js/pdfmake.min.js');
    await loadScript('/js/vfs_fonts.js');
  }
  return (window as any).pdfMake;
}

async function renderPDFAsset(markdown: string, nodes: Map<string, any>, title: string, assetImages: ImageInput[]) {
  const [pdfMake, pdfImages] = await Promise.all([
    ensurePdfMake(),
    Promise.all(
      assetImages.map(async (img) => {
        try {
          const dataUrl = await fetchImageAsDataUrl(img.previewUrl || img.originalUrl);
          return { dataUrl, alt: img.alt, name: img.name } as PdfImage;
        } catch {
          return null;
        }
      })
    ).then(imgs => imgs.filter((img): img is PdfImage => img !== null)),
  ]);

  const pdf = await markdownToPdf(markdown, nodes, title, pdfImages);
  pdfMake.createPdf(pdf).download(`${title}.pdf`);
}

async function extractImageList(imageList: any[]): Promise<ImageInput[]> {
  const images: ImageInput[] = [];
  console.log("IMAGELIST", imageList, !imageList || imageList.length === 0);
  if (!imageList || imageList.length === 0) return [];

  await Promise.all(imageList.map(async (imageList) => {
    const image = imageList[0];

    if (!image) {
      console.warn("Missing image", imageList);
      return;
    }

    images.push({
      name: await image.name,
      previewUrl: (await imageList._.preview[0]?.url) ?? (await image.url),
      originalUrl: await image.url,
      alt: (await image._file && await image._file.alt_text) || (await image.name),
      caption: (await imageList._.captions.caption) 
    });
  }));

  return images;
}

async function renderAsset(asset: Asset, template: HandlebarsTemplateDelegate): Promise<Record<string, Dialog>> {
  const alizarinRenderer = new renderers.MarkdownRenderer(RENDERER_OPTIONS);
  const nonstaticAsset = await alizarinRenderer.render(asset.asset);
  debug('Rendered non-static asset');
  const { images, files, otherEcrs } = categorizeExternalReferences(nonstaticAsset);
  const markdown = template(
    {
      meta: asset.meta,
      title: asset.meta.title,
      ha: nonstaticAsset,
      js: JSON.stringify(nonstaticAsset, null, 2),
      images,
      files,
      ecrs: otherEcrs
    },
    {
      allowProtoPropertiesByDefault: true,
      allowProtoMethodsByDefault: true
    }
  );

  const nodes = asset.asset.__.getNodeObjectsByAlias();

  const sections = await renderToHtml(markdown, nodes, false);

  let imageArray = (await Promise.all(((await asset.asset.images) || []).map(async (i) => {
    if (!i || !i[0] || !(await i[0])) {
      return null;
    }
    const isPublic = (await i._.visibility).includes("Public");
    const webOrder = await i[0]._file && Number.isInteger(await i[0]._file.index);
    return isPublic && webOrder ? i : null;
  }))).filter(a => a !== null).sort((a: Object, b: Object) => a[0]._file.index - b[0]._file.index);

  const assetImages = await extractImageList(imageArray);

  initSwiper(assetImages, 'media/images')

  injectSections(sections);

  const downloadPdfButton = document.getElementById('asset-download');
  if (downloadPdfButton) {
    downloadPdfButton.addEventListener('click', (e) => {
      e.preventDefault();
      const link = downloadPdfButton as HTMLAnchorElement;
      const spinner = document.getElementById('asset-download-spinner');

      // Disable link and hide its children
      link.classList.add('disabled');
      link.setAttribute('aria-disabled', 'true');
      link.querySelectorAll<HTMLSpanElement>('span').forEach(s => s.hidden = true);
      spinner?.removeAttribute('hidden');

      renderPDFAsset(markdown, nodes, asset.meta.title, assetImages).finally(() => {
        // Re-enable link and restore children
        link.classList.remove('disabled');
        link.removeAttribute('aria-disabled');
        link.querySelectorAll<HTMLSpanElement>('span').forEach(s => s.hidden = false);
        spinner?.setAttribute('hidden', 'true');
      });
    });
  }
  console.log("!!!")
  addAssetToMap(asset);
  console.log("!!!2")
  setupDialogLinks();
  console.log("!!!3")
  
  return buildImageDialogs(images, asset.meta.title);
}

function categorizeExternalReferences(nonstaticAsset: any): {
  images: ImageRef[];
  files: any[];
  otherEcrs: any[];
} {
  const images: ImageRef[] = [];
  const files: any[] = [];
  const otherEcrs: any[] = [];

  const ecrs = nonstaticAsset.external_cross_references;
  if (!ecrs?.length) {
    return { images, files, otherEcrs };
  }

  ecrs.forEach((ecr: any, index: number) => {
    const type = ecr.external_cross_reference_notes?.external_cross_reference_description?.toLowerCase();

    if (ecr.url && type === 'image') {
      images.push({ image: ecr, index });
    } else if (ecr.url && ['pdf', 'doc', 'docx'].includes(type)) {
      files.push(ecr);
    } else {
      otherEcrs.push(ecr);
    }
  });

  return { images, files, otherEcrs };
}

function setupDialogLinks(): void {
  const dialogLinks = document.getElementsByClassName("dialog-link");
  for (const link of dialogLinks) {
    link.addEventListener("click", function(this: HTMLElement) {
      const dialogId = this.getAttribute("data-dialog-id");
      if (dialogId) {
        window.showDialog?.(dialogId);
      }
    });
  }
}

async function buildImageDialogs(images: ImageRef[], assetTitle: string): Promise<Record<string, Dialog>> {
  const dialogs: Record<string, Dialog> = {};

  for (const { image, index } of images) {
    dialogs[`image_${index}`] = {
      title: `<h3>Image for ${assetTitle}</h3>\n<h4>${await image.external_cross_reference}</h4>`,
      body: `<img src='${image.url.__clean}' />`
    };
  }

  return dialogs;
}

function addAssetToMap(asset: Asset) {
  const location = asset.meta.location;
  if (location) {
    const centre = location;
    const zoom = 16;
    const map = new MLMap({
      style: 'https://tiles.openfreemap.org/styles/bright',
      pitch: 20,
      bearing: 0,
      container: 'map',
      center: centre,
      zoom: zoom
    });
    map.on('load', async () => {
      await addMarkerImage(map as any);
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

// Asset page manager
class AssetManager implements IAssetManager {
  private graphManager: typeof graphManager | null = null;
  private asset: Asset | null = null;
  private dialogs: Record<string, Dialog> = {};

  async initialize(): Promise<void> {
    initializeAlizarinConfig();
    this.graphManager = await initializeAlizarin();
    debug("Alizarin initialized");
  }

  async loadAssetFromUrl(): Promise<Asset> {
    const { slug, publicView } = parseAssetUrlParams();
    debug("Loading asset:", slug, "publicView:", publicView);

    if (!this.graphManager) {
      throw new Error("AssetManager not initialized");
    }

    const isMaritime = slug.startsWith('MAR') || slug.startsWith('MAL');
    this.asset = isMaritime
      ? await loadMaritimeAsset(slug, this.graphManager)
      : await loadAsset(slug, this.graphManager);

    window.alizarinAsset = this.asset;
    debug("Asset loaded and attached to window.alizarinAsset");

    return this.asset;
  }

  async render(publicView: boolean): Promise<void> {
    if (!this.asset) {
      throw new Error("No asset loaded");
    }

    const template = await fetchTemplate(this.asset.asset);

    this.dialogs = (publicView && template)
      ? await renderAsset(this.asset, template)
      : await renderAssetForDebug(this.asset);

    this.setupShowDialog();
    debug("Dialogs configured:", Object.keys(this.dialogs));
  }

  private setupShowDialog(): void {
    window.showDialog = (dialogId: string) => {
      const dialog = this.dialogs[dialogId];
      if (!dialog) {
        throw new Error(`Could not find dialog: ${dialogId}`);
      }

      const headingEl = document.getElementById("map-dialog__heading");
      const contentEl = document.getElementById("map-dialog__content");
      const dialogEl = document.getElementById("map-dialog") as HTMLDialogElement | null;

      if (headingEl) headingEl.innerHTML = dialog.title;
      if (contentEl) contentEl.innerHTML = dialog.body;
      dialogEl?.showModal();
    };
  }

  getAsset(): Asset | null {
    return this.asset;
  }
}

// Navigation setup
async function setupAssetNavigation(currentId: string): Promise<void> {
  debug("Setting up asset navigation for:", currentId);

  const searchParams = await getSearchContextParams();
  updateBreadcrumbs(searchParams);

  if (!await hasSearchContext()) {
    debug("No search context available");
    hideNavigationCounters();
    return;
  }

  debug("Search context found");
  const { prev, next, position, total } = await getNavigation(currentId);
  debug("Navigation:", { prev, next, position, total });

  const sections = [
    { location: 'top', prevId: 'prev-asset-top', nextId: 'next-asset-top', counterId: 'position-counter-top' },
    { location: 'bottom', prevId: 'prev-asset-bottom', nextId: 'next-asset-bottom', counterId: 'position-counter-bottom' }
  ];

  for (const section of sections) {
    const prevButton = document.getElementById(section.prevId) as HTMLAnchorElement | null;
    const nextButton = document.getElementById(section.nextId) as HTMLAnchorElement | null;
    const counter = document.getElementById(section.counterId);

    if (counter) {
      if (position && total) {
        counter.innerHTML = `Result ${position} of ${total}`;
        counter.classList.remove('js-hidden');
      } else {
        counter.classList.add('js-hidden');
      }
    }

    if (prevButton) {
      if (prev) {
        prevButton.href = await getAssetUrlWithContext(prev);
        prevButton.classList.remove('js-hidden');
      } else {
        prevButton.classList.add('js-hidden');
      }
    }

    if (nextButton) {
      if (next) {
        nextButton.href = await getAssetUrlWithContext(next);
        nextButton.classList.remove('js-hidden');
      } else {
        nextButton.classList.add('js-hidden');
      }
    }
  }
}

function hideNavigationCounters(): void {
  const topCounter = document.getElementById('position-counter-top');
  const bottomCounter = document.getElementById('position-counter-bottom');
  if (topCounter) topCounter.classList.add('js-hidden');
  if (bottomCounter) bottomCounter.classList.add('js-hidden');
}

// UI setup functions
function setupSwapLink(slug: string, publicView: boolean): void {
  const swapLink = document.querySelector<HTMLAnchorElement>("a#swap-link");
  if (swapLink) {
    swapLink.href = `?slug=${slug}&full=${publicView}`;
    swapLink.innerHTML = publicView ? "visit full view" : "visit public view";
  }
}

async function setupBackLinks(currentSlug: string): Promise<void> {
  // Add search params from sessionStorage to back link URLs to restore search context
  // The lastViewedAsset in sessionStorage handles the focus/scroll behavior separately
  const searchParams = await getSearchContextParams();
  const backLinks = document.querySelectorAll<HTMLAnchorElement>('a.back-link')
  for (const elt of Array.from(backLinks)) {
    const basePath = new URL(elt.href, window.location.origin).pathname;
    const url = await makeSearchQuery(basePath, searchParams);
    elt.href = url;
  }
}

function setupAssetTitle(title: string): void {
  const titleEl = document.getElementById("asset-title");
  if (titleEl) {
    titleEl.innerText = title;
  }
}

async function setupRegistryInfo(asset: Asset): Promise<void> {
  const dfcRegistryElement = document.getElementById('dfc-registry');
  if (!dfcRegistryElement) return;

  if (await asset.asset.__has('record_and_registry_membership')) {
    const memberships = await asset.asset.record_and_registry_membership;
    const items = await Promise.all(
      memberships.map(async (membership: any) => {
        const registry = await membership.record_or_registry;
        const json = await registry.forJson();
        return `<li>${json.meta.title}</li>`;
      })
    );
    dfcRegistryElement.innerHTML = `<ul>${items.join("\n")}</ul>`;
  } else {
    dfcRegistryElement.innerHTML = `<ul><li>${asset.asset.__.wkrm.modelClassName}</li></ul>`;
  }
}

async function setupLegacyRecord(asset: Asset, publicView: boolean): Promise<any[] | null> {
  if (publicView || !(await asset.asset.__has('_legacy_record'))) {
    const container = document.getElementById("legacy-record-container");
    if (container) container.classList.add('js-hidden');
    return null;
  }

  let legacyData = await asset.asset._legacy_record;
  if (legacyData === false) {
    const container = document.getElementById("legacy-record-container");
    if (container) container.classList.add('js-hidden');
    return null;
  }

  if (!Array.isArray(legacyData)) {
    legacyData = [legacyData];
  }

  const legacyRecord: any[] = [];
  for (const record of legacyData) {
    const dataString = await record;
    const parsed = JSON.parse(dataString);
    legacyRecord.push(
      Object.fromEntries(
        Object.entries(parsed).map(([key, block]) => {
          try {
            return [key, JSON.parse(block as string)];
          } catch {
            return [key, block];
          }
        })
      )
    );
  }

  const legacyEl = document.getElementById("legacy-record");
  if (legacyEl) {
    legacyEl.innerText = JSON.stringify(legacyRecord, null, 2);
  }

  return legacyRecord;
}

function setupDemoWarning(asset: Asset, publicView: boolean, hasLegacyRecord: boolean): void {
  const warningEl = document.getElementById("demo-warning");
  if (!warningEl) return;

  const isPublicScope = Array.isArray(asset.asset.$.scopes) && asset.asset.$.scopes.includes('public');
  warningEl.classList.toggle('js-hidden', isPublicScope && publicView && !hasLegacyRecord);
}

function formatTimeElements(): void {
  document.querySelectorAll<HTMLTimeElement>('time').forEach(elt => {
    const date = new Date(elt.dateTime);
    elt.innerHTML = date.toLocaleDateString();
  });
}

// Main entry point
window.addEventListener('DOMContentLoaded', async () => {
  console.log("ASSET PAGE LOADING");
  
  const assetManagerInstance = new AssetManager();

  await assetManagerInstance.initialize();
  resolveAssetManagerWith(assetManagerInstance);

  const { slug, publicView } = parseAssetUrlParams();
  const asset = await assetManagerInstance.loadAssetFromUrl();
  console.log("Asset meta:", asset.meta);

  // Run UI setup tasks concurrently where possible
  await Promise.all([
    assetManagerInstance.render(publicView),
    // setupRegistryInfo(asset),
    // setupBackLinks(slug)
  ]);
  console.log("HERE 2")
  //TO REMOVE Hardcoded check for Fort Lytton to display 3D asset
  if (asset.meta.title === "Fort Lytton") {
    document.getElementById('sketchfab-viewer')?.classList.remove('hidden');
  } 
  
  setupAssetTitle(asset.meta.title);
  setupSwapLink(slug, publicView);

  const legacyRecord = await setupLegacyRecord(asset, publicView);
  setupDemoWarning(asset, publicView, !!legacyRecord);

  formatTimeElements();

  // Navigation setup with slight delay for localStorage availability
  setTimeout(() => setupAssetNavigation(slug), 100);

  // Store current slug for browser back button focus behavior
  sessionStorage.setItem('lastViewedAsset', slug);

  history.pushState({}, "", `?slug=${slug}&full=${!publicView}`);
}, { once: true });
