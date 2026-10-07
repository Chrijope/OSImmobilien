/**
 * Kleine reine Helfer für die Exposé-Seite, getrennt von den Komponenten,
 * damit sie sich ohne Oberfläche testen lassen.
 */

/** Den gewünschten Vermögens-Horizont wählen, sonst den nächstliegenden vorhandenen; null ohne Auswahl. */
export function horizontWaehlen(vorhanden: readonly number[], gewuenscht: number): number | null {
  if (vorhanden.length === 0) return null;
  if (vorhanden.includes(gewuenscht)) return gewuenscht;
  return [...vorhanden].sort((a, b) => Math.abs(a - gewuenscht) - Math.abs(b - gewuenscht) || a - b)[0];
}
