/**
 * Die Schwellen der Pipeline, einmal für alle Edge Functions.
 *
 * ACHTUNG, das hier ist eine Kopie, und sie ist es mit Absicht.
 *
 * Die maßgebliche Tabelle steht in `src/lib/inactivityThresholds.ts`. Eine
 * Edge Function läuft in Deno und kann nichts aus `src/` importieren: Dort
 * hängt alles am Alias `@/`, am Browser und am Datencache. Ein Bündelschritt,
 * der die Tabelle vor dem Ausrollen hierher schreibt, gibt es in diesem
 * Projekt nicht.
 *
 * Deshalb liegt die Kopie hier, an EINER Stelle für alle Functions, und
 * `src/lib/pipelineSchwellen.test.ts` vergleicht sie bei jedem Testlauf Zeile
 * für Zeile mit der Anwendung. Läuft eine der beiden weg, schlägt der Test
 * fehl. Das ist der Unterschied zu vorher: Bis heute führten
 * `lead-eskalation-check` und `weekly-pipeline-mahnreport` je eine eigene
 * Kopie mit dem Kommentar "1:1 aus Pipeline.tsx", und beide kannten noch die
 * abgeschafften Stufen `closing` und `vermoegensaufbau`, dafür keine einzige
 * der Stufen aus der Mitte des Prozesses. Wer in Beratungsgespräch,
 * Selbstauskunft, Nicht erreicht oder NoShow stand, wurde von den
 * Eskalationsdiensten stillschweigend übersprungen.
 *
 * Wer hier etwas ändert, ändert es auch in `src/lib/inactivityThresholds.ts`.
 * Eine dritte Kopie darf es nicht geben.
 */

/**
 * Untätigkeitsschwellen je Stufe: [orange ab Tagen, rot ab Tagen].
 *
 * Muss Feld für Feld mit `INACTIVITY_THRESHOLDS` in
 * `src/lib/inactivityThresholds.ts` übereinstimmen.
 */
export const INAKTIVITAETS_SCHWELLEN: Record<string, [number, number]> = {
  neuer_lead: [2, 4],
  nicht_erreicht: [1, 3],
  erreicht: [1, 3],
  erstgespraech_geplant: [3, 7],
  eg_noshow: [1, 3],
  beratungsgespraech: [3, 7],
  bg_noshow: [1, 3],
  selbstauskunft: [3, 7],
  bonitaetsunterlagen: [7, 10],
  objektauswahl: [7, 10],
  follow_up_objekt: [7, 10],
  reservierung: [10, 20],
  finanzierung: [10, 20],
  notar: [10, 20],
  faelligkeit: [10, 20],
  abrechnung: [10, 20],
  // Legacy-Stufen, die in Altbeständen noch vorkommen.
  zugewiesen: [1, 3],
  vermoegensaufbau: [7, 14],
}

/**
 * Die finale Schwelle: ab hier ist keine Erinnerung mehr fällig, sondern eine
 * Entscheidung. Weiterführen, verlieren oder archivieren.
 *
 * Faustregel für die Werte: rund das Doppelte bis Dreifache der Rot-Schwelle,
 * nie weniger als rot plus zwei Tage. Je näher eine Stufe am Abschluss liegt,
 * desto länger darf sie ruhen, weil dort echte Wartezeiten stecken
 * (Bank, Notar, Zahlung) und nicht Nachlässigkeit.
 *
 * Neu hinzugekommen sind die Stufen, die bisher gar nicht überwacht wurden:
 *
 *   nicht_erreicht (10)  Die Wartestaffel in `kontaktversuchSchedule.ts` geht
 *                        bis 72 Stunden je Versuch. Zehn Tage heißen: drei
 *                        Wartezyklen sind verstrichen und trotzdem ist nichts
 *                        passiert.
 *   erreicht (7)         Der heißeste Moment im ganzen Prozess. Wer erreicht
 *                        wurde und eine Woche später immer noch keinen
 *                        nächsten Schritt hat, ist faktisch weg.
 *   erstgespraech_geplant (14)
 *                        Ein Termin darf legitim ein bis zwei Wochen in der
 *                        Zukunft liegen. Nach vierzehn Tagen hat er entweder
 *                        stattgefunden oder er findet nicht mehr statt.
 *   eg_noshow / bg_noshow (je 7)
 *                        Ein geplatzter Termin wird binnen einer Woche neu
 *                        angesetzt, sonst war es das.
 *   beratungsgespraech (14) und selbstauskunft (14)
 *                        Hier liegt der Ball beim Kunden, der Unterlagen
 *                        zusammensucht. Das dauert, zwei Wochen sind aber die
 *                        Grenze.
 *   abrechnung (30)      Wie faelligkeit: der Schwanz des Prozesses, es wird
 *                        überwiegend auf Geld gewartet.
 *
 * Muss keine Entsprechung in der Anwendung haben, die finale Schwelle gibt es
 * nur in den Eskalationsdiensten. Jede Stufe mit Untätigkeitsschwelle hat
 * auch eine finale, das prüft der Test.
 */
export const FINALE_SCHWELLEN: Record<string, number> = {
  neuer_lead: 7,
  nicht_erreicht: 10,
  erreicht: 7,
  erstgespraech_geplant: 14,
  eg_noshow: 7,
  beratungsgespraech: 14,
  bg_noshow: 7,
  selbstauskunft: 14,
  bonitaetsunterlagen: 14,
  objektauswahl: 14,
  follow_up_objekt: 14,
  reservierung: 30,
  finanzierung: 30,
  notar: 30,
  faelligkeit: 30,
  abrechnung: 30,
  zugewiesen: 7,
  vermoegensaufbau: 21,
}

