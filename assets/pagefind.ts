import * as PagefindModularUI from "@pagefind/modular-ui";
import { marked } from 'marked';
import { customFilterPills } from "filterPills";
import * as params from '@params';

import { makeSearchQuery, updateSearchParams } from "./searchContext";
import { getConfig } from './managers';
import { renderFilters, addActiveFilter } from "./map-ui";

// Enterprise proxies (Zscaler, TrustWave) block pagefind's gzip-compressed
// binary files (.pf_meta, .pf_fragment, .pf_index, .pf_filter, .pagefind).
// Zscaler returns HTTP 200 with an HTML block page instead of the binary,
// so we can't rely on response.ok - we detect the block via Content-Type.
//
// When a block is detected, we retry with a .txt sidecar (base64-encoded
// version of the same file, generated at build time by `npm run pagefind:fallback`).
// The decoded bytes are returned as a synthetic Response so pagefind's
// decompression pipeline works unchanged. A nicer approach would gate this on
// a setting at build-time.
const PAGEFIND_BINARY_RE = /\.(pf_meta|pf_fragment|pf_index|pf_filter|pagefind)$/;
const _originalFetch = window.fetch;
window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const response = await _originalFetch(input, init);

    if (!PAGEFIND_BINARY_RE.test(url)) return response;

    // Detect two failure modes:
    // 1. Zscaler proxy block: HTTP 200 with text/html body (block page)
    // 2. Missing file: HTTP 404 (nginx returns application/gzip content-type
    //    due to the location block's `default_type`, so we can't rely on
    //    content-type alone — check response.ok instead)
    const ct = response.headers.get('content-type') || '';
    if (response.ok && !ct.includes('text/html')) return response;

    // Blocked or missing — try base64 .txt fallback
    console.warn(`[pagefind-proxy] ${url} returned ${response.status} (likely proxy block or missing), trying .txt fallback`);
    try {
        const txtResponse = await _originalFetch(url + '.txt', init);
        const txtCt = txtResponse.headers.get('content-type') || '';
        if (!txtResponse.ok || txtCt.includes('text/html')) {
            console.error(`[pagefind-proxy] .txt fallback for ${url} also failed`);
            return response;
        }
        const b64 = (await txtResponse.text()).trim();
        const binary = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        return new Response(binary.buffer, {
            status: 200,
            statusText: 'OK',
            headers: { 'Content-Type': 'application/octet-stream' },
        });
    } catch (e) {
        console.error(`[pagefind-proxy] .txt fallback failed for ${url}:`, e);
        return response;
    }
};

/**
 * Get a precompiled Handlebars template
 * @param templateName - The name of the precompiled template
 * @returns Precompiled Handlebars template function
 */
function getPrecompiledTemplate(templateName: string): HandlebarsTemplateDelegate {
    const precompiled = (window as any).__PRECOMPILED_TEMPLATES?.[templateName];
    if (!precompiled?.template) {
        throw new Error(`Precompiled template not found: ${templateName}`);
    }
    return precompiled.template;
}

/**
 * Get template text (for non-compiled use like filter templates)
 * @param templatePath - The path to fetch the template from
 * @returns Template text as string
 */
async function loadTemplateText(templatePath: string): Promise<string> {
    const response = await fetch(templatePath);
    if (!response.ok) {
        throw new Error(`Failed to load template: ${response.statusText}`)
    }
    return await response.text();
}

