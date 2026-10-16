/**
 * Besichtigung und Termin Bankgutachter: Stufen mit Termin (16.10.2026).
 *
 * Neuer Ablauf laut Umsetzungsstrategie Vertrieb, Abschnitt 2: Nach der
 * unterschriebenen Reservierung besichtigt der Kunde das Objekt, danach
 * bewertet der Gutachter der Bank. Beide Stufen haengen an einem echten
 * Termin. Wer ein Investment von Hand auf eine dieser Stufen setzt (Board,
 * Prozessstrasse im Investment), traegt im Fenster `StufenTerminDialog`
 * Datum und Uhrzeit ein. Gespeichert wird ueber `meeting_anlegen`, also als
 * Meeting mit gekoppelter Aufgabe am Investment, genau wie „Termin
 * festlegen". Damit steht der Termin in der Kachel „Nächste Aktionen", und
 * sein Haken fuehrt in das Terminergebnis (`terminErgebnis.ts`).
 *
 * „Stattgefunden" rueckt die Stufe vor: Besichtigung → Termin Bankgutachter,
 * Termin Bankgutachter → Finanzierung, nie zurueck (`darfVorruecken`).
 *
 * Die Aufgaben „Besichtigung vereinbaren" (nach unterschriebener
 * Reservierung) und „Termin Bankgutachter vereinbaren" (nach der
 * Besichtigung) laufen ueber `addProzessAufgabe`: Empfaenger ist der
 * Zustaendige, ohne ihn die Leitung, je Ausloeser hoechstens eine offene.
 */
import { darfVorruecken } from "./pipelineStufen";
import { meetingZeitInZukunft } from "./meetingZeit";

export type TerminStufe = "besichtigung" | "bankgutachter";

interface TerminStufeInfo {
  /** Titel des Termins, zugleich Erkennungsmerkmal beim Ergebnis. */
  titel: string;
  /** Wohin „stattgefunden" die Stufe rueckt. */
  folgeStufe: "bankgutachter" | "finanzierung";
  /** Erklaerung im Fenster. */
  hinweis: string;
}

export const TERMIN_STUFEN: Record<TerminStufe, TerminStufeInfo> = {
  besichtigung: {
    titel: "Besichtigung",
    folgeStufe: "bankgutachter",
    hinweis: "Der Kunde besichtigt das reservierte Objekt.",
  },
  bankgutachter: {
    titel: "Termin Bankgutachter",
    folgeStufe: "finanzierung",
    hinweis: "Der Gutachter der Bank bewertet das Objekt.",
  },
};

/** Braucht diese Stufe beim Setzen von Hand einen Termin? */
export function brauchtStufenTermin(stufe: string | null | undefined): stufe is TerminStufe {
  return stufe === "besichtigung" || stufe === "bankgutachter";
}

export interface StufenTerminEingabe {
  datum: string;
  uhrzeit: string;
  ort?: string;
  notiz?: string;
}

/**
 * Was am Fenster fehlt, oder `null`, wenn gespeichert werden darf.
 *
 * Datum und Uhrzeit sind Pflicht und muessen in der Zukunft liegen, in
 * Berliner Zeit: `meeting_anlegen` lehnt alles andere ab, und die Meldung
 * soll schon im Fenster stehen statt erst als Datenbankfehler.
 */
export function pruefeStufenTermin(e: StufenTerminEingabe, jetzt: Date = new Date()): string | null {
  if (!e.datum) return "Bitte ein Datum angeben.";
  if (!e.uhrzeit) return "Bitte eine Uhrzeit angeben.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.datum) || !/^\d{2}:\d{2}/.test(e.uhrzeit)) return "Datum oder Uhrzeit ist ungültig.";
  if (!meetingZeitInZukunft(e.datum, e.uhrzeit, jetzt)) return "Der Termin muss in der Zukunft liegen.";
  return null;
}

/** Die Terminstufe zu einem Termintitel, sonst `null`. Gross- und Kleinschreibung egal. */
export function terminStufeAusTitel(titel: string | null | undefined): TerminStufe | null {
  const t = (titel || "").trim().toLowerCase();
  for (const [stufe, info] of Object.entries(TERMIN_STUFEN) as [TerminStufe, TerminStufeInfo][]) {
    if (t === info.titel.toLowerCase()) return stufe;
  }
  return null;
}

/**
 * Die Stufe, auf die ein stattgefundener Termin das Investment rueckt, oder
 * `null`, wenn nichts zu tun ist: anderer Termin, Vorgang schon weiter oder
 * beendet.
 */
export function stufeNachStattgefunden(
  titel: string | null | undefined,
  aktuelleStufe: string | null | undefined,
): "bankgutachter" | "finanzierung" | null {
  const terminStufe = terminStufeAusTitel(titel);
  if (!terminStufe) return null;
  const ziel = TERMIN_STUFEN[terminStufe].folgeStufe;
  return darfVorruecken(aktuelleStufe, ziel) ? ziel : null;
}

/** Ausloeser-Schluessel der Aufgabe „… vereinbaren" je Investment. */
export function vereinbarenSchluessel(stufe: TerminStufe, investmentId: string): string {
  return `${stufe}_vereinbaren:${investmentId}`;
}

export const VEREINBAREN_TITEL: Record<TerminStufe, string> = {
  besichtigung: "Besichtigung vereinbaren",
  bankgutachter: "Termin Bankgutachter vereinbaren",
};

/** Die Zeilen fuer die Details des Meetings, wie sie `terminErgebnis.ts` liest. */
export function stufenTerminDetails(e: StufenTerminEingabe, investmentLabel?: string): string | undefined {
  const zeilen = [
    (e.notiz || "").trim(),
    // "Treffpunkt: " erkennt das Terminergebnis als Termin vor Ort.
    (e.ort || "").trim() ? `Treffpunkt: ${(e.ort || "").trim()}` : "",
    investmentLabel ? `Investment: ${investmentLabel}` : "",
  ].filter(Boolean);
  return zeilen.length ? zeilen.join("\n") : undefined;
}

/** Die Meldung eines gescheiterten Speicherns, auch fuer Datenbankfehler ohne `Error`. */
export function terminFehlerText(fehler: unknown): string {
  const text = (fehler as { message?: unknown } | null)?.message;
  return typeof text === "string" && text.trim() ? text : "Der Termin konnte nicht gespeichert werden.";
}
