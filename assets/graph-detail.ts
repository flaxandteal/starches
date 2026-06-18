/**
 * Graph structure viewer.
 *
 * Renders a single Arches resource model (graph) as a nested, collapsible
 * tree of nodes, mirroring the asset (resource instance) tree view but for
 * the model *schema* rather than a record's values.
 *
 * The graph is selected via the `graphId` query parameter, or from the
 * in-page selector which keeps the URL in sync so views are deep-linkable.
 *
 * Promoted from the optional `starches/debug` module's graph-detail page so
 * it can be built as a first-class production page.
 */

// Runtime singletons + WASM bootstrap come from the project's alizarin-loader,
// which sets the absolute /wasm/ URL (with base64 fallback). Importing wasmReady
// straight from 'alizarin' uses the package's auto-init with a page-relative URL,
// which 404s at the /graph/ route and serves the HTML error page as "wasm".
import { graphManager, client, staticStore, RDM, staticTypes, wasmReady } from './alizarin-loader';
import { WKRM, ResourceModelWrapper, NodeViewModel } from 'alizarin';
import type { GraphManager } from 'alizarin';
import { debug, debugError } from './debug';
import { buildCardTree } from './card-renderer';
import * as params from '@params';
import { createModelResourceSearch } from './relations';
import type { RelationsConfig, ModelResource, ModelResourceSearch } from './relations';
// Registers the <graph-treegrid> W3C-APG accessible treegrid web component.
import './graph-treegrid.js';

// Rós Madair config (resource-by-model search). Absent → search stays hidden.
const rosMadairConfig: RelationsConfig | null = params.ros_madair
  ? {
      wasmModule: params.ros_madair.wasm_module,
      indexBaseUrl: params.ros_madair.index_base_url,
      rdfBaseUri: params.ros_madair.rdf_base_uri,
    }
  : null;

/** One card node, as produced by buildCardTree (interface is not exported). */
type CardTreeNode = ReturnType<typeof buildCardTree>[number];

// --- Treegrid data model (consumed by <graph-treegrid>) ---

type TreeGridCell =
  | string
  | { text?: string; title?: string; className?: string; pill?: boolean; href?: string };

interface TreeGridRow {
  cells: TreeGridCell[];
  children?: TreeGridRow[];
  expanded?: boolean;
}

interface TreeGridData {
  ariaLabel?: string;
  columns: { label: string; width?: string }[];
  rows: TreeGridRow[];
}

interface TreeGridElement extends HTMLElement {
  data: TreeGridData;
}

type GraphView = 'nodes' | 'cards';

/** Which tree is currently shown, and the built data for both views. */
let currentView: GraphView = 'nodes';
let builtViews: { nodes: TreeGridData; cards: TreeGridData } | null = null;

/** Graph currently displayed, and the in-progress resource-by-model search. */
let currentGraphId: string | null = null;
let modelSearch: ModelResourceSearch | null = null;
let modelSearchResults: ModelResource[] = [];

function cardinalityLabel(cardinality?: string): string {
  if (cardinality === 'n') return 'multiple';
  if (cardinality === '1') return 'single';
  return '';
}

let graphManagerPromise: Promise<GraphManager> | null = null;

async function initializeAlizarin(): Promise<GraphManager> {
  if (graphManagerPromise) return graphManagerPromise;

  graphManagerPromise = (async () => {
    // Wait for WASM to be ready before initializing
    await wasmReady;

    // Path config kept identical to the production asset page (assets/asset.ts)
    // so definitions resolve the same way in every deployment.
    const archesClient = new client.ArchesClientRemoteStatic('', {
      allGraphFile: (() => "definitions/graphs/_all.json"),
      graphToGraphFile: ((graph: staticTypes.StaticGraphMeta) => `definitions/graphs/resource_models/${graph.name.toString()}.json`),
      resourceIdToFile: ((resourceId) => `definitions/business_data/${resourceId}.json`),
      collectionIdToFile: ((collectionId) => `definitions/reference_data/collections/${collectionId}.json`)
    });
    graphManager.archesClient = archesClient;
    staticStore.archesClient = archesClient;
    RDM.archesClient = archesClient;

    await graphManager.initialize({ graphs: null, defaultAllowAllNodegroups: true });
    return graphManager;
  })();

  return graphManagerPromise;
}

function getGraphIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('graphId');
}

interface TreeNode {
  name: string;
  alias: string;
  datatype: string;
  nodeid: string;
  nodegroupId?: string;
  cardinality?: string;
  children: TreeNode[];
}

/** Convert a node-schema TreeNode into a treegrid row (recursively). */
function nodeTreeToRow(node: TreeNode): TreeGridRow {
  // Cardinality is only meaningful on a collector (the nodegroup root node).
  const isCollector = node.nodeid === node.nodegroupId;
  return {
    cells: [
      { text: node.name || node.alias || 'Unknown', title: node.nodeid },
      { text: node.alias || '', pill: !!node.alias },
      node.datatype || '',
      isCollector ? cardinalityLabel(node.cardinality) : '',
    ],
    expanded: true,
    children: node.children.map(nodeTreeToRow),
  };
}

/** Convert a card-tree node into a treegrid row; its widgets become leaf rows. */
function cardTreeToRow(card: CardTreeNode): TreeGridRow {
  const widgetRows: TreeGridRow[] = (card.widgets || [])
    .filter((w) => w.visible !== false)
    .map((w) => ({
      cells: [
        { text: w.label || w.nodeAlias || '(field)' },
        { text: w.nodeAlias || '', pill: !!w.nodeAlias },
        'field',
        '',
      ] as TreeGridCell[],
    }));
  const childCardRows: TreeGridRow[] = (card.children || []).map(cardTreeToRow);
  return {
    cells: [
      { text: card.name || card.nodegroupAlias || '(card)', title: card.description || undefined },
      { text: card.nodegroupAlias || '', pill: !!card.nodegroupAlias },
      'card',
      cardinalityLabel(card.cardinality),
    ],
    expanded: true,
    children: [...widgetRows, ...childCardRows],
  };
}

/** Render the currently-selected view (node tree / card tree) into the page. */
function renderActiveTree(): void {
  const treeContainer = document.getElementById('tree-container');
  if (!treeContainer || !builtViews) return;

  const data = builtViews[currentView];
  treeContainer.innerHTML = '';

  if (!data.rows.length) {
    const what = currentView === 'cards' ? 'cards' : 'nodes';
    treeContainer.innerHTML = `<p class="govuk-body">No ${what} to display for this model.</p>`;
    return;
  }

  const grid = document.createElement('graph-treegrid') as TreeGridElement;
  grid.setAttribute('aria-label', data.ariaLabel || 'Graph structure');
  treeContainer.appendChild(grid);
  // Set data after connection so the element's connectedCallback has run.
  grid.data = data;
}

function populateGraphSelector(gm: GraphManager, currentGraphId: string | null): void {
  const selector = document.getElementById('graph-selector') as HTMLSelectElement | null;
  if (!selector) return;

  selector.innerHTML = '<option value="">Select a graph…</option>';

  const wkrms = [...gm.wkrms.values()].sort((a, b) => {
    const an = a.meta?.name || a.modelClassName || '';
    const bn = b.meta?.name || b.modelClassName || '';
    return an.localeCompare(bn);
  });

  for (const wkrm of wkrms) {
    const option = document.createElement('option');
    option.value = wkrm.graphId;
    option.textContent = wkrm.meta?.name || wkrm.modelClassName;
    if (wkrm.graphId === currentGraphId) option.selected = true;
    selector.appendChild(option);
  }

  selector.addEventListener('change', async () => {
    const graphId = selector.value;
    const url = new URL(window.location.href);
    if (graphId) {
      url.searchParams.set('graphId', graphId);
    } else {
      url.searchParams.delete('graphId');
    }
    window.history.pushState({}, '', url.toString());
    await renderGraph(gm, graphId || null);
  });

  debug(`Populated graph selector with ${wkrms.length} graphs`);
}

