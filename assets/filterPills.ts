import { FilterPills } from "@pagefind/modular-ui/components/filterPills";
import El from "@pagefind/modular-ui/helpers/element-builder";

interface CustomFilterPillsOptions {
    customTemplate?: string;
    filter?: string;
    containerElement?: string;
    ordering?: string[];
    alwaysShow?: boolean;
    selectMultiple?: boolean;
    pillInner?: (val: string, count: number) => string;
    makeFilterElement?: () => El;
    onFilterSelect?: (category: string, value: string, label: string) => void;
}

export class customFilterPills extends FilterPills {
    customTemplate: string | null;
    onFilterSelect?: (category: string, value: string, label: string) => void;

    constructor(opts: CustomFilterPillsOptions = {}) {
        super(opts);
        this.customTemplate = opts.customTemplate || null;
        this.onFilterSelect = opts.onFilterSelect;

        if (this.customTemplate) {
            this.processTemplate(this.customTemplate);
            this.initContainer(opts.containerElement)
        }
    }

    processTemplate(template: string) {
        if (!template) {
            return;
        }
        const tempContainer = document.createElement("div")
        tempContainer.innerHTML = template
        const pillContainer = tempContainer.querySelector('[data-pagefind-filters="pill-container"]');
        let pillInnerTemplate = null
        const wrapper = tempContainer.querySelector('[data-pagefind-filters="wrapper"]');
        if (wrapper) {
            wrapper.innerHTML = "";
            this.wrapper = wrapper;
        }
        if (pillContainer) {
            this.pillContainer = pillContainer;
            pillInnerTemplate = pillContainer.innerHTML;
        }
        if (pillInnerTemplate) {
            // Convert the template element into a function that generates HTML
            const templateHTML = pillInnerTemplate;
            this.pillInner = (val: string, count: number) => {
                const template = templateHTML
                    .replace(/\{\{value\}\}/g, val)
                    .replace(/\{\{count\}\}/g, count.toString());

                return template
            };
        }
    }

    initContainer(selector) {
        if (!this.customTemplate) {
            return
        }
        const container = document.querySelector(selector);
        if (!container) {
            console.error(`[Pagefind FilterPills component]: No container found for ${selector} selector`);
            return;
        }

        container.innerHTML = "";

        const id = `pagefind_modular_filter_pills_${this.filter}`;
        if (this.customTemplate) {
            this.wrapper.setAttribute("role", "group")
            this.wrapper.setAttribute("aria-labelledby", id)

            if (!this.alwaysShow) {
                this.wrapper.setAttribute("data-pfmod-hidden", true);
            }

            // Add accessibility label if not present
            if (!this.wrapper.querySelector(`#${id}`)) {
                new El("div")
                    .id(id)
                    .class("pagefind-modular-filter-pills-label")
                    .attrs({
                        "data-pfmod-sr-hidden": true
                    })
                    .text(`Filter results by ${this.filter}`)
                    .addTo(this.wrapper);
            }

            container.appendChild(this.wrapper);
        } else {
            // Use default template
            const wrapper = new El("div")
                .class("pagefind-modular-filter-pills-wrapper")
                .attrs({
                    "role": "group",
                    "aria-labelledby": id,
                });
            if (!this.alwaysShow) {
                wrapper.attrs({"data-pfmod-hidden": true});
            }
            
            new El("div")
                .id(id)
                .class("pagefind-modular-filter-pills-label")
                .attrs({
                    "data-pfmod-sr-hidden": true
                })
                .text(`Filter results by ${this.filter}`)
                .addTo(wrapper);

            this.pillContainer = new El("div")
                .class("pagefind-modular-filter-pills")
                .addTo(wrapper);

            this.wrapper = wrapper.addTo(container);
        }
    }

    renderNew() {
        this.available.forEach(([val, count], index) => {
            // Clone the pillContainer template for each pill
            const newPillContainer = this.pillContainer.cloneNode(true) as HTMLElement;

            const pillId = `radio_${this.filter}_${index}`;

            // Update the input element
            const input = newPillContainer.querySelector("input");
            if (input) {
                input.value = val;
                input.id = pillId;
                input.checked = this.selected.includes(val);
            }

            // Update the label element
            const label = newPillContainer.querySelector("label");
            if (label) {
                label.setAttribute("for", pillId);
                label.textContent = `${val} (${count})`;
            }

            // Add event listener to the input
            if (input) {
                input.addEventListener("click", () => {
                    if (val === "All") {
                        this.selected = ["All"];
                    } else if (this.selected.includes(val)) {
                        this.selected = this.selected.filter(v => v !== val);
                    } else if (this.selectMultiple) {
                        this.selected.push(val);
                    } else {
                        this.selected = [val];
                    }
                    if (!this.selected?.length) {
                        this.selected = ["All"];
                    } else if (this.selected?.length > 1) {
                        this.selected = this.selected.filter(v => v !== "All");
                    }
                    this.update();
                    this.pushFilters();
                    
                    this.onFilterSelect?.(this.filter, val, val);
                });
            }

            // Append the new pill to the wrapper
            this.wrapper.appendChild(newPillContainer);
        });
    }

    updateExisting() {
        const pills = [...this.wrapper.querySelectorAll('[data-pagefind-filters="pill-container"]')];
        this.available.forEach(([val, count], i) => {
            if (!pills[i]) return;

            const isSelected = this.selected.includes(val);
            const input = pills[i].querySelector("input") as HTMLInputElement;
            if (input) {
                input.checked = isSelected;
                input.setAttribute("aria-pressed", String(isSelected));
            }

            const label = pills[i].querySelector("label");
            if (label) {
                label.textContent = `${val} (${count})`;
            }
        });
    }
}