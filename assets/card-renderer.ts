/**
 * Card-directed asset renderer.
 *
 * Uses the card→widget hierarchy (from graph.cards + graph.cards_x_nodes_x_widgets)
 * to determine WHAT to render and in what ORDER, while calling the existing
 * MarkdownRenderer's renderValue() visitor dispatch on each widget's ViewModel
 * for HOW to render each value.
 *
 * Each card is bound to exactly one nodegroup (1:1 in practice). The card
 * scopes which data to show; its widgets (from cards_x_nodes_x_widgets)
 * determine which nodes appear as fields.
 *
 * Produces markdown in the <!--section:--> + ::Block:: format consumed by
 * renderToHtml() in asset.ts.
 */

import { marked } from 'marked';
import { renderers, slugify, staticTypes, viewModels } from './alizarin-loader';

type SemanticViewModel = InstanceType<typeof viewModels.SemanticViewModel>;
type MarkdownRenderer = InstanceType<typeof renderers.MarkdownRenderer>;
type StaticNode = staticTypes.StaticNode;
type StaticNodegroup = staticTypes.StaticNodegroup;
type StaticGraph = staticTypes.StaticGraph;

/** A SemanticViewModel or the root VM — navigable via property access (Proxy). */
type NavigableViewModel = SemanticViewModel | Record<string, any>;

// --- Types ---

interface CardTreeNode {
  cardId: string;
  name: string;
  description: string;
  nodegroupId: string;
  nodegroupAlias: string;
  sortorder: number;
  visible: boolean;
  active: boolean;
  cardinality: '1' | 'n';
  widgets: WidgetInfo[];
  children: CardTreeNode[];
}

interface WidgetInfo {
  nodeId: string;
  nodeAlias: string;
  nodegroupId: string;
  label: string;
  sortorder: number;
  visible: boolean;
}

interface CardRendererOptions {
  conceptValueToUrl?: (value: any) => string | null | Promise<string | null>;
  domainValueToUrl?: (value: any) => string | null | Promise<string | null>;
  resourceReferenceToUrl?: (value: any) => string | null | Promise<string | null>;
  geojsonToUrl?: (value: any) => string | Promise<string> | undefined;
  nodeToUrl?: (value: string) => string;
  extensionToMarkdown?: (value: any, depth: number) => Promise<any>;
}

// --- Card tree construction ---

/**
 * Build a card tree from graph.cards and graph.cards_x_nodes_x_widgets.
 *
 * Each card maps 1:1 to a nodegroup. The tree hierarchy comes from
 * nodegroup parent-child relationships (which mirror the card hierarchy).
 * Each card's widgets come from cards_x_nodes_x_widgets.
 */
export function buildCardTree(
  graph: StaticGraph,
  nodesById: Map<string, StaticNode>,
  nodegroups: Map<string, StaticNodegroup>
): CardTreeNode[] {
  const cards: any[] = Array.isArray(graph.cards) ? graph.cards : [];
  const widgets: any[] = Array.isArray(graph.cards_x_nodes_x_widgets)
    ? graph.cards_x_nodes_x_widgets
    : [];

  // Index widgets by card_id (from cards_x_nodes_x_widgets)
  const widgetsByCard = new Map<string, WidgetInfo[]>();
  for (const w of widgets) {
    const cardId = w.card_id;
    const node = nodesById.get(w.node_id);
    if (!node) continue;

    const info: WidgetInfo = {
      nodeId: w.node_id,
      nodeAlias: node.alias || '',
      nodegroupId: node.nodegroup_id || '',
      label: w.label?.toString?.() || node.name || node.alias || '',
      sortorder: w.sortorder ?? 0,
      visible: w.visible !== false
    };

    if (!widgetsByCard.has(cardId)) {
      widgetsByCard.set(cardId, []);
    }
    widgetsByCard.get(cardId)!.push(info);
  }

  // Sort widgets within each card by sortorder
  for (const ws of widgetsByCard.values()) {
    ws.sort((a, b) => a.sortorder - b.sortorder);
  }

  // Build CardTreeNodes, indexed by nodegroup_id for parent lookup
  const cardNodesByNodegroup = new Map<string, CardTreeNode>();

  const cardNodes: CardTreeNode[] = cards
    .filter(c => c.active !== false)
    .map(c => {
      const nodegroupId = c.nodegroup_id;
      const nodegroup = nodegroups.get(nodegroupId);

      // Find the semantic node that is the nodegroup root
      let nodegroupAlias = '';
      for (const [, node] of nodesById) {
        if (node.nodegroup_id === nodegroupId && node.nodeid === nodegroupId) {
          nodegroupAlias = node.alias || '';
          break;
        }
      }

      const cardNode: CardTreeNode = {
        cardId: c.cardid,
        name: c.name?.toString?.() || '',
        description: c.description?.toString?.() || '',
        nodegroupId,
        nodegroupAlias,
        sortorder: c.sortorder ?? 0,
        visible: c.visible !== false,
        active: c.active !== false,
        cardinality: nodegroup?.cardinality === 'n' ? 'n' : '1',
        widgets: widgetsByCard.get(c.cardid) || [],
        children: []
      };

      // 1:1 card-to-nodegroup — store single card per nodegroup
      cardNodesByNodegroup.set(nodegroupId, cardNode);
      return cardNode;
    });

  // Build hierarchy from nodegroup parent-child relationships
  const rootCards: CardTreeNode[] = [];
  for (const cardNode of cardNodes) {
    const nodegroup = nodegroups.get(cardNode.nodegroupId);
    const parentNodegroupId = nodegroup?.parentnodegroup_id;

    if (!parentNodegroupId) {
      rootCards.push(cardNode);
    } else {
      const parentCard = cardNodesByNodegroup.get(parentNodegroupId);
      if (parentCard) {
        parentCard.children.push(cardNode);
      } else {
        rootCards.push(cardNode);
      }
    }
  }

  // Sort at each level
  rootCards.sort((a, b) => a.sortorder - b.sortorder);
  for (const card of cardNodes) {
    card.children.sort((a, b) => a.sortorder - b.sortorder);
  }

  return rootCards;
}