export async function buildPagefind(searchAction: (term: string, settings: object, pagefind: any) => Promise<any>) {

    const instance = new PagefindModularUI.Instance({
        showImages: false,
        debounceTimeoutMs: 800,
        bundlePath: "./pagefind/",
        allowEmptySearch: true,
        searchAction,
        ranking: {
            termSimilarity: 2.5
        }
    });

    const input = params.search_config?.usecustominput
        ? new PagefindModularUI.Input({ inputElement: "#search" })
        : new PagefindModularUI.Input({ containerElement: "#search" });
    
    // Handle clear button click
    const clearButton = document.getElementById('search-clear');
    const searchInput = document.getElementById('search') as HTMLInputElement;
    if (clearButton && searchInput) {
        clearButton.addEventListener('click', async () => {
            searchInput.value = '';
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));

            // Clear map markers and reset layer visibility
            if (window.map) {
                const emptyFeatures: GeoJSON.FeatureCollection = {
                    type: 'FeatureCollection',
                    features: []
                };
                const source = window.map.getSource('assets');
                if (source && 'setData' in source) {
                    source.setData(emptyFeatures);
                }
                // Reset assets-flat layer visibility to none
                const layer = window.map.getLayer('assets-flat');
                if (layer) {
                    window.map.setLayoutProperty('assets-flat', 'visibility', 'none');
                }
                // Clear the search params as we avoid the call back in clearDraw due to a race condition 
                // where the draw clear triggers a search before the input is cleared, causing an immediate re-population of the map with all results
                await updateSearchParams({
                    searchTerm: undefined,
                    searchFilters: undefined,
                    selectionPolygon: undefined
                });

                // clear polygon selection
                if (window.map.resetViewControl) {
                    window.map.resetViewControl.clearDraw(true);
                }
            }
        });
    }

    // const designationFilters = new PagefindModularUI.FilterPills({
    //     containerElement: "#filter-designation",
    //     filter: "designations",
    //     alwaysShow: true
    // });

    const filterTemplate = await loadTemplateText('/templates/filter-list-template.html');
    
    instance.add(input);
    instance.on("loading", () => {
        let rc = document.getElementById("result-count");
        rc.innerHTML = "";
        let p = document.createElement("p");
        p.classList = 'fade';
        p.innerText = 'Searching...';
        rc.append(p);
    });
    const config = await getConfig();

    // Get the result card template (precompiled)
    const resultCardTemplate = getPrecompiledTemplate('result-card-template');
    
    const resultTemplate = async function (result) {
        let description = result.meta.rawContent;
        result.excerpt = await marked.parse(description.trim());

        const url = await makeSearchQuery(result.url);
        const location = result.meta.location ? JSON.parse(result.meta.location) : null;
        const thumbnailURL = result.meta.thumbnailUrl;
        // const thumbnailURL  = params.blob_base_url + '/media/images/' + result.meta.thumbnailName;

        const templateData = {
            title: result.meta.title || 'Untitled',
            excerpt: result.excerpt,
            url: url,
            location: location,
            thumbnailURL,
            thumbnailAlt: result.meta.thumbnailAltText ?? '',
            icon: result.meta.icon || 'building',
            slug: result.meta.slug || '',
        };

        // Render the Handlebars template
        const rawHtml = resultCardTemplate(templateData);
        return rawHtml;
    };

    // build the results list with the supplied template
    const resultList = new PagefindModularUI.ResultList({
        containerElement: "#results",
        resultTemplate
    });
    await instance.__load__();

    instance.add(resultList);

    // Get all available filters directly from the index
    const filterList = await instance.__pagefind__.filters() || {};

    if (Object.keys(filterList).length > 0) {
        renderFilters(Object.keys(filterList));

        for (let [key, items] of Object.entries(filterList)) {
            const filters = new customFilterPills({
                containerElement: `#filter-${key}`,
                filter: key,
                alwaysShow: true,
                customTemplate: filterTemplate as string,
                onFilterSelect: addActiveFilter
            });

            const filterEntries = Object.entries(items as Record<string, number>);
            filters.available = [["All", 0], ...filterEntries];

            instance.add(filters);
            filters.update();
        }
    }
    

    // Event delegation for thumbnail load errors
    const resultsContainer = document.querySelector('#results');
    if (resultsContainer) {
        resultsContainer.addEventListener('error', (event) => {
            const target = event.target as HTMLElement;
            if (target.tagName === 'IMG' && target.closest('.card-image')) {
                target.classList.add('hidden');
                const fallback = target.parentElement?.querySelector('.qld-icon');
                fallback?.classList.remove('hidden');
            }
        }, true);

        resultsContainer.addEventListener('click', (event) => {
            const target = event.target as HTMLElement;
            const viewButton = target.closest('a.view-button');
            if (viewButton) {
                event.preventDefault();
                let locationStr = viewButton.getAttribute('data-location');
                console.log('[view-on-map] clicked, locationStr:', locationStr, 'map:', !!window.map);
                if (locationStr && window.map) {
                    if (!locationStr.includes("[")) {
                        locationStr = `[${locationStr}]`;
                    }
                    const location = JSON.parse(locationStr);
                    console.log('[view-on-map] parsed location:', location);
                    // Highlight immediately so the pin glows while the camera animates,
                    // then defer the popup to moveend so it lands when the map has settled.
                    // @ts-expect-error selectFeatureAtCoordinates attached in map.ts
                    const feature = window.selectFeatureAtCoordinates?.(location[0], location[1]);
                    console.log('[view-on-map] feature:', feature);
                    console.log('[view-on-map] showFeaturePopup available:', typeof window.showFeaturePopup);
                    window.map.once('moveend', async () => {
                        console.log('[view-on-map] moveend fired, feature:', !!feature);
                        if (feature) {
                            // @ts-expect-error showFeaturePopup attached in map.ts
                            await window.showFeaturePopup?.(feature);
                            console.log('[view-on-map] showFeaturePopup called');
                        }
                    });
                    window.map.flyTo({ center: location, zoom: 14 });
                }
            }
        });
    }

    // Scroll to focused result when returning from asset page
    const focusResult = sessionStorage.getItem('lastViewedAsset');
    if (focusResult) {
        // Clear the sessionStorage to avoid applying on future visits
        sessionStorage.removeItem('lastViewedAsset');
        
        // Use MutationObserver to detect when results are rendered
        const observer = new MutationObserver(() => {
            const targetCard = document.querySelector(`[data-slug="${focusResult}"]`);
            if (targetCard) {
                observer.disconnect();
                // Scroll the card into view
                targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Add highlight class
                targetCard.classList.add('result-focused');
                // Remove highlight after a delay
                setTimeout(() => targetCard.classList.remove('result-focused'), 3000);
            }
        });
        observer.observe(document.getElementById('results'), { childList: true, subtree: true });
    }

    return instance;
}

