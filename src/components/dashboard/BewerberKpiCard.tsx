import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { useMemo } from "react";
import { useLiveVersion } from "@/hooks/useLiveData";
import { getBewerber, getStellen, PIPELINE_STUFEN, STATUS_LABELS, statusColor, type BewerberStatus } from "@/lib/bewerbungStore";
import { unscharfKlasse } from "@/lib/vorfuehrmodus";
import { Users, UserCheck, UserX, Briefcase, TrendingUp } from "lucide-react";

/**
 * Bewerbermanagement-KPI-Übersicht – sichtbar für Admin, Inhaber, HR.
 * Zeigt Gesamtzahlen, Status-Verteilung, Conversion und offene Stellen.
 */
export function BewerberKpiCard() {
  const navigate = useNavigate();
  const v = useLiveVersion(["bewerbungen"]);

  const kpi = useMemo(() => {
    const all = getBewerber();
    const total = all.length;
    const aktiv = all.filter(b => b.status === "Aktiv").length;
    const abgelehnt = all.filter(b => b.status === "Abgelehnt").length;
    const keinInteresse = all.filter(b => b.status === "KeinInteresse").length;
    const imProzess = all.filter(b => !["Aktiv", "Abgelehnt", "KeinInteresse"].includes(b.status)).length;
    const eingang = all.filter(b => b.status === "Eingang").length;

    // Status-Verteilung über Pipeline
    const byStatus: Record<string, number> = {};
    [...PIPELINE_STUFEN, "KeinInteresse" as BewerberStatus, "Abgelehnt" as BewerberStatus].forEach(s => {
      byStatus[s] = all.filter(b => b.status === s).length;
    });

    // Conversion: Aktiv / (Aktiv + Abgelehnt + KeinInteresse)
    const abgeschlossen = aktiv + abgelehnt + keinInteresse;
    const conversion = abgeschlossen > 0 ? Math.round((aktiv / abgeschlossen) * 100) : 0;

    // Neu in letzten 7 Tagen
    const siebenTage = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const neuDieseWoche = all.filter(b => {
      const t = new Date(b.beworben || b.erstelltAm || 0).getTime();
      return t >= siebenTage;
    }).length;

    const stellenOffen = getStellen().filter(s => s.status === "Veröffentlicht").length;

    return { total, aktiv, abgelehnt, keinInteresse, imProzess, eingang, byStatus, conversion, neuDieseWoche, stellenOffen };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);

  const Tile = ({ icon: Icon, label, value, accent }: { icon: any; label: string; value: number | string; accent: string }) => (
    <div data-ui="card" className="rounded-lg border bg-background/60 p-3 flex flex-col items-center text-center gap-1">
      <div className="flex items-center justify-center gap-2 text-muted-foreground text-[11px]">
        <Icon className={`h-3.5 w-3.5 ${accent}`} />
        <span>{label}</span>
      </div>
      {/* Im Vorfuehrmodus wird nur der Wert weichgezeichnet, die Beschriftung
          darueber bleibt lesbar. */}
      <p className={unscharfKlasse("text-xl font-bold text-foreground tabular-nums")}>{value}</p>
    </div>
  );

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">            <CardTitle className="text-[13px] font-medium text-muted-foreground tracking-wide uppercase">Bewerbermanagement – KPIs</CardTitle>
          </div>
          <Badge variant="outline" className="text-[9px]">
            <span className={unscharfKlasse()}>{kpi.total}</span>&nbsp;gesamt
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 flex-1 flex flex-col">
        {/* Top KPIs – Mobile: 2 Spalten, letzte (5.) Kachel mittig zentriert */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 [&>*:nth-child(5):last-child]:col-span-2 [&>*:nth-child(5):last-child]:max-w-[50%] [&>*:nth-child(5):last-child]:justify-self-center md:[&>*:nth-child(5):last-child]:col-span-1 md:[&>*:nth-child(5):last-child]:max-w-none md:[&>*:nth-child(5):last-child]:justify-self-stretch">
          <Tile icon={Users} label="Gesamt" value={kpi.total} accent="text-primary" />
          <Tile icon={TrendingUp} label="Im Prozess" value={kpi.imProzess} accent="text-blue-500" />
          <Tile icon={UserCheck} label="Aktiv" value={kpi.aktiv} accent="text-emerald-500" />
          <Tile icon={UserX} label="Abgelehnt / Kein Int." value={kpi.abgelehnt + kpi.keinInteresse} accent="text-rose-500" />
          <Tile icon={Briefcase} label="Offene Stellen" value={kpi.stellenOffen} accent="text-amber-500" />
        </div>

        {/* Sekundäre Kennzahlen */}
        <div className="grid grid-cols-3 gap-2 text-center pt-1 border-t border-border">
          <div>
            <p className={unscharfKlasse("text-sm font-bold text-foreground")}>{kpi.eingang}</p>
            <p className="text-[10px] text-muted-foreground">Neu in Eingang</p>
          </div>
          <div>
            <p className={unscharfKlasse("text-sm font-bold text-foreground")}>{kpi.neuDieseWoche}</p>
            <p className="text-[10px] text-muted-foreground">Neu (7 Tage)</p>
          </div>
          <div>
            <p className={unscharfKlasse("text-sm font-bold text-foreground")}>{kpi.conversion}%</p>
            <p className="text-[10px] text-muted-foreground">Conversion</p>
          </div>
        </div>

        {/* Status-Verteilung */}
        <div className="pt-1 border-t border-border space-y-1.5">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Status-Verteilung</p>
          <div className="flex flex-wrap gap-1.5">
            {([...PIPELINE_STUFEN, "KeinInteresse", "Abgelehnt"] as BewerberStatus[]).map(s => {
              const count = kpi.byStatus[s] || 0;
              if (count === 0) return null;
              return (
                <div key={s} className="flex items-center gap-1.5 rounded-md border bg-background/60 px-2 py-1">
                  <span className={`inline-block h-2 w-2 rounded-full ${statusColor[s]}`} />
                  <span className="text-[11px] text-foreground">{STATUS_LABELS[s]}</span>
                  <span className={unscharfKlasse("text-[11px] font-bold tabular-nums text-foreground")}>{count}</span>
                </div>
              );
            })}
            {kpi.total === 0 && (
              <p className="text-[11px] text-muted-foreground italic">Noch keine Bewerber erfasst.</p>
            )}
          </div>
        </div>

        <button
          onClick={() => navigate("/bewerberprozess")}
          className="mt-auto pt-1 text-xs text-primary font-medium hover:underline text-left"
        >
          Zum Bewerbermanagement →
        </button>
      </CardContent>
    </Card>
  );
}