async function renderGraph(gm: GraphManager, graphId: string | null): Promise<void> {
  const graphNameElement = document.getElementById('graph-name');
  const wkrmInfoElement = document.getElementById('wkrm-info');
  const treeContainer = document.getElementById('tree-container');

  // Reset info panel between selections
  if (wkrmInfoElement) wkrmInfoElement.innerHTML = '';

  if (!graphId) {
    if (graphNameElement) graphNameElement.textContent = 'Select a graph';
    if (treeContainer) {
      treeContainer.innerHTML = '<p class="govuk-body">Choose a resource model above to view its structure.</p>';
    }
    currentGraphId = null;
    builtViews = null;
    setViewToggleVisible(false);
    resetResourceSearch();
    return;
  }

  currentGraphId = graphId;
  resetResourceSearch();

  debug("Loading graph:", graphId);

  // Get the WKRM for this graph
  const wkrm: WKRM | undefined = [...gm.wkrms.values()].find((w: WKRM) => w.graphId === graphId);

  if (!wkrm) {
    if (graphNameElement) graphNameElement.textContent = 'Graph not found';
    if (treeContainer) {
      treeContainer.innerHTML = `<p class="govuk-body">Graph not found: ${graphId}</p>`;
    }
    return;
  }

  const meta: staticTypes.StaticGraphMeta | undefined = wkrm.meta;

  // Update page title and info
  if (graphNameElement) {
    graphNameElement.textContent = meta?.name || wkrm.modelClassName || 'Unknown Graph';
  }

  const modelWrapper: ResourceModelWrapper<any> = await gm.get(wkrm.modelClassName);

  // Single model-summary panel. Counts come from the loaded graph (actual
  // array lengths); name/subtitle/description fall back to the registry meta.
  if (wkrmInfoElement) {
    const graph = modelWrapper?.graph;
    const name = meta?.name || graph?.name;
    const subtitle = meta?.subtitle || graph?.subtitle;
    const description = meta?.description || graph?.description;
    const info = ["<h3>Model</h3>"];
    if (name) info.push(`<p class="govuk-body">Name: ${name}</p>`);
    if (wkrm.modelClassName) info.push(`<p class="govuk-body">Class: ${wkrm.modelClassName}</p>`);
    if (subtitle) info.push(`<p class="govuk-body">${subtitle}</p>`);
    if (description) info.push(`<p class="govuk-body">${description}</p>`);
    info.push(`<dl class="govuk-summary-list govuk-summary-list--no-border">
      ${graph?.nodes ? `<div class="govuk-summary-list__row"><dt class="govuk-summary-list__key">Nodes</dt><dd class="govuk-summary-list__value">${graph.nodes.length}</dd></div>` : ''}
      ${graph?.nodegroups ? `<div class="govuk-summary-list__row"><dt class="govuk-summary-list__key">Node Groups</dt><dd class="govuk-summary-list__value">${graph.nodegroups.length}</dd></div>` : ''}
      ${graph?.cards ? `<div class="govuk-summary-list__row"><dt class="govuk-summary-list__key">Cards</dt><dd class="govuk-summary-list__value">${graph.cards.length}</dd></div>` : ''}
      ${graph?.edges ? `<div class="govuk-summary-list__row"><dt class="govuk-summary-list__key">Edges</dt><dd class="govuk-summary-list__value">${graph.edges.length}</dd></div>` : ''}
    </dl>`);
    wkrmInfoElement.innerHTML = info.join('');
  }

  if (!treeContainer) {
    debugError("Tree container not found");
    return;
  }

  treeContainer.innerHTML = '<p class="govuk-body">Loading graph structure…</p>';

  // Use getRoot() to get a NodeViewModel with built-in child support
  const rootNodeVM: NodeViewModel = modelWrapper.getRoot();

  if (!rootNodeVM) {
    treeContainer.innerHTML = '<p class="govuk-body">No root node found</p>';
    return;
  }

  debug("Root node:", rootNodeVM);

  // Build the tree structure using NodeViewModel
  // NodeViewModel provides access to children via __parentPseudo.childNodes
  const buildNodeTree = async (nodeVM: NodeViewModel): Promise<TreeNode> => {
    const pseudoNode = nodeVM.__parentPseudo;
    const node = pseudoNode.node;
    const childNodes = pseudoNode.childNodes; // Map<string, StaticNode>

    // Get nodegroup information for cardinality
    const nodegroupObjs = modelWrapper.getNodegroupObjects();
    const nodegroup = node.nodegroup_id ? nodegroupObjs.get(node.nodegroup_id) : null;
    const cardinality = nodegroup?.cardinality;

    const children: TreeNode[] = [];
    if (childNodes && childNodes.size > 0) {
      // Convert to array and sort alphabetically by alias
      const sortedChildEntries = Array.from(childNodes.entries()).sort((a, b) => {
        const aliasA = a[0] || '';
        const aliasB = b[0] || '';
        return aliasA.localeCompare(aliasB);
      });

      for (const [alias, childNode] of sortedChildEntries) {
        const childVM = await nodeVM.__get(alias);
        children.push(await buildNodeTree(childVM));
      }
    }

    return {
      name: node.name,
      alias: node.alias || '',
      datatype: node.datatype,
      nodeid: node.nodeid,
      nodegroupId: node.nodegroup_id || undefined,
      cardinality: cardinality,
      children: children
    };
  };

  const treeData: TreeNode = await buildNodeTree(rootNodeVM);

  const graphLabel = meta?.name || wkrm.modelClassName || 'Graph';

  const nodeView: TreeGridData = {
    ariaLabel: `${graphLabel} node structure`,
    columns: [
      { label: 'Node', width: '40%' },
      { label: 'Alias', width: '25%' },
      { label: 'Datatype', width: '20%' },
      { label: 'Cardinality', width: '15%' },
    ],
    rows: [nodeTreeToRow(treeData)],
  };

  // Card tree — the Arches card/widget hierarchy, derived purely from the
  // static graph (no resource instance needed). Best-effort: fall back to an
  // empty card view if the graph lacks card data.
  let cardRows: TreeGridRow[] = [];
  try {
    const cardTree = buildCardTree(
      modelWrapper.graph,
      modelWrapper.getNodeObjects(),
      modelWrapper.getNodegroupObjects(),
    );
    cardRows = cardTree.map(cardTreeToRow);
  } catch (error) {
    debugError('Failed to build card tree', error);
  }

  const cardView: TreeGridData = {
    ariaLabel: `${graphLabel} card structure`,
    columns: [
      { label: 'Card / Field', width: '45%' },
      { label: 'Alias', width: '25%' },
      { label: 'Kind', width: '15%' },
      { label: 'Cardinality', width: '15%' },
    ],
    rows: cardRows,
  };

  builtViews = { nodes: nodeView, cards: cardView };
  setViewToggleVisible(true);
  renderActiveTree();

  // Offer the resource-by-model search once a graph is loaded (Rós Madair only).
  setResourceSearchVisible(!!rosMadairConfig);

  debug("Graph tree display complete");
}

