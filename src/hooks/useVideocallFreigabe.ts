import { useUser } from "@/contexts/UserContext";
import { darfVideocallBereich } from "@/lib/bewerberprozessFreigabe";

/**
 * Darf dieser Nutzer den Videocall-Bereich sehen und nutzen?
 *
 * Seit dem 27.09.2026 (Entscheidung von Christian) nur Christian Peetz in der
 * aktiven Rolle admin, niemand sonst. Die Regel steht einmal in
 * `darfVideocallBereich`; dieselbe prüft der Routenschutz in
 * `sidebarPermissions.ts`. Alle Einstiege fragen diesen Haken: Seitenleiste,
 * Videocall-Seiten, das Meeting im Kundenprofil (`QuickActionDialog`) und die
 * Warteraum-Meldungen.
 *
 * Bis dahin öffneten ihn zusätzlich inhaber, hr und die Einträge in der
 * Tabelle `videocall_freigaben`. Die Tabelle wird nicht mehr gelesen; die
 * Datenbank ignoriert sie ebenfalls (Migration
 * 20260927120000_videocall_nur_geschaeftsfuehrer.sql).
 *
 * `laedt` ist wahr, solange die Anmeldung noch nicht vorliegt, damit eine
 * Seite in diesem Moment keine Sperrmeldung aufblitzen lässt.
 */
export function useVideocallFreigabe(): { darf: boolean; laedt: boolean } {
  const { user, authUser } = useUser();
  if (!authUser) return { darf: false, laedt: true };
  const darf = darfVideocallBereich({ rolle: user.role, userId: authUser.id, email: authUser.email });
  return { darf, laedt: false };
}
