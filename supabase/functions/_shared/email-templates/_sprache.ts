/**
 * Sprachwahl der Anmeldemails (Plan Kundensprache vom 25.09.2026, M30).
 *
 * `auth-email-hook` ermittelt die Sprache aus dem Kundenprofil über die
 * Adresse und gibt sie als `sprache` an die Vorlage. Findet er keinen
 * Kontakt (Partner, Mitarbeiter) oder ist die Angabe unklar, gilt Deutsch.
 *
 * Nur Sprachwahl, keine Gestaltung: Das Aussehen kommt weiter aus
 * `_gemeinsam.ts`.
 */
import { normalisiereSprache, type Sprache } from '../kunden-sprache.ts'

// Jede Sprache darf ihren eigenen Typ haben, damit `as const`-Vorlagen mit
// abweichenden Literalen (z. B. "Sicherheit" / "Security") kompilieren.
export function texteFuer<D, E>(texte: { de: D; en: E }, sprache: unknown): D | E {
  return texte[normalisiereSprache(sprache) ?? 'de']
}
