/**
 * Erkennt, dass ein nachgeladener Programmteil (Chunk) fehlt, typischerweise
 * nach einem Deploy: Der offene Tab kennt noch die alten Dateinamen, die es
 * auf dem Server nicht mehr gibt.
 *
 * Seit dem 26.10.2026 laedt die App in diesem Fall nie mehr von selbst neu.
 * Ein automatisches Neuladen hat Christian mitten in der Arbeit Eingaben
 * gekostet. Stattdessen zeigt die jeweilige Fehlergrenze eine Karte mit
 * „Jetzt neu laden“, geklickt wird vom Nutzer.
 */
const CHUNK_FEHLER_MUSTER =
  /Failed to fetch dynamically imported module|dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading module|Loading chunk|Unable to preload CSS/i;

export function istChunkLadefehler(fehler: unknown): boolean {
  const meldung = fehler instanceof Error ? fehler.message : String(fehler ?? "");
  return CHUNK_FEHLER_MUSTER.test(meldung);
}
