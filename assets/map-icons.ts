import { Map as MLMap, Marker } from 'maplibre-gl';

/**
 * Heritage category to Material Icon mapping
 * Icons from https://fonts.google.com/icons (Apache 2.0 license)
 */
export interface CategoryIconConfig {
  icon: string;       // Material Icon name
  color?: string;     // Optional default color
}

export interface IconConfig {
  categories: Record<string, CategoryIconConfig>;
  defaultIcon: string;
  defaultColor: string;
}

/** Read marker colors from CSS custom properties (defined in map.css), with hardcoded fallbacks */
const _rootStyle = getComputedStyle(document.documentElement);
const DEFAULT_MARKER_COLOR = _rootStyle.getPropertyValue('--map-marker-color').trim() || '#09549f';
const DEFAULT_MARKER_ICON_COLOR = _rootStyle.getPropertyValue('--map-marker-icon-color').trim() || '#ffffff';

/**
 * Cache for the base marker SVG from MapLibre
 */
let cachedMarkerSvg: string | null = null;

/**
 * Get the base marker SVG from a MapLibre Marker
 * This is the teardrop pin shape
 */
function getMarkerSvg(): string {
  if (cachedMarkerSvg) {
    return cachedMarkerSvg;
  }

  const marker = new Marker();
  const markerSvg = marker._element.firstChild as SVGElement;
  cachedMarkerSvg = new XMLSerializer().serializeToString(markerSvg);
  marker.remove();
  return cachedMarkerSvg;
}

/**
 * Default category-to-icon mapping using Material Symbols
 * These can be overridden via params.yaml
 */
export const defaultCategoryIcons: Record<string, CategoryIconConfig> = {
  // Built heritage
  'Archaeological': { icon: 'search' },
  'Burial': { icon: 'deceased' },
  'Monuments and Memorials': { icon: 'account_balance' },
  'Natural Feature': { icon: 'landscape' },
  'Parks, Gardens & Trees': { icon: 'park' },
  'Urban Area/Urban Planning': { icon: 'location_city' },
  'Built Environment Components': { icon: 'domain' },

  // Services & Administration
  'Commercial, Financial & Professional': { icon: 'business' },
  'Government administration': { icon: 'account_balance' },
  'Health and Care Services': { icon: 'local_hospital' },
  'Education, Research & Science': { icon: 'school' },
  'Law & Order': { icon: 'gavel' },
  'Immigration, Customs & Quarantine': { icon: 'luggage' },
  'Emergency Services': { icon: 'local_fire_department' },
  'Social and Community': { icon: 'groups' },

  // Industry
  'Manufacturing and Processing': { icon: 'factory' },
  'Mining and Mineral processing': { icon: 'hardware' },
  'Forestry and Timber Industry': { icon: 'forest' },
  'Farming & Pastoralism': { icon: 'agriculture' },
  'Marine and Maritime Industry': { icon: 'anchor' },
  'Utilities': { icon: 'electric_bolt' },

  // Communications & Infrastructure
  'Communications': { icon: 'cell_tower' },
  'Defence': { icon: 'shield' },

  // Transport
  'Transport - Air': { icon: 'flight' },
  'Transport - Rail': { icon: 'train' },
  'Transport - Road': { icon: 'directions_car' },
  'Transport - Water': { icon: 'directions_boat' },
  'Transport - Other': { icon: 'commute' },

  // Living & Leisure
  'Residential': { icon: 'home' },
  'Retail, Wholesale & Services': { icon: 'storefront' },
  'Recreation and Entertainment': { icon: 'theater_comedy' },
  'Religion and Worship': { icon: 'church' },

  // Exploration & Survey
  'Exploration & Survey': { icon: 'explore' },
  'Political': { icon: 'how_to_vote' },

  // Intangible heritage
  'Event, Practice, or Ritual': { icon: 'event' },
  'Skill, Craft, or Process': { icon: 'construction' },
  'Traditions and Expressions': { icon: 'celebration' },

  // Maritime/Vessel objects
  'Vessel': { icon: 'sailing' },
  'Aircraft': { icon: 'flight' },
  'Cargo and Ballast': { icon: 'inventory_2' },
  'Clothing and Personal Items': { icon: 'checkroom' },
  'Coins and Medals': { icon: 'paid' },
  'Decorative Arts and Artificial Curiosities': { icon: 'palette' },
  'Domestic': { icon: 'house' },
  'Equipment': { icon: 'handyman' },
  'Parts of the Ship': { icon: 'anchor' },
  'Samples': { icon: 'science' },
  'Ships Furniture and Fittings': { icon: 'chair' },
  'Tools and Instruments': { icon: 'build' },
  'Utensils and Accessories': { icon: 'restaurant' },
  'Weapons and Accessories': { icon: 'security' },
  'Stores and Provisions': { icon: 'inventory' },
  'Furnishings': { icon: 'weekend' },
  'Vehicles and Machines': { icon: 'precision_manufacturing' },
  'Artwork': { icon: 'brush' },
  'Natural Objects': { icon: 'eco' },
  'Archival Objects': { icon: 'folder_open' },
  'Other Objects': { icon: 'category' },
  'Ungrouped': { icon: 'place' },
};

