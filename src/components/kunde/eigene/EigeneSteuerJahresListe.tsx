import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, ExternalLink, FileText, Loader2, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { cockpitWerte, type ExternesInvestment } from "@/lib/eigeneInvestmentBerechnungen";
import { baueAnlageVAufstellung, type AnlageVAufstellung, type AnlageVInvestment } from "@/lib/anlageVExport";
import { erzeugeAnlageVPdf } from "@/lib/anlageVPdf";
import { AnlageVSendenDialog } from "@/components/kunde/AnlageVSendenDialog";
import { portalSprache } from "@/i18n/portalSprache";
import { euroText } from "@/lib/sprachFormat";

/**
 * Eigene Investments im Steuer-Reiter (Stufe 3 der Kundenportal-Sanierung):
 * Liste mit Kurz-Ergebnis des gewaehlten Steuerjahres, je Investment der
 * Anlage-V-PDF-Export und der Link ins Detail. Vorher stand hier nur ein Link.
 *
 * Gerechnet wird ausschliesslich ueber baueAnlageVAufstellung, also mit der
 * Logik aus eigeneInvestmentBerechnungen (keine zweite Steuerrechnung). Die im
 * Steuer-Cockpit des Investments gepflegten Angaben fliessen ein: Bodenwert-
 * Anteil und Verwaltungsanteil als derselbe Wert wie im Bearbeiten-Dialog
 * (cockpitWerte), die Sonder-AfA aus meta.steuerCockpit.
 */
