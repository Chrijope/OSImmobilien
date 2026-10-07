import { getVerstecktBisForVersuch } from "./kontaktversuchSchedule";

/**
 * Regeln des Anruf-Protokolls, getrennt von der Oberfläche, damit sie sich
 * ohne Dialog prüfen lassen.
 */

/**
 * Ergebnisse, bei denen kein Gespräch stattfand.
 *
 * Bei ihnen gibt es nichts zusammenzufassen und keine Gesprächsdauer. Ein
 * Pflichtfeld an dieser Stelle führt nur dazu, dass „kA" oder ein Punkt darin
 * steht.
 */
export const ERGEBNISSE_OHNE_GESPRAECH = ["nicht_erreicht", "mailbox", "daten_falsch"] as const;

/**
 * Fand bei diesem Ergebnis ein Gespräch statt? Solange noch kein Ergebnis
 * gewählt ist, weiß das niemand, dann gilt nein.
 */
export function gespraechFandStatt(ergebnis: string): boolean {
  return !!ergebnis && !(ERGEBNISSE_OHNE_GESPRAECH as readonly string[]).includes(ergebnis);
}

/**
 * Muss zu diesem Ergebnis eine Zusammenfassung dastehen?
 *
 * Christian, 26.09.2026: Ohne Zusammenfassung geht die Dokumentation unter.
 * Wer jemanden erreicht hat, hat auch etwas zu notieren, und genau das
 * braucht der Nächste, der den Kunden anruft. Bei „Nicht erreicht", „Mailbox"
 * und „Daten falsch" bleibt sie freiwillig, dort sagt das Ergebnis schon
 * alles.
 */
export function zusammenfassungIstPflicht(ergebnis: string): boolean {
  return gespraechFandStatt(ergebnis);
}

/** Datum und Uhrzeit in der Form der Eingabefelder, lokale Zeit. */
export interface TerminVorschlag {
  datum: string;
  uhrzeit: string;
}

function alsFelder(d: Date): TerminVorschlag {
  const zwei = (n: number) => String(n).padStart(2, "0");
  return {
    datum: `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`,
    uhrzeit: `${zwei(d.getHours())}:${zwei(d.getMinutes())}`,
  };
}

/** Morgen um 10:00 Uhr, lokale Zeit. */
function morgenZehnUhr(jetzt: Date): Date {
  const d = new Date(jetzt);
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return d;
}

/**
 * Fälligkeit, die für die Wiedervorlage nach einem Anruf vorgeschlagen wird.
 *
 * Bei „Nicht erreicht" derselbe Zeitpunkt, zu dem der Kontakt nach der
 * Staffel aus `kontaktversuchSchedule` wieder in der Liste auftaucht. So
 * zeigen Aufgabe und Wartezeit auf denselben nächsten Versuch. Gerechnet wird
 * mit dem Versuch, der gerade protokolliert wird, also dem bisherigen Zähler
 * plus eins. Auf die nächste Viertelstunde aufgerundet, damit keine krumme
 * Minute wie 14:37 im Kalender steht.
 *
 * Bei allen anderen Ergebnissen morgen um 10:00 Uhr.
 */
export function wiedervorlageVorschlag(
  ergebnis: string,
  bisherigeNichtErreicht: number,
  jetzt: Date = new Date(),
): TerminVorschlag {
  if (ergebnis === "nicht_erreicht") {
    const bis = getVerstecktBisForVersuch(bisherigeNichtErreicht + 1, jetzt);
    if (bis) {
      const viertelstunde = 15 * 60 * 1000;
      return alsFelder(new Date(Math.ceil(new Date(bis).getTime() / viertelstunde) * viertelstunde));
    }
  }
  return alsFelder(morgenZehnUhr(jetzt));
}
