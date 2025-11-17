import * as fs from "fs";
import { points } from "@turf/helpers";
import { pointsWithinPolygon } from "@turf/points-within-polygon";
import { type Feature, type FeatureCollection, type MultiPolygon, type Polygon } from 'geojson';

function groupByCounty(locs: [number, number][], seaNorth: number = 55) {
  const countyData = fs.readFileSync('static/geospatial/OSNI_Open_Data_-_Largescale_Boundaries_-_County_Boundaries_.geojson');
  const counties: FeatureCollection<MultiPolygon> = JSON.parse(countyData.toString());
  const locPoints = points(locs);
  const locMatches: Array<number | null> = locs.map(() => null);

  [...counties.features.entries()].forEach(([cix, mp]: [cix: number, mp: Feature<MultiPolygon | Polygon>]) => {
    console.log('sorting', mp.properties?.CountyName);
    const result = pointsWithinPolygon(locPoints, mp);
    [...locPoints.features.entries()].forEach(([ix, loc]) => {
      if (result.features.includes(loc)) {
        locMatches[ix] = cix;
      }
    });
    console.log('end');
    return result;
  });

  // This creates two "sea regions" but note that this will include any point not in a county.
  [...locs.entries()].forEach(([cix, loc]) => {
    if (locMatches[cix] === null) {
      locMatches[cix] = (loc[1] > seaNorth) ? 7 : 8;
    }
  });

  console.log(locMatches);
  return locMatches;
}

export { groupByCounty };
