import { describe, expect, it } from "vitest";
import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";
import daten from "@/data/bundeslaender.geo.json";
import { deutschlandMaskenRinge } from "./deutschlandMaske";

const ringe = deutschlandMaskenRinge(daten as FeatureCollection<Polygon | MultiPolygon>);
// SVG fuellt bei evenodd genau die Punkte mit ungerader Zahl von Umschliessungen.
function verdeckt(lat: number, lng: number) {
  let innen = false;
  for (const ring of ringe) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [yi, xi] = ring[i];
      const [yj, xj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) innen = !innen;
    }
  }
  return innen;
}

describe("Deutschlandmaske", () => {
  it.each([
    ["Berlin", 52.52, 13.405], ["Muenchen", 48.137, 11.575],
    ["Koeln", 50.938, 6.96], ["Hamburg", 53.55, 9.99],
    ["Potsdam", 52.4, 13.06], ["Bremen", 53.079, 8.802],
  ])("laesst %s sichtbar, auch bei Stadtstaaten", (_, lat, lng) => {
    expect(verdeckt(lat, lng)).toBe(false);
  });
  it.each([
    ["Frankreich", 48.58, 7.75], ["Oesterreich", 47.8, 13.04],
    ["Schweiz", 47.37, 8.54], ["Niederlande", 52.37, 4.9],
    ["Polen", 52.4, 16.93], ["Tschechien", 50.08, 14.43],
    ["Daenemark", 55.67, 12.56], ["Belgien", 50.85, 4.35],
    ["Luxemburg", 49.61, 6.13],
  ])("deckt %s ab", (_, lat, lng) => {
    expect(verdeckt(lat, lng)).toBe(true);
  });
});
