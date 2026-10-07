export interface Quelle {
  id: string;
  name: string;
  url: string;
  kategorie: "statistik" | "immo" | "wirtschaft" | "geo";
  stand: string;
  lizenz?: string;
}

export const QUELLEN: Record<string, Quelle> = {
  destatis: {
    id: "destatis",
    name: "Statistisches Bundesamt (Destatis) – GENESIS-Online",
    url: "https://www-genesis.destatis.de",
    kategorie: "statistik",
    stand: "2026-06",
    lizenz: "Datenlizenz Deutschland – Namensnennung 2.0",
  },
  boris: {
    id: "boris",
    name: "BORIS-D – Bodenrichtwerte der Gutachterausschüsse",
    url: "https://www.bodenrichtwerte-boris.de",
    kategorie: "immo",
    stand: "2026-01",
    lizenz: "je Bundesland unterschiedlich",
  },
  bbsr: {
    id: "bbsr",
    name: "BBSR – Wohnungsmarktbeobachtung",
    url: "https://www.bbsr.bund.de",
    kategorie: "immo",
    stand: "2026-Q1",
    lizenz: "Datenlizenz Deutschland – Namensnennung 2.0",
  },
  ba: {
    id: "ba",
    name: "Bundesagentur für Arbeit – Statistik",
    url: "https://statistik.arbeitsagentur.de",
    kategorie: "wirtschaft",
    stand: "2026-05",
  },
  ihk: {
    id: "ihk",
    name: "IHK / Bundesanzeiger – Unternehmensregister",
    url: "https://www.unternehmensregister.de",
    kategorie: "wirtschaft",
    stand: "2026",
  },
  osm: {
    id: "osm",
    name: "OpenStreetMap / Overpass API",
    url: "https://www.openstreetmap.org",
    kategorie: "geo",
    stand: "laufend",
    lizenz: "ODbL",
  },
  google_maps: {
    id: "google_maps",
    name: "Google Maps Platform (Places / Geocoding)",
    url: "https://developers.google.com/maps",
    kategorie: "geo",
    stand: "laufend",
  },
  gfk: {
    id: "gfk",
    name: "GfK / MB-Research – Kaufkraftindex (Fallback: Destatis-Median)",
    url: "https://www.gfk.com",
    kategorie: "wirtschaft",
    stand: "2025",
  },
};

export function quellenFor(ids: string[]): Quelle[] {
  const unique = Array.from(new Set(ids));
  return unique.map((id) => QUELLEN[id]).filter(Boolean);
}