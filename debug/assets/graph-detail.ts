import { graphManager, client, staticStore, RDM, staticTypes, wasmReady, WKRM, ResourceModelWrapper, NodeViewModel } from 'alizarin';
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

async function createNodeElement(node: TreeNode, level: number = 0): Promise<HTMLElement> {
  const nodeItem = document.createElement('li');
  nodeItem.className = 'tree-node';
  nodeItem.style.setProperty('--level', level.toString());

  const nodeHeader = document.createElement('div');
  nodeHeader.className = 'tree-node__header';

  // Check if node has children
  const hasChildren = node.children && node.children.length > 0;

  if (hasChildren) {
    const toggle = document.createElement('button');
    toggle.className = 'tree-node__toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.textContent = '▶';
    toggle.addEventListener('click', () => toggleNode(nodeItem, toggle, node, level));
    nodeHeader.appendChild(toggle);
  } else {
    // Add spacer for alignment
    const spacer = document.createElement('span');
    spacer.className = 'tree-node__spacer';
    nodeHeader.appendChild(spacer);
  }

  const nodeContent = document.createElement('div');
  nodeContent.className = 'tree-node__content';

  // Add alias pill with cardinality indicator
  if (node.alias) {
    const aliasPill = document.createElement('span');
    aliasPill.className = 'tree-node__alias';
    // Only show cardinality if this node is a collector (nodegroup_id === nodeid)
    const isCollector = node.nodeid === node.nodegroupId;
    const cardinalityIndicator = (isCollector && node.cardinality === 'n') ? '[]' : '';
    aliasPill.textContent = node.alias + cardinalityIndicator;

    // Make pill clickable to expand/collapse if node has children
    if (hasChildren) {
      aliasPill.style.cursor = 'pointer';
      aliasPill.addEventListener('click', (e) => {
        e.stopPropagation();
        const toggle = nodeHeader.querySelector('.tree-node__toggle') as HTMLButtonElement;
        if (toggle) {
          toggle.click();
        }
      });
    }

    nodeContent.appendChild(aliasPill);
  }

  const nodeName = document.createElement('span');
  nodeName.className = 'tree-node__name';
  nodeName.textContent = node.name || node.alias || 'Unknown';
  nodeContent.appendChild(nodeName);

  const nodeType = document.createElement('span');
  nodeType.className = 'tree-node__type';
  nodeType.textContent = node.datatype || '';
  if (node.datatype) {
    nodeContent.appendChild(nodeType);
  }

  // Add copy UUID button
  const copyButton = document.createElement('button');
  copyButton.className = 'tree-node__copy-button';
  copyButton.textContent = 'Copy UUID';
  copyButton.setAttribute('aria-label', `Copy UUID for ${node.alias || node.name}`);
  copyButton.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(node.nodeid);
      copyButton.textContent = 'Copied!';
      copyButton.classList.add('tree-node__copy-button--copied');
      setTimeout(() => {
        copyButton.textContent = 'Copy UUID';
        copyButton.classList.remove('tree-node__copy-button--copied');
      }, 2000);
    } catch (error) {
      console.error('Failed to copy UUID:', error);
      copyButton.textContent = 'Failed';
      setTimeout(() => {
        copyButton.textContent = 'Copy UUID';
      }, 2000);
    }
  });
  nodeContent.appendChild(copyButton);

  nodeHeader.appendChild(nodeContent);
  nodeItem.appendChild(nodeHeader);

  return nodeItem;
}

async function toggleNode(nodeItem: HTMLElement, toggle: HTMLButtonElement, node: TreeNode, level: number): Promise<void> {
  const isExpanded = toggle.getAttribute('aria-expanded') === 'true';

  if (isExpanded) {
    // Collapse - remove children
    const childList = nodeItem.querySelector('.tree-node__children');
    if (childList) {
      childList.remove();
    }
    toggle.setAttribute('aria-expanded', 'false');
    toggle.textContent = '▶';
  } else {
    // Expand - lazy load and add children
    toggle.setAttribute('aria-expanded', 'true');
    toggle.textContent = '▼';

    const childList = document.createElement('ul');
    childList.className = 'tree-node__children';

    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        const childElement = await createNodeElement(child, level + 1);
        childList.appendChild(childElement);
      }
    }

    nodeItem.appendChild(childList);
  }
}

