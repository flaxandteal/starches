// Active filter management
interface ActiveFilter {
    category: string;
    value: string;
    label: string;
}

const activeFilters: Map<string, ActiveFilter> = new Map();

export function addActiveFilter(category: string, value: string, label: string): void {
    if (value === 'All') {
        activeFilters.delete(category);
    } else {
        activeFilters.set(category, { category, value, label });
    }
    updateActiveFiltersList();
}

export function renderFilters(categories: string[]): void {
    const tabContainer = document.getElementById('filter-tabs-container');
    const contentContainer = document.getElementById('tag-content');
    const tabTemplate = document.getElementById('filter-tab-template') as HTMLTemplateElement;
    const contentTemplate = document.getElementById('filter-content-template') as HTMLTemplateElement;

    if (!tabContainer || !contentContainer || !tabTemplate || !contentTemplate) return;

    tabContainer.innerHTML = '';
    contentContainer.innerHTML = '';

    categories.forEach((category, index) => {
        const contentId = `filter-content-${category}`;
        const mountPointId = `filter-${category}`;

        // Clone and populate Tab
        const tabClone = tabTemplate.content.cloneNode(true) as DocumentFragment;
        const li = tabClone.querySelector('li');
        const link = li?.querySelector('a');

        if (li && link) {
            li.setAttribute('data-content', contentId);
            // Capitalize first letter for label
            link.textContent = category.charAt(0).toUpperCase() + category.slice(1);
            
            if (index === 0) li.classList.add('selected');

            // Attach click listener immediately
            li.addEventListener('click', function(this: HTMLElement) {
                document.querySelectorAll<HTMLElement>('.tag').forEach(t => t.classList.remove('selected'));
                this.classList.add('selected');
                document.querySelectorAll<HTMLElement>('.content-item').forEach(c => c.classList.remove('active'));
                
                const contentToShow = document.getElementById(contentId);
                if (contentToShow) contentToShow.classList.add('active');
            });
            tabContainer.appendChild(tabClone);
        }

        // Clone and populate Content
        const contentClone = contentTemplate.content.cloneNode(true) as DocumentFragment;
        const div = contentClone.querySelector('.content-item');
        const innerDiv = div?.querySelector('div');

        if (div && innerDiv) {
            div.id = contentId;
            innerDiv.id = mountPointId; // This is where pagefind will mount the filter pills
            if (index === 0) div.classList.add('active');
            contentContainer.appendChild(contentClone);
        }
    });
}

function updateActiveFiltersList(): void {
    const filterList = document.querySelector('.tag-list.tag-dark.my-0');
    if (!filterList) return;

    const existingFilters = filterList.querySelectorAll('li');
    console.log("existing filters", existingFilters)
    existingFilters.forEach(filter => filter.remove());

    activeFilters.forEach((filter) => {
        const li = document.createElement('li');
        li.className = 'tag-item tag-large';
        li.innerHTML = `
            ${filter.label}
            <button class="tag-clear-filter-button" aria-label="Remove ${filter.label}" data-category="${filter.category}"></button>
        `;
        
        const clearBtn = li.querySelector('.tag-clear-filter-button');
        if (clearBtn) {
            clearBtn.addEventListener('click', (e: Event): void => {
                e.stopPropagation();
                removeFilter(filter.category);
            });
        }
        
        filterList.appendChild(li);
    });

    const firstItem = filterList.querySelector('li:first-child');
    if (firstItem) {
        if (activeFilters.size > 0) {
            firstItem.classList.remove('d-none');
        } else {
            firstItem.classList.add('d-none');
        }
    }
}

function removeFilter(category: string): void {
    activeFilters.delete(category);
    
    // Find and click the "All" option for this category to reset the filter
    const filterContainer = document.getElementById(`filter-${category}`);
    if (filterContainer) {
        const allInput = Array.from(filterContainer.querySelectorAll<HTMLInputElement>('input'))
            .find(input => input.value === 'All');
        if (allInput) {
            allInput.click();
        }
    }
    
    updateActiveFiltersList();
}

function hasSearchResults(): boolean {
    const searchResults = document.getElementById('results');
    if (!searchResults) return false;
    const listItems = searchResults.querySelectorAll('li');
    return listItems.length > 0;
}

// Filter toggle functionality
document.addEventListener('DOMContentLoaded', (): void => {
    const filterToggle = document.getElementById('filterToggle');
    if (filterToggle) {
        filterToggle.addEventListener('click', (event: Event): void => {
            event.preventDefault();

            const filterContent = document.getElementById('filterContent');
            if (!filterContent) return;

            const isExpanded = filterToggle.getAttribute('aria-expanded') === 'true';

            filterToggle.setAttribute('aria-expanded', (!isExpanded).toString());

            if (filterContent.classList.contains('expanded')) {
                filterContent.classList.remove('expanded');
            } else {
                filterContent.classList.add('expanded');
            }
        });
    }

    // Help toggle functionality
    const helpToggle = document.getElementById('help-toggle');
    const helpContent = document.getElementById('help-content');
    
    if (helpToggle) {
        helpToggle.addEventListener('click', (event: Event): void => {
            event.preventDefault();

            if (!helpContent) return;

            const isExpanded = helpToggle.getAttribute('aria-expanded') === 'true';

            helpToggle.setAttribute('aria-expanded', (!isExpanded).toString());
            helpContent.classList.toggle('hidden');
        });
    }

    // Monitor search results container for changes and hide help content when search results are present
    const resultsContainer = document.getElementById('results');
    if (resultsContainer && helpContent) {
        const observer = new MutationObserver((): void => {
            if (hasSearchResults()) {
                helpContent.classList.add('hidden');
                if (helpToggle) {
                    helpToggle.setAttribute('aria-expanded', 'false');
                }
            } else {
                // Show help content again when results are cleared
                helpContent.classList.remove('hidden');
                if (helpToggle) {
                    helpToggle.setAttribute('aria-expanded', 'true');
                }
            }
        });

        // Observe changes to the results container
        observer.observe(resultsContainer, {
            childList: true,
            subtree: true
        });
    }

    // Initialize: hide the filter label if no filters are active
    const firstFilterItem = document.querySelector('.tag-list.tag-dark.my-0 li:first-child');
    if (firstFilterItem && activeFilters.size === 0) {
        firstFilterItem.classList.add('d-none');
    }
});
