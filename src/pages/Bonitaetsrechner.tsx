import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CreditCard, Download, Info } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { bankLebenshaltung, rahmenAusUeberschuss, RAHMEN_PUFFER, RAHMEN_ANNUITAET } from "@/lib/finanzierbarkeitUtils";

const EINNAHME_FELDER = [
  "Lohn/Gehalt (netto)",
  "Einkünfte aus selbst. Tätigkeit",
  "Renten",
  "Zinserträge",
  "Kindergeld",
  "Mieteinnahmen 1",
  "Mieteinnahmen 2",
  "Mieteinnahmen 3",
  "Sonstige Einnahmen",
];

const AUSGABE_FELDER = [
  "Miete",
  "Lebenshaltungskosten",
  "Fahrzeugleasing",
  "Ratenkredit 1",
  "Ratenkredit 2",
  "Zins/Tilgung 1",
  "Zins/Tilgung 2",
  "Kinder (300 € pauschal)",
];

const BONITAETSKLASSEN = [
  { klasse: "A+", min: 1000000, label: "Ab 1.000.000 €", color: "text-green-500" },
  { klasse: "A", min: 500000, label: "Ab 500.000 €", color: "text-green-400" },
  { klasse: "B", min: 200000, label: "Ab 200.000 €", color: "text-yellow-500" },
  { klasse: "C", min: 150000, label: "Bis 200.000 €", color: "text-orange-500" },
  { klasse: "D", min: 0, label: "Bis 150.000 €", color: "text-red-500" },
];

const ASSETKLASSEN = [
  { icon: "🏛", name: "Denkmalschutz" },
  { icon: "🏗", name: "Neubau" },
  { icon: "🏢", name: "Kontor Klasse" },
  { icon: "✨", name: "Konzept Klasse" },
  { icon: "🏚", name: "WPB (Worst Performing Building)" },
  { icon: "🏡", name: "Sanierter Altbau" },
  { icon: "🏘", name: "Mehrfamilienhaus" },
  { icon: "⚡", name: "Effizienzklasse" },
];

function getBonitaetsklasse(investitionsrahmen: number): { klasse: string; color: string } {
  if (investitionsrahmen >= 1000000) return { klasse: "A+", color: "text-green-500" };
  if (investitionsrahmen >= 500000) return { klasse: "A", color: "text-green-400" };
  if (investitionsrahmen >= 200000) return { klasse: "B", color: "text-yellow-500" };
  if (investitionsrahmen >= 150000) return { klasse: "C", color: "text-orange-500" };
  return { klasse: "D", color: "text-red-500" };
}

