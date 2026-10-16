import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  SetterErstgespraechsSkript,
  type SetterErstgespraechsSkriptHandle,
} from "@/components/setter/SetterErstgespraechsSkript";
import type { KundeData } from "@/lib/kundenStore";
import { VORSCHAU_ERSTGESPRAECH_SCHLUESSEL } from "./VorschauBeratungspraesentation";

/*
 * Lokale Vorschau des neuen Erstgesprächsskripts (Entwurf 15.10.2026).
 * Nur im Entwicklungsmodus (siehe vorschauRouten.ts), ohne Anmeldung.
 *
 * Gespeichert wird nichts: Die Investment-ID gibt es im Zwischenspeicher
 * nicht, also schreibt das Skript ins Leere, und die Kontakt-Felder (Netto,
 * Eigenkapital, Beruf, Ziele) treffen keinen Kontakt. Der Knopf oben reicht
 * den Stand an die Vorschau der Beratungspräsentation weiter.
 */

const BEISPIEL_KUNDE = {
  id: "vorschau-kunde",
  vorname: "Anna",
  nachname: "Muster",
  anrede: "Frau",
  quelle: "Website",
  leadTyp: "website",
  qualEinkommen: "3.980",
  qualEigenkapital: "20.000",
  meta: {},
} as unknown as KundeData;

export default function VorschauErstgespraech() {
  const ref = useRef<SetterErstgespraechsSkriptHandle>(null);
  const navigate = useNavigate();
  const [modus, setModus] = useState<"setter" | "vertriebspartner">("setter");
  const [hinweis, setHinweis] = useState("");

  const zurPraesentation = () => {
    const stand = ref.current?.stand();
    if (!stand) return;
    try {
      sessionStorage.setItem(
        VORSCHAU_ERSTGESPRAECH_SCHLUESSEL,
        JSON.stringify({
          kundenName: `${BEISPIEL_KUNDE.vorname} ${BEISPIEL_KUNDE.nachname}`,
          kontakt: {
            anrede: BEISPIEL_KUNDE.anrede,
            vorname: BEISPIEL_KUNDE.vorname,
            nachname: BEISPIEL_KUNDE.nachname,
            qualEinkommen: (BEISPIEL_KUNDE as any).qualEinkommen,
            qualEigenkapital: (BEISPIEL_KUNDE as any).qualEigenkapital,
          },
          skript: stand,
        }),
      );
      // Frühere Eingaben dieser Vorschau verwerfen, sonst gewinnen sie gegen die Übernahme.
      localStorage.removeItem("beratung-antworten-vorschau-erstgespraech");
    } catch {
      setHinweis("Der Browser erlaubt hier keinen Zwischenspeicher. Die Präsentation zeigt dann das Beispiel.");
    }
    navigate("/vorschau/beratungspraesentation?beispiel=erstgespraech");
  };

  return (
    <div className="min-h-screen bg-background p-3 sm:p-6" data-lg="seite">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="rounded-lg border-2 border-dashed border-[#e5007d] bg-[#e5007d]/5 p-3 text-sm" data-testid="vorschau-banner">
          <strong>Lokale Vorschau, nur auf diesem Rechner.</strong> So stünde das neue Skript im Kundenprofil unter
          „Erstgespräch“. Beispielkundin Anna Muster, kein echter Kunde. Es wird nichts gespeichert; Netto und
          Eigenkapital bleiben hier beim Beispielwert.
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={zurPraesentation}>In der Präsentation ansehen</Button>
            <Button size="sm" variant="outline" onClick={() => setModus((m) => (m === "setter" ? "vertriebspartner" : "setter"))}>
              Modus: {modus === "setter" ? "Setter" : "Vertriebspartner"} (umschalten)
            </Button>
          </div>
          {hinweis && <p className="mt-2 text-xs">{hinweis}</p>}
        </div>

        <SetterErstgespraechsSkript
          key={modus}
          ref={ref}
          kunde={BEISPIEL_KUNDE}
          onUpdate={() => {}}
          onFollowUp={() => setHinweis("Im CRM öffnet sich hier der Dialog für den Rückruf mit Datum und Uhrzeit.")}
          mode={modus}
          investmentId="vorschau-erstgespraech"
          terminSlot={
            <Card className="p-4 text-sm text-muted-foreground border-dashed">
              Hier sitzt im CRM die Terminkarte („Beratungsgespräch vereinbaren“, nach der Freigabe „Beratungspräsentation
              vereinbaren“) mit Berater, Datum und Uhrzeit.
            </Card>
          }
          abschlussSlot={
            <Card className="p-4 text-sm text-muted-foreground border-dashed">
              Hier sitzt im CRM die Abschlusskarte mit dem Knopf „Erstgespräch gebucht“, der die KI-Zusammenfassung
              erzeugt und die Stufe setzt.
            </Card>
          }
        />
      </div>
    </div>
  );
}
