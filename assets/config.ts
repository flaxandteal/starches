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

// Hugo lowercases all frontmatter keys, so we need to normalize them back to camelCase
const CONFIG_KEY_MAP: Record<string, string> = {
  showgeolocatecontrol: 'showGeolocateControl',
  changemaplayeronzoom: 'changeMapLayerOnZoom',
  minsearchzoom: 'minSearchZoom',
  minsearchlength: 'minSearchLength',
  maxmappoints: 'maxMapPoints',
  timetoshowloadingms: 'timeToShowLoadingMs',
  hassearch: 'hasSearch',
  allowsearchcontext: 'allowSearchContext',
};

function normalizeConfigKeys(obj: Record<string, any>): Partial<StarchesConfiguration> {
  const normalized: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    normalized[CONFIG_KEY_MAP[key.toLowerCase()] || key] = value;
  }
  return normalized;
}

function buildConfig() {
  const raw: Record<string, any> = window.STARCHES_BASE_CONFIGURATION ? JSON.parse(window.STARCHES_BASE_CONFIGURATION) : {};
  const base = normalizeConfigKeys(raw);
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
