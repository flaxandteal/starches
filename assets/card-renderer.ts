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

/** Plain object returned by SemanticViewModel.toObject() — {alias: ViewModel} */
type ViewModelChildren = Record<string, any>;

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
    const rootChildren: ViewModelChildren = await rootVm.toObject();

    const cardTree = buildCardTree(graph, nodesById, nodegroups);
    const markdown = await this.assembleMarkdown(cardTree, rootChildren);

    // Full render for image/file extraction (tiles already loaded, so fast)
    const rendered = await this.valueRenderer.render(asset);

    return { markdown, rendered };
  }

  private async assembleMarkdown(cardTree: CardTreeNode[], rootChildren: ViewModelChildren): Promise<string> {
    const sections: string[] = [];

    for (const rootCard of cardTree) {
      if (!rootCard.visible) continue;

      const sectionId = slugify(rootCard.name) || rootCard.cardId;
      const sectionContent = await this.renderCard(rootCard, rootChildren);

      if (sectionContent.trim()) {
        sections.push(`<!--section:${sectionId}-->\n${sectionContent}`);
      }
    }

    return sections.join('\n');
  }

  /**
   * Render a card and its children. Looks up the card's nodegroup VM from
   * parentContext, handles cardinality-n by iterating instances.
   *
   * @param parentContext - Plain object from toObject() (safe, no Proxy).
   */
  private async renderCard(card: CardTreeNode, parentContext: ViewModelChildren): Promise<string> {
    if (!card.visible) return '';

    const nodegroupVm = parentContext[card.nodegroupAlias];
    if (nodegroupVm === null || nodegroupVm === undefined) return '';

    if (card.cardinality === 'n' && Array.isArray(nodegroupVm)) {
      // PseudoList elements are AttrPromises — must await to get SemanticViewModels.
      const instances: SemanticViewModel[] = await Promise.all([...nodegroupVm]);
      const blocks = await Promise.all(
        instances.map(instance => this.renderCardInstance(card, instance))
      );
      return blocks.filter(s => s.trim()).join('\n');
    }

    return this.renderCardInstance(card, nodegroupVm as SemanticViewModel);
  }

  /**
   * Render one card instance as a ::Block:: with its widgets from
   * cards_x_nodes_x_widgets, then render child cards as sibling blocks.
   */
  private async renderCardInstance(card: CardTreeNode, semanticVm: SemanticViewModel): Promise<string> {
    // toObject() returns a plain {} — safe property access, no Proxy.
    const children: ViewModelChildren = (typeof semanticVm?.toObject === 'function')
      ? await semanticVm.toObject()
      : (typeof semanticVm === 'object' ? semanticVm as unknown as ViewModelChildren : {});

    // Render this card's widgets (from cards_x_nodes_x_widgets).
    // Skip semantic-type VMs — those are nodegroup roots for child cards,
    // not leaf values to display.
    const fields: string[] = [];
    for (const widget of card.widgets) {
      if (!widget.visible) continue;

      const vm = children[widget.nodeAlias];
      if (vm === null || vm === undefined) continue;
      if (vm instanceof viewModels.SemanticViewModel) continue;

      const rendered = await this.valueRenderer.renderValue(vm, 0);
      const text = rendered?.toString()?.trim() || '';
      if (text) {
        const html = await marked.parseInline(text);
        fields.push(`[@${widget.nodeAlias}] ${html}`);
      }
    }

    // Child cards render as sibling blocks (not nested), each looking up
    // its own nodegroup VM from the children context.
    const childBlocks: string[] = [];
    for (const childCard of card.children) {
      const childResult = await this.renderCard(childCard, children);
      if (childResult.trim()) childBlocks.push(childResult);
    }

    // Assemble: own fields in a ::Block::, child blocks as siblings.
    // Description (if present) is encoded in {braces} for the template.
    // Widget metadata encoded as <!--widgets:alias=Label;;alias2=Label2--> for schema display.
    const parts: string[] = [];
    const ownContent = fields.join('\n');
    if (ownContent.trim()) {
      const desc = card.description ? `{${card.description}}` : '';
      const visibleWidgets = card.widgets.filter(w => w.visible);
      const widgetMeta = visibleWidgets
        .map(w => `${w.nodeAlias}=${w.label}`)
        .join(';;');
      const widgetComment = widgetMeta ? `\n<!--widgets:${widgetMeta}-->` : '';
      parts.push(`::${card.name}${desc}::${widgetComment}\n${ownContent}\n::end::\n`);
    }
    parts.push(...childBlocks);

    return parts.filter(s => s.trim()).join('\n');
  }
}
