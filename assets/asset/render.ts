import {
  Asset, staticTypes, renderers
} from './alizarin-init';
import { debug } from '../shared/debug';
import { registerDialogs, setupDialogLinks } from '../shared/dialog';
import { initCarousel } from '../carousel/carousel';
import { renderPDFAsset } from './pdf-export';
import { extractImageList } from './image-manager';
import { RENDERER_OPTIONS, renderToHtml, injectSections } from './markdown-renderer';

interface ImageRef {
  image: any;
  index: number;
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

async function buildImageDialogs(images: ImageRef[], assetTitle: string): Promise<Record<string, { title: string; body: string }>> {
  const dialogs: Record<string, { title: string; body: string }> = {};

  for (const { image, index } of images) {
    dialogs[`image_${index}`] = {
      title: `<h3>Image for ${assetTitle}</h3>\n<h4>${await image.external_cross_reference}</h4>`,
      body: `<img src='${image.url.__clean}' />`
    };
  }

  return dialogs;
}

export async function renderAssetForDebug(asset: Asset): Promise<void> {
  const alizarinRenderer = new renderers.MarkdownRenderer({
    ...RENDERER_OPTIONS,
    nodeToUrl: (node: staticTypes.StaticNode) => `@${node.alias}`
  });

  let markdown = await alizarinRenderer.render(asset.asset);

  if (Array.isArray(markdown)) {
    markdown = markdown.join("\n\n");
  }

  const assetEl = document.getElementById('asset');
  if (!assetEl) return;

  const returnElt = document.createElement('a');
  returnElt.href = "../asset-list/?model=" + asset.asset.__.wkrm.graphId;
  returnElt.innerText = "List all resources for this model";
  assetEl.appendChild(returnElt);

  const treegridElt = document.createElement('tree-grid') as HTMLElement & {
    data: { listItems: string | string[]; nodeObjectsByAlias: Map<string, any> };
  };
  assetEl.appendChild(treegridElt);

  const nodeObjectsByAlias = asset.asset.__.getNodeObjectsByAlias();
  treegridElt.data = { listItems: markdown, nodeObjectsByAlias };

  registerDialogs(await buildImageDialogs([], asset.meta.title));
  setupDialogLinks();
}

export async function renderAsset(asset: Asset, template: HandlebarsTemplateDelegate): Promise<void> {
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
  await initCarousel(assetImages);
  injectSections(sections);

  const downloadPdfButton = document.getElementById('asset-download');
  if (downloadPdfButton) {
    downloadPdfButton.addEventListener('click', (e) => {
      e.preventDefault();
      const link = downloadPdfButton as HTMLAnchorElement;
      const spinner = document.getElementById('asset-download-spinner');

      link.classList.add('disabled');
      link.setAttribute('aria-disabled', 'true');
      link.querySelectorAll<HTMLSpanElement>('span').forEach(s => s.hidden = true);
      spinner?.removeAttribute('hidden');

      renderPDFAsset(markdown, nodes, asset.meta.title, assetImages).finally(() => {
        link.classList.remove('disabled');
        link.removeAttribute('aria-disabled');
        link.querySelectorAll<HTMLSpanElement>('span').forEach(s => s.hidden = false);
        spinner?.setAttribute('hidden', 'true');
      });
    });
  }

  addAssetToMap(asset);

  registerDialogs(await buildImageDialogs(images, asset.meta.title));
  setupDialogLinks();
}

// Lazy import to avoid circular dependency
async function addAssetToMap(asset: Asset): Promise<void> {
  const { addAssetToMap: addMap } = await import('./asset-map');
  addMap(asset);
}
