import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip,
  PieChart, Pie, LabelList,
} from "recharts";
import { Calculator, TrendingUp, PieChart as PieIcon, ArrowRight, CheckCircle2, Sparkles, GitBranch } from "lucide-react";
import type {
  AkademieVisual, AkademieKpi, AkademieBeispielrechnung, AkademieBarchart,
  AkademieDonut, AkademieTimeline, AkademieVergleich,
} from "@/lib/vertriebsakademieContent";

const KPI_STYLE: Record<NonNullable<AkademieKpi["farbe"]>, string> = {
  primary: "border-primary/30 bg-primary/5 text-primary",
  emerald: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
  amber: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400",
  rose: "border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-400",
  sky: "border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-400",
  indigo: "border-indigo-500/30 bg-indigo-500/5 text-indigo-700 dark:text-indigo-400",
};

function KpiRow({ items }: { items: AkademieKpi[] }) {
  return (
    <div className={`grid gap-2 ${items.length >= 4 ? "grid-cols-2 md:grid-cols-4" : items.length === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2"} animate-fade-in`}>
      {items.map((k, i) => (
        <div
          key={i}
          className={`rounded-lg border p-3 ${KPI_STYLE[k.farbe ?? "primary"]} transition-transform hover:-translate-y-0.5`}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{k.label}</div>
          <div className="mt-1 text-xl font-bold tabular-nums">{k.wert}</div>
          {k.hinweis && <div className="mt-0.5 text-[11px] text-muted-foreground">{k.hinweis}</div>}
        </div>
      ))}
    </div>
  );
}

