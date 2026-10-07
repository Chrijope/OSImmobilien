/**
 * Whitelist von E-Mail-Adressen, deren Sidebar NIE verschwommen / gesperrt wird.
 * Gilt zusätzlich zur Preview-Erkennung in DashboardLayout.
 *
 * Wird ein Account hier eingetragen, ist die Pflicht-Academy für ihn rein
 * informativ – das Backoffice bleibt jederzeit voll bedienbar.
 */
export const SIDEBAR_BLUR_WHITELIST: ReadonlyArray<string> = [
  "c.peetz@moreimmo.de",
  "c.peetz@imondu.de",
  "m.m@imondu.com",
  "m.marjanovic@moreimmo.de",
  "m.obermantel@moreimmo.de",
  "m.ober-mantel@moreimmo.de",
  "m.sauter@moreimmo.de",
  "max.sauter@moreimmo.de",
  "t.blum@moreimmo.de",
  "timo.blum@moreimmo.de",
  "e.bajrami@moreimmo.de",
  "erleta.bajrami@moreimmo.de",
];

const NORMALIZED = new Set(
  SIDEBAR_BLUR_WHITELIST.map((e) => e.trim().toLowerCase())
);

export function isSidebarBlurExempt(email?: string | null): boolean {
  if (!email) return false;
  return NORMALIZED.has(email.trim().toLowerCase());
}
