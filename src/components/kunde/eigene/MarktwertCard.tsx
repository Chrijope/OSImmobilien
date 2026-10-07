import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { einlage } from "@/components/kunde/portal/einlage";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip as ReTooltip, CartesianGrid } from "recharts";
import { Sparkles, Loader2, TrendingUp, Info, ExternalLink } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { aktuelleRestschuld, type ExternesInvestment } from "@/lib/eigeneInvestmentBerechnungen";
import { useTranslation } from "react-i18next";
import { portalLocale, portalSprache } from "@/i18n/portalSprache";
import { datumText, euroText, prozentText, zahlText } from "@/lib/sprachFormat";

export interface MarktwertEintrag {
  datum: string;
  wert: number;
  quelle: "manuell" | "ki" | "gutachten";
  begruendung?: string;
  konfidenz?: "niedrig" | "mittel" | "hoch";
  qmPreisMin?: number | null;
  qmPreisMax?: number | null;
  vergleichsmieteQm?: number | null;
  quellen?: { name: string; hinweis?: string; url?: string }[];
  hinweis?: string;
  stand?: string;
  methodik?: string;
}

export function MarktwertCard({ inv, onPersist }: {
  inv: ExternesInvestment & { adresse?: string | null; plz?: string | null; ort?: string | null; wohnflaeche?: number | null; objekttyp?: string | null };
  onPersist: (patch: any) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const sprache = portalSprache();
  const locale = portalLocale();
  const fmt = (v: number) => euroText(v, sprache, 0);
  // Die KI-Bewertung speichert die Konfidenz als deutschen Wert, übersetzt wird nur die Anzeige.
  const konfidenzText = (k?: string) =>
    k === "niedrig"
      ? t("portal.cards.marktwert.konfidenz_niedrig")
      : k === "hoch"
        ? t("portal.cards.marktwert.konfidenz_hoch")
        : t("portal.cards.marktwert.konfidenz_mittel");
  const historie: MarktwertEintrag[] = (inv.meta?.marktwertHistorie || []) as any;
  const [wert, setWert] = useState("");
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10));
  const [aiLoading, setAiLoading] = useState(false);

  const aktuell = historie[historie.length - 1];
  const wertVeraenderung = aktuell ? aktuell.wert - inv.kaufpreis : 0;
  const wertVeraenderungP = inv.kaufpreis > 0 && aktuell ? (wertVeraenderung / inv.kaufpreis) * 100 : 0;
  const restschuld = aktuelleRestschuld(inv) ?? 0;
  const eigenkapital = (aktuell?.wert || inv.kaufpreis) - restschuld;

  const addEintrag = async (eintrag: MarktwertEintrag) => {
    const next = [...historie, eintrag].sort((a, b) => a.datum.localeCompare(b.datum));
    await onPersist({ marktwertHistorie: next });
    toast.success(t("portal.cards.marktwert.toast_saved"));
  };

  const handleManual = async () => {
    const w = parseFloat(wert);
    if (!w || w <= 0) { toast.error(t("portal.cards.marktwert.toast_invalid")); return; }
    await addEintrag({ datum, wert: w, quelle: "manuell" });
    setWert("");
  };

  const handleAI = async () => {
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("estimate-marktwert", {
        body: {
          kaufpreis: inv.kaufpreis,
          kaufdatum: inv.kaufdatum,
          baujahr: inv.baujahr,
          wohnflaeche: inv.wohnflaeche,
          objekttyp: inv.objekttyp,
          plz: inv.plz, ort: inv.ort, adresse: inv.adresse,
        },
      });
      if (error) throw error;
      const wert = Number(data?.wert);
      if (!wert) throw new Error(t("portal.cards.marktwert.toast_no_estimate"));
      await addEintrag({
        datum: new Date().toISOString().slice(0, 10),
        wert,
        quelle: "ki",
        begruendung: data?.begruendung,
        konfidenz: data?.konfidenz,
        qmPreisMin: data?.qmPreisMin ?? null,
        qmPreisMax: data?.qmPreisMax ?? null,
        vergleichsmieteQm: data?.vergleichsmieteQm ?? null,
        quellen: Array.isArray(data?.quellen) ? data.quellen : [],
        hinweis: data?.hinweis,
        stand: data?.stand,
        methodik: data?.methodik,
      });
    } catch (e: any) {
      toast.error(e?.message || t("portal.cards.marktwert.toast_ai_error"));
    } finally {
      setAiLoading(false);
    }
  };

  // Chart-Daten: Kauf → … → Heute (letzter Eintrag bekommt Label "Heute")
  const data = historie.map((h, i) => ({
    datum: i === historie.length - 1 ? t("portal.cards.marktwert.today") : h.datum.slice(0, 7),
    [t("portal.cards.marktwert.value_series")]: h.wert,
  }));
  if (historie.length > 0) {
    data.unshift({
      datum: inv.kaufdatum ? new Date(inv.kaufdatum).toLocaleDateString(locale, { month: "2-digit", year: "numeric" }) : t("portal.cards.marktwert.purchase"),
      [t("portal.cards.marktwert.value_series")]: inv.kaufpreis,
    });
  }

  const qmPreisHeute = inv.wohnflaeche && aktuell?.wert ? aktuell.wert / inv.wohnflaeche : null;
  const qmPreisKauf = inv.wohnflaeche && inv.kaufpreis ? inv.kaufpreis / inv.wohnflaeche : null;

  return (
    <Card className="p-5">
      <h3 className="font-semibold mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" />{t("portal.cards.marktwert.title")}</h3>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div {...einlage("p-3")}>
          <div className="text-xs text-muted-foreground">{t("portal.cards.marktwert.purchase_price")}</div>
          <div className="font-bold tabular-nums">{fmt(inv.kaufpreis)}</div>
          {qmPreisKauf && <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">{fmt(Math.round(qmPreisKauf))}/m²</div>}
        </div>
        <div className="p-3 rounded-xl border border-primary/20 bg-primary/5">
          <div className="text-xs text-muted-foreground">{t("portal.cards.marktwert.current_value")}</div>
          <div className="font-bold tabular-nums">{aktuell ? fmt(aktuell.wert) : "—"}</div>
          {qmPreisHeute && <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">{fmt(Math.round(qmPreisHeute))}/m²</div>}
        </div>
        <div {...einlage("p-3")}>
          <div className="text-xs text-muted-foreground">{t("portal.cards.marktwert.change")}</div>
          <div className={`font-bold tabular-nums ${wertVeraenderung >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--warning))]"}`}>
            {aktuell ? `${wertVeraenderung >= 0 ? "+" : ""}${fmt(wertVeraenderung)} (${prozentText(wertVeraenderungP, sprache, 1)})` : "—"}
          </div>
        </div>
        <div className="p-3 rounded-xl border border-[hsl(var(--success))]/20 bg-[hsl(var(--success))]/10">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            {t("portal.cards.marktwert.equity")}
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" aria-label={t("portal.cards.marktwert.equity_help_aria")} className="text-muted-foreground/70 hover:text-foreground">
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs leading-relaxed">
                  {t("portal.cards.marktwert.equity_help")}<br />
                  <span className="opacity-80">{fmt(aktuell?.wert || inv.kaufpreis)} − {fmt(restschuld)} = {fmt(eigenkapital)}</span>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="font-bold tabular-nums text-[hsl(var(--success))]">{fmt(eigenkapital)}</div>
        </div>
      </div>

      {data.length > 1 && (
        <div style={{ width: "100%", height: 180 }} className="mb-4">
          <ResponsiveContainer>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
              <XAxis dataKey="datum" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <ReTooltip formatter={(v: any) => fmt(Number(v))} />
            <Line type="monotone" dataKey={t("portal.cards.marktwert.value_series")} stroke="hsl(var(--primary))" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid sm:grid-cols-[1fr_140px_auto_auto] gap-2 items-end p-3 rounded-md bg-muted/30 border border-border/40">
        <div className="space-y-1"><Label className="text-xs">{t("portal.cards.marktwert.value_label")}</Label><Input type="number" value={wert} onChange={e => setWert(e.target.value)} className="h-8" placeholder={t("portal.cards.marktwert.value_placeholder")} /></div>
        <div className="space-y-1"><Label className="text-xs">{t("portal.cards.marktwert.date_label")}</Label><Input type="date" value={datum} onChange={e => setDatum(e.target.value)} className="h-8" /></div>
        <Button size="sm" onClick={handleManual}>{t("portal.cards.marktwert.add")}</Button>
        <Button size="sm" variant="outline" onClick={handleAI} disabled={aiLoading} className="gap-1.5">
          {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}{t("portal.cards.marktwert.ai_estimate")}
        </Button>
      </div>

      {aktuell?.quelle === "ki" && aktuell.begruendung && (
        <div className="mt-3 p-3 rounded-md bg-primary/5 text-xs text-muted-foreground space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">{t("portal.cards.marktwert.valuation")}</span>
            <Badge variant="outline" className="font-normal">{t("portal.cards.marktwert.confidence", { level: konfidenzText(aktuell.konfidenz) })}</Badge>
            {aktuell.stand && <span className="text-xs">{t("portal.cards.marktwert.as_of", { date: datumText(aktuell.stand, sprache) || aktuell.stand })}</span>}
            {aktuell.qmPreisMin && aktuell.qmPreisMax && (
              <span className="text-xs tabular-nums">{t("portal.cards.marktwert.market_range", { min: aktuell.qmPreisMin.toLocaleString(locale), max: aktuell.qmPreisMax.toLocaleString(locale) })}</span>
            )}
            {aktuell.vergleichsmieteQm && (
              <span className="text-xs tabular-nums">{t("portal.cards.marktwert.local_rent", { value: zahlText(aktuell.vergleichsmieteQm, sprache, 2) })}</span>
            )}
          </div>
          <div className="text-foreground/80">{aktuell.begruendung}</div>
          {aktuell.methodik && (
            <div className="text-xs p-2 rounded-md bg-card border border-border/40">
              <span className="font-semibold text-foreground">{t("portal.cards.marktwert.methodology")} </span>{aktuell.methodik}
            </div>
          )}
          {aktuell.quellen && aktuell.quellen.length > 0 && (
            <div>
              <div className="font-semibold text-foreground mb-1">{t("portal.cards.marktwert.sources")}</div>
              <ul className="space-y-0.5">
                {aktuell.quellen.map((q, i) => (
                  <li key={i}>
                    {q.url
                      ? <a href={q.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline hover:text-foreground"><ExternalLink className="h-3 w-3" />{q.name}</a>
                      : <span className="text-foreground/80">• {q.name}</span>}
                    {q.hinweis && <span>: {q.hinweis}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {aktuell.hinweis && <div className="text-xs text-muted-foreground pt-1 border-t border-border/40">{aktuell.hinweis}</div>}
        </div>
      )}
    </Card>
  );
}