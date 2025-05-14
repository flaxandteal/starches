import Flatbush from "flatbush";
import { deserialize as fgbDeserialize } from 'flatgeobuf/lib/mjs/geojson.js';
import { nearestPoint } from "@turf/nearest-point";

const NEAREST_RADIUS = 0.03;

class FlatbushWrapper {
    __filtered__: null | false | Set<[number, number]> = null;
    __filteredWithMetadata__: null | false | Set<[number, number]> = null;
    index: Flatbush | null = null;
    locs: Array<[number, number]> | null = null;
    bounds: null | [number, number, number, number] = null;
    totalFeatures?: number;

    async initialize(arrayBufferLocation: string, bounds: null | [number, number, number, number] = null) {
        const flatbushBin = await fetch(arrayBufferLocation)
        const arrayBuffer = await flatbushBin.arrayBuffer()
        this.index = Flatbush.from(arrayBuffer);

        const flatbushJson = await fetch('/flatbush.json');
        this.locs = await flatbushJson.json();
        if (bounds) {
            this.filter(bounds);
        } else {
            this.setFiltered(null);
        }
    }

    handleHeader(headerMeta) {
        this.totalFeatures = headerMeta.featuresCount;
        if (headerMeta?.description) {
            console.log(headerMeta.description);
        }
    }

    async getFiltered(withMetadata?: boolean) {
        if (withMetadata) {
            if (!this.__filteredWithMetadata__) {
                if (!this.bounds) {
                    return null;
                }
                this.__filteredWithMetadata__ = [];
                for await (const re of fgbDeserialize(
                    '/fgb/nihed-assets.fgb',
                     { minX: this.bounds[0], minY: this.bounds[1], maxX: this.bounds[2], maxY: this.bounds[3] },
                     this.handleHeader.bind(this)
                )) {
                    this.__filteredWithMetadata__.push({
                        // Needs corrected to the hash
                        id: re.id,
                        excerpt: re.properties.content,
                        filters: re.properties?.filters,
                        data: async () => {
                            const data = {};
                            Object.assign(data, re.properties);
                            data.excerpt = re.properties.content || '';
                            return data;
                        }
                    });
                }
            }
            return this.__filteredWithMetadata__;
        } else {
            return this.__filtered__;
        }
    }

    filter(bounds: [number, number, number, number]) {
        const set = new Set(this.index.search(...bounds).map((i) => this.locs[i][0]));
        this.setFiltered(set);
        this.bounds = bounds;
    }

    async nearest(loc: [number, number], regcode: number | undefined) {
        const fg: FeatureCollection = {
            'type': 'FeatureCollection',
            'features': []
        };
        console.log({ minX: loc[0] - NEAREST_RADIUS, minY: loc[1] - NEAREST_RADIUS, maxX: loc[0] + NEAREST_RADIUS, maxY: loc[1] + NEAREST_RADIUS });
        for await (const re of fgbDeserialize(
            '/fgb/nihed-assets.fgb',
             { minX: loc[0] - NEAREST_RADIUS, minY: loc[1] - NEAREST_RADIUS, maxX: loc[0] + NEAREST_RADIUS, maxY: loc[1] + NEAREST_RADIUS }
        )) {
            console.log(regcode, re.properties.regcode, re);
            if (!regcode || re.properties.regcode === regcode) {
                fg.features.push(re);
            }
        }
        if (fg.features.length) {
            return nearestPoint(loc, fg);
        }
    }

    setFiltered(val) {
        if (!val) {
            this.bounds = null;
        }
        let filterWarning = document.getElementById("filter-warning");
        if (val) {
            filterWarning.classList.add("filter-warning-visible");
            filterWarning.classList.remove("filter-warning-hidden");
        } else {
            filterWarning.classList.add("filter-warning-hidden");
            filterWarning.classList.remove("filter-warning-visible");
        }
        this.__filtered__ = val;
        this.__filteredWithMetadata__ = null;
    }
};

export { FlatbushWrapper };
