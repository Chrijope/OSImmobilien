import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { getInvestments } from "@/lib/investmentsStore";
import { getKontakte } from "@/lib/kundenStore";
import { excludeStatsKontakte } from "@/lib/statsExclusion";
import {
  Banknote,
  Wallet,
  TrendingUp,
  Clock,
  XCircle,
  CalendarCheck,
  FileSignature,
  ArrowRight,
  Filter,
  Building2,
  Users,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FinanzierungsPerformanceBlock } from "./FinanzierungsPerformanceBlock";

type RangeKey = "30" | "90" | "365" | "all";
const RANGES: Record<RangeKey, { days: number | null; label: string }> = {
  "30": { days: 30, label: "Letzte 30 Tage" },
  "90": { days: 90, label: "Letzte 90 Tage" },
  "365": { days: 365, label: "Letztes Jahr" },
  all: { days: null, label: "Alle Zeit" },
};

// Dashboard zeigt nur die unmittelbar relevante Vorstufe ("reservierung"
// = eine Stufe vor "finanzierung"). Vollzugriff auf alle Kunden in jeder
// Stufe läuft über die Sidebar-Listen (Kontakte / Alle Kontakte etc.).
const PRE_FINANZIERUNG_STAGES = ["reservierung"];
const FINANZIERUNG_STAGES = ["finanzierung"];
// Alles ab "notar" gilt als Finanzierung genehmigt / weiter im Prozess
const POST_FINANZIERUNG_STAGES = ["notar", "notar_ohne_gs", "notar_mit_gs", "faelligkeit", "abrechnung", "abgeschlossen"];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function getKaufpreis(inv: any): number {
  const raw = (inv as any)?.kaufpreis;
  if (typeof raw === "number" && raw > 0) return raw;
  return 0;
}

