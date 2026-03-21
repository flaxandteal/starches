import { parseAssetUrlParams } from './alizarin-init';
import { debug } from '../shared/debug';
import {
  setupAssetNavigation, setupSwapLink,
  setupAssetTitle, setupLegacyRecord,
  setupDemoWarning, formatTimeElements
} from './ui-setup';
import { resolveAssetManagerWith } from '../shared/managers';
import { AssetManager } from './asset-manager';
import '../w3c-treegrid.js';

declare global {
  interface Window {
    archesUrl?: string;
    alizarinAsset?: any;
    showDialog?: (dialogId: string) => void;
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  const assetManager = new AssetManager();

  await assetManager.initialize();
  resolveAssetManagerWith(assetManager);

  const { slug, publicView } = parseAssetUrlParams();
  const asset = await assetManager.loadAssetFromUrl();
  debug("Asset meta:", asset.meta);

  await assetManager.render(publicView);

  // TODO: Make hardcoded check for Sketchfab to display 3D asset more flexible
  for (const ecr of await asset.asset.external_cross_references || []) {
    if (await ecr.external_cross_reference_source == "Sketchfab") {
      document.getElementById('sketchfab-viewer')?.classList.remove('hidden');
    }
  }

  setupAssetTitle(asset.meta.title);
  setupSwapLink(slug, publicView);

  const legacyRecord = await setupLegacyRecord(asset, publicView);
  setupDemoWarning(asset, publicView, !!legacyRecord);

  formatTimeElements();

  setTimeout(() => setupAssetNavigation(slug), 100);
  sessionStorage.setItem('lastViewedAsset', slug);
  history.pushState({}, "", `?slug=${slug}&full=${!publicView}`);
}, { once: true });
