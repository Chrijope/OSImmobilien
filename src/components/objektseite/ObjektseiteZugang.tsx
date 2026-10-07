import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { useLiveVersion } from "@/hooks/useLiveData";
import { isTableLoaded } from "@/lib/dataCache";
import { LoadingFallback } from "@/components/LoadingFallback";
import { objekteTestFreigabe, siehtAdminOnlyNavigation, siehtObjektUndEinheitenseite } from "@/lib/sidebarPermissions";
import { useObjektAdresseGesperrt } from "@/hooks/useObjektAdresseGesperrt";

/**
 * Zugang zur Objektseite und zur Einheiten-Seite.
 *
 * Beide Seiten liegen unter `/objekte/…`, und diese Adresse ist für viele
 * Rollen freigegeben, weil das alte Objektdetail dort wohnt. Der Reiter
 * „Objekte" in der Seitenleiste ist aber `adminOnly`. Damit die neuen Seiten
 * nicht mehr zeigen als die Seitenleiste, prüfen sie hier dieselbe Regel und
 * schicken alle anderen Rollen auf die Verwaltungsansicht, die sie bisher
 * schon sahen. Eine Weiterleitung statt einer Sperrseite, weil die alten
 * Abläufe (Reservierung aus der Kundenakte, Objektpartner-Dashboard) weiter
 * auf `/objekte/:id` verlinken.
 *
 * Die Query-Parameter bleiben dabei erhalten, sie tragen Kundenkontext.
 *
 * `mitVertriebsleitung` (seit dem 04.10.2026) lässt zusätzlich die
 * Vertriebsleitung herein, für Objekt- und Einheitenseite und seit dem
 * 05.10.2026 auch für Kundenansicht und internes Exposé (Christians Go für
 * die Kundenaktionen, siehe `darfKundenaktionen`).
 *
 * Dieselbe Öffnung bekommt die Testfreischaltung für einzelne
 * Vertriebspartner-Konten (`objekteTestFreigabe`, 05.10.2026). Sie steht in
 * `app_config`. Exposé und Kundenansicht öffnen in einem neuen Tab ohne
 * CRM-Rahmen, dort ist die Tabelle beim ersten Zeichnen oft noch nicht
 * geladen. Bis dahin wartet der Wächter, statt den Partner wegzuleiten.
 */
export function ObjektseiteZugang({ verwaltungPfad, mitVertriebsleitung = false, children }: {
  verwaltungPfad: string;
  mitVertriebsleitung?: boolean;
  children: ReactNode;
}) {
  const { user, authUser } = useUser();
  const location = useLocation();
  useLiveVersion(["app_config"]);
  // Exposé und Kundenansicht liegen außerhalb der AppShell, deshalb hier
  // dieselbe Sperre für ausgeblendete und fremde Exklusivobjekte.
  const objektZu = useObjektAdresseGesperrt(location.pathname);
  const darf = mitVertriebsleitung
    ? siehtObjektUndEinheitenseite(user.role) || objekteTestFreigabe(user.role, authUser?.id)
    : siehtAdminOnlyNavigation(user.role);
  if (!darf && mitVertriebsleitung && user.role === "vertriebspartner" && authUser?.id && !isTableLoaded("app_config")) {
    return <LoadingFallback />;
  }
  if (!darf) {
    return <Navigate to={`${verwaltungPfad}${location.search}`} replace />;
  }
  if (objektZu) return <Navigate to="/" replace />;
  return <>{children}</>;
}
