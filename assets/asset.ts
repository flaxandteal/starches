import { addAssetToMap } from './asset-map';
import {
  Asset, initializeAlizarinConfig, initializeAlizarin,
  parseAssetUrlParams, loadAsset, loadMaritimeAsset, fetchTemplate,
  graphManager, staticTypes, renderers
} from './alizarin-init';
import {
  getNavigation,
  hasSearchContext,
  getAssetUrlWithContext,
  getSearchParams as getSearchContextParams,
  updateBreadcrumbs,
  makeSearchQuery
} from './searchContext';
import { debug } from './debug';
import { IAssetManager, resolveAssetManagerWith } from './managers';
import { initSwiper } from 'swiper';
import { renderPDFAsset } from './pdf-export';
import { extractImageList } from './image-manager';
import { RENDERER_OPTIONS, renderToHtml, injectSections } from './markdown-renderer';
import './w3c-treegrid.js';

// Types and interfaces

interface Dialog {
  title: string;
  body: string;
}

interface ImageRef {
  image: any;
  index: number;
}

interface TreeGridElement extends HTMLElement {
  data: { listItems: string | string[]; nodeObjectsByAlias: Map<string, any> };
}

declare global {
  interface HTMLElementTagNameMap {
    'tree-grid': TreeGridElement;
  }
  interface Window {
    archesUrl?: string;
    alizarinAsset?: Asset;
    showDialog?: (dialogId: string) => void;
  }
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
  document.getElementById('asset').appendChild(returnElt);
  const treegridElt = document.createElement('tree-grid');
  document.getElementById('asset').appendChild(treegridElt);
  const nodes = asset.asset.__.getNodeObjectsByAlias();

  setupDialogLinks();

  const nodeObjectsByAlias = asset.asset.__.getNodeObjectsByAlias();
  treegridElt.data = { listItems: markdown, nodeObjectsByAlias };

  return buildImageDialogs([], asset.meta.title);
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

  const name = asset.asset.__.wkrm.modelName;
  if (await asset.asset.__has('record_and_registry_membership')) {
    const memberships = await asset.asset.record_and_registry_membership;
    if (memberships) {
      const items = await Promise.all(
        memberships.map(async (membership: any) => {
          const registry = await membership.record_or_registry;
          const json = await registry.forJson();
          return `<li>${"Heritage Place"}</li>`;
        })
      );
    }
    dfcRegistryElement.innerHTML = `<ul><li>${name}</li></ul>`;
  } else {
    dfcRegistryElement.innerHTML = `<ul><li>${name}</li></ul>`;
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

  // TODO: Make hardcoded check for Sketchfab to display 3D asset more flexible
  for (const ecr of await asset.asset.external_cross_references || []) {
    if (await ecr.external_cross_reference_source == "Sketchfab") {
      document.getElementById('sketchfab-viewer')?.classList.remove('hidden');
    }
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