export function FinanzierungspartnerDashboard() {
  const navigate = useNavigate();
  const [range, setRange] = useState<RangeKey>("90");

  const data = useMemo(() => {
    const investments = getInvestments();
    const kontakte = excludeStatsKontakte(getKontakte());
    const kMap = new Map(kontakte.map((k) => [k.id, k]));

    const now = Date.now();
    const rangeDays = RANGES[range].days;
    const cutoff = rangeDays ? now - rangeDays * 24 * 60 * 60 * 1000 : 0;

    const inRange = (iso?: string) => {
      if (!iso) return false;
      const ts = new Date(iso).getTime();
      if (isNaN(ts)) return false;
      return ts >= cutoff;
    };

    const reserviert = investments.filter((i) => PRE_FINANZIERUNG_STAGES.includes(i.pipelineStufe));
    const inFinanzierung = investments.filter((i) => FINANZIERUNG_STAGES.includes(i.pipelineStufe));
    const postFinanzierung = investments.filter((i) => POST_FINANZIERUNG_STAGES.includes(i.pipelineStufe));

    // Genehmigt im Zeitraum: notarTermin gesetzt im Range ODER finanzierungsStatus=bestaetigt
    const genehmigtImZeitraum = investments.filter((i) => {
      const status = (i as any).finanzierungsStatus;
      if (status === "bestaetigt") {
        return rangeDays === null || inRange(i.notarTermin) || inRange(i.erstellt_am);
      }
      return false;
    });

    const abgelehnt = investments.filter((i) => (i as any).finanzierungsStatus === "abgelehnt");

    // Quote: in Finanzierung erfolgreich / (reserviert + in finanzierung + post)
    const totalFunnel = reserviert.length + inFinanzierung.length + postFinanzierung.length;
    const quote = totalFunnel > 0 ? Math.round((postFinanzierung.length / totalFunnel) * 100) : 0;

    const volumenInFinanzierung = inFinanzierung.reduce((s, i) => s + getKaufpreis(i), 0);
    const volumenReserviert = reserviert.reduce((s, i) => s + getKaufpreis(i), 0);
    const volumenGenehmigt = postFinanzierung.reduce((s, i) => s + getKaufpreis(i), 0);

    // Monatliche Auswertung (letzte 12 Monate) für Trend
    const monthly: { label: string; count: number; volumen: number }[] = [];
    for (let m = 11; m >= 0; m--) {
      const d = new Date();
      d.setMonth(d.getMonth() - m);
      d.setDate(1);
      const start = d.getTime();
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      const monthInvs = postFinanzierung.filter((i) => {
        const ts = i.notarTermin ? new Date(i.notarTermin).getTime() : 0;
        return ts >= start && ts < end;
      });
      monthly.push({
        label: d.toLocaleDateString("de-DE", { month: "short", year: "2-digit" }),
        count: monthInvs.length,
        volumen: monthInvs.reduce((s, i) => s + getKaufpreis(i), 0),
      });
    }

    // Liegezeit Reservierung → Finanzierung: durchschn. Tage seit Reservierung für aktuell offene
    const wartezeiten = reserviert
      .map((i) => {
        const ts = i.erstellt_am ? new Date(i.erstellt_am).getTime() : 0;
        return ts > 0 ? Math.floor((now - ts) / (1000 * 60 * 60 * 24)) : 0;
      })
      .filter((d) => d > 0);
    const avgWartezeit =
      wartezeiten.length > 0
        ? Math.round(wartezeiten.reduce((s, d) => s + d, 0) / wartezeiten.length)
        : 0;

    // SLA-Risiko: Reservierung älter als 14 Tage ohne Fortschritt
    const slaRisiko = reserviert.filter((i) => {
      const ts = i.erstellt_am ? new Date(i.erstellt_am).getTime() : 0;
      return ts > 0 && (now - ts) / (1000 * 60 * 60 * 24) > 14;
    });

    // Anzahl betreuender VPs
    const vpSet = new Set<string>();
    [...reserviert, ...inFinanzierung].forEach((i) => {
      const k = kMap.get(i.kontaktId);
      if (k && (k as any).berater) vpSet.add((k as any).berater);
    });

    return {
      reserviert,
      inFinanzierung,
      postFinanzierung,
      genehmigtImZeitraum,
      abgelehnt,
      quote,
      volumenInFinanzierung,
      volumenReserviert,
      volumenGenehmigt,
      monthly,
      avgWartezeit,
      slaRisiko,
      vpCount: vpSet.size,
      kMap,
    };
  }, [range]);

  // Nur noch reduzierte sekundäre KPIs (Volumen/Abgelehnt/VPs). Haupt-KPIs sind im
  // FinanzierungsPerformanceBlock konsolidiert.
  const kpis = [
    {
      label: "Abgelehnt",
      value: data.abgelehnt.length,
      sub: "Ablehnungen",
      icon: XCircle,
      color: "text-destructive",
      hint: "Finanzierung abgelehnt",
    },
    {
      label: "Betreuende VPs",
      value: data.vpCount,
      sub: "im aktiven Funnel",
      icon: Users,
      color: "text-primary",
      hint: "Vertriebspartner mit offenen Vorgängen",
    },
  ];

  const maxMonthCount = Math.max(1, ...data.monthly.map((m) => m.count));

  return (
    <div className="flex flex-col gap-6">
      {/* Quick Actions */}
      <div className="flex gap-3 flex-wrap">
        <Button onClick={() => navigate("/abwicklung")}>
          <CalendarCheck className="h-4 w-4 mr-1" /> Zur Abwicklung
        </Button>
        <Button variant="outline" onClick={() => navigate("/kunden")}>
          <Users className="h-4 w-4 mr-1" /> Alle Kunden
        </Button>
        <Button variant="outline" onClick={() => navigate("/inbox")}>
          <Clock className="h-4 w-4 mr-1" /> Meine Inbox
        </Button>
      </div>

      {/* Header + Range Filter */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-base">📊</span>
          <h2 className="text-lg font-semibold tracking-tight">
            Finanzierungs-Kennzahlen
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(RANGES).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Haupt-KPIs: konsolidierter Performance-Block */}
      <FinanzierungsPerformanceBlock />

      {/* Sekundäre KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="hover:shadow-md transition-shadow" title={kpi.hint}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="text-2xl font-bold">{kpi.value}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{kpi.sub}</p>
                </div>
                <kpi.icon className={`h-5 w-5 shrink-0 ${kpi.color}`} />
              </div>
              <p className="text-xs text-muted-foreground mt-2 leading-tight">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Zwei Listen: Anstehende Finanzierungen (aus Reservierung) + Laufende */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileSignature className="h-4 w-4 text-[hsl(var(--warning))]" />
              Anstehende Finanzierungen (Vorschau aus Reservierung)
              <Badge variant="secondary" className="ml-auto text-[10px]">
                {data.reserviert.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[420px] overflow-auto">
            {data.reserviert.length === 0 && (
              <p className="text-xs text-muted-foreground py-6 text-center">
                Aktuell keine Reservierungen, die auf Finanzierung warten.
              </p>
            )}
            {data.reserviert.map((inv) => {
              const k = data.kMap.get(inv.kontaktId);
              const name = k ? `${k.vorname} ${k.nachname}` : "Kunde";
              const days = inv.erstellt_am
                ? Math.floor((Date.now() - new Date(inv.erstellt_am).getTime()) / (1000 * 60 * 60 * 24))
                : 0;
              const overdue = days > 14;
              return (
                <div
                  key={inv.id}
                  className="flex items-center gap-3 p-2 rounded border hover:bg-accent cursor-pointer transition-colors"
                  onClick={() => navigate(`/kunden/${inv.kontaktId}`)}
                >
                  <Wallet className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{name}</p>
                    <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {inv.objektTitel || inv.label}
                      {(k as any)?.berater && (
                        <span className="ml-1">· VP: {(k as any).berater}</span>
                      )}
                    </p>
                  </div>
                  <Badge variant={overdue ? "destructive" : "secondary"} className="text-[10px] shrink-0">
                    <Clock className="h-3 w-3 mr-1" />
                    {days}d
                  </Badge>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Banknote className="h-4 w-4 text-primary" />
              Aktuell in Finanzierung
              <Badge variant="secondary" className="ml-auto text-[10px]">
                {data.inFinanzierung.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[420px] overflow-auto">
            {data.inFinanzierung.length === 0 && (
              <p className="text-xs text-muted-foreground py-6 text-center">
                Keine laufenden Finanzierungen.
              </p>
            )}
            {data.inFinanzierung.map((inv) => {
              const k = data.kMap.get(inv.kontaktId);
              const name = k ? `${k.vorname} ${k.nachname}` : "Kunde";
              const kp = getKaufpreis(inv);
              return (
                <div
                  key={inv.id}
                  className="flex items-center gap-3 p-2 rounded border hover:bg-accent cursor-pointer transition-colors"
                  onClick={() => navigate(`/kunden/${inv.kontaktId}`)}
                >
                  <Banknote className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{name}</p>
                    <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {inv.objektTitel || inv.label}
                      {(k as any)?.berater && (
                        <span className="ml-1">· VP: {(k as any).berater}</span>
                      )}
                    </p>
                  </div>
                  {kp > 0 && (
                    <span className="text-[11px] font-semibold text-muted-foreground shrink-0">
                      {formatCurrency(kp)}
                    </span>
                  )}
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>


      {/* Trend: Finanzierungen genehmigt pro Monat */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Genehmigte Finanzierungen pro Monat (letzte 12 Monate)
            </CardTitle>
            <Badge variant="secondary" className="text-[10px]">
              Notartermin = Finanzierung steht
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-2 h-40">
            {data.monthly.map((m) => (
              <div key={m.label} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full bg-primary/80 rounded-t transition-all"
                  style={{ height: `${(m.count / maxMonthCount) * 100}%`, minHeight: m.count > 0 ? 4 : 0 }}
                  title={`${m.count} · ${formatCurrency(m.volumen)}`}
                />
                <span className="text-[10px] text-muted-foreground">{m.label}</span>
                <span className="text-[10px] font-semibold">{m.count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>


    </div>
  );
}