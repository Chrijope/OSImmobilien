/**
 * Schutz gegen doppelte Chatnachrichten, im Kundenportal und im CRM gleich.
 *
 * Zwei Wege fuehrten zu Doppeln:
 *   1. Doppelklick oder zweimal Enter, bevor die erste Antwort da war. Der
 *      Knopf war noch frei, weil React den Zustand "sendet" erst beim
 *      naechsten Zeichnen kennt.
 *   2. Schlechte Verbindung: Die Nachricht kam an, die Antwort nicht. Der
 *      Text blieb stehen, man schickte ihn noch einmal, mit neuer Kennung.
 *
 * Gegen 1 hilft eine Sperre, die sofort gilt (`useRef`). Gegen 2 behaelt ein
 * erneuter Versuch mit demselben Text dieselbe Kennung; die Datenbank weist
 * die zweite Zeile dann als Doppel ab, und das zaehlt als gesendet.
 */

/** Hoechstlaenge einer Nachricht, wie die Datenbankregel (Migration 20261016236000). */
export const CHAT_MAX_ZEICHEN = 10000;

export interface SendeVersuch {
  text: string;
  id: string;
}

/** Kennung fuer diesen Versuch: derselbe Text nach einem Fehlschlag behaelt seine Kennung. */
export function sendeVersuch(
  letzter: SendeVersuch | null,
  text: string,
  neueKennung: () => string = () => crypto.randomUUID(),
): SendeVersuch {
  if (letzter && letzter.text === text) return letzter;
  return { text, id: neueKennung() };
}

/** Lehnte die Datenbank ab, weil es die Nachricht mit dieser Kennung schon gibt? */
export function schonGespeichert(fehler: { code?: string } | null | undefined): boolean {
  return fehler?.code === "23505";
}
