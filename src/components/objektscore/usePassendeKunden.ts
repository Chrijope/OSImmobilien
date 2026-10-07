import { useMemo } from "react";
import { useUser } from "@/contexts/UserContext";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useVertretungen } from "@/hooks/useVertretungen";
import type { ObjektData } from "@/lib/objekteStore";
import { istGlobalobjekt } from "@/lib/objektKlassen";
import { nurEigeneKunden, passendeKundenFuerObjekt, siehtPassendeKunden, type PassendeKunden } from "@/lib/objektScoreDaten";

/**
 * Die passenden Kunden eines Objekts für die aktive Rolle (Objektscore,
 * 04.10.2026). Eine Stelle für Objektseite, Einheitenseite und die alte
 * Verwaltungs- und Wohnungsansicht, die der Vertriebspartner sieht.
 *
 * Admin, Inhaber und Vertriebsleitung bekommen alle Kunden, die sie sehen;
 * der Vertriebspartner nur die eigenen, zuständig über die Kennung oder als
 * heutige Vertretung. Ohne Recht, beim Globalobjekt oder mit `aktiv = false`
 * kommt nichts zurück. Neu gerechnet wird nur, wenn sich Objekt, Investments
 * oder Kontakte ändern.
 */
export function usePassendeKunden(objekt: ObjektData | null | undefined, aktiv = true): PassendeKunden | undefined {
  const { user, authUser } = useUser();
  const version = useLiveVersion(["investments", "kontakte"]);
  const nurEigene = nurEigeneKunden(user.role);
  const benutzerId = authUser?.id;
  const vertretungFuer = useVertretungen(nurEigene ? benutzerId : null);
  const darf = aktiv && !!objekt && siehtPassendeKunden(user.role) && !istGlobalobjekt(objekt);
  return useMemo(
    () => (darf && objekt ? passendeKundenFuerObjekt(objekt, { benutzerId, nurEigene, vertretungFuer }) : undefined),
    // `version` zählt mit: Neue Selbstauskünfte und Stufenwechsel sollen ankommen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [darf, objekt, benutzerId, nurEigene, vertretungFuer, version],
  );
}
