/**
 * Welche Schluessel ein oeffentliches Formular in `meta` an submit-lead
 * mitgeben darf (Gegenpruefung vom 28.09.2026, A1).
 *
 * Bis dahin breitete submit-lead das ganze `meta` aus dem Aufruf in den neuen
 * Kontakt aus und legte ihn mit dem Dienstschluessel an. Wer die Function
 * selbst aufrief, konnte so `authUserId` (Portalzugang), `erstelltVonId`
 * (Sichtbarkeit und Provision) oder eine Zustaendigkeit einschleusen. Jetzt
 * kommt nur durch, was eine der Seiten wirklich schickt. Den Partner setzt
 * weiterhin allein der Server ueber das Kuerzel, den Ersteller ebenso.
 *
 * Die Liste entspricht den Rumpfen aus LeadFunnelDialog (Mikroseite, auch mit
 * Tippgeber), analyseLead, steuerrechnerLead, expatsRechnerLead und
 * handbuch/leadAbsenden. Ein neues Feld dort muss hier dazu, sonst geht es
 * still verloren; der Test `glockeAbsichern.test.ts` vergleicht beides.
 */
export const LEAD_META_POSITIVLISTE = [
  // alle Seiten
  "kampagne",
  // Vorgabe fuer die Stufe; der Server entscheidet trotzdem selbst
  // (pipelineStufeFuerLead) und ueberschreibt sie.
  "pipelineStufe",
  // Mikroseite
  "microseiteSlug",
  "funnelData",
  // Mikroseite mit Tippgeber-Link (Anzeige am Lead, keine Rechte)
  "tippgeberId",
  "tippgeberName",
  "empfehlungsgeberName",
  "empfehlungsgeberBeziehung",
  // Analysetool
  "leadQuality",
  "analyseScore",
  "analyseNachricht",
  "analyseSnapshot",
  // Steuerrechner und Expats-Rechner
  "steuerNachricht",
  "steuerStartzeitpunkt",
  "steuerSnapshot",
  "expatsSnapshot",
] as const;

/** Nur die erlaubten Schluessel, alles andere faellt weg. Kein Objekt: leeres Objekt. */
export function nurErlaubteLeadMeta(meta: unknown): Record<string, unknown> {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
  const quelle = meta as Record<string, unknown>;
  const aus: Record<string, unknown> = {};
  for (const schluessel of LEAD_META_POSITIVLISTE) {
    if (Object.prototype.hasOwnProperty.call(quelle, schluessel) && quelle[schluessel] !== undefined) {
      aus[schluessel] = quelle[schluessel];
    }
  }
  return aus;
}
