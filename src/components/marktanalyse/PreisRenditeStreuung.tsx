// Kaufpreis gegen Rendite, ein Punkt je Standort.
//
// Die eigentliche Frage im Ankauf lautet nicht "was kostet der Quadratmeter",
// sondern "was bekomme ich für den Preis". In einer Liste von 351 Zeilen ist
// das nicht zu sehen, in einem Streudiagramm auf einen Blick: Der Zusammenhang
// ist eine fallende Kurve, und interessant sind die Punkte, die deutlich über
// ihr liegen.

import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from "recharts";
import { bruttomietrendite, type Standort } from "@/data/marktanalyseSeed";

interface Punkt {
  id: string;
  name: string;
  bundesland: string;
  preis: number;
  rendite: number;
  einwohner: number;
  markiert: boolean;
}

export function PreisRenditeStreuung({
  standorte,
  markiert = [],
  onWaehlen,
  hoehe = 340,
}: {
  standorte: Standort[];
  markiert?: string[];
  onWaehlen?: (id: string) => void;
  hoehe?: number;
}) {
  const punkte: Punkt[] = standorte
    .filter((s) => s.kaufpreis_qm_wohnung_eur > 0 && s.miete_qm_eur > 0)
    .map((s) => ({
      id: s.id,
      name: s.name,
      bundesland: s.bundesland,
      preis: s.kaufpreis_qm_wohnung_eur,
      rendite: Number(bruttomietrendite(s).toFixed(2)),
      einwohner: s.einwohner,
      markiert: markiert.includes(s.id),
    }));

  if (punkte.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Keine Standorte mit Preis und Miete in der Auswahl.
      </p>
    );
  }

  const medianRendite =
    [...punkte].sort((a, b) => a.rendite - b.rendite)[Math.floor(punkte.length / 2)].rendite;

  return (
    <div>
      <ResponsiveContainer width="100%" height={hoehe}>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis
            type="number"
            dataKey="preis"
            name="Kaufpreis"
            unit=" €/m²"
            tick={{ fontSize: 11 }}
            label={{ value: "Kaufpreis €/m²", position: "insideBottom", offset: -14, fontSize: 11 }}
          />
          <YAxis
            type="number"
            dataKey="rendite"
            name="Rendite"
            unit=" %"
            tick={{ fontSize: 11 }}
            label={{ value: "Bruttomietrendite", angle: -90, position: "insideLeft", fontSize: 11 }}
          />
          <ZAxis type="number" dataKey="einwohner" range={[30, 400]} />
          <ReferenceLine
            y={medianRendite}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="4 4"
            label={{ value: `Median ${medianRendite.toFixed(2)} %`, fontSize: 10, position: "right" }}
          />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={({ payload }) => {
              const p = payload?.[0]?.payload as Punkt | undefined;
              if (!p) return null;
              return (
                <div className="rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-md">
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-muted-foreground">{p.bundesland}</div>
                  <div className="mt-1 tabular-nums">
                    {p.preis.toLocaleString("de-DE")} €/m² · {p.rendite.toFixed(2)} %
                  </div>
                  <div className="tabular-nums text-muted-foreground">
                    {p.einwohner.toLocaleString("de-DE")} Einwohner
                  </div>
                </div>
              );
            }}
          />
          <Scatter
            data={punkte}
            onClick={(d: any) => onWaehlen?.(d?.id)}
            cursor={onWaehlen ? "pointer" : undefined}
          >
            {punkte.map((p) => (
              <Cell
                key={p.id}
                fill={p.markiert ? "hsl(var(--primary))" : "hsl(var(--primary) / 0.35)"}
                stroke={p.markiert ? "hsl(var(--primary))" : "transparent"}
                strokeWidth={p.markiert ? 2 : 0}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      <p className="text-[11px] text-muted-foreground mt-1">
        Jeder Punkt ist ein Standort, die Größe steht für die Einwohnerzahl. Punkte oberhalb der
        Medianlinie liefern für ihren Preis überdurchschnittlich viel Rendite.
      </p>
    </div>
  );
}
