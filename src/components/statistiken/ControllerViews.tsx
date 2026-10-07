import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { nameOf, type Row } from "@/lib/statistikController";
import { tarnName, unscharfKlasse } from "@/lib/vorfuehrmodus";
export const number = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(n);
export const euro = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(n);
export const percent = (n: number | null) =>
  n === null ? "—" : `${number(n)} %`;
export function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {note && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {note}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}
export function Metric({
  label,
  value,
  note,
  current,
  previous,
  onClick,
}: {
  label: string;
  value: string;
  note: string;
  current?: number;
  previous?: number;
  onClick?: () => void;
}) {
  const change =
    current !== undefined && previous !== undefined ? current - previous : null;
  const content = (
    <>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p
        className={unscharfKlasse(
          "text-2xl lg:text-3xl font-semibold tabular-nums break-words my-2",
        )}
      >
        {value}
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">{note}</p>
      {change !== null && (
        <p className="text-xs mt-2 tabular-nums">
          {change > 0 ? "+" : ""}
          {number(change)} zum Vorzeitraum ·{" "}
          {previous === 0
            ? "Prozentvergleich ohne Basis"
            : `${change > 0 ? "+" : ""}${number((change / previous!) * 100)} %`}
        </p>
      )}
    </>
  );
  return onClick ? (
    <button data-ui="card"
      className="rounded-xl border bg-card p-4 text-left hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      onClick={onClick}
      aria-label={`${label}: ${value}. Datensätze anzeigen`}
    >
      {content}
    </button>
  ) : (
    <div data-ui="card" className="rounded-xl border bg-card p-4">{content}</div>
  );
}
export function Chart({
  title,
  note,
  rows,
  monetary = false,
  temporal = false,
  onSelect,
}: {
  title: string;
  note: string;
  rows: { label: string; count: number }[];
  monetary?: boolean;
  temporal?: boolean;
  onSelect?: (label: string) => void;
}) {
  const [view, setView] = useState(temporal ? "line" : "bar");
  const format = monetary ? euro : number;
  return (
    <Section title={title} note={note}>
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label={`Darstellung: ${title}`}
      >
        {[
          ["bar", "Balken"],
          ...(temporal ? [["line", "Verlauf"]] : []),
          ["table", "Tabelle"],
        ].map(([id, label]) => (
          <Button
            key={id}
            size="sm"
            variant={view === id ? "default" : "outline"}
            aria-pressed={view === id}
            onClick={() => setView(id)}
          >
            {label}
          </Button>
        ))}
      </div>
      {!rows.length ? (
        <p className="text-sm text-muted-foreground">
          Keine Daten für diese Auswahl.
        </p>
      ) : view === "table" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                <th className="text-left py-2">
                  {temporal ? "Zeitraum" : "Kategorie"}
                </th>
                <th className="text-right">{monetary ? "Betrag" : "Anzahl"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-t">
                  <td className="py-2">
                    {onSelect ? (
                      <button
                        className="text-primary underline text-left"
                        onClick={() => onSelect(r.label)}
                      >
                        {r.label}
                      </button>
                    ) : (
                      r.label
                    )}
                  </td>
                  <td className={unscharfKlasse("text-right tabular-nums")}>
                    {format(r.count)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          role="img"
          aria-label={`${title}. Exakte Werte über die Tabellenansicht.`}
          className={unscharfKlasse("w-full min-w-0")}
          style={{ height: temporal ? 280 : Math.max(240, rows.length * 30) }}
        >
          <ResponsiveContainer width="100%" height="100%">
            {view === "line" ? (
              <LineChart
                data={rows}
                margin={{ left: 12, right: 20, bottom: 25 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" fontSize={11} minTickGap={40} />
                <YAxis
                  width={85}
                  tickFormatter={(v) => format(v)}
                  fontSize={11}
                />
                <Tooltip formatter={(v: number) => format(v)} />
                <Line
                  name={monetary ? "Betrag" : "Anzahl"}
                  type="linear"
                  dataKey="count"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={rows.length < 15}
                  isAnimationActive={false}
                />
              </LineChart>
            ) : (
              <BarChart
                data={rows}
                layout={temporal ? "horizontal" : "vertical"}
                margin={{ left: 8, right: 20, bottom: 15 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={temporal}
                  vertical={!temporal}
                />
                {temporal ? (
                  <>
                    <XAxis dataKey="label" fontSize={11} minTickGap={40} />
                    <YAxis
                      width={85}
                      tickFormatter={(v) => format(v)}
                      fontSize={11}
                    />
                  </>
                ) : (
                  <>
                    <XAxis
                      type="number"
                      tickFormatter={(v) => format(v)}
                      fontSize={11}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={145}
                      fontSize={11}
                    />
                  </>
                )}
                <Tooltip formatter={(v: number) => format(v)} />
                <Bar
                  name={monetary ? "Betrag" : "Anzahl"}
                  dataKey="count"
                  fill="hsl(var(--primary))"
                  radius={[0, 3, 3, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </Section>
  );
}
export function Records({
  title,
  rows,
  onClose,
}: {
  title: string;
  rows: Row[];
  onClose: () => void;
}) {
  const [page, setPage] = useState(0);
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {rows.length} Datensätze aus der gewählten Auswertung.
          </DialogDescription>
        </DialogHeader>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left">Vorgang</th>
              <th className="text-left">Bezug</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(page * 50, page * 50 + 50).map((r) => (
              <tr key={r.id} className="border-t">
                <td className="py-3">{tarnName(nameOf(r), "kunde")}</td>
                <td>
                  {r.kunde_id || r.vorname || r.nachname ? (
                    <Link
                      className="text-primary underline"
                      to={`/kunden/${r.kunde_id || r.id}`}
                    >
                      Kundenprofil öffnen
                    </Link>
                  ) : (
                    <span>{r.label || r.status || "—"}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p>Keine Datensätze für diese Auswahl.</p>}
        <div className="flex justify-between items-center">
          <Button
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Zurück
          </Button>
          <span className="text-sm">
            Seite {page + 1} von {Math.max(1, Math.ceil(rows.length / 50))}
          </span>
          <Button
            variant="outline"
            disabled={(page + 1) * 50 >= rows.length}
            onClick={() => setPage(page + 1)}
          >
            Weiter
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
