import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface Tranche {
  id: string;
  bezeichnung: string;
  betrag: number;
  zinssatz: number;
  tilgung: number;
}

interface MischzinsRechnerProps {
  /** Gesamtkaufpreis – wird als Basis für die Voreinstellung der Tranchen verwendet */
  gesamtKaufpreis?: number;
  /** Label für den Kontext (z.B. "Objekt" oder "WE 19") */
  kontextLabel?: string;
}

export function MischzinsRechner({ gesamtKaufpreis, kontextLabel }: MischzinsRechnerProps = {}) {
  const basis = gesamtKaufpreis || 250000;
  const kfwAnteil = Math.round(basis * 0.6);
  const bankAnteil = basis - kfwAnteil;

  const [tranchen, setTranchen] = useState<Tranche[]>([
    { id: "t1", bezeichnung: "KfW Darlehen", betrag: kfwAnteil, zinssatz: 0.01, tilgung: 2.29 },
    { id: "t2", bezeichnung: "Bankdarlehen", betrag: bankAnteil, zinssatz: 3.5, tilgung: 2.0 },
  ]);

  const addTranche = () =>
    setTranchen((p) => [...p, { id: `t${Date.now()}`, bezeichnung: "", betrag: 0, zinssatz: 0, tilgung: 0 }]);

  const update = (id: string, field: keyof Tranche, value: string) =>
    setTranchen((p) =>
      p.map((t) => (t.id === id ? { ...t, [field]: field === "bezeichnung" ? value : parseFloat(value) || 0 } : t))
    );

  const remove = (id: string) => setTranchen((p) => p.filter((t) => t.id !== id));

  const gesamtBetrag = tranchen.reduce((s, t) => s + t.betrag, 0);
  const gewichteterZins = gesamtBetrag > 0
    ? tranchen.reduce((s, t) => s + t.betrag * t.zinssatz, 0) / gesamtBetrag
    : 0;
  const gewichteteTilgung = gesamtBetrag > 0
    ? tranchen.reduce((s, t) => s + t.betrag * t.tilgung, 0) / gesamtBetrag
    : 0;
  const mischAnnuitaet = gewichteterZins + gewichteteTilgung;
  const monatsrate = (gesamtBetrag * mischAnnuitaet) / 100 / 12;

  const fmt = (v: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);

  return (
    <div className="space-y-4">
      <h3 className="font-bold">Mischzinsrechner{kontextLabel ? ` – ${kontextLabel}` : ""}</h3>
      <p className="text-sm text-muted-foreground">Berechne den gewichteten Mischzins aus mehreren Darlehenstranchen.</p>

      {tranchen.map((t, i) => (
        <Card key={t.id} className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">Tranche {i + 1}</span>
            {tranchen.length > 1 && (
              <Button variant="ghost" size="sm" className="text-destructive h-6 px-2 text-xs" onClick={() => remove(t.id)}>
                Entfernen
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><Label className="text-xs">Bezeichnung</Label><Input value={t.bezeichnung} onChange={(e) => update(t.id, "bezeichnung", e.target.value)} className="h-8" /></div>
            <div><Label className="text-xs">Betrag (€)</Label><Input type="number" value={t.betrag || ""} onChange={(e) => update(t.id, "betrag", e.target.value)} className="h-8" /></div>
            <div><Label className="text-xs">Zinssatz (%)</Label><Input type="number" step="0.01" value={t.zinssatz || ""} onChange={(e) => update(t.id, "zinssatz", e.target.value)} className="h-8" /></div>
            <div><Label className="text-xs">Tilgung (%)</Label><Input type="number" step="0.01" value={t.tilgung || ""} onChange={(e) => update(t.id, "tilgung", e.target.value)} className="h-8" /></div>
          </div>
        </Card>
      ))}

      <Button variant="outline" size="sm" onClick={addTranche}>+ Tranche hinzufügen</Button>

      <Card className="p-4 bg-primary/5 border-primary/30">
        <h4 className="font-bold mb-3">Ergebnis</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><span className="text-muted-foreground block">Gesamtbetrag</span><span className="font-bold text-lg">{fmt(gesamtBetrag)}</span></div>
          <div><span className="text-muted-foreground block">Mischzins</span><span className="font-bold text-lg">{gewichteterZins.toFixed(3)} %</span></div>
          <div><span className="text-muted-foreground block">Ø Tilgung</span><span className="font-bold text-lg">{gewichteteTilgung.toFixed(3)} %</span></div>
          <div><span className="text-muted-foreground block">Monatsrate</span><span className="font-bold text-lg">{fmt(monatsrate)}</span></div>
        </div>
      </Card>
    </div>
  );
}
