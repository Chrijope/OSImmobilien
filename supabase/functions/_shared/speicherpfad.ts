/**
 * Ein Speicherpfad, der sich gefahrlos an die Storage-Schnittstelle geben
 * lässt (seit dem 28.09.2026, Befund LOTSE-R5-001).
 *
 * Geprüft wird der Pfad NACH dem Dekodieren. Abgelehnt wird jedes `%`
 * (auch doppelt kodierte Trenner wie `%252e`), jeder Backslash, jedes
 * Steuerzeichen, ein führender Schrägstrich, ein doppelter Schrägstrich und
 * jeder Abschnitt „.“ oder „..“. Was hier durchkommt, kann keinen anderen
 * Ordner erreichen als den, mit dem er beginnt.
 *
 * Genutzt von `dokumentAblage` (Lotse, Rechner, Objekttexte), der
 * Kundenablage (`kunden-ablage.ts`) und `analyze-objekt-pdfs`. Geprüft in
 * `src/lib/lotseFaktenauszug.test.ts`.
 */
export function sichererSpeicherpfad(pfad: string): string | null {
  if (typeof pfad !== "string" || !pfad || pfad.length > 1024) return null;
  // deno-lint-ignore no-control-regex
  if (/[%\\\u0000-\u001f\u007f]/.test(pfad)) return null;
  if (pfad.startsWith("/") || pfad.includes("//")) return null;
  if (pfad.split("/").some((teil) => !teil || teil === "." || teil === "..")) return null;
  return pfad;
}

/**
 * Nur Pfade, die die Objektanlage selbst schreibt (`objektAnalyseRunner.ts`):
 * `<eigene Nutzerkennung>/analyse-temp/<Lauf-UUID>/<Nummer>_<Name>`, der Name
 * nur aus Buchstaben, Ziffern, Punkt, Unterstrich und Bindestrich, höchstens
 * 100 Zeichen. Damit scheitern `..`, kodierte Trenner wie `%2e%2e` und `%2f`,
 * Backslash und Steuerzeichen schon am Format (LOTSE-R5-001), zusätzlich
 * prüft `sichererSpeicherpfad`.
 */
export function analysePfadErlaubt(nutzer: string, pfad: unknown): boolean {
  if (typeof pfad !== "string" || !/^[0-9a-f-]{36}$/i.test(nutzer)) return false;
  const format = new RegExp(`^${nutzer}/analyse-temp/[0-9a-f-]{36}/\\d{1,4}_[A-Za-z0-9._-]{1,100}$`, "i");
  return format.test(pfad) && sichererSpeicherpfad(pfad) !== null;
}
