/**
 * Kontakte, die aus allen Statistiken, Dashboards und Provisions-
 * berechnungen ausgeschlossen sind (z. B. Demo-/Testkunden, die nur
 * für Investment-Vergleichsansichten sichtbar bleiben sollen).
 *
 * Ausschluss greift, wenn:
 *  - die Kontakt-ID in EXCLUDED_IDS gelistet ist, ODER
 *  - meta._excludeFromStats === true, ODER
 *  - meta._testData === true (Seed-/Stresstestdaten).
 *
 * Die Kontakte selbst bleiben in den Kundenlisten sichtbar –
 * sie werden nur nicht in Auswertungen einbezogen.
 */
const EXCLUDED_IDS = new Set<string>([
  "086acaeb-0ff9-4577-b114-3b973797d635", // Frank Otto (Demo)
  "9d2957d5-f165-41d5-8e25-c0b4655169b2", // Otto Hans  (Demo)
]);

export function isKontaktStatsExcluded(k: any): boolean {
  if (!k) return false;
  if (k.id && EXCLUDED_IDS.has(k.id)) return true;
  const meta = (k.meta ?? {}) as Record<string, unknown>;
  if (meta._excludeFromStats === true) return true;
  if (meta._testData === true) return true;
  return false;
}

export function excludeStatsKontakte<T = any>(arr: T[] | null | undefined): T[] {
  if (!Array.isArray(arr)) return [];
  return arr.filter((k) => !isKontaktStatsExcluded(k));
}

export const STATS_EXCLUDED_KONTAKT_IDS = EXCLUDED_IDS;