/** Show/hide the node/card view toggle (only meaningful once a graph loads). */
function setViewToggleVisible(visible: boolean): void {
  const toggle = document.querySelector('.graph-view-toggle');
  if (!toggle) return;
  if (visible) {
    toggle.removeAttribute('hidden');
  } else {
    toggle.setAttribute('hidden', '');
  }
}

/** Wire the node/card toggle buttons once; re-renders the active tree on switch. */
function setupViewToggle(): void {
  const toggle = document.querySelector('.graph-view-toggle');
  if (!toggle) return;

  toggle.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest('[data-graph-view]') as HTMLElement | null;
    if (!button) return;
    const view = button.getAttribute('data-graph-view') as GraphView;
    if (view !== 'nodes' && view !== 'cards') return;
    if (view === currentView) return;

    currentView = view;
    toggle.querySelectorAll('[data-graph-view]').forEach((b) => {
      b.setAttribute('aria-pressed', b === button ? 'true' : 'false');
    });
    renderActiveTree();
  });
}

// --- Resource-by-model search (Rós Madair) ---

/** Show/hide the bottom "Search for Resources of this Model" section. */
function setResourceSearchVisible(visible: boolean): void {
  const section = document.querySelector('.graph-resource-search');
  if (!section) return;
  if (visible) {
    section.removeAttribute('hidden');
  } else {
    section.setAttribute('hidden', '');
  }
}

