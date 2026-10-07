import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";
import type { LatLngTuple } from "leaflet";

/** Weltflaeche mit Deutschland als Aussparung fuer eine SVG-Evenodd-Maske. */
export function deutschlandMaskenRinge(daten: FeatureCollection<Polygon | MultiPolygon>): LatLngTuple[][] {
  const ringe: LatLngTuple[][] = [
    [[85, -180], [85, 180], [-85, 180], [-85, -180]],
  ];
  for (const { geometry } of daten.features) {
    const polygone = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    for (const polygon of polygone) {
      for (const ring of polygon) {
        ringe.push(ring.map(([lng, lat]) => [lat, lng]));
      }
    }
  }
  return ringe;
}
