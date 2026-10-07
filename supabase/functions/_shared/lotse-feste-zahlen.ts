/**
 * Feste Zahlen der Einheit für den MORE Lotsen (05.10.2026).
 *
 * Das Hausgeld gesamt rechnet das CRM, nicht die KI: umlagefähig plus nicht
 * umlagefähig plus Rücklage, nur wenn alle drei erfasst sind. Dazu die
 * Steuer- und Neubauangaben aus den Investagon-Rohdaten mit deutschen
 * Namen. Eine 0 gilt bei diesen Angaben als „nicht erfasst“ und steht in
 * `fehlt`, nie als echter Wert.
 *
 * Die Hausgeld-Regel selbst steht seit dem 05.10.2026 in
 * `einheit-hausgeld.ts`.
 *
 * Gemeinsam für den Prompt (`baueLotsePrompt`) und die Begrüßung im Browser.
 * Reine Funktionen, geprüft in `src/lib/lotseRegeln.test.ts`.
 */

import { hausgeldTeile } from "./einheit-hausgeld.ts";

function alsObjekt(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

/** Eine positive Zahl, auch als Text. 0, leer und Unsinn gelten als nicht erfasst. */
function positiv(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.trim().replace(",", ".")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Ein Datum als TT.MM.JJJJ, sonst nichts. */
function datum(v: unknown): string | undefined {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(v)) return undefined;
  const [j, m, t] = v.slice(0, 10).split("-");
  return `${t}.${m}.${j}`;
}

/** Investagon-Schalter: 1 heißt ja, 0 und -1 heißen nein, alles andere ist unklar. */
function schalter(v: unknown): "ja" | "nein" | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  if (n === 1) return "ja";
  if (n === 0 || n === -1) return "nein";
  return undefined;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export const HAUSGELD_UMLAGEFAEHIG = "Hausgeld umlagefähig je Monat in Euro";
export const HAUSGELD_NICHT_UMLAGEFAEHIG = "Hausgeld nicht umlagefähig je Monat in Euro";
export const RUECKLAGE = "Rücklage (Zuführung) je Monat in Euro";
export const HAUSGELD_GESAMT = "Hausgeld gesamt je Monat in Euro";

export interface FesteZahlen {
  /** Deutscher Name und Wert, nur erfasste Angaben. */
  werte: Record<string, number | string>;
  /** Deutsche Namen der Angaben, die fehlen oder 0 sind. */
  fehlt: string[];
}

/**
 * Die festen Zahlen aus `wohnungen.meta` (samt `investagonRaw`). Denkmal-
 * und 7b-Angaben stehen nur in `fehlt`, wenn das Objekt überhaupt als
 * Denkmal beziehungsweise mit 7b geführt wird; sonst wären sie Rauschen.
 */
export function festeZahlenEinheit(meta: unknown): FesteZahlen {
  const m = alsObjekt(meta) ?? {};
  const roh = alsObjekt(m.investagonRaw) ?? {};
  const werte: Record<string, number | string> = {};
  const fehlt: string[] = [];
  const setze = (name: string, wert: number | string | undefined, pflicht = true) => {
    if (wert !== undefined) werte[name] = typeof wert === "number" ? r2(wert) : wert;
    else if (pflicht) fehlt.push(name);
  };

  // Die Regel steht in `einheit-hausgeld.ts`, dieselbe wie in CRM und Import.
  const hausgeld = hausgeldTeile(m);
  setze(HAUSGELD_UMLAGEFAEHIG, hausgeld.umlagefaehig);
  setze(HAUSGELD_NICHT_UMLAGEFAEHIG, hausgeld.nichtUmlagefaehig);
  setze(RUECKLAGE, hausgeld.ruecklage);
  setze(HAUSGELD_GESAMT, hausgeld.gesamt);

  const denkmalAnteil = positiv(roh.share_monument);
  const denkmal18 = positiv(roh.depreciation_rate_monument_y1y8);
  const denkmal912 = positiv(roh.depreciation_rate_monument_y9y12);
  const denkmalBeginn = datum(roh.depreciation_start_monument_input);
  const istDenkmal = denkmalAnteil !== undefined || denkmal18 !== undefined || denkmalBeginn !== undefined;
  setze("Denkmal-Anteil in Prozent", denkmalAnteil, istDenkmal);
  setze("Denkmal-AfA Jahre 1 bis 8 in Prozent", denkmal18, istDenkmal);
  setze("Denkmal-AfA Jahre 9 bis 12 in Prozent", denkmal912, istDenkmal);
  setze("Beginn der Denkmal-AfA", denkmalBeginn, istDenkmal);

  const sonder7b = schalter(roh.depreciation_special_7b_onoff);
  setze("Sonder-AfA nach § 7b EStG", sonder7b, false);
  if (sonder7b === "ja") setze("Bemessungsgrundlage Sonder-AfA § 7b in Euro", positiv(roh.depreciation_special_7b_base));
  setze("Degressive AfA", schalter(roh.degressive_depreciation_building_onoff), false);
  setze("Fertigstellung", datum(roh.end_building_phase_date), false);
  setze("Energiekennwert in kWh je m² und Jahr", positiv(roh.power_consumption), false);
  return { werte, fehlt };
}

/* ------------------------------------------------------------------ */
/* Sanierungen                                                        */
/* ------------------------------------------------------------------ */

/** Wörter, die eine Maßnahme als Plan kennzeichnen. */
const PLAN = /geplant|planung|vorgesehen|beschlossen|anstehend|steht an|soll|wird .*(erneuert|saniert|gemacht)|künftig|kuenftig/i;

/**
 * Der Stand einer Sanierung (05.10.2026). Liegt das Jahr in der Zukunft, ist
 * sie geplant. Ist sie als Plan beschrieben und ihr Jahr schon erreicht oder
 * vorbei, weiß niemand, ob sie gemacht wurde: „Stand unklar, bitte prüfen“,
 * nie erledigt. Sonst kein Vermerk.
 */
export function sanierungStand(eintrag: { jahr?: unknown; massnahme?: unknown }, heute: Date): string | undefined {
  const jahr = Number(String(eintrag.jahr ?? "").match(/\d{4}/)?.[0]);
  if (!Number.isFinite(jahr)) return PLAN.test(String(eintrag.massnahme ?? "")) ? "geplant, ohne Jahr" : undefined;
  if (jahr > heute.getFullYear()) return "geplant";
  return PLAN.test(String(eintrag.massnahme ?? "")) ? "Stand unklar, bitte prüfen" : undefined;
}