/** Clear any previous search state/results (e.g. when switching graphs). */
function resetResourceSearch(): void {
  modelSearch = null;
  modelSearchResults = [];
  const results = document.getElementById('model-resources-results');
  if (results) results.innerHTML = '';
}

/** Toggle the search/load-more buttons' busy state. */
function setResourceSearchBusy(busy: boolean): void {
  const button = document.getElementById('search-model-resources') as HTMLButtonElement | null;
  const more = document.getElementById('model-resources-more') as HTMLButtonElement | null;
  if (button) button.disabled = busy;
  if (more) more.disabled = busy;
}

/** Begin a fresh search for the current model: load the first page of resources. */
async function startModelSearch(): Promise<void> {
  if (!currentGraphId || !rosMadairConfig) return;
  setResourceSearchBusy(true);
  try {
    modelSearch = await createModelResourceSearch(currentGraphId, rosMadairConfig);
    modelSearchResults = [];
    const first = await modelSearch.loadNext();
    modelSearchResults.push(...first);
    renderModelResults();
  } catch (error) {
    debugError('Model resource search failed', error);
    const results = document.getElementById('model-resources-results');
    if (results) results.innerHTML = '<p class="govuk-body">Search failed — see console for details.</p>';
  } finally {
    setResourceSearchBusy(false);
  }
}

/** Load the next page of resources and append to the rendered list. */
async function loadMoreModelResults(): Promise<void> {
  if (!modelSearch) return;
  setResourceSearchBusy(true);
  try {
    const more = await modelSearch.loadNext();
    modelSearchResults.push(...more);
    renderModelResults();
  } catch (error) {
    debugError('Load-more failed', error);
  } finally {
    setResourceSearchBusy(false);
  }
}

/** Render the accumulated resource results into the accessible treegrid. */
function renderModelResults(): void {
  const container = document.getElementById('model-resources-results');
  if (!container || !modelSearch) return;
  container.innerHTML = '';

  const status = document.createElement('p');
  status.className = 'govuk-body model-resources-status';
  container.appendChild(status);

  if (modelSearchResults.length === 0) {
    status.textContent = 'No resources found for this model.';
    return;
  }

  status.textContent = `Showing ${modelSearchResults.length} of ${modelSearch.totalResources}`;

  const grid = document.createElement('graph-treegrid') as TreeGridElement;
  grid.setAttribute('aria-label', 'Resources of this model');
  container.appendChild(grid);
  grid.data = {
    ariaLabel: 'Resources of this model',
    columns: [{ label: 'Resource' }],
    rows: modelSearchResults.map((r) => ({
      cells: [
        { text: r.name || '(untitled)', href: `../asset/?slug=${encodeURIComponent(r.slug)}&full=true` },
      ] as TreeGridCell[],
    })),
  };

  if (modelSearch.hasMore) {
    const more = document.createElement('button');
    more.type = 'button';
    more.id = 'model-resources-more';
    more.className = 'govuk-button govuk-button--secondary model-resources-more';
    more.textContent = 'Load more';
    more.addEventListener('click', loadMoreModelResults);
    container.appendChild(more);
  }
}

/** Wire the search button once. */
function setupResourceSearch(): void {
  const button = document.getElementById('search-model-resources');
  if (!button) return;
  button.addEventListener('click', startModelSearch);
}

async function initializeGraphPage(): Promise<void> {
  const gm: GraphManager = await initializeAlizarin();
  const graphId: string | null = getGraphIdFromUrl();

  setupViewToggle();
  setupResourceSearch();
  populateGraphSelector(gm, graphId);
  await renderGraph(gm, graphId);

  // Keep the view in sync with browser back/forward navigation.
  window.addEventListener('popstate', async () => {
    const id = getGraphIdFromUrl();
    const selector = document.getElementById('graph-selector') as HTMLSelectElement | null;
    if (selector) selector.value = id || '';
    await renderGraph(gm, id);
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  debug("Graph detail module loading");
  await initializeGraphPage();
});
