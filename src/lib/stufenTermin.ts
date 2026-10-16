/**
 * Besichtigung und Termin Bankgutachter: Stufen mit Termin (16.10.2026).
 *
 * Reihenfolge nach der Vorgabe von Christian (zweite Fassung, 16.10.2026):
 * Reservierung → Finanzierung → Termin Bankgutachter → Besichtigung → Notar.
 * Ist die Finanzierung angefragt, meldet sich der Gutachter der Bank; das
 * Backoffice traegt den Termin ein. Besichtigt wird am Notartag oder am
 * Vortag, alternativ online.
 *
 * Beide Stufen haengen an einem echten Termin. Wer ein Investment von Hand
 * auf eine dieser Stufen setzt (Board, Prozessstrasse im Investment) oder im
 * Abschnitt Finanzierung den Gutachtertermin eintraegt, fuellt das Fenster
 * `StufenTerminDialog` aus. Gespeichert wird ueber `meeting_anlegen`, also als
 * Meeting mit gekoppelter Aufgabe am Investment, genau wie „Termin
 * festlegen". Damit steht der Termin in der Kachel „Nächste Aktionen", und
 * sein Haken fuehrt in das Terminergebnis (`terminErgebnis.ts`).
 *
 * „Stattgefunden" rueckt die Stufe vor: Termin Bankgutachter → Besichtigung,
 * Besichtigung → Notar, nie zurueck (`darfVorruecken`).
 *
 * Die Aufgaben „Termin Bankgutachter vereinbaren" (sobald die Finanzierung
 * angefragt ist) und „Besichtigung vereinbaren" (nach dem Bankgutachter oder
 * sobald der Notartermin steht) laufen ueber `addProzessAufgabe`: Empfaenger
 * ist der Zustaendige, ohne ihn die Leitung, je Ausloeser hoechstens eine
 * offene.
 */
import { darfVorruecken } from "./pipelineStufen";
import { meetingZeitInZukunft } from "./meetingZeit";

export type TerminStufe = "besichtigung" | "bankgutachter";

interface TerminStufeInfo {
  /** Titel des Termins, zugleich Erkennungsmerkmal beim Ergebnis. */
  titel: string;
  /** Wohin „stattgefunden" die Stufe rueckt. */
  folgeStufe: "besichtigung" | "notar";
  /** Erklaerung im Fenster. */
  hinweis: string;
}

export const TERMIN_STUFEN: Record<TerminStufe, TerminStufeInfo> = {
  besichtigung: {
    titel: "Besichtigung",
    folgeStufe: "notar",
    hinweis: "Der Kunde besichtigt das Objekt, am Tag des Notartermins oder am Vortag. Alternativ online.",
  },
  bankgutachter: {
    titel: "Termin Bankgutachter",
    folgeStufe: "besichtigung",
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
): "besichtigung" | "notar" | null {
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

/** Ortsangabe fuer eine Besichtigung per Video. */
export const ORT_ONLINE = "Online (Video)";

/**
 * Vorschlag fuer den Besichtigungstermin: der Notartermin selbst, sonst leer.
 * Liegt der Notartermin noch mindestens einen Tag entfernt, bietet das Fenster
 * zusaetzlich den Vortag an (`vortagIso`).
 */
export function besichtigungsVorschlag(
  notarTermin: string | null | undefined,
  notarUhrzeit: string | null | undefined,
): { datum: string; uhrzeit: string } | null {
  const datum = (notarTermin || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return null;
  return { datum, uhrzeit: /^\d{2}:\d{2}/.test(notarUhrzeit || "") ? (notarUhrzeit || "").slice(0, 5) : "" };
}

/** Der Kalendertag vor `datum` (JJJJ-MM-TT), ohne Zeitzonen-Verschiebung. */
export function vortagIso(datum: string): string {
  const [j, m, t] = datum.split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1, t - 1));
  return d.toISOString().slice(0, 10);
}

/** Der Treffpunkt aus den Details bzw. der Beschreibung eines Stufentermins. */
export function treffpunktAusText(text: string | null | undefined): string {
  const zeile = (text || "").split("\n").find((z) => z.startsWith("Treffpunkt: "));
  return zeile ? zeile.slice("Treffpunkt: ".length).trim() : "";
}

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

/**
 * Ist die Finanzierung positiv? Dann liegt ein Finanzierungsangebot der Bank
 * vor (in der Finanzierungskarte „Angebot liegt vor") oder der
 * Darlehensvertrag ist unterschrieben. Ab hier gibt das Backoffice den
 * Kaufvertragsentwurf beim Notar in Auftrag (Vorgabe Christian, 16.10.2026).
 */
export function finanzierungPositiv(
  daten: { angebote?: Array<{ dokumente?: Array<{ name: string; status: string }> }> } | null | undefined,
): boolean {
  return (daten?.angebote || []).some((a) => (a.dokumente || []).some((d) =>
    (d.name === "Finanzierungsangebot" && d.status !== "none")
    || (d.name === "Darlehensvertrag" && d.status === "signed")));
}

/** Ausloeser-Schluessel der Aufgabe „Kaufvertragsentwurf beauftragen" je Investment. */
export function kveSchluessel(investmentId: string): string {
  return `kve_beauftragen:${investmentId}`;
}

export const KVE_TITEL = "Finanzierung positiv: Kaufvertragsentwurf beim Notar in Auftrag geben";

export interface EingetragenerStufenTermin {
  datum: string;
  uhrzeit: string;
  ort: string;
  eingetragenVon: string;
  erledigt: boolean;
}

/**
 * Der zuletzt eingetragene Termin einer Terminstufe an einem Investment, aus
 * den Aufgaben, die `meeting_anlegen` mit dem Termin anlegt. Abgesagte zaehlen
 * nicht. Fuer die Zeile „Termin Bankgutachter" im Abschnitt Finanzierung.
 */
export function eingetragenerStufenTermin(
  aufgaben: ReadonlyArray<{ investmentId?: string; titel: string; status: string; faelligAm?: string; uhrzeit?: string; beschreibung?: string; erstelltVonName?: string }>,
  investmentId: string,
  stufe: TerminStufe,
): EingetragenerStufenTermin | null {
  const titel = TERMIN_STUFEN[stufe].titel.toLowerCase();
  const treffer = aufgaben
    .filter((a) => a.investmentId === investmentId && a.titel.trim().toLowerCase() === titel && a.status !== "abgesagt" && a.faelligAm)
    .sort((a, b) => `${b.faelligAm}${b.uhrzeit || ""}`.localeCompare(`${a.faelligAm}${a.uhrzeit || ""}`))[0];
  if (!treffer) return null;
  return {
    datum: (treffer.faelligAm || "").slice(0, 10),
    uhrzeit: (treffer.uhrzeit || "").slice(0, 5),
    ort: treffpunktAusText(treffer.beschreibung),
    eingetragenVon: treffer.erstelltVonName || "",
    erledigt: treffer.status === "erledigt",
  };
}