// --- Rendering ---

export class CardRenderer {
  private valueRenderer: MarkdownRenderer;

  constructor(options: CardRendererOptions) {
    this.valueRenderer = new renderers.MarkdownRenderer(options);
  }

  async render(
    asset: any,
    graph: StaticGraph,
    nodesById: Map<string, StaticNode>,
    nodegroups: Map<string, StaticNodegroup>
  ): Promise<{ markdown: string; rendered: any }> {
    await asset.$.ensureTilesLoaded();
    await asset.$.populate(false);

    const rootVm: SemanticViewModel = await asset.$.getRootViewModel();

    const cardTree = buildCardTree(graph, nodesById, nodegroups);
    const markdown = await this.assembleMarkdown(cardTree, rootVm);

    // Full render for image/file extraction (tiles already loaded, so fast)
    const rendered = await this.valueRenderer.render(asset);

    return { markdown, rendered };
  }

  private async assembleMarkdown(cardTree: CardTreeNode[], rootVm: NavigableViewModel): Promise<string> {
    console.debug(`[card-renderer] assembleMarkdown: ${cardTree.length} root cards:`, cardTree.map(c => `${c.name} (${c.nodegroupAlias})`));
    const sections: string[] = [];

    for (const rootCard of cardTree) {
      if (!rootCard.visible) continue;

      const sectionId = slugify(rootCard.name) || rootCard.cardId;
      const sectionContent = await this.renderCard(rootCard, rootVm);

      if (sectionContent.trim()) {
        sections.push(`<!--section:${sectionId}-->\n${sectionContent}`);
      }
    }

    return sections.join('\n');
  }

  /**
   * Render a card and its children. Uses alizarin's VM navigation (Proxy)
   * to look up the card's nodegroup, handling empty parents with children, etc.
   */
  private async renderCard(card: CardTreeNode, parentVm: NavigableViewModel): Promise<string> {
    if (!card.visible) return '';

    // Let alizarin navigate to the child VM — its Proxy handles
    // empty tiles, missing nodegroups, etc.
    let nodegroupVm: any;
    if (parentVm.__has(card.nodegroupAlias)) {
      nodegroupVm = await parentVm[card.nodegroupAlias];
      if (nodegroupVm == null) {
        console.debug(`[card-renderer] ${card.name}: __has=true but VM is null (alias=${card.nodegroupAlias})`);
      }
    } else {
      // Nodegroup not a direct child of parent — may be nested deeper.
      // Alizarin's flat card tree doesn't always match the semantic tree depth.
      console.debug(`[card-renderer] ${card.name}: __has=false (alias=${card.nodegroupAlias}, parent=${parentVm.__node?.alias || '?'})`);
      return '';
    }
    if (nodegroupVm == null) {
      // No tiles for this nodegroup — but child cards may still have data
      // (collector/grouping nodes often have no tile of their own).
      if (card.children.length > 0) {
        console.debug(`[card-renderer] ${card.name}: null VM, rendering ${card.children.length} children from parentVm`);
        const childBlocks: string[] = [];
        for (const childCard of card.children) {
          const childResult = await this.renderCard(childCard, parentVm);
          if (childResult.trim()) childBlocks.push(childResult);
        }
        return childBlocks.join('\n');
      }
      return '';
    }
    console.debug(`[card-renderer] ${card.name}: VM resolved (type=${nodegroupVm?.constructor?.name}, isArray=${Array.isArray(nodegroupVm)}, length=${Array.isArray(nodegroupVm) ? nodegroupVm.length : 'N/A'})`);

    if (Array.isArray(nodegroupVm)) {
      // PseudoList elements are AttrPromises — must await to get ViewModels.
      const instances = await Promise.all([...nodegroupVm]);
      if (card.cardinality === '1') {
        // Cardinality-1: render only the first instance (Arches enforces at most one tile).
        // Alizarin may still return a PseudoList for collector nodes even when cardinality is 1.
        const single = instances[0];
        if (!single) return '';
        if (single instanceof viewModels.ResourceInstanceViewModel) {
          // Resource-instance nodegroup — render as reference, don't traverse into it
          const rendered = await this.valueRenderer.renderValue(single, 0);
          return rendered?.toString()?.trim() || '';
        }
        return this.renderCardInstance(card, single, true);
      }
      // Cardinality-n: emit the card heading once, then each instance as a bare entry
      const blocks = await Promise.all(
        instances.map(instance => {
          if (instance instanceof viewModels.ResourceInstanceViewModel) {
            return this.valueRenderer.renderValue(instance, 0).then((r: any) => r?.toString()?.trim() || '');
          }
          return this.renderCardInstance(card, instance, false);
        })
      );
      const entries = blocks.filter(s => s.trim());
      if (entries.length === 0) return '';

      const desc = card.description ? `{${card.description}}` : '';
      const visibleWidgets = card.widgets.filter(w => w.visible);
      const widgetMeta = visibleWidgets
        .map(w => `${w.nodeAlias}=${w.label}`)
        .join(';;');
      const widgetComment = widgetMeta ? `\n<!--widgets:${widgetMeta}-->` : '';
      return `::${card.name}${desc}::${widgetComment}\n${entries.join('\n---\n')}\n::end::\n`;
    }

    // Single value (not array) — check if it's an RIVM before treating as semantic
    if (nodegroupVm instanceof viewModels.ResourceInstanceViewModel) {
      const rendered = await this.valueRenderer.renderValue(nodegroupVm, 0);
      return rendered?.toString()?.trim() || '';
    }

    return this.renderCardInstance(card, nodegroupVm as SemanticViewModel);
  }