/**
 * Cache for loaded SVG content
 */
const svgCache: Map<string, string> = new Map();

/**
 * Fetch a Material Icon SVG from Google Fonts
 * Uses the outlined style for consistency
 */
async function fetchMaterialIconSvg(iconName: string): Promise<string> {
  if (svgCache.has(iconName)) {
    return svgCache.get(iconName)!;
  }

  // Material Symbols URL format
  const url = `https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/${iconName}/default/24px.svg`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Failed to fetch icon ${iconName}, using fallback`);
      return fetchMaterialIconSvg('place'); // Fallback to place marker
    }
    const svg = await response.text();
    svgCache.set(iconName, svg);
    return svg;
  } catch (e) {
    console.warn(`Error fetching icon ${iconName}:`, e);
    // Return a simple circle as ultimate fallback
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="currentColor"/></svg>';
  }
}

/**
 * Apply color to an SVG string
 * Material Icons use 'fill' for the icon color
 */
function colorSvg(svg: string, color: string): string {
  // Add fill color to the SVG
  // Material Symbols SVGs typically have a path or paths we need to color
  return svg.replace(/<svg([^>]*)>/, `<svg$1 fill="${color}">`);
}

// Marker dimensions (MapLibre default marker)
const MARKER_WIDTH = 27;
const MARKER_HEIGHT = 41;
const MARKER_VIEWBOX = `0 0 ${MARKER_WIDTH} ${MARKER_HEIGHT}`;
const ICON_SIZE = 14;
const ICON_X = 6.5;  // Centered in marker head: (27/2) - (14/2)
const ICON_Y = 5;    // Centered in marker head: 12 - (14/2)

/** Extract viewBox attribute from SVG string */
const getViewBox = (svg: string, fallback: string): string =>
  svg.match(/viewBox="([^"]+)"/)?.[1] ?? fallback;

/** Extract inner content from SVG (strip outer tags) */
const getSvgContent = (svg: string): string =>
  svg.replace(/<svg[^>]*>/, '').replace(/<\/svg>/, '');

/** Replace all fill colors in SVG */
const recolorSvg = (svg: string, color: string): string =>
  svg.replace(/fill="#[0-9a-fA-F]{3,6}"/g, `fill="${color}"`)
     .replace(/fill="rgb\([^)]+\)"/g, `fill="${color}"`);

/** Convert SVG string to an Image suitable for MapLibre */
async function svgToImage(svg: string, width: number, height: number): Promise<HTMLImageElement> {
  const img = new Image(width, height);
  img.src = `data:image/svg+xml;base64,${btoa(svg)}`;
  await img.decode();
  return img;
}

/** Create a composite SVG with the Material icon inside a marker pin */
function createCompositeMarkerSvg(markerSvg: string, iconSvg: string, pinColor: string, iconColor: string): string {
  const viewBox = getViewBox(markerSvg, MARKER_VIEWBOX);
  const markerContent = getSvgContent(recolorSvg(markerSvg, pinColor));
  const iconViewBox = getViewBox(iconSvg, '0 -960 960 960');
  const iconContent = getSvgContent(iconSvg);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${MARKER_WIDTH}" height="${MARKER_HEIGHT}">
    ${markerContent}
    <svg x="${ICON_X}" y="${ICON_Y}" width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="${iconViewBox}" fill="${iconColor}">
      ${iconContent}
    </svg>
  </svg>`;
}

/**
 * Add a category icon to the map as a composite marker pin
 * The icon is embedded inside the teardrop marker shape
 */
