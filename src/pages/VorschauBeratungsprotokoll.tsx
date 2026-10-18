import { useEffect, useState } from "react";
import { UserContext, useUser } from "@/contexts/UserContext";
import { BEISPIEL_INVESTMENT_ID, BEISPIEL_KONTAKT_ID } from "@/lib/beispielkunde";
import { BeratungsprotokollInhalt } from "./Beratungsprotokoll";
import { beispielEinspielen, schreibenSperren } from "./VorschauKundeKomplett";

/*
 * Lokale Vorschau des Beratungs- und Qualitätsprotokolls (17.10.2026):
 * /vorschau/beratungsprotokoll. Nur im Entwicklungsmodus (vorschauRouten.ts).
 * Die echte Seite mit dem Beispielkunden Max Mustermann; Speichern und
 * Versand sind ausgeschaltet, die Schreibwege des Clients gesperrt.
 */
export default function VorschauBeratungsprotokoll() {
  const echt = useUser();
  const nutzerId = echt.authUser?.id || "beispiel-vorschau-admin";
  const [bereit, setBereit] = useState(false);

  useEffect(() => {
    const aufheben = schreibenSperren();
    beispielEinspielen(nutzerId);
    setBereit(true);
    return aufheben;
  }, [nutzerId]);

  if (!bereit) return null;
  const wert = echt.authUser
    ? echt
    : { ...echt, isLoggedIn: true, loading: false, user: { ...echt.user, name: "Beispiel Partner", role: "admin" as const } };

  return (
    <UserContext.Provider value={wert}>
      <div className="min-h-screen bg-background" data-lg="seite">
        <div className="bg-amber-100 text-amber-900 text-xs px-4 py-2 text-center">
          Lokale Vorschau mit erfundenen Daten. Max Mustermann ist kein echter Kunde, nichts wird gespeichert.
        </div>
        <BeratungsprotokollInhalt kontaktId={BEISPIEL_KONTAKT_ID} investmentId={BEISPIEL_INVESTMENT_ID} vorschau />
      </div>
    </UserContext.Provider>
  );
}
