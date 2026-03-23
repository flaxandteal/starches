import {
  Asset, initializeAlizarinConfig, initializeAlizarin,
  parseAssetUrlParams, loadAsset, loadMaritimeAsset, fetchTemplate,
  graphManager
} from './alizarin-init';
import { debug, IAssetManager } from '../shared';
import { renderAsset, renderAssetForDebug } from './render';

export class AssetManager implements IAssetManager {
  private graphManager: typeof graphManager | null = null;
  private asset: Asset | null = null;

  async initialize(): Promise<void> {
    initializeAlizarinConfig();
    this.graphManager = await initializeAlizarin();
    debug("Alizarin initialized");
  }

  async loadAssetFromUrl(): Promise<Asset> {
    const { slug, publicView } = parseAssetUrlParams();
    debug("Loading asset:", slug, "publicView:", publicView);

    if (!this.graphManager) {
      throw new Error("AssetManager not initialized");
    }

    const isMaritime = slug.startsWith('MAR') || slug.startsWith('MAL');
    this.asset = isMaritime
      ? await loadMaritimeAsset(slug, this.graphManager)
      : await loadAsset(slug, this.graphManager);

    window.alizarinAsset = this.asset;
    debug("Asset loaded and attached to window.alizarinAsset");

    return this.asset;
  }

  async render(publicView: boolean): Promise<void> {
    if (!this.asset) {
      throw new Error("No asset loaded");
    }

    const template = await fetchTemplate(this.asset.asset);

    if (publicView && template) {
      await renderAsset(this.asset, template);
    } else {
      await renderAssetForDebug(this.asset);
    }
  }

  getAsset(): Asset | null {
    return this.asset;
  }
}
