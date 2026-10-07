/**
 * Wer einen Kontakt endgültig löschen darf (DSGVO-Löschung, Papierkorb).
 *
 * Seit dem 26.09.2026 auch die Vertriebsleitung (Entscheidung Christian).
 * Vorher zeigte der Papierkorb ihr den Knopf, und dsgvo-hard-delete lehnte ab.
 * Eine Liste für Server (dsgvo-hard-delete, dsgvo-storage-cleanup) und
 * Oberfläche (src/lib/papierkorbRegeln.ts), damit beide nicht wieder
 * auseinanderlaufen.
 */
export const ENDGUELTIG_LOESCHEN_ROLLEN: readonly string[] = ["admin", "inhaber", "vertriebsleiter"];

export function darfEndgueltigLoeschen(rollen: readonly (string | null | undefined)[]): boolean {
  return rollen.some((r) => !!r && ENDGUELTIG_LOESCHEN_ROLLEN.includes(r));
}