export function EigeneSteuerJahresListe() {
  const { t } = useTranslation();
  const { authUser } = useUser();
  const [investments, setInvestments] = useState<AnlageVInvestment[]>([]);
  const [loading, setLoading] = useState(true);
  const [pdfLaeuftId, setPdfLaeuftId] = useState<string | null>(null);

  const fmt = (v: number) => euroText(v, portalSprache(), 0);

  useEffect(() => {
    if (!authUser) return;
    let abort = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("externe_investments")
        .select("*")
        .order("erstellt_am", { ascending: false });
      if (abort) return;
      // MOREImmo-Investments laufen ueber den eigenen Bereich, hier zaehlen
      // nur selbst gehaltene Objekte (gleiche Filterung wie im Investments-Tab).
      const eigene = ((data || []) as unknown as AnlageVInvestment[]).filter(
        (i) => (i.meta?.quelle || "extern") !== "moreimmo",
      );
      setInvestments(eigene);
      setLoading(false);
    })();
    return () => { abort = true; };
  }, [authUser]);

  // Steuerjahr: aktuelles Jahr zurueck bis zum aeltesten Kaufjahr,
  // begrenzt auf zehn Jahre.
  const aktuellesJahr = new Date().getFullYear();
  const jahresAuswahl = useMemo(() => {
    let fruehestes = aktuellesJahr;
    for (const inv of investments) {
      const d = inv.kaufdatum ? new Date(inv.kaufdatum) : null;
      if (d && !Number.isNaN(d.getTime())) fruehestes = Math.min(fruehestes, d.getFullYear());
    }
    fruehestes = Math.max(fruehestes, aktuellesJahr - 9);
    const liste: number[] = [];
    for (let j = aktuellesJahr; j >= fruehestes; j--) liste.push(j);
    return liste;
  }, [investments, aktuellesJahr]);
  const [steuerjahr, setSteuerjahr] = useState<number>(aktuellesJahr);

  const baueAufstellung = (inv: AnlageVInvestment): AnlageVAufstellung => {
    const sc = (inv.meta?.steuerCockpit || {}) as { sonderAfA7b?: boolean };
    const werte = cockpitWerte(inv as ExternesInvestment);
    return baueAnlageVAufstellung(inv, {
      jahr: steuerjahr,
      herkunft: "eigen",
      bodenwertAnteil: werte.bodenwertAnteil,
      hausgeldNichtUmlagefaehigProzent: werte.hausgeldNichtUmlageProzent,
      sonderAfA7b: !!sc.sonderAfA7b,
    });
  };

  const exportPdf = async (inv: AnlageVInvestment) => {
    setPdfLaeuftId(inv.id);
    try {
      await erzeugeAnlageVPdf(baueAufstellung(inv));
    } finally {
      setPdfLaeuftId(null);
    }
  };

  // Server-Versand mit echtem PDF-Anhang: Der Dialog erzeugt das PDF beim
  // Senden und schickt es ueber die Edge Function send-anlage-v.
  const [sendenAufstellung, setSendenAufstellung] = useState<AnlageVAufstellung | null>(null);
  const teilePerMail = (inv: AnlageVInvestment) => setSendenAufstellung(baueAufstellung(inv));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (investments.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Building2 className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground mb-4">
          {t("portal.steuer.eigene_empty", "Noch keine eigenen Investments erfasst. Leg deine selbst gehaltenen Immobilien im Investments-Bereich an.")}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to="/kunde/investments?tab=eigene">
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            {t("portal.steuer.eigene_verwalten", "Eigene Investments verwalten")}
          </Link>
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground" htmlFor="eigene-steuerjahr">
            {t("portal.steuer.eigene_jahr_label", "Steuerjahr")}
          </Label>
          <Select value={String(steuerjahr)} onValueChange={(v) => setSteuerjahr(Number(v))}>
            <SelectTrigger id="eigene-steuerjahr" className="h-8 w-[92px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {jahresAuswahl.map((j) => <SelectItem key={j} value={String(j)}>{j}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/kunde/investments?tab=eigene">
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            {t("portal.steuer.eigene_verwalten", "Eigene Investments verwalten")}
          </Link>
        </Button>
      </div>

      <div className="space-y-3">
        {investments.map((inv) => {
          const aufstellung = baueAufstellung(inv);
          const mieteFehlt = (inv as ExternesInvestment).mieteinnahmen_kalt == null
            || Number((inv as ExternesInvestment).mieteinnahmen_kalt) <= 0;
          const anzahlFehlt = aufstellung.fehlendeAngaben.length;
          return (
            <Card key={inv.id} className="p-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex-1 min-w-[180px]">
                  <p className="font-semibold text-sm truncate">{inv.bezeichnung}</p>
                  {(inv.ort || inv.adresse) && (
                    <p className="text-xs text-muted-foreground truncate">
                      {[inv.adresse, inv.ort].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>
                <div className="text-right min-w-[140px]">
                  {mieteFehlt ? (
                    <p className="text-xs text-muted-foreground">
                      {t("portal.steuer.eigene_unvollstaendig", "unvollständig, {{count}} Angaben fehlen", { count: anzahlFehlt })}
                    </p>
                  ) : (
                    <>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">
                        {aufstellung.ueberschussVerlust < 0
                          ? t("portal.steuer.eigene_verlust", "Verlust {{jahr}}", { jahr: steuerjahr })
                          : t("portal.steuer.eigene_ueberschuss", "Überschuss {{jahr}}", { jahr: steuerjahr })}
                      </p>
                      <p className={`font-bold text-sm tabular-nums ${aufstellung.ueberschussVerlust < 0 ? "text-destructive" : "text-[hsl(var(--success))]"}`}>
                        {fmt(aufstellung.ueberschussVerlust)}
                      </p>
                    </>
                  )}
                  {!mieteFehlt && anzahlFehlt > 0 && (
                    <Badge variant="outline" className="mt-1 font-normal text-muted-foreground">
                      {t("portal.steuer.eigene_unvollstaendig", "unvollständig, {{count}} Angaben fehlen", { count: anzahlFehlt })}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Button size="sm" variant="outline" className="gap-1.5"
                    disabled={pdfLaeuftId === inv.id}
                    onClick={() => exportPdf(inv)}>
                    <FileText className="h-3.5 w-3.5" />
                    {t("portal.steuer.eigene_pdf", "Anlage-V-Aufstellung (PDF)")}
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-1.5"
                    disabled={pdfLaeuftId === inv.id}
                    onClick={() => teilePerMail(inv)}>
                    <Mail className="h-3.5 w-3.5" />
                    {t("portal.steuer.eigene_mail", "Per E-Mail teilen")}
                  </Button>
                  <Button asChild size="sm" variant="ghost" className="gap-1.5">
                    <Link to={`/kunde/investments?tab=eigene&inv=${inv.id}`}>
                      <ExternalLink className="h-3.5 w-3.5" />
                      {t("portal.steuer.eigene_detail", "Details")}
                    </Link>
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        {t("portal.steuer.eigene_hinweis", "Die Aufstellung dient der Vorbereitung der Anlage V und ersetzt keine Steuerberatung. Fehlende Angaben sind im PDF ausdrücklich gekennzeichnet und lassen sich im jeweiligen Investment ergänzen.")}
      </p>

      <AnlageVSendenDialog
        aufstellung={sendenAufstellung}
        open={sendenAufstellung != null}
        onOpenChange={(o) => { if (!o) setSendenAufstellung(null); }}
      />
    </div>
  );
}
