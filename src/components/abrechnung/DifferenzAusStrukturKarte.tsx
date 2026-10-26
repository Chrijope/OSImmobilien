// Differenz aus der Struktur (16.10.2026), wie sie in den Monatsbescheiden
// steht. Der Teamleiter sieht die Kunden seiner Struktur nicht; deshalb kommt
// die Differenz aus dem Bescheid, den Buchhaltung oder Admin erstellen, und
// nennt Partner und Objekt statt des Kunden.

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getAbrechnungen, monatLabel } from "@/lib/provisionsAbrechnungStore";

const eur = (v: number) => v.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const STATUS: Record<string, string> = { offen: "Offen", freigegeben: "Freigegeben", ausgezahlt: "Bezahlt" };

export function DifferenzAusStrukturKarte({ userId }: { userId: string }) {
  const bescheide = getAbrechnungen()
    .filter((a) => a.userId === userId && a.overridesErhalten.length > 0)
    .sort((a, b) => b.monat.localeCompare(a.monat));
  if (bescheide.length === 0) return null;
  return (
    <Card data-testid="differenz-aus-struktur">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold font-sans">Differenz aus deiner Struktur</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {bescheide.map((b) => (
          <div key={b.id} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-medium">{monatLabel(b.monat)}</span>
              <span className="flex items-center gap-2">
                <Badge variant="outline" className="text-bildunterschrift">{STATUS[b.status] ?? b.status}</Badge>
                <span className="font-semibold text-primary tabular-nums">{eur(b.summeOverridesErhalten)}</span>
              </span>
            </div>
            {b.overridesErhalten.map((o, i) => (
              <div key={i} className="flex justify-between text-xs text-muted-foreground border-b border-border/50 py-1">
                <span>{o.juniorName} · {o.objekt || o.kundeName}</span>
                <span className="tabular-nums">{String(o.overridePercent).replace(".", ",")} % von {eur(o.kaufpreis)} = {eur(o.betrag)}</span>
              </div>
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
