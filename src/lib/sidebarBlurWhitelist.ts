/**
 * Whitelist von E-Mail-Adressen, deren Sidebar NIE verschwommen / gesperrt wird.
 * Gilt zusätzlich zur Preview-Erkennung in DashboardLayout.
 *
 * Admins und Inhaber brauchen keinen Eintrag, sie sind über ihre Rolle frei.
 * Wird ein Account hier eingetragen, ist die Pflicht-Academy für ihn rein
 * informativ – das Backoffice bleibt jederzeit voll bedienbar.
 */
export const SIDEBAR_BLUR_WHITELIST: ReadonlyArray<string> = [];

const NORMALIZED = new Set(
  SIDEBAR_BLUR_WHITELIST.map((e) => e.trim().toLowerCase())
);

export function isSidebarBlurExempt(email?: string | null): boolean {
  if (!email) return false;
  return NORMALIZED.has(email.trim().toLowerCase());
}
