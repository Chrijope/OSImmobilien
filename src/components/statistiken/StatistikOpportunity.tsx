import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { cacheGet } from "@/lib/dataCache";
import { PIPELINE_STUFEN, wahrscheinlichkeitFuerStufe } from "@/lib/kontaktPipeline";
import { formatEuro } from "@/lib/statistikenHelper";
import { Flame, AlertTriangle, TrendingUp, Gauge } from "lucide-react";
import { computeLeadScore, leadScoreColor, type LeadScoreKlasse } from "@/lib/leadScore";
import { InfoTooltip } from "@/components/ui/info-tooltip";

const STAGE_SLA_DAYS: Record<string, { warn: number; alert: number }> = {
  neuer_lead: { warn: 1, alert: 3 },
  kontaktversuche: { warn: 2, alert: 5 },
  erstgespraech: { warn: 3, alert: 7 },
  bonitaetsunterlagen: { warn: 5, alert: 14 },
  closing: { warn: 5, alert: 14 },
  objektauswahl: { warn: 7, alert: 21 },
  reservierung: { warn: 7, alert: 14 },
  finanzierung: { warn: 14, alert: 30 },
  notar: { warn: 7, alert: 14 },
};

function getInvestmentVolume(inv: any): number {
  return Number(inv?.kaufpreis ?? inv?.meta?.kaufpreis ?? 0) || 0;
}

function daysSince(iso?: string | null): number {
  if (!iso) return 0;
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return 0;
  return Math.floor((Date.now() - d) / 86400000);
}

