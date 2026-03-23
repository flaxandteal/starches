import { Asset } from './alizarin-init';
import { debug } from '../shared';
import {
  getNavigation,
  hasSearchContext,
  getAssetUrlWithContext,
  getSearchParams as getSearchContextParams,
  updateBreadcrumbs,
  makeSearchQuery
} from '../search';

// Navigation setup
export async function setupAssetNavigation(currentId: string): Promise<void> {
  debug("Setting up asset navigation for:", currentId);

  const searchParams = await getSearchContextParams();
  updateBreadcrumbs(searchParams);

  if (!await hasSearchContext()) {
    debug("No search context available");
    hideNavigationCounters();
    return;
  }

  debug("Search context found");
  const { prev, next, position, total } = await getNavigation(currentId);
  debug("Navigation:", { prev, next, position, total });

  const sections = [
    { location: 'top', prevId: 'prev-asset-top', nextId: 'next-asset-top', counterId: 'position-counter-top' },
    { location: 'bottom', prevId: 'prev-asset-bottom', nextId: 'next-asset-bottom', counterId: 'position-counter-bottom' }
  ];

  for (const section of sections) {
    const prevButton = document.getElementById(section.prevId) as HTMLAnchorElement | null;
    const nextButton = document.getElementById(section.nextId) as HTMLAnchorElement | null;
    const counter = document.getElementById(section.counterId);

    if (counter) {
      if (position && total) {
        counter.innerHTML = `Result ${position} of ${total}`;
        counter.classList.remove('js-hidden');
      } else {
        counter.classList.add('js-hidden');
      }
    }

    if (prevButton) {
      if (prev) {
        prevButton.href = await getAssetUrlWithContext(prev);
        prevButton.classList.remove('js-hidden');
      } else {
        prevButton.classList.add('js-hidden');
      }
    }

    if (nextButton) {
      if (next) {
        nextButton.href = await getAssetUrlWithContext(next);
        nextButton.classList.remove('js-hidden');
      } else {
        nextButton.classList.add('js-hidden');
      }
    }
  }
}

function hideNavigationCounters(): void {
  const topCounter = document.getElementById('position-counter-top');
  const bottomCounter = document.getElementById('position-counter-bottom');
  if (topCounter) topCounter.classList.add('js-hidden');
  if (bottomCounter) bottomCounter.classList.add('js-hidden');
}

export function setupSwapLink(slug: string, publicView: boolean): void {
  const swapLink = document.querySelector<HTMLAnchorElement>("a#swap-link");
  if (swapLink) {
    swapLink.href = `?slug=${slug}&full=${publicView}`;
    swapLink.innerHTML = publicView ? "visit full view" : "visit public view";
  }
}

export async function setupBackLinks(currentSlug: string): Promise<void> {
  const searchParams = await getSearchContextParams();
  const backLinks = document.querySelectorAll<HTMLAnchorElement>('a.back-link')
  for (const elt of Array.from(backLinks)) {
    const basePath = new URL(elt.href, window.location.origin).pathname;
    const url = await makeSearchQuery(basePath, searchParams);
    elt.href = url;
  }
}

export function setupAssetTitle(title: string): void {
  const titleEl = document.getElementById("asset-title");
  if (titleEl) {
    titleEl.innerText = title;
  }
}

export async function setupRegistryInfo(asset: Asset): Promise<void> {
  const dfcRegistryElement = document.getElementById('dfc-registry');
  if (!dfcRegistryElement) return;

  const name = asset.asset.__.wkrm.modelName;
  if (await asset.asset.__has('record_and_registry_membership')) {
    const memberships = await asset.asset.record_and_registry_membership;
    if (memberships) {
      const items = await Promise.all(
        memberships.map(async (membership: any) => {
          const registry = await membership.record_or_registry;
          const json = await registry.forJson();
          return `<li>${"Heritage Place"}</li>`;
        })
      );
    }
    dfcRegistryElement.innerHTML = `<ul><li>${name}</li></ul>`;
  } else {
    dfcRegistryElement.innerHTML = `<ul><li>${name}</li></ul>`;
  }
}

export async function setupLegacyRecord(asset: Asset, publicView: boolean): Promise<any[] | null> {
  if (publicView || !(await asset.asset.__has('_legacy_record'))) {
    const container = document.getElementById("legacy-record-container");
    if (container) container.classList.add('js-hidden');
    return null;
  }

  let legacyData = await asset.asset._legacy_record;
  if (legacyData === false) {
    const container = document.getElementById("legacy-record-container");
    if (container) container.classList.add('js-hidden');
    return null;
  }

  if (!Array.isArray(legacyData)) {
    legacyData = [legacyData];
  }

  const legacyRecord: any[] = [];
  for (const record of legacyData) {
    const dataString = await record;
    const parsed = JSON.parse(dataString);
    legacyRecord.push(
      Object.fromEntries(
        Object.entries(parsed).map(([key, block]) => {
          try {
            return [key, JSON.parse(block as string)];
          } catch {
            return [key, block];
          }
        })
      )
    );
  }

  const legacyEl = document.getElementById("legacy-record");
  if (legacyEl) {
    legacyEl.innerText = JSON.stringify(legacyRecord, null, 2);
  }

  return legacyRecord;
}

export function setupDemoWarning(asset: Asset, publicView: boolean, hasLegacyRecord: boolean): void {
  const warningEl = document.getElementById("demo-warning");
  if (!warningEl) return;

  const isPublicScope = Array.isArray(asset.asset.$.scopes) && asset.asset.$.scopes.includes('public');
  warningEl.classList.toggle('js-hidden', isPublicScope && publicView && !hasLegacyRecord);
}

export function formatTimeElements(): void {
  document.querySelectorAll<HTMLTimeElement>('time').forEach(elt => {
    const date = new Date(elt.dateTime);
    elt.innerHTML = date.toLocaleDateString();
  });
}
