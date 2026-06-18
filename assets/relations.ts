/**
 * Resource relations viewer using Ros Madair WASM client.
 *
 * Fetches incoming (reverse `!`-prefixed predicates) and outgoing
 * resource-instance links for the current asset, then renders them
 * as a simple HTML list.
 *
 * The WASM module + index files are loaded lazily on first call.
 */

export interface DiscoveredMeta {
  id: string;
  name: string;
  slug: string;
  graphId: string;
}

export interface RelationsConfig {
  wasmModule: string;   // URL to ros_madair_client.js (wasm-pack --target web output)
  indexBaseUrl: string;  // base URL for index files (summary.bin, dictionary.bin, etc.)
  rdfBaseUri: string;    // RDF base URI used when building the index
  /** Called with metadata discovered from Rós Madair page files. */
  onMetaDiscovered?: (resources: DiscoveredMeta[]) => void;
  /** Resolves a graph UUID to a human-readable model name. */
  resolveModelName?: (graphId: string) => string | undefined;
}

export interface Relation {
  predicate: string;
  resourceId: string;
  slug: string;
  name: string;
  direction: 'outgoing' | 'incoming';
  graphId?: string;
  modelName?: string;
}

interface SummaryQuad {
  pred_uri: string;
  page_o: number;
}

interface PageRecord {
  subject: string;
  object: string | null;
  subject_id: number;
  object_val: number;
}

interface PageMeta {
  page_id: number;
}

const NON_PAGE_SENTINEL = 0xFFFFFFFF;

let storePromise: Promise<any> | null = null;

async function getStore(config: RelationsConfig): Promise<any> {
  if (!storePromise) {
    storePromise = (async () => {
      const wasm = await import(config.wasmModule);
      await wasm.default();
      const store = new wasm.SparqlStore(config.indexBaseUrl);
      await store.loadSummary(config.indexBaseUrl);
      window.sparqlStore = store;
      return store;
    })();
  }
  return storePromise;
}

export interface ModelResource {
  resourceId: string;
  name: string;
  slug: string;
  model?: string;
}

export interface ModelResourceSearch {
  graphId: string;
  /** Total resources across this model's pages (from page_meta resource_count). */
  totalResources: number;
  /** Number of (non-shadow) pages for this model. */
  pageCount: number;
  /** Pages whose resources have been loaded so far. */
  loadedPages: number;
  /** Whether more pages remain to load. */
  hasMore: boolean;
  /** Load the next page's resources — one header probe + one meta range fetch. */
  loadNext(): Promise<ModelResource[]>;
}

/**
 * Paginated listing of resources belonging to a resource model (Arches graph).
 *
 * Rós Madair quantizes resources into pages grouped by graph_id (model), and
 * page_meta (loaded once by loadSummary) carries each page's graph_id and
 * resource_count. So we touch only this model's pages, and each loadNext()
 * pulls a single page's resource meta via HTTP range requests — never the whole
 * page file (predicate/tile blocks are skipped). Pagination is page-at-a-time.
 */
export async function createModelResourceSearch(
  graphId: string,
  config: RelationsConfig,
): Promise<ModelResourceSearch> {
  const store = await getStore(config);

  const pages: Array<{ page_id: number; graph_id: string; resource_count?: number; is_shadow?: boolean }> =
    JSON.parse(store.pageMetaJson());
  const modelPages = pages.filter((p) => p.graph_id === graphId && !p.is_shadow);
  const totalResources = modelPages.reduce((n, p) => n + (p.resource_count || 0), 0);

  let cursor = 0;
  const seen = new Set<string>();

  const search: ModelResourceSearch = {
    graphId,
    totalResources,
    pageCount: modelPages.length,
    loadedPages: 0,
    hasMore: modelPages.length > 0,
    async loadNext(): Promise<ModelResource[]> {
      if (cursor >= modelPages.length) {
        search.hasMore = false;
        return [];
      }
      const page = modelPages[cursor++];

      let metas: Array<{ uri?: string; name?: string; slug?: string; model?: string }> = [];
      try {
        // loadResourceMeta takes &mut self in WASM — never call concurrently.
        metas = JSON.parse(await store.loadResourceMeta(page.page_id));
      } catch (e) {
        console.warn('[model-search] loadResourceMeta failed for page', page.page_id, e);
      }

      const out: ModelResource[] = [];
      for (const m of metas) {
        const uri = m.uri || '';
        const resourceId = uri.includes('/resource/') ? uri.split('/resource/').pop()! : uri;
        if (!resourceId || seen.has(resourceId)) continue;
        seen.add(resourceId);
        out.push({
          resourceId,
          name: m.name || resourceId,
          slug: m.slug || resourceId,
          model: m.model,
        });
      }
      out.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      search.loadedPages++;
      search.hasMore = cursor < modelPages.length;
      return out;
    },
  };

  return search;
}

