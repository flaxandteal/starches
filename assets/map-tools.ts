import {Map, Marker} from 'maplibre-gl';

async function addMarkerImage(map: Map, name?: string, color?: string) {
    let marker = new Marker();
    if (!map.hasImage(name || 'marker-new')) {
        const markerSvg = marker._element.firstChild;
        if (color) {
            markerSvg.children[0].children[1].style.fill = color;
        }
        const markerImage = new Image(
            markerSvg.width.baseVal.value,
            markerSvg.height.baseVal.value,
        );
        markerImage.src = `data:image/svg+xml;base64,${btoa(new XMLSerializer().serializeToString(markerSvg))}`;
        await markerImage.decode();
        map.addImage(name || 'marker-new', markerImage);
    }
}

export { addMarkerImage };