/**
 * Klartextnamen der Stufen.
 *
 * Muss Feld für Feld zu `PIPELINE_STUFEN` in `src/lib/pipelineStufen.ts`
 * passen, auch das prüft der Test.
 */
export const STUFEN_LABELS: Record<string, string> = {
  neuer_lead: 'Neuer Lead',
  nicht_erreicht: 'Nicht erreicht',
  erreicht: 'Erreicht',
  follow_up: 'Follow-Up',
  erstgespraech_geplant: 'Erstgespräch',
  eg_noshow: 'EG NoShow',
  beratungsgespraech: 'Beratungsgespräch',
  bg_noshow: 'BG NoShow',
  selbstauskunft: 'Selbstauskunft',
  objektauswahl: 'Objektauswahl',
  // Manuelle Follow-Up-Stufe nach der Objektvorstellung. Gleicher
  // Anzeigename wie follow_up, das ist gewollt.
  follow_up_objekt: 'Follow-Up',
  reservierung: 'Reservierung',
  bonitaetsunterlagen: 'Bonitätsunterlagen',
  finanzierung: 'Finanzierung',
  notar: 'Notar',
  faelligkeit: 'Fälligkeit',
  abrechnung: 'Abrechnung',
  abgeschlossen: 'Abgeschlossen',
  bestandsimport: 'Bestandskunden Import',
  archiviert: 'Archiviert',
  verloren: 'Verloren',
  zugewiesen: 'Zugewiesen',
  kontaktversuche: 'Kontaktversuche',
  vermoegensaufbau: 'Vermögensaufbau',
}

/**
 * Reihenfolge der Stufen, für die Gruppierung in Berichten.
 *
 * Entspricht der Reihenfolge in `PIPELINE_STUFEN`. Der Test hält sie synchron.
 */
export const STUFEN_REIHENFOLGE: string[] = [
  'neuer_lead',
  'nicht_erreicht',
  'erreicht',
  'follow_up',
  'erstgespraech_geplant',
  'eg_noshow',
  'beratungsgespraech',
  'bg_noshow',
  'selbstauskunft',
  'objektauswahl',
  'follow_up_objekt',
  'reservierung',
  'bonitaetsunterlagen',
  'finanzierung',
  'notar',
  'faelligkeit',
  'abrechnung',
  'abgeschlossen',
  'bestandsimport',
  'archiviert',
  'verloren',
  'zugewiesen',
  'kontaktversuche',
  'vermoegensaufbau',
]

/**
 * Stufen, in denen ein Lead nicht mehr überwacht wird.
 *
 * `abgeschlossen` stand in den alten Kopien als `abschluss` und hat deshalb
 * nie gegriffen. Aufgefallen ist das nicht, weil die Stufe ohnehin keine
 * Schwelle hatte und damit an der nächsten Prüfung hängenblieb. So ein Fehler
 * bleibt still, bis jemand die Schwellen ergänzt, und dann eskaliert
 * plötzlich jeder abgeschlossene Vorgang.
 *
 * `follow_up` fehlt hier bewusst NICHT als Sonderfall, sondern hat schlicht
 * keine Tagesschwelle: Follow-Ups werden in Stunden gemessen und von
 * `send-followup-overdue-nudges` behandelt. Zwei Dienste für denselben Fall
 * hieße zwei Meldungen.
 */
export const NICHT_UEBERWACHTE_STUFEN = new Set<string>([
  'abgeschlossen',
  'archiviert',
  'verloren',
  'bestandsimport',
  'follow_up',
  'kontaktversuche',
])

export interface StufenSchwellen {
  /** Orange ab so vielen Tagen ohne Aktivität. */
  orange: number
  /** Rot ab so vielen Tagen. */
  rot: number
  /** Finale Schwelle: Entscheidung erforderlich. */
  final: number
}

/**
 * Die Schwellen einer Stufe, oder `null`, wenn die Stufe nicht überwacht wird.
 *
 * Ein `null` heißt hier ausdrücklich "wird nicht überwacht" und nicht "Stufe
 * unbekannt". Unbekannte Stufen liefern ebenfalls `null`, der Aufrufer soll
 * sie aber getrennt zählen und melden, statt sie stillschweigend fallen zu
 * lassen. Genau das war der alte Fehler.
 */
export function schwellenFuerStufe(stufe: string | null | undefined): StufenSchwellen | null {
  if (!stufe) return null
  if (NICHT_UEBERWACHTE_STUFEN.has(stufe)) return null
  const paar = INAKTIVITAETS_SCHWELLEN[stufe]
  if (!paar) return null
  return { orange: paar[0], rot: paar[1], final: FINALE_SCHWELLEN[stufe] ?? paar[1] * 2 }
}

/** Ist die Stufe überhaupt bekannt? Alles andere ist ein Datenfehler. */
export function istBekannteStufe(stufe: string | null | undefined): boolean {
  return !!stufe && Object.prototype.hasOwnProperty.call(STUFEN_LABELS, stufe)
}

/** Klartextname, mit dem rohen Schlüssel als Rückfallebene. */
export function stufenLabel(stufe: string | null | undefined): string {
  if (!stufe) return 'ohne Stufe'
  return STUFEN_LABELS[stufe] || stufe
}

/** Ganze Tage seit einem Zeitstempel, nie negativ. */
export function tageSeit(iso: string | null | undefined): number {
  if (!iso) return 0
  const wert = new Date(iso).getTime()
  if (Number.isNaN(wert)) return 0
  return Math.max(0, Math.floor((Date.now() - wert) / 86400000))
}
