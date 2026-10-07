/**
 * Ab wann zählt die Untätigkeit eines Leads, für `lead-eskalation-check` und
 * `send-sla-inactivity-nudges`?
 *
 * Zwei Gründe für diese Datei (Befund H1 vom 04.10.2026):
 *
 *   1. Beide Dienste liefen nie. Ihre Rollenliste enthielt `juniorpartner`,
 *      eine Rolle, die es im Aufzählungstyp `app_role` nicht gibt. Die ganze
 *      Abfrage schlug fehl, und weil niemand den Fehler auswertete, fand der
 *      Dienst einfach keine Betreuer. Jetzt, wo sie laufen, würden auf einen
 *      Schlag alle Altfälle eskalieren. Deshalb zählen nur Leads, deren
 *      maßgeblicher Zeitpunkt ab dem Stichtag liegt. Wer danach wieder
 *      angefasst wird, ist automatisch wieder dabei.
 *
 *   2. Die eigene Merkmarke von `lead-eskalation-check` läuft über
 *      `merge_kontakt_meta`, und das setzt `aktualisiert_am` auf jetzt. Nach
 *      der ersten Eskalation fing die Zählung also wieder bei null an, und die
 *      finale Schwelle kam erst nach rot plus final Tagen statt nach final.
 *      Deshalb merkt sich der Dienst beim Setzen der Marke den Zeitpunkt, ab
 *      dem er gezählt hat (`eskalationBezug`), und wann er die Marke gesetzt
 *      hat (`eskalationMarkeAm`). Steht `aktualisiert_am` noch auf seiner
 *      eigenen Marke, gilt der gemerkte Zeitpunkt.
 */

/**
 * Der Stichtag: sieben Tage vor dem Bau dieser Änderung (04.10.2026).
 * Wird erst später ausgerollt, liegt er entsprechend weiter zurück; dann hier
 * auf den Ausrolltag minus sieben Tage setzen.
 */
export const ESKALATION_STICHTAG = "2026-09-27T00:00:00+02:00";

/** Wie nah `aktualisiert_am` an der eigenen Marke liegen darf, um als eigene Schreibung zu gelten. */
const EIGENE_MARKE_TOLERANZ_MS = 5 * 60 * 1000;

export interface EskalationsKontakt {
  aktualisiert_am?: string | null;
  erstellt_am?: string | null;
  meta?: unknown;
}

function zeit(iso: unknown): number {
  if (typeof iso !== "string" || !iso) return NaN;
  return new Date(iso).getTime();
}

/** Der Zeitpunkt, ab dem die Untätigkeit zählt, ohne die eigene Merkmarke. */
export function eskalationsBezug(k: EskalationsKontakt): string | null {
  const roh = k.aktualisiert_am || k.erstellt_am || null;
  const meta = (k.meta && typeof k.meta === "object" ? k.meta : {}) as Record<string, unknown>;
  const bezug = meta.eskalationBezug;
  const marke = zeit(meta.eskalationMarkeAm);
  const aktualisiert = zeit(k.aktualisiert_am);
  if (
    typeof bezug === "string" && !Number.isNaN(zeit(bezug)) &&
    !Number.isNaN(marke) && !Number.isNaN(aktualisiert) &&
    // Betrag, weil die Uhr der Function und die der Datenbank leicht abweichen.
    Math.abs(aktualisiert - marke) <= EIGENE_MARKE_TOLERANZ_MS
  ) {
    return bezug;
  }
  return roh;
}

/** Liegt der Zeitpunkt vor dem Stichtag? Ohne lesbaren Zeitpunkt: ja, dann wird nicht eskaliert. */
export function vorStichtag(iso: string | null | undefined, stichtag: string = ESKALATION_STICHTAG): boolean {
  const wert = zeit(iso);
  if (Number.isNaN(wert)) return true;
  return wert < zeit(stichtag);
}
