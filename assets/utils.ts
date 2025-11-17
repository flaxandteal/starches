export function isTouch() {
    return (('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0));
}

export function slugify(key: string) {
  // TODO: make a proper slugify
  return `${key}`.replaceAll(/[^A-Za-z0-9_]/g, "").slice(0, 20);
}
