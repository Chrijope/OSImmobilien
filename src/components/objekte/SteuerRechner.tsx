import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart, ComposedChart } from "recharts";
import { Download, TrendingUp, Percent, Building2, Calculator, PiggyBank, ChevronDown, ChevronUp, Wallet } from "lucide-react";
import jsPDF from "jspdf";
import { EuroInput } from "@/components/ui/euro-input";
import { estimateGrenzsteuersatz, reverseSteuersatzZuZvE, berechneSteuerersparnis } from "@/lib/steuerHelper";

const fmt = (v: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);

const fmtPct = (v: number) => `${v.toFixed(2)} %`;

interface SteuerRechnerProps {
  /** "objekt" = aggregiert über alle Wohnungen, "wohnung" = einzelne WE */
  modus: "objekt" | "wohnung";
  kaufpreis: number;
  mieteJahr: number;          // Jahresnettomiete
  nebenkosten?: number;       // Kaufnebenkosten (default 5%)
  grundAnteilt?: number;      // Grundstücksanteil % (default 20%)
  hausgeldJahr?: number;      // Hausgeld p.a. (nicht umlegbar)
  zinsSatz?: number;          // Darlehenszins p.a.
  tilgungsSatz?: number;      // Tilgung p.a.
  eigenkapital?: number;      // EK-Anteil
  objektTitel: string;
  weNr?: string;
}

interface JahresZeile {
  jahr: number;
  afa: number;
  zinsen: number;
  hausgeld: number;
  abzuegeSumme: number;
  steuerersparnis: number;
  miete: number;
  cashflowBrutto: number;
  cashflowNetto: number;
  vermoegenAufbau: number;
  restschuld: number;
  renditeNachSteuer: number;
  eigenbelastungMonat: number;
}