export function Beispielrechnung({ b }: { b: AkademieBeispielrechnung }) {
  return (
    <div className="rounded-lg border-2 border-primary/25 bg-gradient-to-br from-primary/5 to-transparent p-4 space-y-3 animate-fade-in">
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-md bg-primary/10 text-primary">
          <Calculator className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">{b.titel}</div>
          {b.untertitel && (
            <div className="text-xs text-muted-foreground">{b.untertitel}</div>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        {b.zeilen.map((z, i) => (
          <div key={i}>
            <div
              className={`flex items-center justify-between gap-3 text-sm py-1 ${
                z.ergebnis ? "border-t border-primary/30 pt-2 mt-1 font-semibold text-primary" : ""
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {z.op && (
                  <span className={`inline-flex h-5 w-5 items-center justify-center rounded text-xs font-bold ${z.ergebnis ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {z.op}
                  </span>
                )}
                <span className={z.op ? "" : "ml-7"}>{z.label}</span>
              </div>
              <span className="tabular-nums shrink-0">{z.wert}</span>
            </div>
            {z.hinweis && (
              <div className="ml-7 text-[11px] text-muted-foreground italic">{z.hinweis}</div>
            )}
          </div>
        ))}
      </div>
      {b.fazit && (
        <div className="pt-2 border-t border-primary/20 flex items-start gap-2 text-xs text-foreground/90">
          <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
          <span>{b.fazit}</span>
        </div>
      )}
    </div>
  );
}

const BAR_COLOR = "hsl(var(--primary))";
const BAR_COLOR_HIGHLIGHT = "hsl(var(--primary))";
const BAR_COLOR_MUTED = "hsl(var(--muted-foreground) / 0.35)";

function BarChartBlock({ c }: { c: AkademieBarchart }) {
  const data = c.daten.map((d) => ({ ...d, name: d.label }));
  const height = Math.max(160, data.length * 34);
  return (
    <div data-ui="card" className="rounded-lg border bg-card p-4 space-y-3 animate-fade-in">
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-md bg-primary/10 text-primary">
          <TrendingUp className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold">{c.titel}</div>
          {c.untertitel && <div className="text-xs text-muted-foreground">{c.untertitel}</div>}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
          <XAxis type="number" hide domain={[0, c.maxWert ?? "auto"]} />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 12, fill: "hsl(var(--foreground))" }}
            width={130}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted) / 0.5)" }}
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(v: number, _n, item: any) => [`${v}${c.einheit ?? ""}`, item?.payload?.hinweis ?? "Wert"]}
          />
          <Bar dataKey="wert" radius={[4, 4, 4, 4]} barSize={18}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.hervorheben ? BAR_COLOR_HIGHLIGHT : BAR_COLOR_MUTED} opacity={d.hervorheben ? 1 : 0.85} />
            ))}
            <LabelList
              dataKey="wert"
              position="right"
              formatter={(v: number) => `${v}${c.einheit ?? ""}`}
              style={{ fontSize: 11, fill: "hsl(var(--foreground))", fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const DONUT_PALETTE = ["hsl(var(--primary))", "hsl(217 91% 60%)", "hsl(160 84% 39%)", "hsl(38 92% 50%)", "hsl(340 82% 52%)", "hsl(262 83% 58%)"];

function DonutBlock({ d }: { d: AkademieDonut }) {
  const total = d.daten.reduce((s, x) => s + x.wert, 0);
  const data = d.daten.map((x, i) => ({ ...x, name: x.label, farbe: x.farbe ?? DONUT_PALETTE[i % DONUT_PALETTE.length] }));
  return (
    <div data-ui="card" className="rounded-lg border bg-card p-4 animate-fade-in">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-md bg-primary/10 text-primary">
          <PieIcon className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold">{d.titel}</div>
          {d.untertitel && <div className="text-xs text-muted-foreground">{d.untertitel}</div>}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 items-center">
        <div className="relative h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="wert"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={2}
                stroke="hsl(var(--background))"
                strokeWidth={2}
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.farbe} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          {(d.zentrumLabel || d.zentrumWert) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              {d.zentrumWert && <div className="text-xl font-bold tabular-nums">{d.zentrumWert}</div>}
              {d.zentrumLabel && <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{d.zentrumLabel}</div>}
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          {data.map((s, i) => {
            const pct = total > 0 ? Math.round((s.wert / total) * 100) : 0;
            return (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: s.farbe }} />
                <span className="flex-1 truncate">{s.label}</span>
                <span className="tabular-nums font-medium">{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const STATUS_STYLE: Record<NonNullable<AkademieTimeline["schritte"][number]["status"]>, { ring: string; dot: string; label: string }> = {
  start: { ring: "border-sky-500/40 bg-sky-500/10", dot: "bg-sky-500", label: "Start" },
  trigger: { ring: "border-amber-500/40 bg-amber-500/10", dot: "bg-amber-500", label: "Trigger" },
  ziel: { ring: "border-emerald-500/40 bg-emerald-500/10", dot: "bg-emerald-500", label: "Ziel" },
};

function TimelineBlock({ t }: { t: AkademieTimeline }) {
  return (
    <div data-ui="card" className="rounded-lg border bg-card p-4 space-y-3 animate-fade-in">
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-md bg-primary/10 text-primary">
          <GitBranch className="h-4 w-4" />
        </div>
        <div className="text-sm font-semibold">{t.titel}</div>
      </div>
      <div className="relative pl-4 space-y-3">
        <div className="absolute left-[7px] top-1 bottom-1 w-0.5 bg-gradient-to-b from-primary via-primary/50 to-primary/10" />
        {t.schritte.map((s, i) => {
          const st = s.status ? STATUS_STYLE[s.status] : null;
          return (
            <div key={i} className="relative">
              <div className={`absolute -left-4 top-0.5 h-3.5 w-3.5 rounded-full border-2 ${st ? st.ring : "border-primary/50 bg-primary/10"}`}>
                <div className={`absolute inset-0.5 rounded-full ${st ? st.dot : "bg-primary"}`} />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="text-sm font-medium">{s.label}</div>
                {s.dauer && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground tabular-nums">{s.dauer}</span>
                )}
                {st && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${st.ring}`}>{st.label}</span>
                )}
              </div>
              {s.beschreibung && (
                <div className="text-xs text-muted-foreground mt-0.5">{s.beschreibung}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VergleichBlock({ v }: { v: AkademieVergleich }) {
  return (
    <div data-ui="card" className="rounded-lg border bg-card p-4 space-y-3 animate-fade-in">
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-md bg-primary/10 text-primary">
          <ArrowRight className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold">{v.titel}</div>
          {v.untertitel && <div className="text-xs text-muted-foreground">{v.untertitel}</div>}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {[v.optionA, v.optionB].map((opt, idx) => (
          <div key={idx} className={`rounded-lg border p-3 ${idx === 1 ? "border-primary/40 bg-primary/5" : "border-muted bg-muted/20"}`}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-sm font-semibold">{opt.label}</div>
              {opt.badge && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${idx === 1 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{opt.badge}</span>
              )}
            </div>
            <ul className="space-y-1 text-xs">
              {opt.punkte.map((p, i) => (
                <li key={i} className="flex gap-1.5">
                  <CheckCircle2 className={`h-3 w-3 mt-0.5 shrink-0 ${idx === 1 ? "text-primary" : "text-muted-foreground"}`} />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
            {opt.ergebnis && (
              <div className={`mt-2 pt-2 border-t text-xs font-semibold tabular-nums ${idx === 1 ? "text-primary border-primary/30" : "text-foreground border-muted"}`}>
                {opt.ergebnis}
              </div>
            )}
          </div>
        ))}
      </div>
      {v.fazit && (
        <div className="flex items-start gap-2 text-xs text-foreground/90 pt-1">
          <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
          <span>{v.fazit}</span>
        </div>
      )}
    </div>
  );
}

export function AkademieVisualsBlock({ visuals, zeigeAdvanced }: { visuals: AkademieVisual[]; zeigeAdvanced: boolean }) {
  const sichtbar = visuals.filter((v) => zeigeAdvanced || !v.advanced);
  if (sichtbar.length === 0) return null;
  return (
    <div className="space-y-3">
      {sichtbar.map((v, i) => (
        <div key={i} className={v.advanced ? "relative" : undefined}>
          {v.advanced && (
            <div className="absolute -top-2 -right-2 z-10 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500 text-white shadow">
              Profi
            </div>
          )}
          {v.kpis && <KpiRow items={v.kpis} />}
          {v.beispielrechnung && <Beispielrechnung b={v.beispielrechnung} />}
          {v.barchart && <BarChartBlock c={v.barchart} />}
          {v.donut && <DonutBlock d={v.donut} />}
          {v.timeline && <TimelineBlock t={v.timeline} />}
          {v.vergleich && <VergleichBlock v={v.vergleich} />}
        </div>
      ))}
    </div>
  );
}