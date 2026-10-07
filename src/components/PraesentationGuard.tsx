import { Navigate, useLocation } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { LoadingFallback } from "@/components/LoadingFallback";
import { isKundeRole, isTippgeberRole } from "@/lib/sidebarPermissions";
import { darfBewerberprozess } from "@/lib/bewerberprozessFreigabe";

/**
 * Schützt die internen Beratungspräsentations-Routen. Diese Seiten liegen
 * bewusst AUSSERHALB des AppShell (damit sie per window.open in einem neuen
 * Tab ohne CRM-Rahmen geöffnet werden können) und wären dadurch sonst
 * öffentlich erreichbar.
 *
 * Zugriffslogik:
 * - Session/Rolle lädt noch → neutraler Ladezustand (nicht vorschnell sperren).
 * - Nicht eingeloggt → Weiterleitung auf /login, dabei bleibt die Ziel-URL
 *   inklusive Query (kunde/kundeId/investmentId) über den redirect-Parameter
 *   erhalten, sodass nach dem Login wieder die Präsentation geöffnet wird.
 * - Eingeloggt, aber kundenseitige Rolle (kunde/tippgeber) → kein Zugriff,
 *   Weiterleitung auf die Startseite.
 * - Mit `nurBewerberprozess` (Closing-Seiten des Bewerberwegs) nur die Rollen
 *   des Bewerberprozesses, siehe `BEWERBERPROZESS_ROLLEN`. Die Datenbank gibt
 *   Bewerbungen seit dem 27.09.2026 nur an diese Rollen heraus, alle anderen
 *   sähen hier eine leere Seite. Weiterleitung auf die Startseite.
 * - Alle übrigen (internen) Rollen → Zugriff erlaubt.
 */
export function PraesentationGuard({
  children,
  nurBewerberprozess = false,
}: {
  children: React.ReactNode;
  nurBewerberprozess?: boolean;
}) {
  const { isLoggedIn, loading, user } = useUser();
  const location = useLocation();

  // Auth-Initialisierung läuft noch – neutraler Ladezustand.
  if (loading) {
    return <LoadingFallback />;
  }

  // Nicht eingeloggt → zum Login, Ziel-URL (inkl. Query) erhalten.
  if (!isLoggedIn) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }

  // Profil/Rolle noch nicht geladen (Default-Sentinel "Laden..." hat die
  // Platzhalter-Rolle "kunde"). In diesem Zustand NICHT rollenbasiert sperren,
  // sonst würde ein gerade einloggender interner VP fälschlich blockiert.
  if (user.name === "Laden...") {
    return <LoadingFallback />;
  }

  // Eingeloggt, aber kundenseitige Rolle → kein Zugriff.
  if (isKundeRole(user.role) || isTippgeberRole(user.role)) {
    return <Navigate to="/" replace />;
  }

  if (nurBewerberprozess && !darfBewerberprozess({ rolle: user.role })) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
