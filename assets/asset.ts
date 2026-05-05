import { marked, Token, Tokens } from 'marked';
import * as params from '@params';
import * as Handlebars from 'handlebars';
import { Map as MLMap } from 'maplibre-gl';
import { AlizarinModel, client, RDM, graphManager, staticStore, staticTypes, viewModels, renderers, wasmReady, slugify } from './alizarin-loader';
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
import { loadAndRenderRelations } from './relations';
import { IAssetManager, AssetMetadata, resolveAssetManagerWith } from './managers';
import { loadTemplate, getPrecompiledTemplate } from 'handlebar-utils';
import { initSwiper, ImageInput, ImageSet } from 'swiper';
import { markdownToPdf, PdfImage } from 'pdf-make';
import './w3c-treegrid.js';
import './relations-treegrid.js';
import { FileItemViewModel } from '@alizarin/filelist';
import { CardRenderer } from './card-renderer';

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
  "8d41e49e-a250-11e9-9eab-00224800b26d": {
    graph: "Consultation.json",
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

interface TreeGridElement extends HTMLElement {
  data: { listItems: string | string[]; nodeObjectsByAlias: Map<string, any>; nodeSkeleton?: Record<string, any> };
}

declare global {
  interface HTMLElementTagNameMap {
    'tree-grid': TreeGridElement;
  }
  interface Window {
    archesUrl?: string;
    alizarinAsset?: Asset;
    showDialog?: (dialogId: string) => void;
    sparqlStore?: any;
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
  const fullParam = urlParams.get("full");

  if (!slug || slug !== slugify(slug)) {
    console.error("Bad slug");
  }

  return {
    slug: slug || '',
    publicView: fullParam ? fullParam === "false" : params.default_show_full_asset ? params.default_show_full_asset === "false" : true
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

    const geometryData = await locationData.geometry;
    if (Array.isArray(geometryData)) {
      if (await geometryData[0] && await geometryData[0].geospatial_coordinates) {
        geometry = await (await geometryData[0].geospatial_coordinates).forJson();
        location = extractCentrePoint(geometry);
      }

      const lastGeometry = geometryData.length - 1; // Will be the polygon, if one.
      if (await geometryData[lastGeometry] && await geometryData[lastGeometry].geospatial_coordinates) {
        geometry = await (await geometryData[lastGeometry].geospatial_coordinates).forJson();
      }
    } else {
      if (geometryData && await geometryData.geospatial_coordinates) {
        geometry = await (await geometryData.geospatial_coordinates).forJson();
        location = extractCentrePoint(geometry);
      }
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

// GeoJSON modal registry — stores GeoJSON data for modal map display
const geojsonRegistry = new Map<string, object>();
let geojsonCounter = 0;

// Shared renderer options (URLs disabled for now)
const RENDERER_OPTIONS = {
  conceptValueToUrl: async () => null,
  domainValueToUrl: async () => null,
  resourceReferenceToUrl: async (rr) => await rr.getSlug().then(s => s && `?slug=${s}`),
  geojsonToUrl: async (gfc) => {
    const json = await gfc.forJson();
    const id = String(geojsonCounter++);
    geojsonRegistry.set(id, json);
    return `#show-geojson-${id}`;
  },
  extensionToMarkdown: async (vm, _depth: number) => {
    if (vm instanceof FileItemViewModel && vm.isImage()) {
      const altText = vm.getAltText();
      const caption = (vm.name || "") + (altText? `: ${altText}` : "");
      return `![${caption}](${vm.url})`;
    }
    return vm.toString();
  }
};

// GeoJSON modal map display
function computeGeojsonBbox(geojson: any): [number, number, number, number] {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;

  function visitCoords(coords: any) {
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const [lng, lat] = coords;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    } else {
      for (const c of coords) visitCoords(c);
    }
  }

  const features = geojson.features || (geojson.geometry ? [geojson] : []);
  for (const f of features) {
    const geom = f.geometry || f;
    if (geom.coordinates) visitCoords(geom.coordinates);
  }
  return [minLng, minLat, maxLng, maxLat];
}

let geojsonModalMap: MLMap | null = null;
let assetPageMap: MLMap | null = null;

function showGeojsonModal(geojson: object): void {
  const dialog = document.getElementById('geojson-dialog') as HTMLDialogElement | null;
  if (!dialog) return;

  dialog.showModal();

  requestAnimationFrame(() => {
    const container = document.getElementById('geojson-dialog__map');
    if (!container) return;

    // Clean up any previous map
    if (geojsonModalMap) {
      geojsonModalMap.remove();
      geojsonModalMap = null;
    }

    // Reuse the asset page map's style, or fall back to the same tile source
    const sourceMap = assetPageMap || (window as any).map;
    const style = (sourceMap && typeof sourceMap.getStyle === 'function')
      ? JSON.parse(JSON.stringify(sourceMap.getStyle()))
      : 'https://tiles.openfreemap.org/styles/bright';

    geojsonModalMap = new MLMap({
      container,
      style,
      pitch: 0,
      bearing: 0,
      center: [0, 0],
      zoom: 1,
    });

    geojsonModalMap.on('load', () => {
      if (!geojsonModalMap) return;

      geojsonModalMap.addSource('geojson-preview', {
        type: 'geojson',
        data: geojson as any,
      });

      geojsonModalMap.addLayer({
        id: 'geojson-preview-fill',
        type: 'fill',
        source: 'geojson-preview',
        paint: {
          'fill-color': '#3388ff',
          'fill-opacity': 0.2,
        },
      });

      geojsonModalMap.addLayer({
        id: 'geojson-preview-line',
        type: 'line',
        source: 'geojson-preview',
        paint: {
          'line-color': '#3388ff',
          'line-width': 3,
        },
      });

      geojsonModalMap.addLayer({
        id: 'geojson-preview-point',
        type: 'circle',
        source: 'geojson-preview',
        paint: {
          'circle-radius': 6,
          'circle-color': '#3388ff',
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2,
        },
      });

      const bbox = computeGeojsonBbox(geojson);
      if (isFinite(bbox[0])) {
        geojsonModalMap.fitBounds(bbox as [number, number, number, number], { padding: 40, animate: false });
      }
    });
  });
}

function setupGeojsonModal(): void {
  const dialog = document.getElementById('geojson-dialog') as HTMLDialogElement | null;
  if (!dialog) return;

  const closeBtn = document.getElementById('geojson-dialog__close');
  closeBtn?.addEventListener('click', () => dialog.close());

  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  dialog.addEventListener('close', () => {
    if (geojsonModalMap) {
      geojsonModalMap.remove();
      geojsonModalMap = null;
    }
  });

  // Delegated click handler for geojson links
  document.body.addEventListener('click', (e) => {
    const link = (e.target as HTMLElement).closest('a[href^="#show-geojson-"]') as HTMLAnchorElement | null;
    if (!link) return;
    e.preventDefault();
    const id = link.getAttribute('href')!.replace('#show-geojson-', '');
    const data = geojsonRegistry.get(id);
    if (data) showGeojsonModal(data);
  });
}

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

  interface WidgetMeta {
    name: string;
    description: string;
  }

  interface NodeBlockToken {
    type: 'nodeBlock';
    raw: string;
    title: string;
    description?: string;
    widgets?: WidgetMeta[];
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
          // Match ::Title{description}::\n...content...\n::end:: (description is optional)
          // Optional <!--widgets:alias=Label;;alias2=Label2--> comment after header
          const match = src.match(/^::([^:{]+)(?:\{([^}]+)\})?::\n([\s\S]*?)::end::/);
          if (match) {
            const title = match[1].trim();
            const description = match[2]?.trim();
            let body = match[3].trim();

            // Parse widget metadata comment if present
            let widgetsMeta: WidgetMeta[] | undefined;
            const widgetsMatch = body.match(/^<!--widgets:(.+?)-->\n?/);
            if (widgetsMatch) {
              body = body.slice(widgetsMatch[0].length).trim();
              widgetsMeta = widgetsMatch[1].split(';;').map(entry => {
                const [alias, label] = entry.split('=', 2);
                const node = nodes.get(alias);
                return {
                  name: label || node?.name || alias,
                  description: node?.description || ''
                };
              });
            }
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
              description,
              widgets: widgetsMeta,
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
            description: nodeToken.description,
            widgets: nodeToken.widgets,
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
  for (const [sectionId, html] of Object.entries(sections)) {
    const element = document.getElementById(sectionId);
    if (element) {
      element.innerHTML = html;
    } else {
      // Fallback: if no matching element, append to 'asset' element
      const assetElement = document.getElementById('asset');
      if (assetElement) {
        assetElement.innerHTML += html;
      }
    }
  }
}

// Build a nested skeleton of the graph definition so the tree-grid
// can show all nodes (including empty ones) in their proper hierarchy.
function buildNodeSkeleton(modelWrapper: any): Record<string, any> {
  const rootNode = modelWrapper.getRootNode();
  return buildSkeletonForNode(modelWrapper, rootNode.nodeid, new Set());
}

function buildSkeletonForNode(modelWrapper: any, nodeId: string, visited: Set<string>): Record<string, any> {
  if (visited.has(nodeId)) return {};
  visited.add(nodeId);
  const childAliases: string[] = modelWrapper.getChildNodeAliases(nodeId) || [];
  const skeleton: Record<string, any> = {};
  for (const alias of childAliases) {
    const childNodeId = modelWrapper.getNodeIdFromAlias(alias);
    const grandChildren: string[] = modelWrapper.getChildNodeAliases(childNodeId) || [];
    skeleton[alias] = grandChildren.length > 0
      ? buildSkeletonForNode(modelWrapper, childNodeId, visited)
      : {};
  }
  return skeleton;
}

// Rendering functions
async function renderAssetForDebug(asset: Asset): Promise<Record<string, Dialog>> {
  const alizarinRenderer = new renderers.MarkdownRenderer({
    ...RENDERER_OPTIONS,
    nodeToUrl: (node: staticTypes.StaticNode) => `@${node.alias}`
  });

  let markdown = await alizarinRenderer.render(asset.asset);

  if (Array.isArray(markdown)) {
    markdown = markdown.join("\n\n");
  }

  const returnElt = document.createElement('a');
  returnElt.href = "../asset-list/?model=" + asset.asset.__.wkrm.graphId;
  returnElt.innerText = "List all resources for this model";
  const assetElt = document.getElementById('asset') || document.getElementById('asset-overview');
  assetElt.appendChild(returnElt);
  const treegridElt = document.createElement('tree-grid');
  assetElt.appendChild(treegridElt);
  const nodes = asset.asset.__.getNodeObjectsByAlias();

  setupDialogLinks();

  const nodeObjectsByAlias = asset.asset.__.getNodeObjectsByAlias();
  const nodeSkeleton = buildNodeSkeleton(asset.asset.__);
  treegridElt.data = { listItems: markdown, nodeObjectsByAlias, nodeSkeleton };
  addAssetToMap(asset);

  return buildImageDialogs([], asset.meta.title);
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
  if (!imageList || imageList.length === 0) return [];

  await Promise.all(imageList.map(async (imageList) => {
    const image = imageList[0];

    if (!image) {
      console.warn("Missing image", imageList);
      return;
    }

    let caption = (await imageList._.captions.caption);
    let copyright = (await imageList._.copyright.copyright_note.copyright_note_text);
    if (copyright) {
      if (!copyright.includes('©')) {
        copyright = '© ' + copyright;
      }
      caption = [(caption || ""), copyright].join(" ");
    }

    images.push({
      name: await image.name,
      previewUrl: (await imageList._.preview[0]?.url) ?? (await image.url),
      originalUrl: await image.url,
      alt: (await image._file && await image._file.alt_text) || (await image.name),
      type: (await image._file && await image._file.type) || (await image.type),
      caption: caption
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

  const hasImages = await asset.asset.__has('images');
  let imageArray = (await Promise.all(((hasImages ? await asset.asset.images : null) || []).map(async (i) => {
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
  addAssetToMap(asset);
  setupDialogLinks();
  
  return buildImageDialogs(images, asset.meta.title);
}

/**
 * Render asset using card-directed traversal.
 *
 * Instead of a hand-written Handlebars template, uses the card/widget hierarchy
 * from the resource model graph to determine structure. Reuses the same
 * MarkdownRenderer visitor dispatch for value formatting, and feeds the result
 * into the existing renderToHtml() pipeline.
 */
async function renderAssetFromCards(asset: Asset): Promise<Record<string, Dialog>> {
  const cardRenderer = new CardRenderer(RENDERER_OPTIONS);
  const model = asset.asset.__;
  const graph = model.graph;

  // Build node/nodegroup indices from the model
  const nodesById = model.getNodeObjects();
  const nodegroups = model.getNodegroupObjects();
  const nodesByAlias = model.getNodeObjectsByAlias();

  // Card-directed render: visitor pattern for values, card tree for structure
  const { markdown, rendered: nonstaticAsset } = await cardRenderer.render(asset.asset, graph, nodesById, nodegroups);

  const sections = await renderToHtml(markdown, nodesByAlias, false);

  // Image handling (same as template path)
  const hasImages = await asset.asset.__has('images');
  let imageArray = (await Promise.all(((hasImages ? await asset.asset.images : null) || []).map(async (i) => {
    if (!i || !i[0] || !(await i[0])) {
      return null;
    }
    const isPublic = (await i._.visibility).includes("Public");
    const webOrder = await i[0]._file && Number.isInteger(await i[0]._file.index);
    return isPublic && webOrder ? i : null;
  }))).filter(a => a !== null).sort((a: Object, b: Object) => a[0]._file.index - b[0]._file.index);

  const assetImages = await extractImageList(imageArray);
  initSwiper(assetImages, 'media/images');
  injectSections(sections);

  const downloadPdfButton = document.getElementById('asset-download');
  if (downloadPdfButton) {
    downloadPdfButton.addEventListener('click', (e) => {
      e.preventDefault();
      const link = downloadPdfButton as HTMLAnchorElement;
      const spinner = document.getElementById('asset-download-spinner');

      link.classList.add('disabled');
      link.setAttribute('aria-disabled', 'true');
      link.querySelectorAll<HTMLSpanElement>('span').forEach(s => s.hidden = true);
      spinner?.removeAttribute('hidden');

      renderPDFAsset(markdown, nodesByAlias, asset.meta.title, assetImages).finally(() => {
        link.classList.remove('disabled');
        link.removeAttribute('aria-disabled');
        link.querySelectorAll<HTMLSpanElement>('span').forEach(s => s.hidden = false);
        spinner?.setAttribute('hidden', 'true');
      });
    });
  }

  addAssetToMap(asset);
  setupDialogLinks();

  const { images } = categorizeExternalReferences(nonstaticAsset);
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
    const isVideo = image.type && image.type.startsWith("video");
    dialogs[`image_${index}`] = {
      title: `<h3>Image for ${assetTitle}</h3>\n<h4>${await image.external_cross_reference}</h4>`,
      body: isVideo ? `<video src='${image.url.__clean}' preload="none" muted />` : `<img src='${image.url.__clean}' />`
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
    assetPageMap = map;
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

    if (!publicView) {
      this.dialogs = await renderAssetForDebug(this.asset);
    } else if (params.starches?.use_card_rendering) {
      this.dialogs = await renderAssetFromCards(this.asset);
    } else {
      const template = await fetchTemplate(this.asset.asset);
      this.dialogs = template
        ? await renderAsset(this.asset, template)
        : await renderAssetFromCards(this.asset);
    }

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

  getGraphManager(): typeof graphManager | null {
    return this.graphManager;
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

  const swapLinkPublic = document.querySelector<HTMLAnchorElement>("a#swap-link-public");
  if (swapLinkPublic) {
    if (publicView && params.default_show_full_asset === "true") {
      swapLinkPublic.href = `?slug=${slug}&full=true`;
      swapLinkPublic.removeAttribute('hidden');
    } else {
      swapLinkPublic.setAttribute('hidden', '');
    }
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

function setupAssetTitle(title: string, modelName?: string, resourceId?: string): void {
  const titleEl = document.getElementById("asset-title");
  if (titleEl) {
    titleEl.innerText = title;
  }
  const modelEl = document.getElementById("asset-model-name");
  if (modelEl && modelName) {
    modelEl.innerText = modelName;
    if (resourceId) {
      const idSpan = document.createElement('span');
      idSpan.className = 'asset-model-resource-id';
      idSpan.textContent = resourceId;
      modelEl.appendChild(idSpan);
    }
  }
}

async function setupRegistryInfo(asset: Asset): Promise<void> {
  const dfcRegistryElement = document.getElementById('dfc-registry');
  if (!dfcRegistryElement) return;

  if (await asset.asset.__has('record_and_registry_membership')) {
    const memberships = await asset.asset.record_and_registry_membership;
    if (memberships) {
      const items = await Promise.all(
        memberships.map(async (membership: any) => {
          const registry = await membership.record_or_registry;
          return `<li>${await registry.getName()}</li>`;
        })
      );
      dfcRegistryElement.innerHTML = `<ul>${items.join("\n")}</ul>`;
    }
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
  const shouldHide = isPublicScope && publicView && !hasLegacyRecord;
  if (shouldHide) {
    warningEl.setAttribute('hidden', '');
  } else {
    warningEl.removeAttribute('hidden');
  }
}

function formatTimeElements(): void {
  document.querySelectorAll<HTMLTimeElement>('time').forEach(elt => {
    const date = new Date(elt.dateTime);
    elt.innerHTML = date.toLocaleDateString();
  });
}

// Main entry point
window.addEventListener('DOMContentLoaded', async () => {
  setupGeojsonModal();

  const assetManagerInstance = new AssetManager();

  await assetManagerInstance.initialize();
  resolveAssetManagerWith(assetManagerInstance);

  const { slug, publicView } = parseAssetUrlParams();
  const asset = await assetManagerInstance.loadAssetFromUrl();

  // Run UI setup tasks concurrently where possible
  await Promise.all([
    assetManagerInstance.render(publicView),
    setupRegistryInfo(asset),
    setupBackLinks(slug)
  ]);

  // TODO: Make hardcoded check for Sketchfab to display 3D asset more flexible
  if (await asset.asset.__has('external_cross_references')) {
    for (const ecr of await asset.asset.external_cross_references || []) {
      if (await ecr.external_cross_reference_source == "Sketchfab") {
        document.getElementById('sketchfab-viewer')?.classList.remove('hidden');
      }
    }
  }

  // Toggle public/private view based on full param
  const privateViewEl = document.getElementById('private-view');
  const publicViewEl = document.getElementById('public-view');
  if (publicView) {
    publicViewEl?.removeAttribute('hidden');
    privateViewEl?.setAttribute('hidden', '');
  } else {
    privateViewEl?.removeAttribute('hidden');
    publicViewEl?.setAttribute('hidden', '');
  }

  setupAssetTitle(asset.meta.title, asset.asset.__.wkrm.modelName, asset.meta.resourceinstanceid);
  setupSwapLink(slug, publicView);

  const legacyRecord = await setupLegacyRecord(asset, publicView);
  setupDemoWarning(asset, publicView, !!legacyRecord);

  formatTimeElements();

  // Load resource relations via Ros Madair (progressive enhancement)
  if (params.ros_madair) {
    const gm = assetManagerInstance.getGraphManager();
    const resolveModelName = gm ? (graphId: string) => {
      for (const wkrm of gm.wkrms.values()) {
        if (wkrm.graphId === graphId) return wkrm.modelName;
      }
    } : undefined;

    loadAndRenderRelations(asset.meta.resourceinstanceid, {
      wasmModule: params.ros_madair.wasm_module,
      indexBaseUrl: params.ros_madair.index_base_url,
      rdfBaseUri: params.ros_madair.rdf_base_uri,
      resolveModelName,
      onMetaDiscovered: (resources) => {
        for (const r of resources) {
          try {
            const summary = new staticTypes.StaticResourceSummary({
              resourceinstanceid: r.id,
              graph_id: r.graphId,
              name: r.name,
              descriptors: { name: r.name, slug: r.slug },
            });
            staticStore.registry.insert(summary);
          } catch { /* skip if summary creation fails */ }
        }
      },
    });
  }

  // Navigation setup with slight delay for localStorage availability
  setTimeout(() => setupAssetNavigation(slug), 100);

  // Store current slug for browser back button focus behavior
  sessionStorage.setItem('lastViewedAsset', slug);

  history.pushState({}, "", `?slug=${slug}&full=${!publicView}`);
}, { once: true });
