// Erweiterte, abgeleitete Kennzahlen für Marktanalyse-Detail & Vergleich.
// Da der Phase-1-Seed nur Basisdaten enthält, leiten wir hier plausible
// Sekundärkennzahlen aus vorhandenen Werten ab (Größe, ÖPNV, Kaufkraft, ALQ).
// Phase 3 ersetzt diese Ableitungen durch echte DB-Werte aus Destatis/OSM/BORIS.

import type { Standort } from "./marktanalyseSeed";
import { bruttomietrendite } from "./marktanalyseSeed";

export interface MikrolageStd {
  kitas_2km: number;
  schulen_2km: number;
  aerzte_2km: number;
  apotheken_2km: number;
  supermaerkte_2km: number;
  restaurants_2km: number;
  oepnv_stops_2km: number;
  gruenflaechen_pct: number;
  laerm_index: number; // 1 (leise) – 5 (laut)
  spielplaetze_2km: number;
}

export interface ImmoStd {
  bodenrichtwert_eur_qm: number;
  miete_min_eur: number;
  miete_max_eur: number;
  preistrend_5j_pct: number;
  neubauquote_pct: number;
  angebotsknappheit: "hoch" | "mittel" | "niedrig";
  wohnungsgroesse_avg_qm: number;
  eigentumsquote_pct: number;
}

export interface WirtschaftStd {
  gewerbesteuer_hebesatz: number;
  gruendungsquote_pro_1000: number;
  pendlersaldo: number;
  top_branchen: string[];
  kaufkraft_eur_kopf: number;
  einzelhandel_umsatz_index: number;
}

export interface InfraStd {
  autobahn_km: number;
  ice_bahnhof: boolean;
  flughafen_km: number;
  breitband_gbit_pct: number;
  ladesaeulen_pro_1000: number;
  radweg_km: number;
  co2_ampel: "grün" | "gelb" | "rot";
  geplante_projekte: string[];
}

// ---------- Deterministische Pseudo-Zufallszahlen aus AGS ----------
function seed(ags: string, salt: string): number {
  let h = 0;
  const s = ags + salt;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000; // 0..1
}
function rand(ags: string, salt: string, min: number, max: number, decimals = 0): number {
  const v = min + seed(ags, salt) * (max - min);
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}

// ---------- Ableitungen ----------
export function mikrolage(s: Standort): MikrolageStd {
  const dichte = Math.min(1, s.einwohner / 1_500_000); // 0..1
  const oepnv = s.oepnv_score / 5;
  const base = 15 + dichte * 40;
  return {
    kitas_2km: Math.round(base * (0.6 + seed(s.ags, "k") * 0.5)),
    schulen_2km: Math.round(base * (0.4 + seed(s.ags, "sc") * 0.4)),
    aerzte_2km: Math.round(base * (1.0 + seed(s.ags, "a") * 0.8)),
    apotheken_2km: Math.round(base * (0.3 + seed(s.ags, "ap") * 0.3)),
    supermaerkte_2km: Math.round(base * (0.5 + seed(s.ags, "sm") * 0.4)),
    restaurants_2km: Math.round(base * (1.5 + seed(s.ags, "r") * 1.5)),
    oepnv_stops_2km: Math.round(20 + oepnv * 80 + seed(s.ags, "o") * 20),
    gruenflaechen_pct: rand(s.ags, "g", 18, 42, 1),
    laerm_index: Math.min(5, Math.max(1, Math.round(2 + dichte * 2.5))),
    spielplaetze_2km: Math.round(base * (0.4 + seed(s.ags, "sp") * 0.4)),
  };
}

export function immo(s: Standort): ImmoStd {
  const trend = s.einwohner_trend_5j_pct;
  const knappheit: ImmoStd["angebotsknappheit"] =
    s.leerstand_pct < 1 ? "hoch" : s.leerstand_pct < 2.5 ? "mittel" : "niedrig";
  return {
    bodenrichtwert_eur_qm: Math.round(s.kaufpreis_qm_wohnung_eur * (0.35 + seed(s.ags, "b") * 0.25)),
    miete_min_eur: Math.round((s.miete_qm_eur * 0.75) * 10) / 10,
    miete_max_eur: Math.round((s.miete_qm_eur * 1.35) * 10) / 10,
    preistrend_5j_pct: Math.round((trend * 4 + rand(s.ags, "pt", -5, 15, 1)) * 10) / 10,
    neubauquote_pct: rand(s.ags, "nb", 0.4, 2.8, 2),
    angebotsknappheit: knappheit,
    wohnungsgroesse_avg_qm: rand(s.ags, "wg", 68, 92, 0),
    eigentumsquote_pct: rand(s.ags, "eq", 22, 55, 0),
  };
}

export function wirtschaft(s: Standort): WirtschaftStd {
  const kaufkraft = Math.round(s.kaufkraftindex * 240); // ~ €/Kopf (DE Ø ~24k)
  const branchen = topBranchen(s);
  return {
    gewerbesteuer_hebesatz: Math.round(rand(s.ags, "gh", 380, 520, 0)),
    gruendungsquote_pro_1000: rand(s.ags, "gr", 3.5, 9.5, 1),
    pendlersaldo: Math.round((s.einwohner / 100) * (s.oepnv_score >= 4 ? 1 : -0.4)),
    top_branchen: branchen,
    kaufkraft_eur_kopf: kaufkraft,
    einzelhandel_umsatz_index: Math.round(s.kaufkraftindex * (0.9 + seed(s.ags, "eh") * 0.3)),
  };
}

export function infra(s: Standort): InfraStd {
  const gross = s.einwohner > 500_000;
  return {
    autobahn_km: rand(s.ags, "ab", 2, 15, 1),
    ice_bahnhof: gross || seed(s.ags, "ice") > 0.55,
    flughafen_km: rand(s.ags, "fh", 5, 90, 0),
    breitband_gbit_pct: rand(s.ags, "bb", 45, 96, 0),
    ladesaeulen_pro_1000: rand(s.ags, "ls", 0.4, 3.2, 1),
    radweg_km: Math.round(s.einwohner / 3000 + rand(s.ags, "rw", 20, 80, 0)),
    co2_ampel: s.oepnv_score >= 4 ? "grün" : s.oepnv_score === 3 ? "gelb" : "rot",
    geplante_projekte: geplante(s),
  };
}

function topBranchen(s: Standort): string[] {
  const set = new Set<string>();
  s.top_arbeitgeber.forEach((a) => set.add(a.branche));
  return Array.from(set).slice(0, 5);
}

function geplante(s: Standort): string[] {
  const pool = [
    "S-Bahn-Ausbau",
    "Neubauquartier > 500 WE",
    "Innenstadt-Revitalisierung",
    "Glasfaser-Vollausbau",
    "Radschnellweg",
    "Neues Klinik-Zentrum",
    "Universitäts-Campus-Erweiterung",
    "Gewerbepark-Ansiedlung",
  ];
  const n = 2 + Math.floor(seed(s.ags, "gp") * 2); // 2-3
  const shuffled = pool
    .map((p) => ({ p, r: seed(s.ags, p) }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.p);
  return shuffled.slice(0, n);
}

// Zusammenfassung – für Vergleichstabelle
export function alleKennzahlenFlat(s: Standort) {
  const m = mikrolage(s);
  const im = immo(s);
  const w = wirtschaft(s);
  const inf = infra(s);
  return { m, im, w, inf, rendite: bruttomietrendite(s) };
}
