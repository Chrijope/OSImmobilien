import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { useOptionalUser } from "@/contexts/UserContext";
import { kundenansichtZiel } from "@/lib/kundenansichtZiel";

/**
 * Die alte „Kundenansicht“ (`/kundenansicht/objekt/:id` und
 * `/kundenansicht/objekt/:id/wohnung/:weId`) ist seit dem 23.09.2026
 * abgelöst (Bauplan Kundenansicht, Frage 11, Freigabe von Christian).
 *
 * Warum: Sie schätzte das Hausgeld pauschal auf 25 % der Miete, ihr Knopf
 * „Details & Reservieren“ führte Kunden in die interne Wohnungsverwaltung,
 * und die Wohnungsseite zeigte Unterlagen, ohne deren Kategorie zu prüfen.
 *
 * Die Adressen bleiben erreichbar, damit alte Links nicht ins Leere laufen,
 * und leiten weiter:
 *   - Admin und Inhaber auf die neue interne Vorschau der Objektübersicht,
 *     mit Wohnung, wenn die alte Adresse eine hatte.
 *   - Alle anderen, auch Kunden ohne Anmeldung und Vertriebspartner (bis zu
 *     Christians Freigabe), auf das öffentliche Online-Exposé.
 *
 * Aus der alten Adresse wird nur das Investment (`investmentId`) übernommen,
 * und nur für die interne Vorschau: Daraus kennt sie den Kunden und seinen
 * Partner. Name, Kennung und Kaufpreisrahmen (`kunde`, `kundeId`,
 * `minRahmen`, `maxRahmen`) fallen weg: Sie gehören nicht in eine Adresse,
 * und das öffentliche Exposé kennt sie ohnehin nicht.
 *
 * `KundenansichtWohnung.tsx` gibt dieselbe Komponente heraus.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function KundenansichtObjekt() {
  const { id = "", weId } = useParams<{ id: string; weId?: string }>();
  const [params] = useSearchParams();
  const nutzer = useOptionalUser();

  // Erst wenn die Anmeldung feststeht, ist die Rolle bekannt. Vorher zu
  // entscheiden, schickte Admin und Inhaber aufs öffentliche Exposé.
  if (nutzer?.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" data-testid="alte-kundenansicht-laedt">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const rolle = nutzer?.isLoggedIn ? nutzer.user.role : null;
  const investmentRoh = (params.get("investmentId") || "").trim();
  const ziel = kundenansichtZiel({
    rolle,
    objektId: id,
    wohnungId: weId || null,
    investmentId: UUID.test(investmentRoh) ? investmentRoh : null,
  });
  return <Navigate to={ziel} replace />;
}
