/**
 * Hell, Dunkel, Automatisch (A6, 26.10.2026).
 *
 * Bisher schaltete der Mond in der Kopfleiste nur zwischen Hell und Dunkel um,
 * und die Wahl war nach dem Neuladen wieder weg. Jetzt gibt es dazu
 * „Automatisch“, das der Einstellung des Geräts folgt (`prefers-color-scheme`).
 * Gemerkt wird je Gerät im Browser, nicht im Konto: Am Handy will man oft
 * etwas anderes als am Schreibtisch.
 */
export type Farbschema = "hell" | "dunkel" | "auto";

export const FARBSCHEMA_SCHLUESSEL = "osimmo_farbschema";
/** Ohne gemerkte Wahl bleibt es wie bisher hell. */
export const FARBSCHEMA_STANDARD: Farbschema = "hell";

export function leseFarbschema(roh: unknown): Farbschema {
  return roh === "hell" || roh === "dunkel" || roh === "auto" ? roh : FARBSCHEMA_STANDARD;
}

export function ladeFarbschema(): Farbschema {
  try {
    return leseFarbschema(localStorage.getItem(FARBSCHEMA_SCHLUESSEL));
  } catch {
    // Privates Fenster oder gesperrter Speicher: dann eben der Standard.
    return FARBSCHEMA_STANDARD;
  }
}

export function merkeFarbschema(schema: Farbschema): void {
  try {
    localStorage.setItem(FARBSCHEMA_SCHLUESSEL, schema);
  } catch {
    /* ohne Speicher gilt die Wahl nur bis zum Neuladen */
  }
}

export function istDunkel(schema: Farbschema, geraetDunkel: boolean): boolean {
  return schema === "dunkel" || (schema === "auto" && geraetDunkel);
}

export const GERAET_DUNKEL_ABFRAGE = "(prefers-color-scheme: dark)";
