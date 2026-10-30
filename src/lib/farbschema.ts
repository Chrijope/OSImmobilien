/**
 * Hell, Dunkel, Automatisch (A6, 26.10.2026).
 *
 * Bisher schaltete der Mond in der Kopfleiste nur zwischen Hell und Dunkel um,
 * und die Wahl war nach dem Neuladen wieder weg. Jetzt gibt es dazu
 * „Automatisch“, das der Einstellung des Geräts folgt (`prefers-color-scheme`).
 * Seit 30.10.2026 richtet sich „Automatisch“ nach der Uhrzeit (Christian):
 * dunkel von DUNKEL_AB bis HELL_AB Uhr, sonst hell. Viele Geräte stehen
 * dauerhaft auf Hell, dem Gerät zu folgen schaltete dort nie um.
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

/** Ab dieser Stunde dunkel, ab HELL_AB wieder hell (Ortszeit des Geräts). */
export const DUNKEL_AB = 19;
export const HELL_AB = 7;

export function istNacht(jetzt: Date): boolean {
  const stunde = jetzt.getHours();
  return stunde >= DUNKEL_AB || stunde < HELL_AB;
}

export function istDunkel(schema: Farbschema, nacht: boolean): boolean {
  return schema === "dunkel" || (schema === "auto" && nacht);
}
