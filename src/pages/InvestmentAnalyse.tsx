import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useCacheReady } from "@/hooks/useCacheReady";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { InvestmentRechner } from "@/components/objekte/InvestmentRechner";
import { getObjekte, getAktuelleMiete } from "@/lib/objekteStore";
import { useUser } from "@/contexts/UserContext";
import { kundenSprache } from "@/lib/kundenSprache";

export default function InvestmentAnalyse() {
  const { id, weId } = useParams<{ id: string; weId?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromKundenansicht = searchParams.get("fromKundenansicht");
  const { user } = useUser();

  // Objekte kommen in der zweiten Ladewelle; bis dahin nicht "nicht gefunden" melden.
  const objekteBereit = useCacheReady(["objekte", "wohnungen"]);
  const objekte = getObjekte();
  const objekt = objekte.find(o => o.id === id);

  if (!objekt && !objekteBereit) {
    return (
      <DashboardLayout>
        <div className="p-8 text-center text-muted-foreground">Objekt wird geladen …</div>
      </DashboardLayout>
    );
  }

  if (!objekt) {
    return (
      <DashboardLayout>
        <div className="p-8 text-center text-muted-foreground">Objekt nicht gefunden.</div>
      </DashboardLayout>
    );
  }

  const canEdit = ["admin", "inhaber", "objektpartner"].includes(user.role);
  const wohnung = weId ? objekt.wohnungen.find(w => w.id === weId) : null;
  const isWohnungModus = !!wohnung;

  const totalVk = objekt.wohnungen.reduce((s, w) => s + w.vkGesamt, 0);
  const tausendstel = isWohnungModus && totalVk > 0
    ? Math.round((wohnung!.vkGesamt / totalVk) * 1000)
    : undefined;

  const subtitle = isWohnungModus
    ? `WE ${wohnung!.weNr} – ${objekt.titel}`
    : objekt.titel;

  const kundeId = searchParams.get("kundeId");
  const kundeName = searchParams.get("kunde");
  const investmentIdParam = searchParams.get("investmentId");
  
  const backUrl = fromKundenansicht
    ? (isWohnungModus
        ? `/objekte/${id}/wohnung/${weId}?kundeId=${kundeId || ""}&kundeName=${encodeURIComponent(kundeName || "")}&investmentId=${investmentIdParam || ""}&fromKundenansicht=${id}`
        : `/kundenansicht/objekt/${id}?kunde=${encodeURIComponent(kundeName || "")}&kundeId=${kundeId || ""}&investmentId=${investmentIdParam || ""}`)
    : isWohnungModus ? `/objekte/${id}/wohnung/${weId}` : `/objekte/${id}`;
  // Ohne Pfeil im Text: Der Knopf trägt das Pfeilsymbol schon.
  const backLabel = fromKundenansicht
    ? (isWohnungModus ? "Zurück zur Wohnung" : "Zurück zur Kundenansicht")
    : isWohnungModus ? "Zurück zur Wohnung" : "Zurück zum Objekt";

  return (
    <DashboardLayout>
      <div className="space-y-6 w-full">
        {/*
          Der Rückweg steht oben links, über der Überschrift.

          Christian am 22.09.2026: Rechts in der Knopfgruppe wird er schlecht
          gefunden. Der Rückweg liegt im ganzen System an derselben Stelle,
          Vorbild ist die `ZurueckLeiste` in `EinheitSeite`. Hier stand er
          doppelt: links als Pfeil ohne Beschriftung und rechts noch einmal
          mit Text, beide zum selben Ziel. Geblieben ist der linke, jetzt mit
          Beschriftung.
        */}
        <div>
          <div className="-ml-2 mb-1">
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => navigate(backUrl)}>
              <ArrowLeft className="h-4 w-4" /> {backLabel}
            </Button>
          </div>
          <PageHeader
            title="Investment-Analyse"
            subtitle={subtitle}
          />
        </div>

        <InvestmentRechner
          modus={isWohnungModus ? "wohnung" : "objekt"}
          kaufpreis={isWohnungModus ? wohnung!.vkGesamt : totalVk}
          mieteMonat={isWohnungModus ? getAktuelleMiete(wohnung!) : objekt.wohnungen.reduce((s, w) => s + getAktuelleMiete(w), 0)}
          objektTitel={objekt.titel}
          weNr={isWohnungModus ? wohnung!.weNr : undefined}
          editable={canEdit}
          sanierungskosten={objekt.sanierungskosten || 0}
          tausendstel={tausendstel}
          groesse={isWohnungModus ? wohnung!.groesse : objekt.wohnungen.reduce((s, w) => s + w.groesse, 0)}
          userRole={user.role}
          analyseKey={isWohnungModus ? `${id}-${weId}` : id}
          initialAfaModell={objekt.afaDaten?.afaModell}
          initialAfaSatz={objekt.afaDaten?.afaSatz}
          initialRestnutzungsdauer={objekt.afaDaten?.restnutzungsdauer}
          initialGrundAnteilPct={objekt.afaDaten?.grundstueckAnteil}
          initialBodenrichtwert={objekt.afaDaten?.bodenrichtwert}
          initialGrundstuecksflaeche={objekt.afaDaten?.grundstuecksflaeche || objekt.globalDaten?.grundstueckQm}
          initialBaujahr={objekt.globalDaten?.baujahr}
          initialKaufnebenkosten={objekt.globalDaten?.kaufnebenkosten}
          pdfSprache={kundenSprache(kundeId)}
          neueMiete={isWohnungModus && wohnung?.neueMiete ? wohnung.neueMiete : undefined}
          mieterhoehungAb={isWohnungModus && wohnung?.mieterhoehungAb ? wohnung.mieterhoehungAb : undefined}
        />
      </div>
    </DashboardLayout>
  );
}