export async function fetchRelations(
  resourceInstanceId: string,
  config: RelationsConfig,
): Promise<Relation[]> {
  const store = await getStore(config);
  const uri = `${config.rdfBaseUri}resource/${resourceInstanceId}`;

  console.debug('[relations] lookup URI:', uri);
  const pageResult = store.pageForResource(uri);
  console.debug('[relations] pageResult:', pageResult);
  if (pageResult == null) return [];

  const pageInfo = typeof pageResult === 'string' ? JSON.parse(pageResult) : pageResult;
  const pageId: number = pageInfo.page_id;
  const layerIndex: number = pageInfo.layer_index ?? 0;
  console.debug('[relations] pageId:', pageId, 'layerIndex:', layerIndex);

  const dictId = store.lookupTerm(uri);
  console.debug('[relations] dictId:', dictId);
  if (dictId == null) return [];

  // Build set of valid page IDs so we can distinguish real resource-link
  // page_o values from quantized literals (dates, geo, booleans) that
  // happen to look like small integers.
  const pageMeta: PageMeta[] = JSON.parse(store.pageMetaJson());
  const validPages = new Set(pageMeta.map(pm => pm.page_id));

  const quads: SummaryQuad[] = JSON.parse(store.summaryFromPage(pageId));

  // Only keep quads that are actual resource links:
  // - reverse predicates (!) are always resource links by construction
  // - forward predicates where page_o is a known page ID
  const resourceQuads = quads.filter(q =>
    q.pred_uri.startsWith('!') || validPages.has(q.page_o)
  );

  const relations: Relation[] = [];
  const seen = new Set<string>();

  for (const quad of resourceQuads) {
    const predUri = quad.pred_uri;
    const isReverse = predUri.startsWith('!');
    const alias = (isReverse ? predUri.slice(1) : predUri)
      .replace(`${config.rdfBaseUri}node/`, '')
      .replace(/_/g, ' ');

    const records: PageRecord[] = JSON.parse(
      await store.loadPredicateRecords(pageId, predUri),
    );

    for (const rec of records) {
      if (rec.subject_id !== dictId) continue;
      if (!rec.object?.includes('/resource/')) continue;

      const key = `${predUri}|${rec.object}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const resourceId = rec.object.split('/resource/').pop()!;
      relations.push({
        predicate: alias,
        resourceId,
        slug: resourceId,
        name: resourceId,
        direction: isReverse ? 'incoming' : 'outgoing',
      });
    }
  }

  // Resolve slugs/names via Rós Madair page metadata.
  if (relations.length > 0) {
    await resolveRelationMeta(store, config, relations);
  }

  return relations;
}

/**
 * Resolve relation names/slugs using Rós Madair page metadata.
 *
 * Primary path: load_resource_meta (range requests to page files, one per page).
 * Fallback: resource_names.json from indexBaseUrl (older WASM without meta support).
 */
async function resolveRelationMeta(
  store: any,
  config: RelationsConfig,
  relations: Relation[],
): Promise<void> {
  const discovered: DiscoveredMeta[] = [];

  if (typeof store.loadResourceMeta === 'function') {
    // Collect unique page IDs for all related resources
    const pageIds = new Set<number>();
    const uriMap = new Map<string, Relation[]>(); // uri → relations referencing it

    for (const rel of relations) {
      const uri = `${config.rdfBaseUri}resource/${rel.resourceId}`;
      if (!uriMap.has(uri)) uriMap.set(uri, []);
      uriMap.get(uri)!.push(rel);

      const pidResult = store.pageForResource(uri);
      if (pidResult != null) {
        const pidInfo = typeof pidResult === 'string' ? JSON.parse(pidResult) : pidResult;
        pageIds.add(pidInfo.page_id);
      } else {
        console.debug('[relations] no page found for', rel.resourceId, uri);
      }
    }

    // Load metadata sequentially — load_resource_meta takes &mut self in WASM,
    // so concurrent calls trigger unsafe aliasing detection.
    for (const pid of pageIds) {
      try {
        await store.loadResourceMeta(pid);
      } catch (e) {
        console.warn('[relations] loadResourceMeta failed for page', pid, e);
      }
    }

    // Resolve each resource synchronously from the cache
    for (const [uri, rels] of uriMap) {
      const infoStr = store.resourceInfo(uri);
      if (infoStr == null) {
        console.debug('[relations] resource_info returned null for', uri);
        continue;
      }

      const info = JSON.parse(infoStr);
      for (const rel of rels) {
        rel.name = info.name || rel.resourceId;
        rel.slug = info.slug || rel.resourceId;
        rel.graphId = info.model || undefined;
        rel.modelName = info.model || undefined;
      }

      const resourceId = uri.split('/resource/').pop()!;
      discovered.push({
        id: resourceId,
        name: info.name || resourceId,
        slug: info.slug || resourceId,
        graphId: info.model || '',
      });
    }
  } else {
    // Fallback: fetch resource_names.json (older WASM without meta support)
    try {
      const url = `${config.indexBaseUrl}resource_names.json`;
      const resp = await fetch(url);
      if (resp.ok) {
        const names: Record<string, string> = await resp.json();
        for (const rel of relations) {
          if (names[rel.resourceId]) {
            rel.name = names[rel.resourceId];
          }
          // slug stays as resourceId in fallback mode
        }
      }
    } catch (e) {
      console.warn('[relations] resource_names.json fallback failed', e);
    }
  }

  if (discovered.length > 0 && config.onMetaDiscovered) {
    config.onMetaDiscovered(discovered);
  }
}

export async function loadAndRenderRelations(
  resourceInstanceId: string,
  config: RelationsConfig,
  publicView: boolean = false,
): Promise<void> {
  const accordionContainer = document.getElementById('related-resources-accordion');

  // Show banner with loading spinner while fetching (non-public view)
  const banner = document.getElementById('related-resources-banner');
  const countEl = banner?.querySelector('.related-resources-banner__count');
  if (banner && countEl) {
    countEl.innerHTML = '<span class="related-resources-banner__spinner" aria-label="Loading"></span>';
    banner.removeAttribute('hidden');
  }

  try {
    console.debug('[relations] fetching for', resourceInstanceId);
    const relations = await fetchRelations(resourceInstanceId, config);
    console.debug('[relations] found', relations.length, 'relations', relations);
    if (relations.length === 0) {
      if (banner) banner.setAttribute('hidden', '');
      if (countEl) countEl.innerHTML = '';
      return;
    }

    if (publicView && accordionContainer) {
      // Public view: render as accordion item in Further Information
      renderRelationsAccordion(relations, config.resolveModelName, accordionContainer);
    } else {
      // Non-public / fallback: populate the expandable banner
      renderRelationsBanner(relations, config.resolveModelName, publicView);
    }
  } catch (err) {
    console.warn('[relations]', err);
    if (banner) banner.setAttribute('hidden', '');
    if (countEl) countEl.innerHTML = '';
  }
}

function renderRelationsBanner(
  relations: Relation[],
  resolveModelName?: (graphId: string) => string | undefined,
  publicView: boolean = false,
): void {
  const banner = document.getElementById('related-resources-banner');
  if (!banner) return;

  const countEl = banner.querySelector('.related-resources-banner__count');
  const contentEl = document.getElementById('related-resources-banner__content');
  const toggleBtn = banner.querySelector('.related-resources-banner__toggle');
  if (!countEl || !contentEl || !toggleBtn) return;

  countEl.textContent = `(${relations.length})`;

  // Build a columnar list of related resources
  const list = document.createElement('ul');
  list.className = 'related-resources-banner__list';

  for (const rel of relations) {
    const li = document.createElement('li');

    const dirSpan = document.createElement('span');
    dirSpan.className = 'related-resources-banner__dir';
    dirSpan.textContent = rel.direction === 'incoming' ? '\u2190' : '\u2192';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'related-resources-banner__name';
    const a = document.createElement('a');
    a.href = publicView
      ? `?slug=${encodeURIComponent(rel.slug)}`
      : `?slug=${encodeURIComponent(rel.slug)}&full=true`;
    a.textContent = rel.name || '(untitled)';
    nameSpan.appendChild(a);

    const predSpan = document.createElement('span');
    predSpan.className = 'related-resources-banner__predicate';
    predSpan.textContent = rel.predicate;

    const modelSpan = document.createElement('span');
    modelSpan.className = 'related-resources-banner__model';
    const modelName = rel.modelName
      || (rel.graphId && resolveModelName ? (resolveModelName(rel.graphId) || '') : '');
    modelSpan.textContent = modelName;

    li.appendChild(dirSpan);
    li.appendChild(nameSpan);
    li.appendChild(predSpan);
    li.appendChild(modelSpan);
    list.appendChild(li);
  }

  contentEl.appendChild(list);
  banner.removeAttribute('hidden');

  // Toggle expand/collapse
  toggleBtn.addEventListener('click', () => {
    const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
    toggleBtn.setAttribute('aria-expanded', String(!expanded));
    contentEl.hidden = expanded;
  });
}

function renderRelationsAccordion(
  relations: Relation[],
  resolveModelName?: (graphId: string) => string | undefined,
  container?: HTMLElement,
): void {
  if (!container) return;

  const id = 'related-resources';
  const item = document.createElement('div');
  item.className = 'accordion-item';

  const header = document.createElement('h2');
  header.className = 'accordion-header';
  header.id = `heading-${id}`;

  const btn = document.createElement('button');
  btn.className = 'accordion-button';
  btn.type = 'button';
  btn.setAttribute('data-bs-toggle', 'collapse');
  btn.setAttribute('data-bs-target', `#collapse-${id}`);
  btn.setAttribute('aria-expanded', 'true');
  btn.setAttribute('aria-controls', `collapse-${id}`);
  btn.textContent = `Linked Resources (${relations.length})`;
  header.appendChild(btn);

  const collapse = document.createElement('div');
  collapse.id = `collapse-${id}`;
  collapse.className = 'accordion-collapse collapse show';
  collapse.setAttribute('aria-labelledby', `heading-${id}`);
  collapse.setAttribute('role', 'region');

  const body = document.createElement('div');
  body.className = 'accordion-body';

  const inner = document.createElement('div');
  inner.className = 'ms-md-4 d-flex flex-column gap-3';

  for (const rel of relations) {
    const row = document.createElement('div');
    row.className = 'd-md-flex';

    const modelName = rel.modelName
      || (rel.graphId && resolveModelName ? (resolveModelName(rel.graphId) || '') : '');
    const label = document.createElement('p');
    label.className = 'me-md-2 mb-1';
    label.innerHTML = `<strong>${rel.predicate}${modelName ? ` (${modelName})` : ''}:</strong>`;

    const value = document.createElement('div');
    const a = document.createElement('a');
    a.href = `?slug=${encodeURIComponent(rel.slug)}`;
    a.textContent = rel.name || '(untitled)';
    value.appendChild(a);

    row.appendChild(label);
    row.appendChild(value);
    inner.appendChild(row);
  }

  body.appendChild(inner);
  collapse.appendChild(body);
  item.appendChild(header);
  item.appendChild(collapse);
  container.appendChild(item);
  container.removeAttribute('hidden');
}
