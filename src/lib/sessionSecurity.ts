/**
 * Session-Security-Hilfsfunktionen.
 *
 * Früher lagen hier auch der Merker „Angemeldet bleiben“ und die Zeiten für
 * eine Abmeldung bei Inaktivität. Beides wurde nie ausgewertet und ist seit
 * dem 26.09.2026 entfernt; die Abmeldung erledigt der Server jede Nacht
 * (supabase/migrations/20260926200000_naechtliche_abmeldung.sql).
 */

/**
 * Findet alle Supabase-Auth-Tokens im localStorage.
 * Supabase legt die Session unter Schlüsseln wie `sb-<ref>-auth-token` ab.
 */
function findSupabaseAuthKeys(): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("sb-") && key.includes("-auth-token")) {
        keys.push(key);
      }
    }
  } catch {
    // ignore
  }
  return keys;
}

/**
 * Löscht die Supabase-Session aus dem localStorage. Wird beim Abmelden
 * aufgerufen, damit auch bei einem gescheiterten Server-Aufruf nichts liegen bleibt.
 */
export function clearPersistedSupabaseSession() {
  try {
    findSupabaseAuthKeys().forEach((key) => localStorage.removeItem(key));
  } catch {
    // ignore
  }
}
