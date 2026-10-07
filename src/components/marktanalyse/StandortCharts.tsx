import { Card } from "@/components/ui/card";
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
  RadialBarChart, RadialBar, PolarAngleAxis as RPolarAngleAxis,
  PieChart, Pie, Legend,
} from "recharts";
import { Radar as RadarIcon, BarChart3, Gauge, PieChart as PieIcon } from "lucide-react";

type Props = {
  scores: { dim: string; wert: number }[];
  pois: { name: string; wert: number }[];
  rendite: number;
  eigentumsquote: number;
};

const CHART_COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2, 210 60% 55%))"];

export function StandortCharts({ scores, pois, rendite, eigentumsquote }: Props) {
  const renditeMax = 6; // Skala für Gauge
  const renditePct = Math.min(100, (rendite / renditeMax) * 100);
  const gaugeData = [{ name: "Rendite", value: renditePct, fill: "hsl(var(--primary))" }];
  const mixData = [
    { name: "Eigentum", value: eigentumsquote },
    { name: "Miete", value: 100 - eigentumsquote },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {/* Spinnennetz / Radar */}
      <Card className="p-4 xl:col-span-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
          <RadarIcon className="h-3.5 w-3.5" /> Standort-Profil (0–100)
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={scores} outerRadius="75%">
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis dataKey="dim" tick={{ fill: "hsl(var(--foreground))", fontSize: 11 }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
              <Radar name="Score" dataKey="wert" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.35} />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Rendite-Gauge */}
      <Card className="p-4">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
          <Gauge className="h-3.5 w-3.5" /> Bruttomietrendite
        </div>
        <div className="h-64 relative">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart innerRadius="70%" outerRadius="100%" data={gaugeData} startAngle={210} endAngle={-30}>
              <RPolarAngleAxis type="number" domain={[0, 100]} tick={false} />
              <RadialBar dataKey="value" cornerRadius={8} background={{ fill: "hsl(var(--muted))" }} />
            </RadialBarChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="text-3xl font-bold text-primary tabular-nums">{rendite.toFixed(2)} %</div>
            <div className="text-[10px] text-muted-foreground">Skala 0 – {renditeMax} %</div>
          </div>
        </div>
      </Card>

      {/* Eigentum vs Miete */}
      <Card className="p-4">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
          <PieIcon className="h-3.5 w-3.5" /> Wohnform-Mix
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={mixData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                {mixData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => `${v.toFixed(0)} %`} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* POI Barchart */}
      <Card className="p-4 xl:col-span-4">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
          <BarChart3 className="h-3.5 w-3.5" /> Infrastruktur-Dichte · POIs im 2 km Umkreis
        </div>
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={pois} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
              <Bar dataKey="wert" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}