/**
 * Wem eine Benachrichtigung eingeblendet werden darf.
 *
 * WARUM DAS EINE EIGENE DATEI IST
 *
 * Die Glocke hat zwei Anzeigen, und sie liefen auseinander:
 *
 *   Die LISTE filtert seit jeher auf die eigene Kennung. Wer als Admin oder
 *   Inhaber laut Zeilensicherheit alle Benachrichtigungen lesen darf, sieht
 *   dort trotzdem nur seine eigenen.
 *
 *   Die EINBLENDUNG davor filterte bis zum 17.09.2026 gar nicht. Sie feuerte
 *   bei jeder neuen Zeile in der Tabelle, gleich fuer wen sie bestimmt war.
 *
 * Christian bekam deshalb die Meldung „Reservierung versandt: Jonas Lins",
 * obwohl sie an p.pintat@more.immo zugestellt war, und fand in seiner Glocke
 * nichts dazu. Genau dieses Muster, Anzeige und Daten gehen auseinander, hatte
 * das Projekt einen Tag zuvor schon einmal.
 *
 * Die Regel steht hier und nicht in der Komponente, weil sie eine
 * Sicherheitsfrage ist und geprueft gehoert. `HeaderBar` ist mit ihren
 * Abhaengigkeiten schwer zu testen, diese drei Zeilen sind es nicht.
 *
 * Das hier entscheidet nur, was die Oberflaeche zeigt. Massgeblich dafuer, wer
 * eine Zeile ueberhaupt lesen darf, bleibt die Zeilensicherheit der Datenbank.
 */

/** Was von einer Benachrichtigungszeile gebraucht wird. */
export interface AnzeigeZeile {
  benutzer_id?: string | null;
}

/**
 * Darf diese Meldung eingeblendet werden?
 *
 * Im Zweifel ja: Ist die eigene Kennung noch nicht geladen, wird nicht
 * unterdrueckt. Dieselbe Regel wie in der Liste, und sie faellt auf die
 * richtige Seite. Eine Meldung zu viel ist laestig, eine verschluckte
 * Meldung bemerkt niemand.
 */
export function darfEingeblendetWerden(
  zeile: AnzeigeZeile | null | undefined,
  eigeneKennung: string | null | undefined,
): boolean {
  if (!eigeneKennung) return true;
  if (!zeile) return false;
  return zeile.benutzer_id === eigeneKennung;
}
