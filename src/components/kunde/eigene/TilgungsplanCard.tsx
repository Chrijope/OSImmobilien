import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { LineChart, Line, XAxis, YAxis, Tooltip as ReTooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Landmark } from "lucide-react";
import { aktuelleRestschuld, berechneTilgungsplan, jahresAnnuitaet, type ExternesInvestment } from "@/lib/eigeneInvestmentBerechnungen";
import { useTranslation, Trans } from "react-i18next";
import { portalSprache } from "@/i18n/portalSprache";
import { euroText } from "@/lib/sprachFormat";

export function TilgungsplanCard({ inv }: { inv: ExternesInvestment }) {
  const { t } = useTranslation();
  const fmt = (v: number) => euroText(v, portalSprache(), 0);
  const initialSond = inv.meta?.sondertilgung_jahr || 0;
  const [sond, setSond] = useState<number>(initialSond);

  const rows = useMemo(() => {
    // Start ist die heutige Restschuld, dieselbe Zahl wie bei „Offene Tilgung“.
    const rest = aktuelleRestschuld(inv) ?? 0;
    return berechneTilgungsplan(rest, inv.zinssatz || 0, jahresAnnuitaet(inv), sond, 40);
  }, [inv, sond]);

  const lRest = t("portal.cards.tilgung.remaining");
  const lZins = t("portal.cards.tilgung.interest");
  const lTilg = t("portal.cards.tilgung.redemption");
  const chartData = rows.map(r => ({ jahr: r.jahr, [lRest]: Math.round(r.restschuld), [lZins]: Math.round(r.zinsen), [lTilg]: Math.round(r.tilgung + r.sondertilgung) }));
  const volltilgungJahr = rows[rows.length - 1]?.restschuld < 1 ? rows.length : null;
  const summe = rows.reduce((s, r) => ({ z: s.z + r.zinsen, t: s.t + r.tilgung + r.sondertilgung }), { z: 0, t: 0 });

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-semibold flex items-center gap-2"><Landmark className="h-4 w-4 text-primary" />{t("portal.cards.tilgung.title")}</h3>
        {volltilgungJahr && <span className="text-xs text-muted-foreground"><Trans i18nKey="portal.cards.tilgung.fully_paid" values={{ years: volltilgungJahr }} components={{ strong: <strong className="text-[hsl(var(--success))]" /> }} /></span>}
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex justify-between text-xs">
          <Label>{t("portal.cards.tilgung.sond_annual")}</Label>
          <span className="font-semibold tabular-nums">{fmt(sond)}</span>
        </div>
        <Slider value={[sond]} onValueChange={v => setSond(v[0])} min={0} max={Math.max(20000, (inv.darlehenssumme || 0) * 0.05)} step={500} />
      </div>

      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
            <XAxis dataKey="jahr" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <ReTooltip formatter={(v: any) => fmt(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey={lRest} stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey={lZins} stroke="hsl(var(--destructive))" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey={lTilg} stroke="hsl(var(--success))" strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-border/40 text-sm">
        <div><span className="text-muted-foreground">{t("portal.cards.tilgung.interest_total")} </span><span className="font-semibold tabular-nums">{fmt(summe.z)}</span></div>
        <div><span className="text-muted-foreground">{t("portal.cards.tilgung.redemption_total")} </span><span className="font-semibold tabular-nums">{fmt(summe.t)}</span></div>
      </div>
    </Card>
  );
}