const Bonitaetsrechner = () => {
  const [einnahmen1, setEinnahmen1] = useState<number[]>(Array(EINNAHME_FELDER.length).fill(0));
  const [einnahmen2, setEinnahmen2] = useState<number[]>(Array(EINNAHME_FELDER.length).fill(0));
  const [ausgaben1, setAusgaben1] = useState<number[]>(Array(AUSGABE_FELDER.length).fill(0));
  const [ausgaben2, setAusgaben2] = useState<number[]>(Array(AUSGABE_FELDER.length).fill(0));
  const [ek1, setEk1] = useState<number>(0);
  const [ek2, setEk2] = useState<number>(0);

  const berechnungen = useMemo(() => {
    const sumEin1 = einnahmen1.reduce((a, b) => a + b, 0);
    const sumEin2 = einnahmen2.reduce((a, b) => a + b, 0);
    const sumAus1 = ausgaben1.reduce((a, b) => a + b, 0);
    const sumAus2 = ausgaben2.reduce((a, b) => a + b, 0);

    // Lebenshaltungskosten nach Bankansatz: 30 Prozent vom Netto, mindestens
    // 800 Euro. Dieselbe Regel wie in der Kundenakte, damit hier nicht eine
    // andere Zahl herauskommt als dort. Feld 0 ist die Miete, Feld 1 die
    // Lebenshaltung, Einnahmefeld 0 ist das Nettogehalt.
    const ersetzeLebenshaltung = (ausg: number[], netto: number) =>
      ausg[0] + bankLebenshaltung(ausg[1], netto) + ausg.slice(2).reduce((a, b) => a + b, 0);
    const effAus1 = ersetzeLebenshaltung(ausgaben1, einnahmen1[0]);
    const effAus2 = ersetzeLebenshaltung(ausgaben2, einnahmen2[0]);

    const ueberschuss1 = sumEin1 - effAus1;
    const ueberschuss2 = sumEin2 - effAus2;
    const ueberschussGesamt = ueberschuss1 + ueberschuss2;

    // Monatlich max tragbare Belastung, Sicherheitspuffer aus finanzierbarkeitUtils
    const maxBelastung = ueberschussGesamt * RAHMEN_PUFFER;

    // Eigenkapital ist ein einmaliger Bestand (kein monatlicher Cashflow)
    // und fließt NICHT in Überschuss / Bonität ein, sondern nur in den Investitionsrahmen.
    const eigenkapitalGesamt = (ek1 || 0) + (ek2 || 0);

    // Bonität (%)
    const einnahmenGesamt = sumEin1 + sumEin2;
    const bonitaetProzent = einnahmenGesamt > 0 ? (ueberschussGesamt / einnahmenGesamt) * 100 : 0;

    // Investitionsrahmen: jaehrliche Rate geteilt durch die Annuitaet, dann
    // plus Eigenkapital. Die Annuitaet kommt aus finanzierbarkeitUtils, damit
    // Rechner, Kundenakte, Kundenportal und Praesentation dieselbe Zahl zeigen.
    const annuitaet = RAHMEN_ANNUITAET;
    const maxDarlehen = ueberschussGesamt > 0 ? rahmenAusUeberschuss(ueberschussGesamt).maxDarlehen : 0;
    const investitionsrahmen = maxDarlehen + eigenkapitalGesamt;

    // Asset classes recommendation based on Investitionsrahmen
    const assetMin = investitionsrahmen * 0.7;
    const assetMax = investitionsrahmen * 1.1;

    const bonitaetsklasse = getBonitaetsklasse(investitionsrahmen);

    return {
      sumEin1, sumEin2, sumAus1: effAus1, sumAus2: effAus2,
      ueberschussGesamt, maxBelastung, eigenkapitalGesamt,
      bonitaetProzent, bonitaetsklasse, investitionsrahmen,
      assetMin, assetMax,
    };
  }, [einnahmen1, einnahmen2, ausgaben1, ausgaben2, ek1, ek2]);

  const fmt = (v: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);

  const renderInputGroup = (
    felder: string[],
    werte: number[],
    setWerte: React.Dispatch<React.SetStateAction<number[]>>,
    hinweis?: Record<number, string>,
  ) => (
    <div className="space-y-3">
      {felder.map((feld, i) => (
        <div key={feld}>
          <Label className="text-xs font-semibold text-primary">{feld}:</Label>
          <Input
            type="number"
            min={0}
            value={werte[i] || ""}
            onChange={e => {
              const v = [...werte];
              v[i] = parseFloat(e.target.value) || 0;
              setWerte(v);
            }}
            className="mt-1 bg-muted/50"
          />
          {hinweis?.[i] && (
            <p className="text-[10px] text-orange-400 mt-0.5 flex items-center gap-1">
              <Info className="h-3 w-3" /> {hinweis[i]}
            </p>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Bonitätsrechner"
          subtitle="Berechne die Bonität und den maximalen Investitionsrahmen deines Kunden"
        />

        {/* Two-column input */}
        <div className="grid grid-cols-2 gap-6">
          {/* Antragsteller 1 */}
          <Card className="p-5 bg-card border-2 border-primary/20">
            <h2 className="text-lg font-bold text-primary text-center mb-4">1. Antragsteller</h2>

            <h3 className="font-semibold mb-3">Einnahmen</h3>
            {renderInputGroup(EINNAHME_FELDER, einnahmen1, setEinnahmen1)}
            <div className="mt-3 text-center">
              <p className="text-sm font-semibold text-primary">Summe Einnahmen: {fmt(berechnungen.sumEin1)}</p>
            </div>

            <Separator className="my-4" />

            <div>
              <Label className="text-xs font-semibold text-primary">Eigenkapital nachweislich (einmalig):</Label>
              <Input
                type="number"
                min={0}
                value={ek1 || ""}
                onChange={e => setEk1(parseFloat(e.target.value) || 0)}
                className="mt-1 bg-muted/50"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                <Info className="h-3 w-3" /> Wird nur zum Investitionsrahmen addiert, nicht zum monatlichen Überschuss.
              </p>
            </div>

            <Separator className="my-4" />

            <h3 className="font-semibold mb-3">Ausgaben</h3>
            {renderInputGroup(AUSGABE_FELDER, ausgaben1, setAusgaben1, {
              1: "Die Bank setzt mindestens 30 % des Nettoeinkommens an, mindestens aber 800 €.",
            })}
            <div className="mt-3 text-center">
              <p className="text-sm font-semibold text-primary">Summe Ausgaben: {fmt(berechnungen.sumAus1)}</p>
            </div>
          </Card>

          {/* Antragsteller 2 */}
          <Card className="p-5 bg-card border-2 border-primary/20">
            <h2 className="text-lg font-bold text-primary text-center mb-4">2. Antragsteller</h2>

            <h3 className="font-semibold mb-3">Einnahmen</h3>
            {renderInputGroup(EINNAHME_FELDER, einnahmen2, setEinnahmen2)}
            <div className="mt-3 text-center">
              <p className="text-sm font-semibold text-primary">Summe Einnahmen: {fmt(berechnungen.sumEin2)}</p>
            </div>

            <Separator className="my-4" />

            <div>
              <Label className="text-xs font-semibold text-primary">Eigenkapital nachweislich (einmalig):</Label>
              <Input
                type="number"
                min={0}
                value={ek2 || ""}
                onChange={e => setEk2(parseFloat(e.target.value) || 0)}
                className="mt-1 bg-muted/50"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                <Info className="h-3 w-3" /> Wird nur zum Investitionsrahmen addiert, nicht zum monatlichen Überschuss.
              </p>
            </div>

            <Separator className="my-4" />

            <h3 className="font-semibold mb-3">Ausgaben</h3>
            {renderInputGroup(AUSGABE_FELDER, ausgaben2, setAusgaben2, {
              1: "Die Bank setzt mindestens 30 % des Nettoeinkommens an, mindestens aber 800 €.",
            })}
            <div className="mt-3 text-center">
              <p className="text-sm font-semibold text-primary">Summe Ausgaben: {fmt(berechnungen.sumAus2)}</p>
            </div>
          </Card>
        </div>

        {/* Ergebnis */}
        <Card className="p-6 bg-muted/30 border-2 text-center space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Überschuss gesamt:</p>
            <p className="text-3xl font-bold text-primary">{fmt(berechnungen.ueberschussGesamt)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Monatlich maximal tragbare Belastung:</p>
            <p className="text-3xl font-bold text-primary">{fmt(berechnungen.maxBelastung)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Gesamtes Eigenkapital nachweislich:</p>
            <p className="text-3xl font-bold text-primary">{fmt(berechnungen.eigenkapitalGesamt)}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Die Bank berücksichtigt einen Sicherheitspuffer – d. h. nur ca. 80 % deines verfügbaren Überschusses werden angesetzt.
          </p>
        </Card>

        {/* Bonitätsberechnung */}
        <Card className="p-6 bg-muted/30 border-2 text-center space-y-4">
          <h2 className="text-xl font-bold text-primary">Bonitätsberechnung</h2>
          <div>
            <p className="text-sm text-muted-foreground">Bonität (%)</p>
            <p className="text-4xl font-bold text-primary">{berechnungen.bonitaetProzent.toFixed(0)} %</p>
            <p className="text-xs text-muted-foreground mt-1">Formel: (Überschuss / Einnahmen) × 100</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Bonitätsklasse</p>
            <p className={`text-4xl font-bold ${berechnungen.bonitaetsklasse.color}`}>{berechnungen.bonitaetsklasse.klasse}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Min: {fmt(berechnungen.assetMin)} | Max: {fmt(berechnungen.assetMax)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <p className="text-sm text-muted-foreground">Empfohlener Investitionsrahmen:</p>
              <p className="text-2xl font-bold text-primary">{fmt(berechnungen.investitionsrahmen)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Empfohlene Assetklassen:</p>
              <div className="flex flex-wrap gap-1 mt-1 justify-center">
                {ASSETKLASSEN.filter(() => berechnungen.investitionsrahmen > 0).map(a => (
                  <Badge key={a.name} variant="outline" className="text-xs">{a.icon} {a.name}</Badge>
                ))}
              </div>
            </div>
          </div>

          <Button className="mt-4"><Download className="h-4 w-4 mr-2" /> Als PDF speichern</Button>
        </Card>

        {/* Referenztabellen */}
        <div className="grid grid-cols-2 gap-4">
          <Card className="p-5">
            <h3 className="font-semibold mb-3">Bonitätsklassen Übersicht</h3>
            <div className="space-y-2 text-sm">
              {BONITAETSKLASSEN.map(b => (
                <div key={b.klasse} className="flex justify-between">
                  <span>{b.label}</span>
                  <span className={`font-bold ${b.color}`}>{b.klasse}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="font-semibold mb-3">Assetklassen Übersicht</h3>
            <div className="space-y-2 text-sm">
              {ASSETKLASSEN.map(a => (
                <div key={a.name} className="flex items-center gap-2">
                  <span>{a.icon}</span>
                  <span>{a.name}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Bonitaetsrechner;
