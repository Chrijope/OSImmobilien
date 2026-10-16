import BeraterMicrositeContent from "@/components/landing/BeraterMicrositeContent";
import FloatingBeraterBadge, { type BeraterInfo } from "@/components/landing/FloatingBeraterBadge";
import { SeitenSpracheProvider } from "@/components/SeitenSprache";

/*
 * Lokale Vorschau der Partner-Landingpage (16.10.2026): /vorschau/mikroseite.
 * Nur im Entwicklungsmodus (siehe vorschauRouten.ts), ohne Anmeldung und
 * ohne Datenbank, mit einem erfundenen Beispielpartner. `?lang=en` zeigt
 * die englische Fassung. Das Anfrageformular ist hier bewusst nicht
 * eingebunden, damit aus der Vorschau kein Lead in der echten Datenbank landet.
 */
const BEISPIEL_PARTNER: BeraterInfo = {
  name: "Alex Beispiel",
  position: "Immobilienberater",
  telefon: "+49 30 1234567",
  email: "alex.beispiel@example.com",
  bild: null,
  buchungslink: "https://example.com/termin",
};

export default function VorschauMikroseite() {
  const anfrage = () => window.alert("Vorschau: Hier öffnet sich auf der echten Seite das Anfrageformular.");
  return (
    <SeitenSpracheProvider>
      <div className="lp-theme">
        <BeraterMicrositeContent berater={BEISPIEL_PARTNER} onOpenFunnel={anfrage} />
        <FloatingBeraterBadge berater={BEISPIEL_PARTNER} onContactClick={anfrage} />
      </div>
    </SeitenSpracheProvider>
  );
}
