import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, Tooltip as ReTooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { TrendingUp } from "lucide-react";
import { berechneForecast, cockpitWerte, type ExternesInvestment } from "@/lib/eigeneInvestmentBerechnungen";
import { suggestSteuersatz } from "@/lib/steuerHelper";
import { useTranslation } from "react-i18next";
import { portalSprache } from "@/i18n/portalSprache";
import { euroText } from "@/lib/sprachFormat";

const SCENARIOS = {
  konservativ: { miet: 1.0, hg: 2.5, zinsAuf: 2.0 },
  realistisch: { miet: 1.5, hg: 2.0, zinsAuf: 1.5 },
  optimistisch: { miet: 2.5, hg: 1.5, zinsAuf: 0.5 },
} as const;

export function CashflowForecastCard({ inv, saData }: { inv: ExternesInvestment; saData?: any }) {
  const { t } = useTranslation();
  const fmt = (v: number) => euroText(v, portalSprache(), 0);
  const [jahre, setJahre] = useState<10 | 20 | 30>(20);
  const [szenario, setSzenario] = useState<keyof typeof SCENARIOS>("realistisch");
  // Kein 42-%-Fallback: Vorbelegung nur aus gespeicherter Angabe oder aus der
  // Selbstauskunft. 0 heisst: kein Steuereffekt im Forecast, bis der Nutzer
  // einen Satz eintraegt (sichtbares Eingabefeld auf der Karte).
  const [steuersatz, setSteuersatz] = useState<number>(
    inv.meta?.steuerCockpit?.grenzsteuersatz
      ?? suggestSteuersatz(saData, 0)
  );

  const rows = useMemo(() => {
    const s = SCENARIOS[szenario];
    // Bodenwert und Verwaltungsanteil: derselbe Wert wie im Steuer-Cockpit
    // und im Bearbeiten-Dialog (Gebaeudeanteil, Hausgeld nicht umlagefaehig).
    const werte = cockpitWerte(inv);
    return berechneForecast(inv, {
      jahre,
      mietsteigerungP: s.miet,
      hausgeldSteigerungP: s.hg,
      anschlussZinsAufschlag: s.zinsAuf,
      steuersatz,
      // Keine stillen Pauschalen: ohne gespeicherte Angabe rechnet der
      // Forecast ohne AfA bzw. ohne Hausgeld-Anteil.
      bodenwertAnteil: werte.bodenwertAnteil,
      hausgeldNichtUmlagefaehigP: werte.hausgeldNichtUmlageProzent,
    });
  }, [inv, jahre, szenario, steuersatz]);

  const lCash = t("portal.cards.cashflow.cashflow_series");
  const data = rows.map(r => ({ jahr: r.jahr, [lCash]: Math.round(r.cashflow), Restschuld: Math.round(r.restschuld) }));
  const sumCF = rows.reduce((s, r) => s + r.cashflow, 0);
  const zinsbindungBis = inv.meta?.zinsbindung_bis ? new Date(inv.meta.zinsbindung_bis).getFullYear() : null;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" />{t("portal.cards.cashflow.title")}</h3>
        <Tabs value={String(jahre)} onValueChange={v => setJahre(Number(v) as any)}>
          <TabsList className="h-8">
            <TabsTrigger value="10" className="text-xs h-7 px-2">{t("portal.cards.cashflow.y10")}</TabsTrigger>
            <TabsTrigger value="20" className="text-xs h-7 px-2">{t("portal.cards.cashflow.y20")}</TabsTrigger>
            <TabsTrigger value="30" className="text-xs h-7 px-2">{t("portal.cards.cashflow.y30")}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        {(Object.keys(SCENARIOS) as (keyof typeof SCENARIOS)[]).map(s => (
          <button key={s} onClick={() => setSzenario(s)}
            className={`px-2 py-1.5 rounded-md text-xs font-medium border transition ${szenario === s ? "bg-primary text-primary-foreground border-primary" : "border-border/60 hover:bg-muted/40"}`}>
            {t(`portal.cards.cashflow.${s}`)}
          </button>
        ))}
        <div className="space-y-0.5">
          <Label className="text-xs">{t("portal.cards.cashflow.tax_rate")}</Label>
          <Input type="number" value={steuersatz} onChange={e => setSteuersatz(Number(e.target.value) || 0)} className="h-7 text-xs" />
        </div>
      </div>

      <div style={{ width: "100%", height: 230 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
            <XAxis dataKey="jahr" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <ReTooltip formatter={(v: any) => fmt(Number(v))} />
            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 2" />
            {zinsbindungBis && <ReferenceLine x={zinsbindungBis} stroke="hsl(var(--destructive))" strokeDasharray="3 3" label={{ value: t("portal.cards.cashflow.fixed_end"), fontSize: 11, fill: "hsl(var(--destructive))", position: "top" }} />}
            <Line type="monotone" dataKey={lCash} stroke="hsl(var(--success))" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 pt-3 border-t border-border/40 flex justify-between text-sm">
        <span className="text-muted-foreground">{t("portal.cards.cashflow.cumulative", { years: jahre })}</span>
        <span className={`font-semibold tabular-nums ${sumCF >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--warning))]"}`}>{fmt(sumCF)}</span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground leading-snug">
        {t("portal.cards.cashflow.szenario_hinweis", "Szenario-Annahmen (Miet- und Hausgeldsteigerung, Anschlusszins, Steuersatz) wählst du selbst. ")}
        {steuersatz <= 0 && t("portal.cards.cashflow.kein_steuersatz", "Ohne eingetragenen Steuersatz wird kein Steuereffekt berücksichtigt.")}
      </p>
    </Card>
  );
}