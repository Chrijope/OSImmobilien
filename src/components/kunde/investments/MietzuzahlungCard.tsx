import { Link, useNavigate } from "react-router-dom";
import { Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getInvestmentMetaField, setInvestmentMetaFields } from "@/lib/investmentsStore";
import { confirmDialog } from "@/lib/confirm";
import { datumDe, ENTWURF_SCHLUESSEL, entwurfErgaenzen, euro, neuesSchreiben, rechne, type MietzuzahlungDaten } from "@/lib/mietzuzahlung";
import { systemWerte } from "@/pages/Mietzuzahlung";

/**
 * Vereinbarung über eine Mietzuzahlung in der Karte „After Sales“ (30.10.2026).
 * Erst der Knopf „Mietzuzahlungsschreiben erstellen“ legt das Schreiben an:
 * alles aus dem System, Ort Mittenwalde, Erstellungsdatum. Danach öffnet die
 * Seite mit Formular und PDF-Vorschau, dort bleibt alles änderbar.
 */
export function MietzuzahlungCard({ kontaktId, investmentId }: { kontaktId: string; investmentId: string }) {
  const entwurf = getInvestmentMetaField<Partial<MietzuzahlungDaten> | null>(investmentId, ENTWURF_SCHLUESSEL, null);
  const daten = entwurfErgaenzen(entwurf, systemWerte(kontaktId, investmentId));
  const r = rechne(daten);
  const ohneZiel = !daten.zielQm.trim();
  const navigate = useNavigate();
  const seite = `/kunden/${kontaktId}/mietzuzahlung/${investmentId}`;
  const erstellen = async () => {
    if (entwurf) {
      const ok = await confirmDialog({
        title: "Schreiben neu erstellen?",
        description: "Alle Werte kommen neu aus dem System, das Datum wird heute. Deine Änderungen am bisherigen Schreiben gehen dabei verloren.",
        confirmText: "Neu erstellen",
        cancelText: "Abbrechen",
      });
      if (!ok) return;
    }
    setInvestmentMetaFields(investmentId, { [ENTWURF_SCHLUESSEL]: neuesSchreiben(systemWerte(kontaktId, investmentId)) });
    navigate(seite);
  };
  return (
    <Card className="space-y-3 p-4" data-testid="mietzuzahlung-karte">
      <div className="flex items-center gap-2">
        <Coins className="h-5 w-5 text-primary" />
        <h3 className="text-sm font-semibold">Vereinbarung über eine Mietzuzahlung</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        {entwurf
          ? `Erstellt am ${datumDe(daten.datum2) || "…"}, Mietzuzahlung ${euro(r.gesamt)} €.`
          : ohneZiel
            ? "Am Objekt ist keine Zielmiete hinterlegt (Objekt anlegen, Objektdaten, Mietsubvention). Du kannst sie im Schreiben trotzdem eintragen."
            : `Aus dem System ergibt sich eine Mietzuzahlung von ${euro(r.gesamt)} €.`}
      </p>
      <div className="flex flex-wrap gap-2">
        {entwurf && (
          <Button asChild size="sm">
            <Link to={seite}>Schreiben öffnen</Link>
          </Button>
        )}
        <Button size="sm" variant={entwurf ? "outline" : "default"} onClick={() => void erstellen()} data-testid="mietzuzahlung-erstellen">
          {entwurf ? "Neu erstellen" : "Mietzuzahlungsschreiben erstellen"}
        </Button>
      </div>
    </Card>
  );
}
