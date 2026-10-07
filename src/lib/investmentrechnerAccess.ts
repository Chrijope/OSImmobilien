import type { UserRole } from "@/types/user";

/**
 * Zugriff auf den Investmentrechner (`/investmentrechner`).
 *
 * Seit dem 07.09.2026 ist der Rechner kein Entwurf mehr und steht den
 * Vertriebsrollen offen. Die Rollenliste steht bewusst hier im Code und nicht
 * in `public.role_permissions`: `sidebarPermissions.ts` wertet diese Pruefung
 * vor der Rollenliste aus der Datenbank aus, deshalb greift sie sofort und
 * ohne Migration, in der Seitenleiste genauso wie im Routen-Schutz des
 * DashboardLayout. Sonst waere der Eintrag zwar sichtbar, der Klick landete
 * aber auf dem Dashboard.
 *
 * Bis zum 27.09.2026 gab es zusaetzlich eine persoenliche Ausnahme fuer
 * Hermann Vogl (Mailadresse und Nutzer-Kennung). Sie ist entfallen: Anzeige
 * und Befugnis richten sich allein nach der aktiven Rolle. Als
 * Vertriebspartner ist er ueber `INVESTMENTRECHNER_ROLLEN` ohnehin drin; die
 * Ausnahme oeffnete den Rechner nur noch in Rollen, fuer die er nicht gedacht
 * ist.
 */
export const INVESTMENTRECHNER_ROUTE = "/investmentrechner";

/** Rollen, fuer die der Investmentrechner regulaer offen ist. */
export const INVESTMENTRECHNER_ROLLEN: ReadonlyArray<UserRole> = [
  "admin",
  "inhaber",
  "vertriebsleiter",
  "vertriebspartner",
  "objektpartner",
  "finanzierungspartner",
];

export function canAccessInvestmentrechner(role: UserRole | string | undefined | null): boolean {
  return INVESTMENTRECHNER_ROLLEN.includes((role || "") as UserRole);
}
