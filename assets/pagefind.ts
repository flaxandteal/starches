import * as PagefindModularUI from "@pagefind/modular-ui";

import { makeSearchQuery } from "./searchContext";
import { getConfig } from './managers';

export async function buildPagefind(searchAction: (term: string, settings: object, pagefind: any) => Promise<any>) {
    const instance = new PagefindModularUI.Instance({
        showImages: false,
        debounceTimeoutMs: 800,
        bundlePath: "./pagefind/",
        allowEmptySearch: true,
        searchAction
    });
    const input = new PagefindModularUI.Input({
        containerElement: "#search",
    });
    // const designationFilters = new PagefindModularUI.FilterPills({
    //     containerElement: "#filter-designation",
    //     filter: "designations",
    //     alwaysShow: true
    // });
    const filters = new PagefindModularUI.FilterPills({
        containerElement: "#filter",
        filter: "tags",
        alwaysShow: true,
        makeFilterElement: () => (new PagefindModularUI.ElementBuilder.default("div")).class("govuk-radios__item"),
        pillInner: function(val, count) {
            const ariaChecked = this.selected.includes(val);
            console.log(this.defaultPillInner(val, count));
            return `
                <input class="govuk-radios__input" ${ariaChecked ? 'checked' : ''} aria-checked="${ariaChecked}" id="chosenRecord" name="chosenRecord" type="radio" value="${val}">
                <label class="govuk-label govuk-radios__label" for="chosenRecord">
                    ${this.defaultPillInner(val, count)}
                </label>
            `;
        }
    });
    const pillContainer = document.createElement("div");
    pillContainer.classList.add("govuk-radios");
    pillContainer.classList.add("govuk-radios--inline");
    pillContainer.setAttribute("data-module", "govuk-radios");
    filters.wrapper = document.getElementById("filter");
    filters.pillContainer = pillContainer;
    filters.wrapper.appendChild(pillContainer);
    instance.add(filters);

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
    const resultTemplate = async function (result) {
        let [indexOnly, description] = result.excerpt.split('$$$');
        if (description && description.trim().length > 0) {
            result.excerpt = description;
        } else {
            result.excerpt = indexOnly;
        }
        const el = resultList.defaultResultTemplate(result);
        let p = document.createElement("p");
        p.classList = "result-links"
        let location = result.meta.location;
        let pInner = "<div class='govuk-button-group'>";

        const url = await makeSearchQuery(result.url);
        pInner += `<a href='${url}' role="button" draggable="false" class="govuk-button" data-module="govuk-button">View</a>`;
        // Use window.open with a JavaScript event instead of target='_blank' to ensure localStorage is properly shared
        pInner += `<a href='${url}' role="button" draggable="false" class="govuk-button govuk-button--secondary" data-module="govuk-button" onclick="window.open('${url}', '_blank'); return false;">Open tab</a></li>`;
        if (location) {
            location = JSON.parse(location);
            if (location) {
              const call = `window.__starchesManagers.primaryMap.then(map => map.flyTo({center: [${location[0]}, ${location[1]}], zoom: ${config.minSearchZoom + 1}}))`;
              pInner += `<button type="submit" class="govuk-button govuk-button--secondary" data-module="govuk-button" onClick='${call}'>Zoom</button>`;
            }
        }
        p.innerHTML = pInner;
        el.children[1].append(p);
        return el;
    };
    const resultList = new PagefindModularUI.ResultList({
        containerElement: "#results",
        resultTemplate
    });
    await instance.__load__();
    // This routine from pagefind.
    // instance.__search__ = async function (term, filters) {
    //     this.__dispatch__("loading");
    //     await this.__load__();
    //     const thisSearch = ++this.__searchID__;

    //     const results = await this.__pagefind__.search(term, { filters });
    //     if (results && this.__searchID__ === thisSearch) {
    //       if (results.filters && Object.keys(results.filters)?.length) {
    //         this.availableFilters = results.filters;
    //         this.totalFilters = results.totalFilters;
    //         this.__dispatch__("filters", {
    //           available: this.availableFilters,
    //           total: this.totalFilters,
    //         });
    //       }
    //       this.searchResult = results;
    //       this.__dispatch__("results", this.searchResult);
    //     }
    //   }
    instance.add(resultList);
    return instance;
}

