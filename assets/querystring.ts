async function getBounds() {
  if (window.STARCHES_ALLOW_BOUNDS
}

window.addEventListener('DOMContentLoaded', async (event) => {
  const searchParams = new URLSearchParams(window.location.search);
  let geoBounds = searchParams.get("geoBounds");

  if (geoBounds && /^[-,\[\]_0-9a-f.]*$/i.exec(geoBounds)) {
    const bounds: [number, number, number, number] = JSON.parse(geoBounds);
  }
  addMaps();
});
