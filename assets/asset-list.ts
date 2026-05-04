import { AlizarinModel, client, RDM, graphManager, staticStore, staticTypes, viewModels, wasmReady, slugify } from './alizarin-loader';
import { debug } from './debug';
import { IAssetManager, AssetMetadata, resolveAssetManagerWith } from './managers';

// Types and interfaces
interface AssetUrlParams {
  model: string;
  publicView: boolean;
}

interface Asset {
  asset: AlizarinModel<any>;
  meta: AssetMetadata;
}

type AssetList = Asset[];

// Alizarin-specific setup (Handlebars helpers are registered in static/js/handlebars-helpers.js)
function initializeAlizarinConfig(): void {
  viewModels.CUSTOM_DATATYPES.set("tm65centrepoint", "non-localized-string");
  // Arches 7 'reference' datatype — map to non-localized-string so values render as text
  viewModels.CUSTOM_DATATYPES.set("reference", "non-localized-string");
}

// URL parameter parsing (distinct from search context params)
function parseAssetUrlParams(): AssetUrlParams {
  const urlParams = new URLSearchParams(window.location.search);
  const model = urlParams.get("model");

  if (!model) {
    debug("No model provided in URL");
  } else if (model !== slugify(model)) {
    debug("Slug does not match slugified form:", model, "->", slugify(model));
  }

  return {
    model: model || '',
    publicView: urlParams.get("full") === "true"
  };
}

// Alizarin initialization
async function initializeAlizarin(): Promise<typeof graphManager> {
  await wasmReady;

  const archesClient = new client.ArchesClientRemoteStatic('', {
    allGraphFile: () => "definitions/graphs/_all.json",
    graphToGraphFile: (graph: staticTypes.StaticGraphMeta) =>
      `definitions/graphs/resource_models/${graph.name.toString()}.json`,
    graphIdToResourcesFiles: (graphId: staticTypes.StaticGraphMeta) =>
      [`definitions/business_data/_${graphId.toString()}.json`],
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
async function loadAssetList(model: string, gm: typeof graphManager): Promise<AssetList> {
  const rmvm = await gm.loadGraph(model);
  console.log('Loaded rmvm');
  const assets = await rmvm.allSummaries();
  console.log('Loaded asset from graph manager');
  return Promise.all(assets.map((asset) => getAssetMetadata(asset).then(meta => { return { asset, meta }; })));
}

async function getAssetMetadata(asset: AlizarinModel<any>): Promise<AssetMetadata> {
  return {
    resourceinstanceid: `${await asset.id}`,
    geometry: null,
    location: null,
    title: await asset.getName(true),
  };
}

// Rendering
async function renderAssets(assetList: AssetList): Promise<void> {
  const groups = new Map<string, [string, string][]>();
  for (const { asset, meta } of assetList) {
    const modelName = asset.__.wkrm.modelName;
    if (!groups.has(modelName)) {
      groups.set(modelName, []);
    }

    groups.get(modelName)!.push(
      [
        meta.title,
        `<li><a href='../asset/?slug=${await asset.getSlug()}&full=true'>${await asset.getName() || '(untitled)'}</a></li>`
      ]
    );
  }

  const assetElement = document.getElementById('asset-overview');
  if (!assetElement) return;
  for (const [ modelName, rows ] of Array.from(groups.entries())) {
    assetElement.innerHTML += `
    <h1>${modelName}</h1>
    <ul>
    ${rows.sort(([a, a2], [b, b2]) => a && a.localeCompare(b)).map(a => a[1]).join('\n')}
    </ul>
    `;
  }
}

// Asset list manager
class AssetManager implements IAssetManager {
  private graphManager: typeof graphManager | null = null;
  private assetList: AssetList | null = null;
  private _model: string = '';
  private _publicView: boolean = true;

  async initialize(): Promise<void> {
    initializeAlizarinConfig();
    this.graphManager = await initializeAlizarin();
    debug("Alizarin initialized");
  }

  getGraphManager(): typeof graphManager | null {
    return this.graphManager;
  }

  setUrlParams(model: string, publicView: boolean): void {
    this._model = model;
    this._publicView = publicView;
  }

  async loadAssetFromUrl(): Promise<Asset> {
    const model = this._model;
    debug("Loading asset:", model, "publicView:", this._publicView);

    if (!model) {
      throw new Error("No model provided - add ?model=<model-id> to the URL");
    }

    if (!this.graphManager) {
      throw new Error("AssetManager not initialized");
    }

    this.assetList = await loadAssetList(model, this.graphManager);

    debug("Assets loaded");

    if (this.assetList.length === 0) {
      throw new Error("No assets found for model: " + model);
    }

    return this.assetList[0];
  }

  async render(publicView: boolean): Promise<void> {
    if (!this.assetList) {
      throw new Error("No assets loaded");
    }

    await renderAssets(this.assetList);
  }

  getAsset(): Asset | null {
    return this.assetList ? this.assetList[0] : null;
  }

  getAssetList(): AssetList | null {
    return this.assetList;
  }
}

async function setupResourceModelInfo(gm: typeof graphManager): Promise<void> {
  const dfcRegistryElement = document.getElementById('resource-models');
  if (!dfcRegistryElement) return;

  const items = await Promise.all(
    Array.from(gm.wkrms).map(async ([modelClassName, wkrm]) => {
      try {
        const res = await fetch(`/definitions/business_data/_${wkrm.graphId}.json`);
        console.log(`Checking resources for ${modelClassName} (graphId: ${wkrm.graphId}) - response status: ${res.status}`);
        if (!res.ok) return { modelClassName, graphId: wkrm.graphId, hasResources: false };
        const data = await res.json();
        const hasResources = Array.isArray(data) ? data.length > 0 : !!data;
        return { modelClassName, graphId: wkrm.graphId, hasResources };
      } catch {
        return { modelClassName, graphId: wkrm.graphId, hasResources: false };
      }
    })
  );

  let innerHtml = "<ul>";
  for (const { modelClassName, graphId, hasResources } of items) {
    if (hasResources) {
      innerHtml += `<li><a href="?model=${graphId}">${modelClassName}</a></li>`;
    } else {
      innerHtml += `<li><span class="disabled">${modelClassName}</span></li>`;
    }
  }
  innerHtml += "</ul>";
  dfcRegistryElement.innerHTML = innerHtml;
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

  const { model, publicView } = parseAssetUrlParams();
  assetManagerInstance.setUrlParams(model, publicView);
  await assetManagerInstance.loadAssetFromUrl();

  // Run UI setup tasks concurrently where possible
  // Render content and set up map separately so a render error doesn't block the map
  const renderResult = Promise.all([
    assetManagerInstance.render(publicView),
    setupResourceModelInfo(assetManagerInstance.getGraphManager())
  ]);

  await renderResult;

  formatTimeElements();

  // Store current model for browser back button focus behavior
  sessionStorage.setItem('lastViewedModel', model);

  history.pushState({}, "", `?model=${model}&full=${!publicView}`);
}, { once: true });
