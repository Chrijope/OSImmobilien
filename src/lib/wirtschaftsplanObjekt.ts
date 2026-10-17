/**
 * Der Wirtschaftsplan am Objekt (17.10.2026, Stufe 2 der Objektdaten).
 *
 * Bis dahin lag ein Wirtschaftsplan nur in den Kaufpreislisten, je Nutzer
 * gespeichert. Jetzt hängt er am Objekt (`objekte.meta.wirtschaftsplan`), und
 * das Hausgeld jeder Einheit ergibt sich daraus über ihre MEA. Gerechnet wird
 * mit denselben Funktionen wie in der Kaufpreisliste (`kaufpreisliste.ts`),
 * damit beide nie auseinanderlaufen.
 */
import { cacheGet } from "./dataCache";
import type { Blatt } from "./excelLesen";
import {
  HAUSGELD_KATEGORIEN, hausgeldMonat, neueWpPosition,
  type HausgeldKategorie, type Verteiler, type Wirtschaftsplan,
} from "./kaufpreisliste";

export function wirtschaftsplanAusMeta(meta: unknown): Wirtschaftsplan | null {
  const wp = (meta as { wirtschaftsplan?: Wirtschaftsplan } | null)?.wirtschaftsplan;
  return wp && Array.isArray(wp.positionen) ? wp : null;
}

export function wirtschaftsplanFuerObjekt(objektId: string): Wirtschaftsplan | null {
  const zeile = cacheGet("objekte").find((o: { id: string }) => o.id === objektId);
  return wirtschaftsplanAusMeta(zeile?.meta);
}

export interface HausgeldTeile {
  gesamt: number;
  /** Umlagefähig einschließlich Heizkosten, wie in den Listen („davon umlagefähig inkl. Heizung“). */
  umlagefaehig: number;
  nichtUmlagefaehig: number;
  ruecklage: number;
}

const rund = (n: number) => Math.round(n * 100) / 100;

/** Hausgeld einer Einheit je Monat aus dem Plan; null ohne MEA oder Gesamt-MEA. */
export function hausgeldAusPlan(wp: Wirtschaftsplan, mea: number | null): HausgeldTeile | null {
  const teil = (k: HausgeldKategorie) => hausgeldMonat(wp, mea, k);
  const gesamt = hausgeldMonat(wp, mea);
  if (gesamt === null) return null;
  return {
    gesamt: rund(gesamt),
    umlagefaehig: rund((teil("umlagefähig") ?? 0) + (teil("Heizkosten") ?? 0)),
    nichtUmlagefaehig: rund(teil("nicht umlagefähig") ?? 0),
    ruecklage: rund(teil("Erhaltungsrücklage") ?? 0),
  };
}

const norm = (s: unknown) => String(s ?? "").toLocaleLowerCase("de-DE").replace(/\s+/g, " ").trim();
const zahl = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = String(v ?? "").replace(/[€\s]/g, "");
  if (!/^-?[\d.,]+$/.test(t)) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
};

/**
 * Einen Wirtschaftsplan aus einem Excel-Blatt lesen, im Aufbau der
 * Kaufpreisliste (Blatt „Wirtschaftsplan“): oben Gesamt-MEA, Anzahl
 * Einheiten, Gesamtfläche, gültig ab; darunter die Zeilen Position,
 * Kategorie, Ansatz €/Jahr, Verteiler, Hinweis. Werte werden unverändert
 * übernommen. Null, wenn das Blatt keine Positionen hat.
 */
export function wirtschaftsplanAusBlatt(blatt: Blatt): Wirtschaftsplan | null {
  const wp: Wirtschaftsplan = { gesamtMea: null, anzahlEinheiten: null, gesamtflaeche: null, gueltigAb: "", pruefMea: null, positionen: [] };
  let kopf = -1;
  blatt.zeilen.forEach((z, i) => {
    const a = norm(z[0]);
    if (kopf < 0) {
      if (a.startsWith("gesamt-mea")) wp.gesamtMea = zahl(z[1]);
      else if (a.startsWith("anzahl einheiten")) wp.anzahlEinheiten = zahl(z[1]);
      else if (a.startsWith("gesamtfläche")) wp.gesamtflaeche = zahl(z[1]);
      else if (a.startsWith("plan gültig ab")) wp.gueltigAb = String(z[1] ?? "").trim();
      else if (a === "position" && norm(z[1]) === "kategorie") kopf = i;
      return;
    }
    if (!a || a.startsWith("summen")) { kopf = Number.MAX_SAFE_INTEGER; return; }
    if (i <= kopf) return;
    const kategorie = HAUSGELD_KATEGORIEN.find((k) => norm(k) === norm(z[1]));
    if (!kategorie) return;
    const verteiler: Verteiler = norm(z[3]) === "we" ? "WE" : "MEA";
    wp.positionen.push(neueWpPosition(String(z[0]).trim(), kategorie, zahl(z[2]), verteiler, String(z[4] ?? "").trim()));
  });
  return wp.positionen.length ? wp : null;
}
