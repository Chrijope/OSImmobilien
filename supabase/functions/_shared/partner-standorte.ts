/**
 * Wie viele Objekte stehen je Standort im Angebot? Für die öffentliche Seite
 * „Partner werden“ (Edge Function `partner-standorte`).
 *
 * Gezählt wird wie die Objektübersicht im CRM (`pages/Objekte.tsx` mit
 * `getObjekteImAngebot`):
 *   - nur Objekte, die für Vertriebspartner sichtbar geschaltet sind
 *     (`sichtbar = true`),
 *   - und davon nur solche, bei denen mindestens eine Einheit im Angebot
 *     steht, nach genau der Regel aus `einheit-angebot.ts` (nicht verkauft,
 *     in Investagon online). Reservierte Einheiten zählen mit, sie bleiben
 *     laut Christian sichtbar, weil Reservierungen platzen.
 *   - Jeder Eintrag zählt einzeln, wie in der Übersicht. Ein Haus mit zwei
 *     Modellen (All-inclusive und Standard) steht dort zweimal und zählt
 *     deshalb auch hier zweimal. Wer das ändern will, ändert es hier.
 *
 * Die Stadt kommt aus dem Feld `ort`, bei leerem Ort aus der Adresse.
 * „München-Pasing“, „Muenchen“ und „Hof (Saale)“ zählen zur Stadt, „Hofheim“
 * oder „Unterhaching“ nicht.
 *
 * Reine Funktionen ohne Deno- oder Browser-API, damit Vitest sie prüft.
 */
import { istImAngebot } from "./einheit-angebot.ts";

export const PARTNER_STANDORTE = ["München", "Nürnberg", "Augsburg", "Hof", "Leipzig"] as const;
export type PartnerStandort = (typeof PARTNER_STANDORTE)[number];

export interface StandortObjekt {
  id: string;
  ort: string | null;
  adresse: string | null;
  sichtbar: boolean | null;
}

export interface StandortEinheit {
  objekt_id: string;
  status: string | null;
  /** Der Investagon-Datensatz der Einheit (`meta.investagonRaw`) oder die Felder daraus. */
  roh: unknown;
}

/** Klein, ohne Umlaute und ß, ohne Randleerzeichen. */
export function normalisiereOrt(wert: string | null | undefined): string {
  return String(wert ?? "")
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

const SCHLUESSEL = PARTNER_STANDORTE.map((name) => ({ name, schluessel: normalisiereOrt(name) }));

/**
 * Welcher unserer Standorte? Im Ort muss der Name am Anfang stehen und dahinter
 * darf kein Buchstabe folgen. In der Adresse genügt der Name als ganzes Wort.
 */
export function standortVon(ort: string | null | undefined, adresse?: string | null): PartnerStandort | null {
  const o = normalisiereOrt(ort);
  if (o) {
    for (const { name, schluessel } of SCHLUESSEL) {
      if (o.startsWith(schluessel) && !/[a-z]/.test(o.charAt(schluessel.length))) return name;
    }
    return null;
  }
  const a = normalisiereOrt(adresse);
  for (const { name, schluessel } of SCHLUESSEL) {
    if (new RegExp(`(^|[^a-z])${schluessel}([^a-z]|$)`).test(a)) return name;
  }
  return null;
}

/** Die Anzahl der Objekte im Angebot je Standort. Jeder Standort steht drin, notfalls mit 0. */
export function zaehleObjekteJeStandort(
  objekte: StandortObjekt[],
  einheiten: StandortEinheit[],
): Record<PartnerStandort, number> {
  const mitAngebot = new Set<string>();
  for (const e of einheiten) {
    if (istImAngebot(e.status, e.roh)) mitAngebot.add(e.objekt_id);
  }
  const zahlen = Object.fromEntries(PARTNER_STANDORTE.map((n) => [n, 0])) as Record<PartnerStandort, number>;
  for (const o of objekte) {
    if (o.sichtbar !== true || !mitAngebot.has(o.id)) continue;
    const standort = standortVon(o.ort, o.adresse);
    if (standort) zahlen[standort] += 1;
  }
  return zahlen;
}

/** Prüft die Antwort der Function im Browser: nur ganze Zahlen ab 0, sonst nichts. */
export function leseStandortZahlen(roh: unknown): Partial<Record<PartnerStandort, number>> | null {
  if (!roh || typeof roh !== "object") return null;
  const standorte = (roh as Record<string, unknown>).standorte;
  if (!standorte || typeof standorte !== "object") return null;
  const ergebnis: Partial<Record<PartnerStandort, number>> = {};
  for (const name of PARTNER_STANDORTE) {
    const wert = (standorte as Record<string, unknown>)[name];
    if (typeof wert === "number" && Number.isInteger(wert) && wert >= 0) ergebnis[name] = wert;
  }
  return Object.keys(ergebnis).length > 0 ? ergebnis : null;
}
