/**
 * Rollen, die Kundendaten nur lesen (Christian, 18.10.2026).
 *
 * Die Buchhaltung sieht Kontakte, Kundenprofile, Investments und die
 * Pipeline, ändert aber nichts. Ausnahme bleiben die Stufen „Abrechnung“
 * und „Abgeschlossen“ (ABSCHLUSS_NUR_ROLLEN in abwicklungStore.ts).
 *
 * Das ist die Oberfläche. Hart sperrt die Datenbank:
 * `nur_lesend_kundendaten` und der Wächter `kundendaten_nur_lesend_schuetzen`
 * (Migration 20261018130000).
 */
export const NUR_LESEND_KUNDEN_ROLLEN: readonly string[] = ["buchhaltung"];

export function nurLesendKundendaten(rolle: string | null | undefined): boolean {
  return NUR_LESEND_KUNDEN_ROLLEN.includes(String(rolle || ""));
}

export const NUR_LESEND_HINWEIS =
  "Nur lesend: Du siehst diesen Kunden, kannst aber nichts ändern. Ausnahme sind die Stufen Abrechnung und Abgeschlossen.";
