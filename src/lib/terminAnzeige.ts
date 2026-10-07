/**
 * Reine Auswertungen fuer die Termin-Anzeige im Kundenprofil.
 *
 * Der QuickActionDialog schreibt die Gaeste eines Meetings als Zeile
 * "Gäste: Name <mail>, ..." in die Details der Termin-Aktivitaet. Die
 * Ergebnis-Karte zeigt daraus nur die Namen, die Mail-Adressen gehen
 * niemanden etwas an, der nur kurz aufs Profil schaut.
 */

/** Name des window-Ereignisses, mit dem neue Termine sofort nachgeladen werden. */
export const TERMINE_AKTUALISIERT_EVENT = "termine-aktualisiert";

/**
 * Liest die Gaeste-Namen aus den Details einer Termin-Aktivitaet.
 * E-Mail-Adressen in spitzen Klammern werden weggelassen.
 */
export function gaesteNamenAusDetails(details?: string | null): string[] {
  if (!details) return [];
  const zeile = details
    .split("\n")
    .map((z) => z.trim())
    .find((z) => z.startsWith("Gäste:"));
  if (!zeile) return [];
  return zeile
    .slice("Gäste:".length)
    .split(",")
    .map((teil) => teil.replace(/<[^>]*>/g, "").trim())
    .filter(Boolean);
}

/** Liest die Investment-Zeile aus den Details einer Termin-Aktivitaet. */
export function investmentAusDetails(details?: string | null): string | undefined {
  const treffer = (details || "").match(/^Investment: (.+)$/m);
  return treffer ? treffer[1].trim() : undefined;
}
