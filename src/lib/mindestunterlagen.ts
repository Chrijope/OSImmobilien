/**
 * Die Unterlagen vor der Objektvorstellung (neuer Ablauf seit 16.10.2026).
 *
 * Umsetzungsstrategie Vertrieb, Abschnitt 2, Schritt 4: Bis zur
 * Objektvorstellung liegen Personalausweis und letzte Gehaltsabrechnung im
 * Portal, damit die Reservierung im selben Termin fallen kann.
 *
 * Gebraucht von der Aufgabe zwei Tage vor dem Termin
 * (`useInvestmentInboxTriggers`) und von der Freigabe der Reservierung
 * (`reservierungStart.ts`).
 *
 * „Da" heisst hochgeladen oder freigegeben, ein abgelehntes Dokument fehlt.
 * Selbststaendige haben keine Gehaltsabrechnung, und beim Vermerk „Kunde
 * finanziert selbst" braucht es sie nicht; dort zaehlt nur der Ausweis.
 */

import { istSelbststaendig } from "./bonitaetDocs";

export const AUSWEIS = "Personalausweis";
export const LETZTE_GEHALTSABRECHNUNG = "Letzter Gehaltsnachweis";

export const UNTERLAGEN_FEHLEN_TITEL = "Unterlagen fehlen: vor der Objektvorstellung nachfassen";

const DA = new Set(["uploaded", "approved"]);

/** Die fehlenden Mindestunterlagen, nach `meta` des Investments. */
export function fehlendeMindestunterlagen(meta: Record<string, unknown> | null | undefined): string[] {
  const m = meta || {};
  const status = (m.docStatuses || {}) as Record<string, unknown>;
  const sa = (m.saData || m.saSnapshot) as { beschaeftigungsart?: string } | undefined;
  const selbstFinanziert = !!(m.selbstauskunftEntfaellt as { aktiv?: boolean } | undefined)?.aktiv;
  const pflicht = istSelbststaendig(sa?.beschaeftigungsart) || selbstFinanziert
    ? [AUSWEIS]
    : [AUSWEIS, LETZTE_GEHALTSABRECHNUNG];
  return pflicht.filter((name) => !DA.has(String(status[name] ?? "")));
}

/** Kurzer Text fuer Aufgaben und Hinweise, etwa „Personalausweis, letzte Gehaltsabrechnung". */
export function mindestunterlagenText(fehlend: string[]): string {
  return fehlend.map((d) => (d === LETZTE_GEHALTSABRECHNUNG ? "letzte Gehaltsabrechnung" : d)).join(", ");
}

/** Stufen, in denen vor der Objektvorstellung nachgefasst wird. */
export const STUFEN_VOR_OBJEKTVORSTELLUNG = ["selbstauskunft", "objektauswahl", "follow_up_objekt"];

/** Zwei Tage vor dem Termin. */
export const VORLAUF_OBJEKTVORSTELLUNG_MS = 2 * 24 * 60 * 60 * 1000;

/** Ist der Termin `terminMs` in den naechsten zwei Tagen? */
export function objektvorstellungSteht(terminMs: number, jetztMs: number): boolean {
  return Number.isFinite(terminMs) && terminMs > jetztMs && terminMs - jetztMs <= VORLAUF_OBJEKTVORSTELLUNG_MS;
}
