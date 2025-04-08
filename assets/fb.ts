import Flatbush from "flatbush";

class FlatbushWrapper {
    __filtered__: null | false | Set<[number, number]> = null;
    index: Flatbush | null = null;
    locs: Array<[number, number]> | null = null;
    bounds: null | [number, number, number, number] = null;

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

    getFiltered() {
        return this.__filtered__;
    }

    filter(bounds: [number, number, number, number]) {
       this.setFiltered(new Set(this.index.search(...bounds).map((i) => this.locs[i])));
       this.bounds = bounds;
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
    }
};

export { FlatbushWrapper };
