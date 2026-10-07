/**
 * Die Quelle eines Kontakts, wie sie überall angezeigt wird.
 *
 * Maßgeblich ist die Spalte `kontakte.quelle`. Ältere und manuell angelegte
 * Leads haben dort oft nichts stehen, tragen den Kanal aber in
 * `meta.leadTyp` (etwa "google"). Die Liste „Alle Kontakte“ fiel schon immer
 * darauf zurück, das Kundenprofil nicht, deshalb stand dort ein Strich, wo die
 * Liste „Google“ zeigte. Beide lesen jetzt hier.
 *
 * Nur Anzeige: Der abgeleitete Wert wird nie in `quelle` zurückgeschrieben.
 */
export function kontaktQuelleAnzeige(k: { quelle?: string | null; leadTyp?: string | null }): string {
  return (k.quelle || "").trim() || (k.leadTyp || "").trim();
}
