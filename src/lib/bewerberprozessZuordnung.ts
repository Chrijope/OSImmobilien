import { getBewerber, updateBewerber, type Bewerber } from "./bewerbungStore";

/**
 * Welcher Bewerber läuft in welchem Prozess.
 *
 * ## Warum es diese Datei gibt
 *
 * Das alte Bewerbermanagement und der neue Bewerberprozess lesen **dieselbe
 * Tabelle**. Das war so gewollt, es spart einen zweiten Datenbestand. Ohne
 * eine Zuordnung hätte es aber zwei unangenehme Folgen:
 *
 * 1. Der neue Bereich zeigte sofort alle heutigen Bewerber, obwohl er in
 *    Erprobung ist und sie im alten Ablauf stehen.
 * 2. Schlimmer: Ein Übungsbewerber, der im neuen Bereich angelegt wird,
 *    stünde in der **alten Liste**, in der die HR-Managerin arbeitet. Sie
 *    würde ihn anrufen.
 *
 * Deshalb trägt jeder Bewerber ein Kennzeichen, und jede der beiden Listen
 * zeigt nur ihre eigene Seite. Es ist ausdrücklich **kein zweiter
 * Datenbestand**: Der Bewerber bleibt eine einzige Zeile, es ändert sich nur,
 * wer ihn sieht.
 *
 * ## Der spätere Umzug
 *
 * Wenn der neue Prozess freigegeben wird, sollen die heutigen Bewerber
 * hinüberwechseln und dort weiterlaufen. Weil nur ein Kennzeichen umgestellt
 * wird, ist das ein Vorgang und kein Kopieren: `alleInDenNeuenProzess`. Nichts
 * wird dupliziert, nichts kann dabei verloren gehen, und derselbe Weg führt
 * mit `alleZurueckInDenAltenProzess` wieder heraus.
 *
 * ## Was diese Zuordnung ausdrücklich nicht tut
 *
 * Die automatischen Läufe im Hintergrund (Erinnerungen, Nachfassmails)
 * arbeiten auf der Tabelle und kennen das Kennzeichen nicht. Ein Bewerber im
 * neuen Prozess bekommt also weiterhin echte Mails. Das ist so gewollt, sonst
 * ließe sich der neue Ablauf nicht wirklich durchspielen. Die Zuordnung regelt
 * die Sichtbarkeit, nicht den Versand.
 */

/** Der Schlüssel in `bewerbungen.meta`. */
export const PROZESS_SCHLUESSEL = "prozess";

/** Der Wert, der einen Bewerber in den neuen Ablauf stellt. */
export const PROZESS_NEU = "neu";

/**
 * Läuft dieser Bewerber im neuen Prozess?
 *
 * Ohne Kennzeichen lautet die Antwort nein. Das ist die wichtige Richtung:
 * Alle heutigen Bewerber tragen nichts und bleiben damit dort, wo sie sind.
 */
export function istImNeuenProzess(b: Pick<Bewerber, "prozess"> | undefined | null): boolean {
  return b?.prozess === PROZESS_NEU;
}

/** Die Liste für den neuen Bereich. Startet leer, bis jemand hinübergeholt wird. */
export function nurNeuerProzess<T extends Pick<Bewerber, "prozess">>(liste: readonly T[]): T[] {
  return liste.filter(istImNeuenProzess);
}

/** Die Liste für das bestehende Bewerbermanagement. */
export function nurAlterProzess<T extends Pick<Bewerber, "prozess">>(liste: readonly T[]): T[] {
  return liste.filter((b) => !istImNeuenProzess(b));
}

/*
 * Bis zum 26.09.2026 standen hier noch `inNeuenProzessHolen` und
 * `zurueckInDenAltenProzess` für einen einzelnen Bewerber. Sie gehörten allein
 * zum Knopf „Ablauf umstellen" im Bewerberprozess, und der ist auf Christians
 * Wunsch entfallen. Das Kennzeichen bleibt, wie es beim Bewerber steht: Wer
 * `neu` trägt, läuft mit Videocall und Kennenlernbogen, wer nichts trägt, mit
 * Erstgespräch und Vorabbogen. Neue Bewerber bekommen `neu` beim Anlegen.
 */

/**
 * Der Umzug beim Umschalten: alle heutigen Bewerber in den neuen Ablauf.
 *
 * Gibt zurück, wie viele umgestellt wurden. Bewerber, die schon drüben sind,
 * werden nicht noch einmal angefasst, damit der Aufruf gefahrlos wiederholbar
 * ist.
 */
export function alleInDenNeuenProzess(): number {
  const offen = nurAlterProzess(getBewerber());
  offen.forEach((b) => updateBewerber(b.id, { prozess: PROZESS_NEU }));
  return offen.length;
}

/** Der Rückweg für alle. Gibt zurück, wie viele zurückgestellt wurden. */
export function alleZurueckInDenAltenProzess(): number {
  const drueben = nurNeuerProzess(getBewerber());
  drueben.forEach((b) => updateBewerber(b.id, { prozess: "" }));
  return drueben.length;
}
