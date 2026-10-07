/**
 * Wer darf eine Einheit für einen Kunden reservieren.
 *
 * Entscheidung Christians vom 11.09.2026: Admin, Inhaber, Vertriebsleiter und
 * Vertriebspartner. Sonst niemand.
 *
 * Vorher hatte der Knopf "Kunde reservieren" gar keine Rollenprüfung, und in
 * der Datenbank durfte jede der fünfzehn internen Rollen an den Wohnungen
 * schreiben, also auch Hausverwaltung, Marketing, Buchhaltung und HR. Ein
 * ausgeblendeter Knopf ist keine Zugriffskontrolle, deshalb gibt es zu dieser
 * Datei eine Entsprechung in der Datenbank: die Funktion
 * `public.darf_reservieren()` und der Auslöser
 * `wohnung_reservierung_pruefen()` (Migration
 * `20260911090000_reservierung_nur_vertrieb.sql`). Ändert sich die Liste hier,
 * muss sie dort mitgeändert werden.
 */
export const RESERVIEREN_ROLLEN = [
  "admin",
  "inhaber",
  "vertriebsleiter",
  "vertriebspartner",
] as const;

export function darfReservieren(role?: string | null): boolean {
  if (!role) return false;
  return (RESERVIEREN_ROLLEN as readonly string[]).includes(role);
}
