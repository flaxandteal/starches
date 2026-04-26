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
}

export interface Relation {
  predicate: string;
  resourceId: string;
  slug: string;
  name: string;
  direction: 'outgoing' | 'incoming';
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
      await store.load_summary();
      return store;
    })();
  }
  return storePromise;
}

export async function fetchRelations(
  resourceInstanceId: string,
  config: RelationsConfig,
): Promise<Relation[]> {
  const store = await getStore(config);
  const uri = `${config.rdfBaseUri}resource/${resourceInstanceId}`;

  const pageId = store.page_for_resource(uri);
  if (pageId == null) return [];

  const dictId = store.lookup_term(uri);
  if (dictId == null) return [];

  // Build set of valid page IDs so we can distinguish real resource-link
  // page_o values from quantized literals (dates, geo, booleans) that
  // happen to look like small integers.
  const pageMeta: PageMeta[] = JSON.parse(store.page_meta_json());
  const validPages = new Set(pageMeta.map(pm => pm.page_id));

  const quads: SummaryQuad[] = JSON.parse(store.summary_from_page(pageId));

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
      await store.load_predicate_records(pageId, predUri),
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

  if (typeof store.load_resource_meta === 'function') {
    // Collect unique page IDs for all related resources
    const pageIds = new Set<number>();
    const uriMap = new Map<string, Relation[]>(); // uri → relations referencing it

    for (const rel of relations) {
      const uri = `${config.rdfBaseUri}resource/${rel.resourceId}`;
      if (!uriMap.has(uri)) uriMap.set(uri, []);
      uriMap.get(uri)!.push(rel);

      const pid = store.page_for_resource(uri);
      if (pid != null) {
        pageIds.add(pid);
      } else {
        console.debug('[relations] no page found for', rel.resourceId, uri);
      }
    }

    // Load metadata sequentially — load_resource_meta takes &mut self in WASM,
    // so concurrent calls trigger unsafe aliasing detection.
    for (const pid of pageIds) {
      try {
        await store.load_resource_meta(pid);
      } catch (e) {
        console.warn('[relations] load_resource_meta failed for page', pid, e);
      }
    }

    // Resolve each resource synchronously from the cache
    for (const [uri, rels] of uriMap) {
      const infoStr = store.resource_info(uri);
      if (infoStr == null) {
        console.debug('[relations] resource_info returned null for', uri);
        continue;
      }

      const info = JSON.parse(infoStr);
      for (const rel of rels) {
        rel.name = info.name || rel.resourceId;
        rel.slug = info.slug || rel.resourceId;
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
): Promise<void> {
  const container = document.getElementById('resource-relations');
  if (!container) return;

  try {
    const relations = await fetchRelations(resourceInstanceId, config);
    if (relations.length === 0) return;

    const outgoing = relations.filter(r => r.direction === 'outgoing');
    const incoming = relations.filter(r => r.direction === 'incoming');

    let html = '<h2>Linked Resources</h2>';

    if (outgoing.length > 0) {
      html += '<h3>Outgoing</h3><ul>';
      for (const r of outgoing) {
        html += `<li><a href="?slug=${encodeURIComponent(r.slug)}&full=true">${r.name}</a> (${r.predicate})</li>`;
      }
      html += '</ul>';
    }

    if (incoming.length > 0) {
      html += '<h3>Incoming</h3><ul>';
      for (const r of incoming) {
        html += `<li><a href="?slug=${encodeURIComponent(r.slug)}&full=true">${r.name}</a> (${r.predicate})</li>`;
      }
      html += '</ul>';
    }

    container.innerHTML = html;
    container.removeAttribute('hidden');
  } catch (err) {
    console.warn('[relations]', err);
  }
}
