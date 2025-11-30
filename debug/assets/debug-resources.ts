import { graphManager, client, staticStore, RDM, staticTypes, wasmReady, WKRM, ResourceModelWrapper } from 'alizarin';
import type { GraphManager } from 'alizarin';
import { debug, debugError } from './debug';

let resourceIterator: AsyncGenerator<any> | null = null;
let isLoading = false;
let selectedGraphId: string | null = null;

async function initializeAlizarin(): Promise<GraphManager> {
  // Wait for WASM to be ready before initializing
  await wasmReady;

  const archesClient = new client.ArchesClientRemoteStatic('', {
    allGraphFile: (() => "definitions/graphs/_all.json"),
    graphToGraphFile: ((graph: staticTypes.StaticGraphMeta) => `definitions/graphs/resource_models/${graph.name.toString()}.json`),
    resourceIdToFile: ((resourceId) => `definitions/business_data/${resourceId}.json`),
    collectionIdToFile: ((collectionId) => `definitions/reference_data/collections/${collectionId}.json`),
    graphIdToResourcesFiles: ((graphId: string) => [`definitions/business_data/_${graphId}.json`])
  });
  graphManager.archesClient = archesClient;
  staticStore.archesClient = archesClient;
  RDM.archesClient = archesClient;

  await graphManager.initialize();
  return graphManager;
}

function populateGraphSelector(gm: GraphManager): void {
  const selector = document.getElementById('graph-selector') as HTMLSelectElement;
  if (!selector) {
    debugError("Graph selector not found");
    return;
  }

  // Clear existing options except the placeholder
  selector.innerHTML = '<option value="">Select a graph...</option>';

  const wkrms = Array.from(gm.wkrms.values());

  for (const wkrm of wkrms) {
    const option = document.createElement('option');
    option.value = wkrm.graphId;
    option.textContent = wkrm.meta?.name || wkrm.modelClassName;
    selector.appendChild(option);
  }

  debug(`Populated graph selector with ${wkrms.length} graphs`);
}

function createResourceCard(resource: any): HTMLElement {
  const card = document.createElement('div');
  card.className = 'resource-card';

  const header = document.createElement('div');
  header.className = 'resource-card__header';

  const title = document.createElement('h3');
  title.className = 'resource-card__title';
  // Try to get display name from the resource
  title.textContent = resource.id || 'Unnamed Resource';
  header.appendChild(title);

  card.appendChild(header);

  const metadata = document.createElement('dl');
  metadata.className = 'resource-card__metadata';

  const idRow = `
    <div class="resource-card__metadata-row">
      <dt>ID:</dt>
      <dd><code>${resource.id}</code></dd>
    </div>
  `;

  metadata.innerHTML = idRow;
  card.appendChild(metadata);

  // Make card clickable to view resource details
  card.style.cursor = 'pointer';
  card.addEventListener('click', () => {
    window.location.href = `/debug/resource/?id=${encodeURIComponent(resource.id)}`;
  });

  return card;
}

async function loadMoreResources(container: HTMLElement, batchSize: number = 10): Promise<boolean> {
  if (isLoading || !resourceIterator) {
    return false;
  }

  isLoading = true;
  const loader = document.getElementById('loading-indicator');
  if (loader) {
    loader.style.display = 'block';
  }

  try {
    let loadedCount = 0;

    for (let i = 0; i < batchSize; i++) {
      const result = await resourceIterator.next();

      if (result.done) {
        // No more resources
        if (loader) {
          loader.textContent = 'All resources loaded';
        }
        return false;
      }

      const resource = result.value;
      const card = createResourceCard(resource);
      container.appendChild(card);
      loadedCount++;
    }

    updateStats(container.children.length);
    debug(`Loaded ${loadedCount} resources in this batch`);
    return true;

  } catch (error) {
    debugError("Failed to load resources:", error);
    if (loader) {
      loader.textContent = 'Error loading resources';
      loader.className = 'loading-indicator loading-indicator--error';
    }
    return false;
  } finally {
    isLoading = false;
    if (loader && loader.textContent === 'Loading...') {
      loader.style.display = 'none';
    }
  }
}

function updateStats(loadedCount: number): void {
  const statsElement = document.getElementById('resources-stats');
  if (statsElement) {
    statsElement.textContent = `Loaded ${loadedCount} resource${loadedCount !== 1 ? 's' : ''}`;
  }
}

async function onGraphSelected(gm: GraphManager, graphId: string): Promise<void> {
  const container = document.getElementById('resources-container');
  const emptyState = document.getElementById('empty-state');
  const loader = document.getElementById('loading-indicator');

  if (!container) {
    debugError("Resources container not found");
    return;
  }

  // Clear previous resources
  container.innerHTML = '';
  selectedGraphId = graphId;

  if (emptyState) {
    emptyState.style.display = 'none';
  }

  try {
    // Get the ResourceModelWrapper for this graph
    const modelWrapper: ResourceModelWrapper<any> = await gm.get(graphId);

    debug(`Loading resources for graph: ${graphId}`);

    // Create an async iterator using iterAll with lazy loading
    resourceIterator = modelWrapper.iterAll({ lazy: true });

    // Load initial batch
    await loadMoreResources(container, 20);

  } catch (error) {
    debugError(`Failed to load graph ${graphId}:`, error);
    if (loader) {
      loader.textContent = 'Failed to load graph';
      loader.className = 'loading-indicator loading-indicator--error';
      loader.style.display = 'block';
    }
  }
}

function setupInfiniteScroll(container: HTMLElement): void {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !isLoading && resourceIterator) {
        loadMoreResources(container, 10);
      }
    });
  }, {
    rootMargin: '200px'
  });

  const sentinel = document.getElementById('scroll-sentinel');
  if (sentinel) {
    observer.observe(sentinel);
  }
}

async function initializeResourcesPage(): Promise<void> {
  const gm: GraphManager = await initializeAlizarin();

  const selector = document.getElementById('graph-selector') as HTMLSelectElement;
  const container = document.getElementById('resources-container');

  if (!selector || !container) {
    debugError("Required elements not found");
    return;
  }

  // Populate graph selector
  populateGraphSelector(gm);

  // Set up graph selection handler
  selector.addEventListener('change', async () => {
    const graphId = selector.value;
    if (graphId) {
      await onGraphSelected(gm, graphId);
    }
  });

  // Set up infinite scroll
  setupInfiniteScroll(container);

  debug("Resources page initialized");
}

window.addEventListener('DOMContentLoaded', async (event) => {
  debug("Debug resources module loading");
  await initializeResourcesPage();
});
