function makeDefaultConfiguration(): StarchesBaseConfiguration {
  return {
    showGeolocateControl: false,
    minSearchZoom: 13,
    minSearchLength: 4,
    maxMapPoints: 300,
    timeToShowLoadingMs: 50,
    allowSearchContext: false
  };
}

class StarchesBaseConfiguration {
  [key: string]: any

  showGeolocateControl?: boolean;
  minSearchZoom?: number;
  minSearchLength?: number;
  maxMapPoints?: number;
  timeToShowLoadingMs?: number;

  constructor(configuration: StarchesBaseConfiguration) {
    Object.assign(this, makeDefaultConfiguration());
    Object.assign(this, configuration);
  }
}

class StarchesConfiguration extends StarchesBaseConfiguration {
  hasSearch: boolean;

  constructor(configuration: StarchesConfiguration) {
    super(configuration);
    Object.assign(this, configuration);
  }
}

let resolveConfiguration;
const configuration: Promise<StarchesConfiguration> = new Promise((resolve) => { resolveConfiguration = resolve; });

function buildConfig() {
  const base: StarchesBaseConfiguration = window.STARCHES_BASE_CONFIGURATION ? JSON.parse(window.STARCHES_BASE_CONFIGURATION) : {};
  const loadedConfiguration = {
    hasSearch: !!window.STARCHES_HAS_SEARCH,
    ...base
  };
  const configuration = new StarchesConfiguration(loadedConfiguration);
  console.debug("Loaded Starches configuration", configuration);
  resolveConfiguration(configuration);
}

export async function getConfig(): Promise<StarchesConfiguration> {
  return configuration;
}

window.addEventListener('DOMContentLoaded', async (event) => {
  buildConfig();
});
