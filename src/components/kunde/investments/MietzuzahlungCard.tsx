import { Link } from "react-router-dom";
import { Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getInvestmentMetaField } from "@/lib/investmentsStore";
import { ENTWURF_SCHLUESSEL, entwurfErgaenzen, euro, rechne, type MietzuzahlungDaten } from "@/lib/mietzuzahlung";
import { systemWerte } from "@/pages/Mietzuzahlung";

/**
 * Vereinbarung über eine Mietzuzahlung in der Karte „After Sales“ (30.10.2026).
 * Zeigt den Betrag aus Entwurf oder Systemwerten und führt auf die eigene
 * Seite mit Formular und PDF-Vorschau.
 */
export function MietzuzahlungCard({ kontaktId, investmentId }: { kontaktId: string; investmentId: string }) {
  const entwurf = getInvestmentMetaField<Partial<MietzuzahlungDaten> | null>(investmentId, ENTWURF_SCHLUESSEL, null);
  const daten = entwurfErgaenzen(entwurf, systemWerte(kontaktId, investmentId));
  const r = rechne(daten);
  const ohneZiel = !daten.zielQm.trim();
  return (
    <Card className="space-y-3 p-4" data-testid="mietzuzahlung-karte">
      <div className="flex items-center gap-2">
        <Coins className="h-5 w-5 text-primary" />
        <h3 className="text-sm font-semibold">Vereinbarung über eine Mietzuzahlung</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        {ohneZiel
          ? "Am Objekt ist keine Zielmiete hinterlegt (Objekt anlegen, Objektdaten, Mietsubvention). Du kannst sie auf der Seite trotzdem eintragen."
          : `Mietzuzahlung ${euro(r.gesamt)} €${entwurf ? ", Entwurf gespeichert" : ", aus dem System vorbelegt"}.`}
      </p>
      <Button asChild size="sm" variant="outline">
        <Link to={`/kunden/${kontaktId}/mietzuzahlung/${investmentId}`}>Öffnen und prüfen</Link>
      </Button>
    </Card>
  );
}