export async function addCategoryIcon(
  map: MLMap,
  category: string,
  config: IconConfig,
  pinColor?: string
): Promise<string> {
  const imageName = `category-${category.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

  if (map.hasImage(imageName)) {
    return imageName;
  }

  const categoryConfig = config.categories[category] || { icon: config.defaultIcon };
  const markerColor = pinColor || categoryConfig.color || config.defaultColor;
  const iconColor = DEFAULT_MARKER_ICON_COLOR;

  // Get the base marker SVG and the category icon
  const markerSvg = getMarkerSvg();
  const iconSvg = await fetchMaterialIconSvg(categoryConfig.icon);

  // Create composite marker with icon inside
  const compositeSvg = createCompositeMarkerSvg(markerSvg, iconSvg, markerColor, iconColor);

  const img = await svgToImage(compositeSvg, MARKER_WIDTH, MARKER_HEIGHT);
  map.addImage(imageName, img);

  return imageName;
}

/** Name for the fallback marker (no icon, just pin) */
export const FALLBACK_MARKER_NAME = 'category-fallback';

/** Create a plain marker pin without any icon inside */
function createPlainMarkerSvg(markerSvg: string, pinColor: string): string {
  const viewBox = getViewBox(markerSvg, MARKER_VIEWBOX);
  const markerContent = getSvgContent(recolorSvg(markerSvg, pinColor));

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${MARKER_WIDTH}" height="${MARKER_HEIGHT}">
    ${markerContent}
  </svg>`;
}

/**
 * Add a plain fallback marker (no icon) to the map
 */
export async function addFallbackMarker(
  map: MLMap,
  config: IconConfig,
  pinColor?: string
): Promise<string> {
  if (map.hasImage(FALLBACK_MARKER_NAME)) {
    return FALLBACK_MARKER_NAME;
  }

  const markerColor = pinColor || config.defaultColor;
  const markerSvg = getMarkerSvg();
  const plainSvg = createPlainMarkerSvg(markerSvg, markerColor);

  const img = await svgToImage(plainSvg, MARKER_WIDTH, MARKER_HEIGHT);
  map.addImage(FALLBACK_MARKER_NAME, img);

  return FALLBACK_MARKER_NAME;
}

/**
 * Preload all category icons
 * Call this on map load to avoid delays when features appear
 */
export async function preloadCategoryIcons(
  map: MLMap,
  config: IconConfig,
  categories?: string[]
): Promise<Map<string, string>> {
  const categoriesToLoad = categories || Object.keys(config.categories);
  const iconMap = new Map<string, string>();

  // Add the fallback marker first
  await addFallbackMarker(map, config);

  await Promise.all(
    categoriesToLoad.map(async (category) => {
      const imageName = await addCategoryIcon(map, category, config);
      iconMap.set(category, imageName);
    })
  );

  return iconMap;
}

/**
 * Get the icon image name for a category
 * Returns the default if category not found
 */
export function getIconNameForCategory(category: string): string {
  return `category-${category.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
}

/**
 * Build an IconConfig from params, merging with defaults
 */
export function buildIconConfig(paramsConfig?: Partial<IconConfig>): IconConfig {
  return {
    categories: {
      ...defaultCategoryIcons,
      ...(paramsConfig?.categories || {}),
    },
    defaultIcon: paramsConfig?.defaultIcon || 'place',
    defaultColor: paramsConfig?.defaultColor || DEFAULT_MARKER_COLOR,
  };
}

/**
 * Build a MapLibre expression for category-based icon selection
 * Returns a 'match' expression that maps category values to icon names
 *
 * Usage in layer config:
 *   'icon-image': buildCategoryIconExpression(iconConfig, 'category')
 *
 * @param config - The icon configuration
 * @param propertyName - The feature property containing the category (default: 'category')
 * @param fallbackIcon - Icon to use if category not matched (default: FALLBACK_MARKER_NAME)
 */
export function buildCategoryIconExpression(
  config: IconConfig,
  propertyName: string = 'category',
  fallbackIcon: string = FALLBACK_MARKER_NAME
): any[] {
  // Build match expression: ['match', ['get', 'category'], 'Cat1', 'icon1', 'Cat2', 'icon2', ..., 'fallback']
  const expression: any[] = ['match', ['get', propertyName]];

  for (const category of Object.keys(config.categories)) {
    expression.push(category);
    expression.push(getIconNameForCategory(category));
  }

  // Fallback icon if no match
  expression.push(fallbackIcon);

  return expression;
}

/**
 * Build a coalesce expression that tries category icon first, then falls back
 * This is useful when some features may not have a category property
 *
 * Usage:
 *   'icon-image': buildCategoryIconExpressionWithFallback(iconConfig)
 */
export function buildCategoryIconExpressionWithFallback(
  config: IconConfig,
  propertyName: string = 'category',
  fallbackIcon: string = FALLBACK_MARKER_NAME
): any[] {
  return [
    'coalesce',
    [
      'case',
      ['has', propertyName],
      buildCategoryIconExpression(config, propertyName, fallbackIcon),
      fallbackIcon
    ],
    fallbackIcon
  ];
}
