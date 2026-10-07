import { ROLLEN_VARIANTE_LEAD_BERATER } from "@/lib/rollenLabel";

/**
 * Wochentag, Uhrzeiten und Zoom-Zugang des Weekly Sales Call an einer
 * einzigen Stelle.
 *
 * Seit dem 05.10.2026 gibt es wieder zwei Calls am Montag: 19:00 Uhr fuer die
 * Lead-Berater, 19:30 Uhr fuer die Vertriebspartner ohne diese Variante. Beide
 * dauern eine Stunde und laufen ueber denselben Zoom-Raum. Admin, Inhaber und
 * Vertriebsleitung betreuen beide Calls und sehen deshalb beide. (Vom 30.09.
 * bis 05.10.2026 gab es nur einen Call fuer alle um 19:00 Uhr.)
 *
 * Der Wochenschnitt liegt fuer beide bei 20:30 Uhr: Bis dahin zaehlt der
 * laufende Montag, danach der naechste. Er steht bewusst fest, weil die
 * Datenbankfunktion `weekly_call_woche()` dieselben 20:30 enthaelt
 * (Migration 20260901180000_weekly_call_schnitt_2030.sql). Wer den Schnitt
 * aendert, muss beide Stellen aendern.
 *
 * Wer welchen Call sieht, entscheidet `callRundenFuer` nach aktiver Rolle und
 * Anzeige-Variante. Dieselbe Regel erzwingt die Datenbank in
 * `weekly_call_runden()` (Migration 20261005160000_weekly_call_zwei_runden.sql).
 */

/** 0 = Sonntag, 1 = Montag. */
export const CALL_WOCHENTAG = 1;

/** Dauer eines Calls in Minuten. */
export const CALL_DAUER_MINUTEN = 60;

export interface CallZeit {
  stunde: number;
  minute: number;
}

/** Wochenschnitt, deckungsgleich mit `weekly_call_woche()` in der Datenbank. */
export const CALL_SCHNITT_STUNDE = 20;
export const CALL_SCHNITT_MINUTE = 30;

/**
 * Der Zoom-Zugang, fuer beide Calls derselbe. Einzige Stelle im Browser-Code.
 */
export const ZOOM_URL = "https://zoom.us/j/DEIN-MEETING";
export const ZOOM_MEETING_ID = "DEIN-MEETING";
export const ZOOM_KENNCODE = "DEIN-KENNCODE";

/** Die beiden Calls, gleich den Werten der Spalte `weekly_call_punkte.call_runde`. */
export type CallRunde = "lead_berater" | "vertriebspartner";

export const CALL_RUNDEN: Record<CallRunde, { zeit: CallZeit; gruppe: string }> = {
  lead_berater: { zeit: { stunde: 19, minute: 0 }, gruppe: "Lead-Berater" },
  vertriebspartner: { zeit: { stunde: 19, minute: 30 }, gruppe: "Vertriebspartner" },
};

/** Reihenfolge am Abend, frueherer Call zuerst. */
export const ALLE_CALL_RUNDEN: CallRunde[] = ["lead_berater", "vertriebspartner"];

/** Leitungsrollen betreuen beide Calls. */
const BEIDE_CALLS = ["admin", "inhaber", "vertriebsleiter"];

/**
 * Die Calls, die ein Nutzer sieht, nach aktiver Rolle und Anzeige-Variante.
 *
 * Leitung beide, Vertriebspartner mit Variante Lead-Berater nur den 19:00-Call,
 * alle anderen Vertriebspartner nur den 19:30-Call, alle anderen Rollen keinen.
 * Nur Anzeige: Die Trennung der Punkte erzwingt die Datenbank selbst.
 */
export function callRundenFuer(rolle?: string, rollenVariante?: string | null): CallRunde[] {
  if (rolle && BEIDE_CALLS.includes(rolle)) return [...ALLE_CALL_RUNDEN];
  if (rolle === "vertriebspartner") {
    return [rollenVariante === ROLLEN_VARIANTE_LEAD_BERATER ? "lead_berater" : "vertriebspartner"];
  }
  return [];
}

const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const ICAL_TAGE = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** "Montag", fuer Ueberschriften. */
export const CALL_WOCHENTAG_NAME = WOCHENTAGE[CALL_WOCHENTAG];

/** "Montags", fuer Fliesstext. */
export const CALL_WOCHENTAG_ADVERB = `${CALL_WOCHENTAG_NAME}s`;

/** "19:00" aus einer CallZeit, fuer Anzeigen und Hinweistexte. */
export function callUhrzeitText(zeit: CallZeit): string {
  return `${String(zeit.stunde).padStart(2, "0")}:${String(zeit.minute).padStart(2, "0")}`;
}

/** "19:30" fuer einen Call. */
export function rundeUhrzeitText(runde: CallRunde): string {
  return callUhrzeitText(CALL_RUNDEN[runde].zeit);
}

/** "19:00 Uhr" bei einem Call, "19:00 Uhr Lead-Berater, 19:30 Uhr Vertriebspartner" bei beiden. */
export function callZeitenText(runden: CallRunde[]): string {
  if (runden.length === 1) return `${rundeUhrzeitText(runden[0])} Uhr`;
  return runden.map((r) => `${rundeUhrzeitText(r)} Uhr ${CALL_RUNDEN[r].gruppe}`).join(", ");
}

/** Tageskuerzel fuer die Wiederholungsregel im Kalendereintrag. */
export const CALL_ICAL_TAG = ICAL_TAGE[CALL_WOCHENTAG];