export function StatistikOpportunity({ kontakte }: { kontakte: any[] }) {
  const investments: any[] = cacheGet("investments") || [];
  const invByKontakt = useMemo(() => {
    const m = new Map<string, any[]>();
    investments.forEach(i => {
      const arr = m.get(i.kunde_id) || []; arr.push(i); m.set(i.kunde_id, arr);
    });
    return m;
  }, [investments]);

  const activeKontakte = useMemo(
    () => kontakte.filter(k => !k.archiviert && !k.geloescht && k.meta?.pipelineStufe !== "verloren" && k.status !== "verloren"),
    [kontakte]
  );

  const stageRows = useMemo(() => {
    return PIPELINE_STUFEN.filter(s => !["archiviert", "verloren"].includes(s.key)).map(s => {
      const list = activeKontakte.filter(k => (k.meta?.pipelineStufe || "neuer_lead") === s.key);
      const volume = list.reduce((sum, k) => {
        const invs = invByKontakt.get(k.id) || [];
        return sum + invs.reduce((a, i) => a + getInvestmentVolume(i), 0);
      }, 0);
      const prob = wahrscheinlichkeitFuerStufe(s.key);
      return { key: s.key, label: s.label, count: list.length, volume, weighted: volume * prob };
    });
  }, [activeKontakte, invByKontakt]);

  const totalForecast = stageRows.reduce((s, r) => s + r.weighted, 0);
  const totalVolume = stageRows.reduce((s, r) => s + r.volume, 0);

  const hotDeals = useMemo(() => {
    const in30 = Date.now() + 30 * 86400000;
    return activeKontakte
      .map(k => {
        const invs = invByKontakt.get(k.id) || [];
        const notar = invs.map(i => i.meta?.notarTermin || i.meta?.notarData?.datum).find(Boolean);
        const stufe = k.meta?.pipelineStufe;
        if (!["reservierung", "finanzierung", "notar"].includes(stufe || "")) return null;
        const notarDate = notar ? new Date(notar).getTime() : null;
        if (notarDate && notarDate > in30) return null;
        return { id: k.id, name: `${k.vorname || ""} ${k.nachname || ""}`.trim() || "Ohne Namen", stufe, notar: notarDate, volume: invs.reduce((s, i) => s + getInvestmentVolume(i), 0) };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => (a.notar ?? Infinity) - (b.notar ?? Infinity))
      .slice(0, 12) as any[];
  }, [activeKontakte, invByKontakt]);

  const stuckDeals = useMemo(() => {
    return activeKontakte
      .map(k => {
        const stufe = k.meta?.pipelineStufe || "neuer_lead";
        const sla = STAGE_SLA_DAYS[stufe];
        if (!sla) return null;
        const since = k.aktualisiert_am || k.erstellt_am;
        const days = daysSince(since);
        if (days < sla.warn) return null;
        return { id: k.id, name: `${k.vorname || ""} ${k.nachname || ""}`.trim() || "Ohne Namen", stufe, days, severity: days >= sla.alert ? "alert" : "warn" };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.days - a.days)
      .slice(0, 15) as any[];
  }, [activeKontakte]);


  // ── Lead-Qualität (Score-Verteilung) ──
  const leadQuality = useMemo(() => {
    const buckets: Record<LeadScoreKlasse | "none", { count: number; volume: number; sum: number }> = {
      A: { count: 0, volume: 0, sum: 0 },
      B: { count: 0, volume: 0, sum: 0 },
      C: { count: 0, volume: 0, sum: 0 },
      D: { count: 0, volume: 0, sum: 0 },
      none: { count: 0, volume: 0, sum: 0 },
    };
    let scored = 0;
    let scoreSum = 0;
    const top: { id: string; name: string; total: number; klasse: LeadScoreKlasse; volume: number }[] = [];

    activeKontakte.forEach(k => {
      const invs = invByKontakt.get(k.id) || [];
      const volume = invs.reduce((s, i) => s + getInvestmentVolume(i), 0);
      const sa = invs.map(i => i.meta?.saData).find(Boolean);
      if (!sa) {
        buckets.none.count++;
        buckets.none.volume += volume;
        return;
      }
      const res = computeLeadScore(sa);
      if (!res.hasSA) {
        buckets.none.count++;
        buckets.none.volume += volume;
        return;
      }
      buckets[res.klasse].count++;
      buckets[res.klasse].volume += volume;
      buckets[res.klasse].sum += res.total;
      scored++;
      scoreSum += res.total;
      top.push({
        id: k.id,
        name: `${k.vorname || ""} ${k.nachname || ""}`.trim() || "Ohne Namen",
        total: res.total,
        klasse: res.klasse,
        volume,
      });
    });

    const rows = (["A", "B", "C", "D", "none"] as const).map(k => ({
      key: k,
      label: k === "none" ? "Ohne SA" : `${k}-Lead`,
      count: buckets[k].count,
      volume: buckets[k].volume,
      avg: buckets[k].count > 0 && k !== "none" ? Math.round(buckets[k].sum / buckets[k].count) : null,
    }));

    return {
      rows,
      scored,
      avgScore: scored > 0 ? Math.round(scoreSum / scored) : 0,
      topLeads: top.sort((a, b) => b.total - a.total).slice(0, 8),
      coverage: activeKontakte.length > 0 ? Math.round((scored / activeKontakte.length) * 100) : 0,
    };
  }, [activeKontakte, invByKontakt]);

  const klasseColor = (k: LeadScoreKlasse | "none"): string => {
    if (k === "none") return "hsl(220 10% 60%)";
    if (k === "A") return "hsl(160 60% 40%)";
    if (k === "B") return "hsl(48 90% 50%)";
    if (k === "C") return "hsl(28 90% 55%)";
    return "hsl(0 75% 55%)";
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6 text-center"><p className="text-xs text-muted-foreground inline-flex items-center justify-center gap-1">Aktive Deals <InfoTooltip text="Anzahl aller offenen Kontakte in der Pipeline — also alle Leads, die NICHT archiviert, gelöscht oder als 'verloren' markiert sind. Basis für alle Kennzahlen auf dieser Seite." /></p><p className="text-2xl font-bold">{activeKontakte.length}</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><p className="text-xs text-muted-foreground inline-flex items-center justify-center gap-1">Pipeline-Volumen <InfoTooltip text="Summe der Kaufpreise aller Investments aller aktiven Deals. Unabhängig davon, in welcher Pipeline-Stufe sie stehen — also das gesamte potenzielle Geschäftsvolumen." /></p><p className="text-2xl font-bold">{formatEuro(totalVolume)}</p></CardContent></Card>
        <Card className="border-primary/30"><CardContent className="pt-6 text-center"><p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><TrendingUp className="h-3 w-3"/>Gewichteter Forecast <InfoTooltip text="Realistische Umsatz-Prognose: Volumen jeder Pipeline-Stufe × hinterlegte Abschluss-Wahrscheinlichkeit (z. B. Erstgespräch 20 %, Reservierung 70 %, Notar 90 %). Je weiter ein Deal vorne ist, desto stärker fließt er ein." /></p><p className="text-2xl font-bold text-primary">{formatEuro(totalForecast)}</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><p className="text-xs text-muted-foreground inline-flex items-center justify-center gap-1">Stuck Deals (SLA) <InfoTooltip text="Deals, deren letzte Aktivität länger zurückliegt als die SLA-Frist für ihre aktuelle Pipeline-Stufe (z. B. Erstgespräch > 3 Tage, Bonität > 5 Tage). Diese Leads brauchen sofortige Aufmerksamkeit." /></p><p className="text-2xl font-bold text-destructive">{stuckDeals.length}</p></CardContent></Card>
      </div>

      {/* Lead-Qualität (Score-Verteilung) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Gauge className="h-4 w-4 text-primary" />
            Lead-Qualität (Bonitäts-Score)
            <InfoTooltip text="Bewertung der eingereichten Selbstauskünfte (SA) nach Bonitäts-Kriterien (Einkommen, Eigenkapital, Sparrate, Alter, ...). Klassen: A = Top-Lead, B = solide, C = bedingt, D = kritisch. 'Ohne SA' = Kunde hat noch keine Selbstauskunft ausgefüllt." />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* KPIs links */}
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Ø Score (bewertete Leads)</p>
                <p className="text-3xl font-bold text-primary">{leadQuality.avgScore}<span className="text-base text-muted-foreground"> / 100</span></p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Bewertete Leads</p>
                <p className="text-lg font-semibold">{leadQuality.scored} <span className="text-xs text-muted-foreground">({leadQuality.coverage} % der aktiven)</span></p>
              </div>
              <div className="space-y-1 pt-2">
                {leadQuality.rows.map(r => {
                  const color = leadScoreColor(r.key === "none" ? "D" : (r.key as LeadScoreKlasse));
                  return (
                    <div key={r.key} className="flex items-center justify-between text-sm border-b border-border pb-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full" style={{ background: klasseColor(r.key as any) }} />
                        <span className="font-medium">{r.label}</span>
                        {r.avg != null && <span className="text-xs text-muted-foreground">Ø {r.avg}</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className={r.key !== "none" ? color.badge : ""}>{r.count}</Badge>
                        <span className="text-xs text-muted-foreground w-24 text-right">{formatEuro(r.volume)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Verteilung Bar Chart */}
            <div className="lg:col-span-2">
              <p className="text-xs text-muted-foreground mb-2">Verteilung nach Klasse</p>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={leadQuality.rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="leadQualityFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} interval={0} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                    formatter={(value: any, name: string) => name === "Volumen" ? formatEuro(value) : value}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    name="Leads"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2.5}
                    fill="url(#leadQualityFill)"
                    dot={({ cx, cy, index }: any) => {
                      const r = leadQuality.rows[index];
                      const color = r ? klasseColor(r.key as any) : "hsl(var(--primary))";
                      return <circle key={index} cx={cx} cy={cy} r={4} fill={color} stroke="hsl(var(--background))" strokeWidth={2} />;
                    }}
                    activeDot={{ r: 6 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
              {leadQuality.topLeads.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground mb-1">Top-Leads nach Score</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                    {leadQuality.topLeads.map(l => {
                      const c = leadScoreColor(l.klasse);
                      return (
                        <div key={l.id} className="flex items-center justify-between text-sm border-b border-border py-1">
                          <span className="truncate pr-2">{l.name}</span>
                          <span className="flex items-center gap-2">
                            <Badge variant="outline" className={c.badge}>{l.klasse}</Badge>
                            <span className="font-semibold tabular-nums">{l.total}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {leadQuality.scored === 0 && (
                <p className="text-xs text-muted-foreground mt-3">
                  Noch keine ausgefüllten Selbstauskünfte – Score wird verfügbar, sobald Kunden die SA abschließen.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Flame className="h-4 w-4 text-orange-500"/>Hot Deals (nächste 30 Tage) <InfoTooltip text="Deals kurz vor dem Abschluss: in Stufe Reservierung, Finanzierung oder Notar. Sortiert nach Notartermin — Deals mit Termin in den nächsten 30 Tagen oder ohne Termin (= akut) stehen oben. Top 12 angezeigt." /></CardTitle></CardHeader>
          <CardContent>
            {hotDeals.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Hot Deals im Zeitraum.</p>
            ) : (
              <div className="space-y-2">
                {hotDeals.map(d => (
                  <div key={d.id} className="flex items-center justify-between text-sm border-b border-border pb-2">
                    <div>
                      <p className="font-medium">{d.name}</p>
                      <p className="text-xs text-muted-foreground">{d.stufe}{d.notar ? ` · Notar: ${new Date(d.notar).toLocaleDateString("de-DE")}` : ""}</p>
                    </div>
                    <Badge variant="outline">{formatEuro(d.volume)}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive"/>Stuck Deals — SLA überschritten <InfoTooltip text="Deals, die in ihrer aktuellen Stufe zu lange ohne Aktivität liegen. Orange = Warnschwelle (z. B. Erstgespräch > 3 Tage), Rot = Alert-Schwelle (z. B. > 7 Tage). Sortiert nach Inaktivitätsdauer." /></CardTitle></CardHeader>
          <CardContent>
            {stuckDeals.length === 0 ? (
              <p className="text-sm text-muted-foreground">Alles im grünen Bereich.</p>
            ) : (
              <div className="space-y-2">
                {stuckDeals.map((d: any) => (
                  <div key={d.id} className={`flex items-center justify-between text-sm border-l-4 pl-3 py-1 ${d.severity === "alert" ? "border-destructive" : "border-orange-500"}`}>
                    <div>
                      <p className="font-medium">{d.name}</p>
                      <p className="text-xs text-muted-foreground">{d.stufe}</p>
                    </div>
                    <Badge variant={d.severity === "alert" ? "destructive" : "outline"}>{d.days} Tage</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/*
        Die Torte "Lost Reasons" stand hier direkt unter der Karte
        "Verlustgründe" und widersprach ihr systematisch: andere Erkennung des
        verlorenen Leads, festes 90-Tage-Fenster statt wählbarem Zeitraum,
        keine Zusammenfassung der Freitexte und ab dem neunten Segment
        wiederholte Farben. Zwei Antworten auf dieselbe Frage im selben Tab
        sind schlimmer als eine. Geblieben ist die Karte "Verlustgründe".
      */}
    </div>
  );
}