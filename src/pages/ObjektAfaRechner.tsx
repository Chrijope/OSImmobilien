import { useParams, useNavigate } from "react-router-dom";
import { useCacheReady } from "@/hooks/useCacheReady";
import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { AfaRechnerEmbed, type AfaRechnerDraft, type AfaErgebnis } from "@/components/objekte/AfaRechnerEmbed";
import { getObjektById, updateObjektField } from "@/lib/objekteStore";
import { useToast } from "@/hooks/use-toast";

export default function ObjektAfaRechner() {
  const { id, weId } = useParams<{ id: string; weId?: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [afaDraftLocal, setAfaDraftLocal] = useState<AfaRechnerDraft | null>(null);
  const [afaErgebnisLocal, setAfaErgebnisLocal] = useState<AfaErgebnis | null>(null);
  const [saving, setSaving] = useState(false);

  // Objekte kommen in der zweiten Ladewelle. Bei einem Direktlink sind sie
  // noch nicht da; dann laden statt faelschlich "nicht gefunden" zu melden.
  const objekteBereit = useCacheReady(["objekte", "wohnungen"]);
  const objekt = getObjektById(id || "");
  if (!objekt) {
    return (
      <DashboardLayout>
        <div className="p-8 text-center text-muted-foreground">
          {objekteBereit ? "Objekt nicht gefunden." : "Objekt wird geladen …"}
        </div>
      </DashboardLayout>
    );
  }

  const wohnung = weId ? objekt.wohnungen.find(w => w.id === weId) : null;
  const isWohnungModus = !!wohnung;
  const subtitle = isWohnungModus ? `WE ${wohnung!.weNr} – ${objekt.titel}` : objekt.titel;
  const backUrl = isWohnungModus ? `/objekte/${id}/wohnung/${weId}` : `/objekte/${id}`;

  const handleSaveAndBack = async () => {
    if (!id) { navigate(backUrl); return; }
    setSaving(true);
    try {
      const nextAfaDaten = {
        ...(objekt.afaDaten || { afaModell: "linear", afaSatz: 2, restnutzungsdauer: 50, grundstueckAnteil: 20 }),
        afaSatz: afaErgebnisLocal?.afaSatz ?? objekt.afaDaten?.afaSatz ?? 2,
        restnutzungsdauer: afaErgebnisLocal?.rnd ?? objekt.afaDaten?.restnutzungsdauer ?? 50,
        grundstueckAnteil: afaErgebnisLocal?.bodenPct ?? objekt.afaDaten?.grundstueckAnteil ?? 20,
      };
      const nextMeta = { ...(objekt.meta || {}), afaDraft: afaDraftLocal };
      const nextSanierung = afaDraftLocal?.sanierungskosten ?? objekt.sanierungskosten ?? 0;
      await updateObjektField(id, { afaDaten: nextAfaDaten, meta: nextMeta, sanierungskosten: nextSanierung } as any);
      toast({ title: "AfA-Daten gespeichert ✓" });
    } finally {
      setSaving(false);
      navigate(backUrl);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 w-full">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Zurück" onClick={() => navigate(backUrl)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <PageHeader title="AfA-Rechner" subtitle={subtitle} />
          <div className="ml-auto">
            <Button variant="outline" size="sm" onClick={() => navigate(backUrl)}>
              Verwerfen
            </Button>
          </div>
        </div>

        <AfaRechnerEmbed
          computedAdresse={objekt.adresse}
          computedPlz={objekt.plz}
          computedOrt={objekt.ort}
          computedKaufpreis={objekt.globalDaten?.verkaufspreis || objekt.wohnungen.reduce((s, w) => s + (w.vkGesamt || 0), 0)}
          computedWohnflaeche={objekt.globalDaten?.gesamtQm || objekt.wohnungen.reduce((s, w) => s + (w.groesse || 0), 0)}
          computedBaujahr={objekt.globalDaten?.baujahr || undefined}
          initialSanierungskosten={objekt.sanierungskosten || 0}
          draft={(objekt.meta as any)?.afaDraft || null}
          onSanierungskostenChange={() => {}}
          onResultChange={setAfaErgebnisLocal}
          onDraftChange={setAfaDraftLocal}
        />

        <div className="flex justify-end pt-4 border-t">
          <Button size="lg" onClick={handleSaveAndBack} disabled={saving}>
            {saving ? "Speichern…" : "Speichern & Zurück"}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}