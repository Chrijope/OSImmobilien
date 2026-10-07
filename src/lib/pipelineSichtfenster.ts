/**
 * Welche Kacheln einer Pipelinespalte tatsächlich gezeichnet werden.
 *
 * In der Pipeline stehen firmenweit über zweitausend Kontakte. Alle auf einmal
 * zu zeichnen hat den Browser beim Öffnen der Seite sekundenlang blockiert,
 * obwohl in eine Spalte nur etwa acht Kacheln auf den Bildschirm passen.
 *
 * Diese Funktion schneidet die Liste auf das Sichtfenster zu. Zwei Regeln sind
 * dabei wichtig und deshalb hier und nicht in der Seite:
 *
 *   * Die Zahl in der Spaltenüberschrift bleibt die Gesamtzahl. Wer hier
 *     kürzt, darf die Zählung nicht mitkürzen, sonst behauptet die Spalte
 *     weniger Kunden als sie hat.
 *   * Eine gerade verschobene Kachel bleibt sichtbar. Ohne diese Ausnahme
 *     landet ein Kunde, den man in eine volle Spalte zieht, hinter dem
 *     Sichtfenster, und der Zug sieht aus, als wäre die Kachel verschwunden.
 */

/** Nur das, was für die Auswahl gebraucht wird, damit der Test leicht bleibt. */
export interface SichtbareKachel {
  kunde: { id: string };
  investmentId?: string;
}

/** Die zuletzt per Ziehen verschobene Kachel, sofern es eine gibt. */
export interface VerschobeneKachel {
  kundeId: string;
  investmentId?: string;
}

export function sichtfenster<T extends SichtbareKachel>(
  eintraege: readonly T[],
  anzahl: number,
  zuletztVerschoben?: VerschobeneKachel | null,
): T[] {
  if (eintraege.length <= anzahl) return eintraege as T[];
  const gezeigt = eintraege.slice(0, Math.max(0, anzahl));
  if (!zuletztVerschoben) return gezeigt;

  const pos = eintraege.findIndex(
    (e) =>
      e.kunde.id === zuletztVerschoben.kundeId &&
      (!zuletztVerschoben.investmentId || e.investmentId === zuletztVerschoben.investmentId),
  );
  // Nur wenn sie überhaupt in dieser Spalte steht und hinter dem Fenster liegt.
  if (pos < 0 || pos < gezeigt.length) return gezeigt;
  return [eintraege[pos], ...gezeigt];
}