async function displayGraphTree(): Promise<void> {
  const gm: GraphManager = await initializeAlizarin();
  const graphId: string | null = getGraphIdFromUrl();

  const graphNameElement = document.getElementById('graph-name');
  const wkrmInfoElement = document.getElementById('wkrm-info');
  const graphInfoElement = document.getElementById('graph-info');
  const treeContainer = document.getElementById('tree-container');

  if (!graphId) {
    if (treeContainer) {
      treeContainer.innerHTML = '<p class="govuk-body">No graph ID specified</p>';
    }
    return;
  }

  debug("Loading graph:", graphId);

  // Get the WKRM for this graph
  const wkrm: WKRM | undefined = [...gm.wkrms.values()].find((w: WKRM) => w.graphId === graphId);

  if (!wkrm) {
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

  if (wkrmInfoElement) {
    const info = ["<h3>Well-Known Resource Model</h3>"];
    if (meta?.name) info.push(`<p class="govuk-body">Name: ${meta.name}</p>`);
    if (wkrm.modelClassName) info.push(`<p class="govuk-body">Class: ${wkrm.modelClassName}</p>`);
    if (meta?.subtitle) info.push(`<p class="govuk-body">${meta.subtitle}</p>`);
    if (meta?.description) info.push(`<p class="govuk-body">${meta.description}</p>`);
    info.push(`<dl class="govuk-summary-list govuk-summary-list--no-border">
      ${meta?.nodes ? `<div class="govuk-summary-list__row"><dt class="govuk-summary-list__key">Nodes</dt><dd class="govuk-summary-list__value">${meta.nodes}</dd></div>` : ''}
      ${meta?.nodegroups ? `<div class="govuk-summary-list__row"><dt class="govuk-summary-list__key">Node Groups</dt><dd class="govuk-summary-list__value">${meta.nodegroups}</dd></div>` : ''}
      ${meta?.cards ? `<div class="govuk-summary-list__row"><dt class="govuk-summary-list__key">Cards</dt><dd class="govuk-summary-list__value">${meta.cards}</dd></div>` : ''}
      ${meta?.edges ? `<div class="govuk-summary-list__row"><dt class="govuk-summary-list__key">Edges</dt><dd class="govuk-summary-list__value">${meta.edges}</dd></div>` : ''}
    </dl>`);
    wkrmInfoElement.innerHTML = info.join('');
  }

  const modelWrapper: ResourceModelWrapper<any> = await gm.get(wkrm.modelClassName);
  console.log(modelWrapper);

  if (graphInfoElement) {
    const info = ["<h3>Graph</h3>"];
    if (modelWrapper?.graph?.name) info.push(`<p class="govuk-body">Name: ${modelWrapper.graph.name}</p>`);
    if (modelWrapper?.graph?.subtitle) info.push(`<p class="govuk-body">${modelWrapper.graph.subtitle}</p>`);
    if (modelWrapper?.graph?.description) info.push(`<p class="govuk-body">${modelWrapper.graph.description}</p>`);
    info.push(`<dl class="govuk-summary-list govuk-summary-list--no-border">
      ${modelWrapper?.graph?.nodes ? `<div class="govuk-summary-list__row"><dt class="govuk-summary-list__key">Nodes</dt><dd class="govuk-summary-list__value">${modelWrapper.graph.nodes.length}</dd></div>` : ''}
      ${modelWrapper?.graph?.nodegroups ? `<div class="govuk-summary-list__row"><dt class="govuk-summary-list__key">Node Groups</dt><dd class="govuk-summary-list__value">${modelWrapper.graph.nodegroups.length}</dd></div>` : ''}
      ${modelWrapper?.graph?.cards ? `<div class="govuk-summary-list__row"><dt class="govuk-summary-list__key">Cards</dt><dd class="govuk-summary-list__value">${modelWrapper.graph.cards.length}</dd></div>` : ''}
      ${modelWrapper?.graph?.edges ? `<div class="govuk-summary-list__row"><dt class="govuk-summary-list__key">Edges</dt><dd class="govuk-summary-list__value">${modelWrapper.graph.edges.length}</dd></div>` : ''}
    </dl>`);
    graphInfoElement.innerHTML = info.join('');
  }

  if (!treeContainer) {
    debugError("Tree container not found");
    return;
  }

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

  // Create the tree view
  const treeList: HTMLUListElement = document.createElement('ul');
  treeList.className = 'tree-root';

  const rootElement: HTMLElement = await createNodeElement(treeData, 0);
  treeList.appendChild(rootElement);

  treeContainer.innerHTML = '';
  treeContainer.appendChild(treeList);

  debug("Graph tree display complete");
}

window.addEventListener('DOMContentLoaded', async (event) => {
  debug("Graph detail module loading");
  await displayGraphTree();
});
