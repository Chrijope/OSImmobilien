/**
 * Wohin der Zurückweg aus der Reservierungsvereinbarung führt.
 *
 * Das Formular lässt sich von drei Stellen aus öffnen: aus dem Kundenprofil,
 * von der Objektseite und von der Wohnungsseite. Jede gibt ihre eigene
 * Adresse als Parameter `zurueck` mit, damit der Knopf oben dorthin
 * zurückführt, wo der Nutzer hergekommen ist.
 *
 * **Warum das eine eigene Datei ist:** Die Regel wurde an zwei Stellen
 * gebraucht, im Formular für den Zurückknopf und auf der Seite für den Sprung
 * nach dem Versand. Zweimal dieselbe Prüfung heißt: Eines Tages wird nur eine
 * davon geändert, und dann führt derselbe Knopf an zwei verschiedene Orte.
 *
 * **Warum die Prüfung nötig ist:** Der Wert steht in der Adresszeile und ist
 * damit von außen gesetzt. Ohne Prüfung könnte ein zugeschickter Link jemanden
 * aus dem CRM heraus auf eine fremde Seite schicken, die wie das CRM aussieht.
 * Erlaubt ist deshalb nur ein Pfad innerhalb der Anwendung.
 */

/**
 * Ist das ein Pfad innerhalb der Anwendung?
 *
 * Drei Formen werden abgelehnt, und die beiden letzten sind der Grund für
 * diese Funktion:
 *
 *   - `https://fremd.example` und alles andere mit Schema.
 *   - `//fremd.example`, die protokollrelative Adresse. Sie sieht aus wie ein
 *     Pfad, führt aber auf einen fremden Rechner.
 *   - `/\fremd.example` und `/\/fremd.example`. Browser behandeln den
 *     Rückwärtsschrägstrich in Adressen wie einen Schrägstrich, damit wirkt
 *     das wie die Form darüber. Eine Prüfung, die nur auf `//` sieht, lässt
 *     es durch.
 */
export function istInternerPfad(ziel: string | null | undefined): boolean {
  if (!ziel) return false;
  if (!ziel.startsWith("/")) return false;
  // Zweites Zeichen: Schrägstrich oder Rückwärtsschrägstrich heißt fremder Ort.
  const zweites = ziel.charAt(1);
  return zweites !== "/" && zweites !== "\\";
}

/**
 * Das Ziel des Zurückknopfes. Fällt auf das Kundenprofil zurück, und ohne
 * Kunden auf die Kontaktliste, damit der Knopf nie ins Leere zeigt.
 */
export function rueckweg(ziel: string | null | undefined, kundeId?: string | null): string {
  if (istInternerPfad(ziel)) return ziel as string;
  return kundeId ? `/kunden/${kundeId}` : "/kontakte";
}

/** Die Beschriftung richtet sich nach dem Ort, an den es zurückgeht. */
export function rueckwegBeschriftung(ziel: string): string {
  if (ziel.startsWith("/kunden/")) return "Zurück zum Kundenprofil";
  // Seit dem 23.09.2026 führt auch die Einheitsseite in die Reservierung.
  if (/^\/objekte\/[^/]+\/einheiten\//.test(ziel)) return "Zurück zur Einheit";
  if (ziel.startsWith("/objekte/")) return "Zurück zum Objekt";
  return "Zurück";
}