export function SteuerRechner({
  modus,
  kaufpreis,
  mieteJahr,
  nebenkosten,
  grundAnteilt,
  hausgeldJahr,
  zinsSatz,
  tilgungsSatz,
  eigenkapital,
  objektTitel,
  weNr,
}: SteuerRechnerProps) {
  const [zvE, setZvE] = useState<number>(reverseSteuersatzZuZvE(42, false));
  const [verheiratet, setVerheiratet] = useState<boolean>(false);
  const steuersatz = useMemo(() => estimateGrenzsteuersatz(zvE, verheiratet), [zvE, verheiratet]);
  const [betrachtungszeitraum, setBetrachtungszeitraum] = useState<10 | 20 | 30>(10);
  const [mietSteigerung, setMietSteigerung] = useState(2);        // % p.a.
  const [wertSteigerung, setWertSteigerung] = useState(2);          // % p.a.
  const [soli, setSoli] = useState(true);                           // Solidaritätszuschlag
  const [kirchensteuer, setKirchensteuer] = useState(false);        // Kirchensteuer 8/9%
  const [showTable, setShowTable] = useState(false);

  // Defaults
  const nkPct = nebenkosten ?? 5;
  const grundPct = grundAnteilt ?? 20;
  const hg = hausgeldJahr ?? Math.round(mieteJahr * 0.25);
  const zins = zinsSatz ?? 3.5;
  const tilg = tilgungsSatz ?? 2.0;
  const ek = eigenkapital ?? Math.round(kaufpreis * 0.2);

  const gesamtkosten = kaufpreis * (1 + nkPct / 100);
  const darlehen = gesamtkosten - ek;
  const gebaeudeAnteil = kaufpreis * (1 - grundPct / 100);
  const afaJahr = gebaeudeAnteil * 0.02; // 2% linear

  // Effektiver Steuersatz inkl. Soli + Kirchensteuer
  const soliPct = soli ? 5.5 : 0;
  const kirchePct = kirchensteuer ? 9 : 0;
  const effektiverSteuersatz = steuersatz * (1 + soliPct / 100 + kirchePct / 100);

  const berechnung = useMemo((): JahresZeile[] => {
    const rows: JahresZeile[] = [];
    let restschuld = darlehen;
    let kumulativTilgung = 0;

    for (let j = 1; j <= betrachtungszeitraum; j++) {
      const mietEinnahme = mieteJahr * Math.pow(1 + mietSteigerung / 100, j - 1);
      const zinsenJahr = restschuld * (zins / 100);
      const annuitaet = darlehen * ((zins + tilg) / 100);
      const tilgungJahr = Math.min(annuitaet - zinsenJahr, restschuld);

      const afa = j <= 50 ? afaJahr : 0;
      const abzuege = afa + zinsenJahr + hg;
      const zuVersteuerndesEinkommen = mietEinnahme - abzuege;
      // Differenzmethode §32a EStG: exakte Steuerersparnis aus zvE
      const minderung = -zuVersteuerndesEinkommen; // Verlust > 0
      const uplift = steuersatz > 0 ? effektiverSteuersatz / steuersatz : 1;
      const { ersparnis } = berechneSteuerersparnis(zvE, minderung, verheiratet);
      const steuerersparnis = ersparnis * uplift;

      const cashflowBrutto = mietEinnahme - annuitaet - hg;
      const cashflowNetto = cashflowBrutto + steuerersparnis;

      // Eigenbelastung = was der Eigentümer monatlich tatsächlich aus eigener Tasche zahlt
      const eigenbelastungMonat = cashflowNetto < 0 ? Math.abs(cashflowNetto) / 12 : 0;

      restschuld = Math.max(0, restschuld - tilgungJahr);
      kumulativTilgung += tilgungJahr;

      const immobilienWert = kaufpreis * Math.pow(1 + wertSteigerung / 100, j);
      const vermoegenAufbau = immobilienWert - restschuld - kaufpreis + kumulativTilgung;

      const renditeNachSteuer = ek > 0
        ? ((cashflowNetto + tilgungJahr + (kaufpreis * (wertSteigerung / 100))) / ek) * 100
        : 0;

      rows.push({
        jahr: j,
        afa,
        zinsen: zinsenJahr,
        hausgeld: hg,
        abzuegeSumme: abzuege,
        steuerersparnis,
        miete: mietEinnahme,
        cashflowBrutto,
        cashflowNetto,
        vermoegenAufbau,
        restschuld,
        renditeNachSteuer,
        eigenbelastungMonat,
      });
    }
    return rows;
  }, [steuersatz, zvE, verheiratet, betrachtungszeitraum, mietSteigerung, wertSteigerung, kaufpreis, mieteJahr, darlehen, zins, tilg, hg, afaJahr, ek, effektiverSteuersatz, soli, kirchensteuer]);

  // Summary stats
  const totalSteuerersparnis = berechnung.reduce((s, r) => s + r.steuerersparnis, 0);
  const totalCashflow = berechnung.reduce((s, r) => s + r.cashflowNetto, 0);
  const avgRendite = berechnung.reduce((s, r) => s + r.renditeNachSteuer, 0) / berechnung.length;
  const eigenbelastungJ1 = berechnung[0]?.eigenbelastungMonat || 0;
  const lastRow = berechnung[berechnung.length - 1];

  // Chart data
  const chartData = berechnung.map(r => ({
    name: `J${r.jahr}`,
    Steuerersparnis: Math.round(r.steuerersparnis),
    "Cashflow netto": Math.round(r.cashflowNetto),
    Vermögensaufbau: Math.round(r.vermoegenAufbau),
    AfA: Math.round(r.afa),
    Zinsen: Math.round(r.zinsen),
    Miete: Math.round(r.miete),
  }));

  const handleExportPdf = () => {
    const doc = new jsPDF();
    const title = modus === "wohnung" ? `Investment-Analyse – ${objektTitel} – WE ${weNr}` : `Investment-Analyse – ${objektTitel}`;
    
    doc.setFontSize(16);
    doc.text(title, 14, 20);
    doc.setFontSize(10);
    doc.text(`Erstellt am: ${new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}`, 14, 28);
    doc.text(`Steuersatz: ${steuersatz}% (eff. ${effektiverSteuersatz.toFixed(1)}%) | Zeitraum: ${betrachtungszeitraum} Jahre`, 14, 34);

    // Summary
    doc.setFontSize(12);
    doc.text("Zusammenfassung", 14, 45);
    doc.setFontSize(10);
    doc.text(`Kaufpreis: ${fmt(kaufpreis)}`, 14, 52);
    doc.text(`Eigenkapital: ${fmt(ek)}`, 14, 58);
    doc.text(`Darlehen: ${fmt(darlehen)}`, 14, 64);
    doc.text(`AfA p.a.: ${fmt(afaJahr)}`, 14, 70);
    doc.text(`Steuerersparnis gesamt: ${fmt(totalSteuerersparnis)}`, 14, 76);
    doc.text(`Cashflow netto gesamt: ${fmt(totalCashflow)}`, 14, 82);
    doc.text(`Ø Rendite nach Steuern: ${fmtPct(avgRendite)}`, 14, 88);
    doc.text(`Vermögensaufbau: ${fmt(lastRow?.vermoegenAufbau || 0)}`, 14, 94);

    // Table
    let y = 108;
    doc.setFontSize(11);
    doc.text("Jahresübersicht", 14, y);
    y += 8;
    doc.setFontSize(7);
    const headers = ["Jahr", "Miete", "AfA", "Zinsen", "Steuervortel.", "CF netto", "Restschuld", "Vermögen"];
    const colW = [12, 22, 22, 22, 24, 22, 24, 24];
    let x = 14;
    headers.forEach((h, i) => { doc.text(h, x, y); x += colW[i]; });
    y += 5;

    berechnung.forEach(r => {
      if (y > 280) { doc.addPage(); y = 20; }
      x = 14;
      const vals = [
        String(r.jahr), fmt(r.miete), fmt(r.afa), fmt(r.zinsen),
        fmt(r.steuerersparnis), fmt(r.cashflowNetto), fmt(r.restschuld), fmt(r.vermoegenAufbau),
      ];
      vals.forEach((v, i) => { doc.text(v, x, y); x += colW[i]; });
      y += 5;
    });

    doc.save(`steuerliche-betrachtung-${objektTitel.replace(/\s/g, "-").toLowerCase()}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card className="p-5">
        <h4 className="font-bold text-sm mb-4 flex items-center gap-2">
          <Calculator className="h-4 w-4 text-primary" />
          Parameter anpassen
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">Zu versteuerndes Einkommen</Label>
            <EuroInput value={zvE} onChange={setZvE} placeholder="60.000" />
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" className="accent-primary"
                checked={verheiratet} onChange={e => setVerheiratet(e.target.checked)} />
              Verheiratet (Splittingtarif)
            </label>
            <p className="text-[11px] text-muted-foreground">
              Grenzsteuersatz: <strong className="text-primary">{steuersatz} %</strong>
            </p>
          </div>
          <div>
            <Label className="text-xs">Mietsteigerung p.a.</Label>
            <div className="flex items-center gap-3 mt-1">
              <Slider
                value={[mietSteigerung]}
                onValueChange={v => setMietSteigerung(v[0])}
                min={0}
                max={5}
                step={0.5}
                className="flex-1"
              />
              <span className="text-sm font-semibold w-12 text-right">{mietSteigerung}%</span>
            </div>
          </div>
          <div>
            <Label className="text-xs">Wertsteigerung p.a.</Label>
            <div className="flex items-center gap-3 mt-1">
              <Slider
                value={[wertSteigerung]}
                onValueChange={v => setWertSteigerung(v[0])}
                min={0}
                max={5}
                step={0.5}
                className="flex-1"
              />
              <span className="text-sm font-semibold w-12 text-right">{wertSteigerung}%</span>
            </div>
          </div>
          <div>
            <Label className="text-xs">Eigenkapital</Label>
            <Input
              type="text"
              inputMode="decimal"
              defaultValue={ek.toLocaleString("de-DE")}
              className="h-8 text-sm mt-1"
              onBlur={e => {
                // Read-only display of EK in this version
              }}
            />
          </div>
        </div>
        {/* Soli & Kirchensteuer */}
        <div className="flex items-center gap-6 mt-3 pt-3 border-t">
          <div className="flex items-center gap-2">
            <Switch checked={soli} onCheckedChange={setSoli} id="soli" />
            <Label htmlFor="soli" className="text-xs cursor-pointer">Solidaritätszuschlag (5,5%)</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={kirchensteuer} onCheckedChange={setKirchensteuer} id="kirche" />
            <Label htmlFor="kirche" className="text-xs cursor-pointer">Kirchensteuer (9%)</Label>
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            Eff. Steuersatz: <span className="font-semibold">{effektiverSteuersatz.toFixed(2)}%</span>
          </div>
        </div>
      </Card>

      {/* Zeitraum Toggle */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Betrachtungszeitraum:</span>
        {([10, 20, 30] as const).map(z => (
          <Button
            key={z}
            size="sm"
            variant={betrachtungszeitraum === z ? "default" : "outline"}
            onClick={() => setBetrachtungszeitraum(z)}
          >
            {z} Jahre
          </Button>
        ))}
        <div className="ml-auto">
          <Button size="sm" variant="outline" onClick={handleExportPdf}>
            <Download className="h-3 w-3 mr-1" /> PDF Export
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="p-4 text-center">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <p className="text-xs text-muted-foreground">AfA p.a.</p>
          <p className="text-lg font-bold">{fmt(afaJahr)}</p>
          <p className="text-[10px] text-muted-foreground">2% linear · {(1 - grundPct / 100) * 100}% Gebäudeanteil</p>
        </Card>
        <Card className="p-4 text-center">
          <div className="w-10 h-10 rounded-full bg-[hsl(var(--success))]/10 flex items-center justify-center mx-auto mb-2">
            <PiggyBank className="h-5 w-5 text-[hsl(var(--success))]" />
          </div>
          <p className="text-xs text-muted-foreground">Steuerersparnis gesamt</p>
          <p className="text-lg font-bold text-[hsl(var(--success))]">{fmt(totalSteuerersparnis)}</p>
          <p className="text-[10px] text-muted-foreground">über {betrachtungszeitraum} Jahre</p>
        </Card>
        <Card className="p-4 text-center">
          <div className="w-10 h-10 rounded-full bg-[hsl(var(--info))]/10 flex items-center justify-center mx-auto mb-2">
            <TrendingUp className="h-5 w-5 text-[hsl(var(--info))]" />
          </div>
          <p className="text-xs text-muted-foreground">Cashflow netto (gesamt)</p>
          <p className={`text-lg font-bold ${totalCashflow >= 0 ? "text-[hsl(var(--success))]" : "text-destructive"}`}>{fmt(totalCashflow)}</p>
          <p className="text-[10px] text-muted-foreground">nach Steuern & Finanzierung</p>
        </Card>
        <Card className="p-4 text-center border-2 border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5">
          <div className="w-10 h-10 rounded-full bg-[hsl(var(--warning))]/10 flex items-center justify-center mx-auto mb-2">
            <Wallet className="h-5 w-5 text-[hsl(var(--warning))]" />
          </div>
          <p className="text-xs text-muted-foreground font-medium">Eigenbelastung / Monat</p>
          <p className="text-xl font-bold text-[hsl(var(--warning))]">{fmt(eigenbelastungJ1)}</p>
          <p className="text-[10px] text-muted-foreground">nach Steuer (Jahr 1)</p>
        </Card>
        <Card className="p-4 text-center">
          <div className="w-10 h-10 rounded-full bg-[hsl(var(--warning))]/10 flex items-center justify-center mx-auto mb-2">
            <Percent className="h-5 w-5 text-[hsl(var(--warning))]" />
          </div>
          <p className="text-xs text-muted-foreground">Ø Rendite nach Steuern</p>
          <p className="text-lg font-bold">{fmtPct(avgRendite)}</p>
          <p className="text-[10px] text-muted-foreground">auf Eigenkapital</p>
        </Card>
      </div>

      {/* Additional KPIs Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Kaufpreis</p>
          <p className="text-sm font-bold">{fmt(kaufpreis)}</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Gesamtkosten</p>
          <p className="text-sm font-bold">{fmt(gesamtkosten)}</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Darlehen</p>
          <p className="text-sm font-bold">{fmt(darlehen)}</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Restschuld (J{betrachtungszeitraum})</p>
          <p className="text-sm font-bold">{fmt(lastRow?.restschuld || 0)}</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Vermögensaufbau</p>
          <p className="text-sm font-bold text-[hsl(var(--success))]">{fmt(lastRow?.vermoegenAufbau || 0)}</p>
        </div>
      </div>

      {/* Charts */}
      <Tabs defaultValue="cashflow">
        <TabsList>
          <TabsTrigger value="cashflow">Cashflow & Steuer</TabsTrigger>
          <TabsTrigger value="vermoegen">Vermögensaufbau</TabsTrigger>
          <TabsTrigger value="kosten">Kostenstruktur</TabsTrigger>
        </TabsList>

        <TabsContent value="cashflow" className="mt-4">
          <Card className="p-4">
            <h4 className="font-bold text-sm mb-3">Cashflow & Steuerersparnis pro Jahr</h4>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value: number, name: string) => [fmt(value), name]}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                />
                <Legend />
                <Bar dataKey="Steuerersparnis" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} opacity={0.8} />
                <Line dataKey="Cashflow netto" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>
        </TabsContent>

        <TabsContent value="vermoegen" className="mt-4">
          <Card className="p-4">
            <h4 className="font-bold text-sm mb-3">Vermögensaufbau über {betrachtungszeitraum} Jahre</h4>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value: number, name: string) => [fmt(value), name]}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                />
                <Area
                  type="monotone"
                  dataKey="Vermögensaufbau"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary))"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </TabsContent>

        <TabsContent value="kosten" className="mt-4">
          <Card className="p-4">
            <h4 className="font-bold text-sm mb-3">Mieteinnahmen vs. Abschreibung & Zinsen</h4>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value: number, name: string) => [fmt(value), name]}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                />
                <Legend />
                <Bar dataKey="Miete" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} opacity={0.7} />
                <Bar dataKey="AfA" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} opacity={0.7} />
                <Bar dataKey="Zinsen" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]} opacity={0.7} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Expandable Table */}
      <Card className="p-4">
        <button
          className="flex items-center gap-2 w-full text-left"
          onClick={() => setShowTable(!showTable)}
        >
          <h4 className="font-bold text-sm flex-1">Detaillierte Jahresübersicht</h4>
          {showTable ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {showTable && (
          <div className="overflow-x-auto mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Jahr</TableHead>
                  <TableHead className="text-xs">Miete</TableHead>
                  <TableHead className="text-xs">AfA</TableHead>
                  <TableHead className="text-xs">Zinsen</TableHead>
                  <TableHead className="text-xs">Hausgeld</TableHead>
                  <TableHead className="text-xs">Abzüge ∑</TableHead>
                  <TableHead className="text-xs">Steuervorteil</TableHead>
                  <TableHead className="text-xs">CF brutto</TableHead>
                  <TableHead className="text-xs">CF netto</TableHead>
                  <TableHead className="text-xs">Restschuld</TableHead>
                  <TableHead className="text-xs">Vermögen</TableHead>
                  <TableHead className="text-xs">Rendite</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {berechnung.map(r => (
                  <TableRow key={r.jahr}>
                    <TableCell className="text-xs font-medium">{r.jahr}</TableCell>
                    <TableCell className="text-xs">{fmt(r.miete)}</TableCell>
                    <TableCell className="text-xs">{fmt(r.afa)}</TableCell>
                    <TableCell className="text-xs">{fmt(r.zinsen)}</TableCell>
                    <TableCell className="text-xs">{fmt(r.hausgeld)}</TableCell>
                    <TableCell className="text-xs">{fmt(r.abzuegeSumme)}</TableCell>
                    <TableCell className={`text-xs font-medium ${r.steuerersparnis >= 0 ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
                      {fmt(r.steuerersparnis)}
                    </TableCell>
                    <TableCell className={`text-xs ${r.cashflowBrutto >= 0 ? "" : "text-destructive"}`}>{fmt(r.cashflowBrutto)}</TableCell>
                    <TableCell className={`text-xs font-medium ${r.cashflowNetto >= 0 ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
                      {fmt(r.cashflowNetto)}
                    </TableCell>
                    <TableCell className="text-xs">{fmt(r.restschuld)}</TableCell>
                    <TableCell className="text-xs font-medium text-[hsl(var(--success))]">{fmt(r.vermoegenAufbau)}</TableCell>
                    <TableCell className="text-xs">{fmtPct(r.renditeNachSteuer)}</TableCell>
                  </TableRow>
                ))}
                {/* Summary Row */}
                <TableRow className="font-bold bg-muted/50">
                  <TableCell className="text-xs">Σ</TableCell>
                  <TableCell className="text-xs">{fmt(berechnung.reduce((s, r) => s + r.miete, 0))}</TableCell>
                  <TableCell className="text-xs">{fmt(berechnung.reduce((s, r) => s + r.afa, 0))}</TableCell>
                  <TableCell className="text-xs">{fmt(berechnung.reduce((s, r) => s + r.zinsen, 0))}</TableCell>
                  <TableCell className="text-xs">{fmt(berechnung.reduce((s, r) => s + r.hausgeld, 0))}</TableCell>
                  <TableCell className="text-xs">{fmt(berechnung.reduce((s, r) => s + r.abzuegeSumme, 0))}</TableCell>
                  <TableCell className="text-xs text-[hsl(var(--success))]">{fmt(totalSteuerersparnis)}</TableCell>
                  <TableCell className="text-xs">{fmt(berechnung.reduce((s, r) => s + r.cashflowBrutto, 0))}</TableCell>
                  <TableCell className="text-xs text-[hsl(var(--success))]">{fmt(totalCashflow)}</TableCell>
                  <TableCell className="text-xs">–</TableCell>
                  <TableCell className="text-xs">–</TableCell>
                  <TableCell className="text-xs">{fmtPct(avgRendite)} Ø</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
