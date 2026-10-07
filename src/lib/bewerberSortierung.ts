/**
 * Die Sortierung der Bewerberliste über die Spaltenköpfe.
 *
 * ## Warum eine eigene Datei
 *
 * Die Liste kann nach zwei Spalten sortieren: nach dem Vorab-Score und, seit
 * dem 18.09.2026, nach dem Termin des Closing-Gesprächs. Beide schalten im
 * selben Dreierschritt „aus, hoch, runter". Läge diese Schaltung zweimal in
 * der Seite, liefen die beiden Spalten früher oder später auseinander, und
 * `BewerberArbeitsplatz.tsx` ist ohnehin schon groß genug.
 *
 * Wichtiger noch: Es kann nur **eine** Spalte zugleich sortieren. Das steht
 * hier nicht als Regel daneben, sondern im Zustand selbst: Er merkt sich die
 * eine sortierende Spalte, mehr passt nicht hinein. Wer die andere anklickt,
 * schaltet die erste damit zwangsläufig ab. Das ist das, was man von einer
 * Tabelle erwartet, und zwei gleichzeitig wirkende Sortierungen wären
 * ohnehin nicht darstellbar: Die Liste hat nur eine Reihenfolge.
 */

/**
 * Zeigt diese Stufe die Zweiteilung nach dem ausgefüllten Bogen?
 *
 * Bis zum 18.09.2026 stand in **jeder** Stufe oben, wer den Kennenlern- oder
 * Vorabbogen ausgefüllt hatte, und darunter alle anderen. Christian hat das
 * am 18.09.2026 auf die beiden Stufen begrenzt, in denen es etwas beiträgt:
 *
 *   - `Eingang` und `Erstgespraech` (in der Oberfläche des neuen Ablaufs
 *     „Videocall"): Hier wird telefoniert und eingeladen, und der
 *     ausgefüllte Bogen sagt, wer als Nächstes am Zug ist.
 *   - Ab `Closing` steht der Termin fest. Dann zählt das Datum und nicht mehr
 *     der Bogen, und eine Zweiteilung würde die Reihenfolge nach Datum nur
 *     zerreißen.
 *
 * Alle übrigen Stufen (`FollowUp`, `Bedenkzeit`, `Paketwahl`, `Vertrag`,
 * `Rechnung`, `Nutzer_anlegen`, `Aktiv`) liegen hinter dem Gespräch und
 * bekommen die Zweiteilung ebenfalls nicht mehr, ebenso die abgeleiteten
 * Abschnitte `KeinInteresse` und `Abgelehnt`. Ein unbekannter Abschnitt
 * bekommt sie auch nicht: eine durchgehende Liste ist der harmlosere Fall.
 *
 * Die Sortierung nach dem Vorab-Score ist davon unberührt. Sie ist eine
 * eigene Sache und wirkt weiterhin in jeder Stufe; weg fällt nur das
 * erzwungene Vorziehen der Ausgefüllten.
 */
export function bogenTrennungZeigen(stufe: string): boolean {
  return stufe === "Eingang" || stufe === "Erstgespraech";
}

/** Die Spalten, über die sich die Bewerberliste sortieren lässt. */
export type SortSpalte = "score" | "termin";

/** Aufsteigend („hoch", Pfeil nach oben) oder absteigend („runter"). */
export type SortRichtung = "hoch" | "runter";

/** Welche Spalte gerade sortiert, oder `null` für die fachliche Reihenfolge. */
export type SortZustand = { spalte: SortSpalte; richtung: SortRichtung } | null;

/** Der Zustand einer einzelnen Spalte, so wie ihr Kopf ihn anzeigt. */
export type SpaltenSortierung = "aus" | SortRichtung;

/**
 * Der nächste Zustand, wenn auf den Kopf dieser Spalte geklickt wird.
 *
 * Für die angeklickte Spalte geht es im Kreis: aus, hoch, runter, aus. Eine
 * andere Spalte fängt bei „hoch" an und löst die bisherige damit ab.
 */
export function naechsteSortierung(zustand: SortZustand, spalte: SortSpalte): SortZustand {
  if (zustand?.spalte !== spalte) return { spalte, richtung: "hoch" };
  if (zustand.richtung === "hoch") return { spalte, richtung: "runter" };
  return null;
}

/** Was der Kopf dieser Spalte anzeigt: „aus", „hoch" oder „runter". */
export function sortierungDerSpalte(zustand: SortZustand, spalte: SortSpalte): SpaltenSortierung {
  return zustand?.spalte === spalte ? zustand.richtung : "aus";
}

/**
 * Nach einem Zeitpunkt sortieren, Einträge ohne Termin immer ans Ende.
 *
 * `zeitpunkt` gibt 0 (oder etwas Unbrauchbares) zurück, wenn kein Termin
 * gepflegt ist. Diese Einträge stehen in **beiden** Richtungen hinten und
 * behalten dabei ihre bisherige Reihenfolge. Ein leeres Feld ist weder ein
 * sehr früher noch ein sehr später Termin, es ist gar keiner; einmal oben und
 * einmal unten wäre nur verwirrend, und ganz oben stünden sie im Weg.
 */
export function sortiereNachTermin<T>(
  items: readonly T[],
  zeitpunkt: (x: T) => number,
  richtung: SortRichtung,
): T[] {
  const mitTermin: Array<{ x: T; ms: number }> = [];
  const ohneTermin: T[] = [];
  for (const x of items) {
    const ms = zeitpunkt(x);
    if (Number.isFinite(ms) && ms > 0) mitTermin.push({ x, ms });
    else ohneTermin.push(x);
  }
  mitTermin.sort((a, b) => (richtung === "hoch" ? a.ms - b.ms : b.ms - a.ms));
  return [...mitTermin.map(e => e.x), ...ohneTermin];
}