  /**
   * Render one card instance with its widgets from cards_x_nodes_x_widgets,
   * then render child cards as sibling blocks.
   *
   * When wrapInBlock=true (default, used for single/cardinality-1 instances),
   * wraps the output in a ::Block:: with heading and widget metadata.
   * When wrapInBlock=false (used for cardinality-n instances where the caller
   * already emitted the shared heading), returns bare fields only.
   */
  private async renderCardInstance(card: CardTreeNode, semanticVm: SemanticViewModel, wrapInBlock: boolean = true): Promise<string> {
    // Guard: only SemanticViewModels can be navigated for widgets/children.
    // ResourceInstanceViewModels should have been caught in renderCard.
    if (!semanticVm || typeof semanticVm.__has !== 'function') return '';

    // Render this card's widgets (from cards_x_nodes_x_widgets).
    // Navigate via alizarin's VM Proxy — it handles null tiles, child lookups, etc.
    // Skip semantic-type VMs — those are nodegroup roots for child cards,
    // not leaf values to display.
    const fields: string[] = [];

    for (const widget of card.widgets) {
      if (!widget.visible) continue;
      // Skip nodes from child nodegroups — their own child cards render them.
      if (!semanticVm.__has(widget.nodeAlias)) continue;
      const vm = await semanticVm[widget.nodeAlias];
      if (vm == null) continue;
      if (vm instanceof viewModels.SemanticViewModel) continue;

      const rendered = await this.valueRenderer.renderValue(vm, 0);
      const text = rendered?.toString()?.trim() || '';
      if (text) {
        const html = await marked.parseInline(text);
        fields.push(`[@${widget.nodeAlias}] ${html}`);
      }
    }

    // Child cards render as sibling blocks. Navigate via alizarin's VM
    // to the child card's nodegroup — alizarin handles the parent→child relationship.
    const childBlocks: string[] = [];
    for (const childCard of card.children) {
      const childResult = await this.renderCard(childCard, semanticVm);
      if (childResult.trim()) childBlocks.push(childResult);
    }

    // Assemble output. When wrapInBlock=false (cardinality-n), return bare
    // fields — the caller wraps all instances in a single shared ::Block::.
    const parts: string[] = [];
    const ownContent = fields.join('\n');
    if (ownContent.trim()) {
      if (wrapInBlock) {
        const desc = card.description ? `{${card.description}}` : '';
        const visibleWidgets = card.widgets.filter(w => w.visible);
        const widgetMeta = visibleWidgets
          .map(w => `${w.nodeAlias}=${w.label}`)
          .join(';;');
        const widgetComment = widgetMeta ? `\n<!--widgets:${widgetMeta}-->` : '';
        parts.push(`::${card.name}${desc}::${widgetComment}\n${ownContent}\n::end::\n`);
      } else {
        parts.push(ownContent);
      }
    }
    parts.push(...childBlocks);

    return parts.filter(s => s.trim()).join('\n');
  }
}
