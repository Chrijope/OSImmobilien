import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Clock, Coins, Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
 * Von dort geht es zur Unterschrift an den Kunden; `meta.mietzuzahlung`
 * (nur der Server schreibt es) hält Versand und das unterschriebene PDF.
 */
interface MietzuzahlungStatus { status?: "gesendet" | "unterschrieben"; gesendetAm?: string; gesendetAn?: string; versandOk?: boolean; unterschriebenAm?: string; pdfPath?: string }

export function MietzuzahlungCard({ kontaktId, investmentId }: { kontaktId: string; investmentId: string }) {
  const entwurf = getInvestmentMetaField<Partial<MietzuzahlungDaten> | null>(investmentId, ENTWURF_SCHLUESSEL, null);
  const daten = entwurfErgaenzen(entwurf, systemWerte(kontaktId, investmentId));
  const r = rechne(daten);
  const ohneZiel = !daten.zielQm.trim();
  const navigate = useNavigate();
  const seite = `/kunden/${kontaktId}/mietzuzahlung/${investmentId}`;
  const stand = getInvestmentMetaField<MietzuzahlungStatus | null>(investmentId, "mietzuzahlung", null);
  const unterschrieben = stand?.status === "unterschrieben";
  const pdfOeffnen = async () => {
    if (!stand?.pdfPath) return;
    const { data, error } = await supabase.storage.from("unterlagen").createSignedUrl(stand.pdfPath, 60 * 10);
    if (error || !data?.signedUrl) { toast.error("PDF konnte nicht geöffnet werden."); return; }
    window.open(data.signedUrl, "_blank");
  };
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
        {unterschrieben && <span className="ml-auto inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Unterschrieben</span>}
        {stand?.status === "gesendet" && <span className="ml-auto inline-flex items-center gap-1 text-xs text-amber-600"><Clock className="h-3.5 w-3.5" /> Wartet auf Kunde</span>}
      </div>
      {unterschrieben && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Vom Kunden unterzeichnet am {stand?.unterschriebenAm ? new Date(stand.unterschriebenAm).toLocaleString("de-DE") : "—"}. Liegt auch unter Dokumente im Kundenordner („Mietzuzahlung“).</p>
          {stand?.pdfPath && (
            <div className="flex items-center gap-2 rounded-lg bg-muted/40 p-2">
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              <span className="flex-1 truncate text-xs">Vereinbarung über eine Mietzuzahlung (unterzeichnet)</span>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void pdfOeffnen()}><Download className="mr-1 h-3 w-3" /> PDF</Button>
            </div>
          )}
        </div>
      )}
      {stand?.status === "gesendet" && (
        <p className="text-xs text-muted-foreground">
          {stand.versandOk === false ? "Die Mail kam nicht an. " : `Am ${stand.gesendetAm ? new Date(stand.gesendetAm).toLocaleString("de-DE") : "—"} an ${stand.gesendetAn || "den Kunden"} gesendet. `}
          Erneut senden geht im Schreiben.
        </p>
      )}
      {!unterschrieben && (<>
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
      </>)}
    </Card>
  );
}
