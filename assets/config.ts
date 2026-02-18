import { StarchesConfiguration, resolveConfigurationWith, getConfig } from './managers';

function makeDefaultConfiguration(): Partial<StarchesConfiguration> {
  return {
    showGeolocateControl: false,
    changeMapLayerOnZoom: false,
    minSearchZoom: 10,
    minSearchLength: 4,
    maxMapPoints: 300,
    timeToShowLoadingMs: 50,
    allowSearchContext: true
  };
}

function buildConfig() {
  const base: Partial<StarchesConfiguration> = window.STARCHES_BASE_CONFIGURATION ? JSON.parse(window.STARCHES_BASE_CONFIGURATION) : {};
  const loadedConfiguration: StarchesConfiguration = {
    hasSearch: !!window.STARCHES_HAS_SEARCH,
    ...makeDefaultConfiguration(),
    ...base
  };
  console.debug("Loaded Starches configuration", loadedConfiguration);
  resolveConfigurationWith(loadedConfiguration);
}

// Re-export for backward compatibility
export { getConfig };

window.addEventListener('DOMContentLoaded', async (event) => {
  buildConfig();
});
