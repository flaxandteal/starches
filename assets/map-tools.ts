import {Map, Marker} from 'maplibre-gl';

async function addMarkerImage(map: Map) {
    let marker = new Marker();
    if (!map.hasImage('marker')) {
        const markerSvg = marker._element.firstChild;
        const markerImage = new Image(
            markerSvg.width.baseVal.value,
            markerSvg.height.baseVal.value,
        );
        markerImage.src = `data:image/svg+xml;base64,${btoa(new XMLSerializer().serializeToString(markerSvg))}`;
        await markerImage.decode();
        map.addImage('marker', markerImage);
    }
}

export { addMarkerImage };
