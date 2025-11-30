import { graphManager, client, staticStore, RDM, staticTypes, wasmReady, WKRM } from 'alizarin';
import type { GraphManager } from 'alizarin';
import { debug, debugError } from './debug';

async function initializeAlizarin(): Promise<GraphManager> {
  // Wait for WASM to be ready before initializing
  await wasmReady;

  const archesClient = new client.ArchesClientRemoteStatic('', {
    allGraphFile: (() => "definitions/graphs/_all.json"),
    graphToGraphFile: ((graph: staticTypes.StaticGraphMeta) => `definitions/graphs/resource_models/${graph.name.toString()}.json`),
    resourceIdToFile: ((resourceId) => `definitions/business_data/${resourceId}.json`),
    collectionIdToFile: ((collectionId) => `definitions/reference_data/collections/${collectionId}.json`)
  });
  graphManager.archesClient = archesClient;
  staticStore.archesClient = archesClient;
  RDM.archesClient = archesClient;

  await graphManager.initialize();
  return graphManager;
}

async function displayGraphs(): Promise<void> {
  const gm: GraphManager = await initializeAlizarin();

  // Use gm.wkrms which is a Map, convert values() iterator to array
  const wkrms: WKRM[] = Array.from(gm.wkrms.values());

  debug("Loaded WKRMs:", wkrms);

  const summaryStatsContainer = document.getElementById('summary-stats');
  const graphCardsContainer = document.getElementById('graph-cards');

  if (!summaryStatsContainer || !graphCardsContainer) {
    debugError("Could not find required container elements");
    return;
  }

  // Clear any existing content
  summaryStatsContainer.innerHTML = '';
  graphCardsContainer.innerHTML = '';

  if (!wkrms || wkrms.length === 0) {
    graphCardsContainer.innerHTML = '<p class="govuk-body">No resource models loaded</p>';
    return;
  }

  // Calculate summary statistics from WKRM metadata
  const totalGraphs = wkrms.length;
  const totalNodes = wkrms.reduce((sum, wkrm) => {
    console.log(wkrm.meta);
    console.log(wkrm.meta.nodes);
    return sum + (wkrm.meta?.nodes || 0);
  }, 0);

  // Create summary statistics cards (GOV.UK Notify style)
  summaryStatsContainer.innerHTML = `
    <div class="summary-cards">
      <div class="summary-card">
        <div class="summary-card__number">${totalGraphs}</div>
        <div class="summary-card__label">Resource Models</div>
      </div>
      <div class="summary-card">
        <div class="summary-card__number">${totalNodes}</div>
        <div class="summary-card__label">Total Nodes</div>
      </div>
    </div>
  `;

  // Create individual graph cards with GOV.UK blue background using WKRM data
  for (const wkrm of wkrms) {
    const meta: staticTypes.StaticGraphMeta | undefined = wkrm.meta; // StaticGraphMeta object
    const graphId: string = meta?.graphid || wkrm.graphId;

    const card: HTMLAnchorElement = document.createElement('a');
    card.className = 'graph-card';
    card.href = `/debug/graph/?graphId=${encodeURIComponent(graphId)}`;

    const cardInner: HTMLDivElement = document.createElement('div');
    cardInner.className = 'graph-card__inner';

    // Build compact stats row for counts
    const stats: string[] = [];
    if (meta?.nodes) stats.push(`<span class="graph-card__stat" title="Nodes"><strong>N:</strong> ${meta.nodes}</span>`);
    if (meta?.nodegroups) stats.push(`<span class="graph-card__stat" title="Node Groups"><strong>G:</strong> ${meta.nodegroups}</span>`);
    if (meta?.cards) stats.push(`<span class="graph-card__stat" title="Cards"><strong>C:</strong> ${meta.cards}</span>`);
    if (meta?.edges) stats.push(`<span class="graph-card__stat" title="Edges"><strong>E:</strong> ${meta.edges}</span>`);

    // Build details list with only non-empty attributes
    const details: string[] = [];
    if (wkrm.modelClassName && wkrm.modelClassName?.trim()) {
      details.push(`<div class="graph-card__detail-row"><dt>Class:</dt><dd><code>${wkrm.modelClassName}</code></dd></div>`);
    }
    if (meta?.author && meta.author.trim()) {
      details.push(`<div class="graph-card__detail-row"><dt>Author:</dt><dd title="${meta.author}">${meta.author}</dd></div>`);
    }
    if (meta?.version && meta.version.trim()) {
      details.push(`<div class="graph-card__detail-row"><dt>Version:</dt><dd>${meta.version}</dd></div>`);
    }

    const subtitle: string | undefined = meta?.subtitle?.trim() || meta?.description?.trim();

    cardInner.innerHTML = `
      <h3 class="graph-card__heading" title="${meta?.name || wkrm.modelClassName || 'Unknown'}">${meta?.name || wkrm.modelClassName || 'Unknown'}</h3>
      ${subtitle ? `<p class="graph-card__subtitle" title="${subtitle}">${subtitle}</p>` : ''}
      ${stats.length > 0 ? `<div class="graph-card__stats">${stats.join('')}</div>` : ''}
      ${details.length > 0 ? `<dl class="graph-card__details">${details.join('')}</dl>` : ''}
    `;

    card.appendChild(cardInner);
    graphCardsContainer.appendChild(card);
  }

  debug("Graph display complete");
}

window.addEventListener('DOMContentLoaded', async (event) => {
  debug("Debug graphs module loading");
  await displayGraphs();
});
