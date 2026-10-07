import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Star, TrendingUp, TrendingDown, Users, Home, Percent, Euro, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { bruttomietrendite, scoreBadge, type Standort } from "@/data/marktanalyseSeed";
import { HerkunftBadge } from "@/components/marktanalyse/HerkunftBadge";
import { standortHerkunft } from "@/lib/marktdatenHerkunft";
import { kaufpreisMieteFaktor } from "@/lib/marktKennzahlen";

interface Props {
  standort: Standort;
  selected: boolean;
  onToggle: () => void;
  favorit: boolean;
  onToggleFavorit: () => void;
  /** Für diesen Standort liegen erhobene Werte aus der Datenbank vor. */
  hatErhobeneWerte?: boolean;
}

const SCORE_COLOR: Record<"A" | "B" | "C", string> = {
  A: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  B: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  C: "bg-rose-500/15 text-rose-700 border-rose-500/30",
};

function nfmt(n: number, digits = 0) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: digits }).format(n);
}

export function StandortKachel({ standort, selected, onToggle, favorit, onToggleFavorit, hatErhobeneWerte = false }: Props) {
  const score = scoreBadge(standort);
  const rendite = bruttomietrendite(standort);
  const faktor = kaufpreisMieteFaktor(standort);
  // Erhobene Werte stechen die Grundeinstufung: liegt mindestens eine echte
  // Kennzahl vor, ist der Standort nicht mehr rein modelliert.
  const herkunft = hatErhobeneWerte ? "gemessen" : standortHerkunft(standort.id);
  const trendPositiv = standort.einwohner_trend_5j_pct >= 0;

  return (
    <Card className={`relative overflow-hidden transition-all hover:shadow-md ${selected ? "ring-2 ring-primary" : ""}`}>
      {/* Header */}
      <div className="p-4 border-b bg-gradient-to-br from-muted/30 to-background">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Link to={`/marktanalyse/${standort.id}`} className="hover:underline">
              <h3 className="font-semibold text-base truncate">{standort.name}</h3>
            </Link>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              <MapPin className="h-3 w-3" />
              <span className="truncate">{standort.bundesland}</span>
            </div>
            <div className="mt-1.5">
              <HerkunftBadge herkunft={herkunft} klein />
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className={`text-xs font-bold cursor-help ${SCORE_COLOR[score]}`}>
                    {score}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs text-xs leading-snug">
                  <div className="font-semibold mb-1">Standort-Score</div>
                  <div className="space-y-0.5">
                    <div><span className="font-semibold text-emerald-500">A</span> = Metropole (Top-7 & Städte ab 500 Tsd., oder ab 250 Tsd. mit KKI ≥ 105)</div>
                    <div><span className="font-semibold text-amber-500">B</span> = Speckgürtel/Mittelstadt (ab 100 Tsd. Einw. oder KKI ≥ 105)</div>
                    <div><span className="font-semibold text-rose-500">C</span> = Ländlich (kleine Städte, KKI &lt; 105)</div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-border/50 text-muted-foreground">
                    Basis: Einwohner + Kaufkraftindex. Wachstum & Arbeitslosenquote können eine Stufe anheben oder senken.
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <button
              onClick={onToggleFavorit}
              className="text-muted-foreground hover:text-amber-500 transition-colors"
              aria-label="Favorit"
            >
              <Star className={`h-4 w-4 ${favorit ? "fill-amber-400 text-amber-400" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="p-4 grid grid-cols-2 gap-3 text-sm">
        <KPI icon={<Euro className="h-3.5 w-3.5" />} label="Kauf €/m²" value={nfmt(standort.kaufpreis_qm_wohnung_eur)} />
        <KPI icon={<Home className="h-3.5 w-3.5" />} label="Miete €/m²" value={nfmt(standort.miete_qm_eur, 2)} />
        <KPI icon={<Percent className="h-3.5 w-3.5" />} label="Bruttorendite" value={`${rendite.toFixed(2)} %`} highlight />
        <KPI icon={<Users className="h-3.5 w-3.5" />} label="Einwohner" value={nfmt(standort.einwohner)} />
      </div>

      {/* Trend & ALQ */}
      <div className="px-4 pb-4 flex items-center justify-between text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          {trendPositiv ? <TrendingUp className="h-3 w-3 text-emerald-600" /> : <TrendingDown className="h-3 w-3 text-rose-600" />}
          {trendPositiv ? "+" : ""}{standort.einwohner_trend_5j_pct.toFixed(1)} % / 5J
        </span>
        <span>ALQ {standort.arbeitslosenquote_pct.toFixed(1)} %</span>
        <span>KKI {standort.kaufkraftindex}</span>
        <span title="Kaufpreis-Miete-Faktor: das Wievielfache der Jahreskaltmiete kostet die Wohnung.">
          Faktor {faktor.toFixed(1)}×
        </span>
      </div>

      {/* Vergleichen */}
      <div className="px-4 pb-4">
        <label className="flex items-center gap-2 text-xs cursor-pointer text-foreground/80 hover:text-foreground">
          <Checkbox checked={selected} onCheckedChange={onToggle} />
          Zum Vergleich hinzufügen
        </label>
      </div>
    </Card>
  );
}

function KPI({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground mb-0.5">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`font-semibold tabular-nums ${highlight ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}