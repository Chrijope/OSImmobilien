// Kalkulation Investagon
//
// Immobilien-Investitionsrechner: Objekt, Kaufnebenkosten, AfA, Finanzierung
// mit Zinsbindung und Anschlussfinanzierung, Bewirtschaftung, Marktannahmen,
// Steuer und Verkauf am Ende der Haltedauer.
//
// Die Rechenlogik entspricht der von Christian gelieferten Vorlage, inklusive
// der monatsgenauen Darlehenssimulation. Die Oberfläche folgt dem CI des CRM
// (shadcn-Komponenten, Projektfarben), links die Eingaben, rechts Kennzahlen
// und die Jahrestabelle.

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calculator, Info } from "lucide-react";

/* ── Zustand ──────────────────────────────────────────────────── */

interface FormZustand {
  kaufpreis: string;
  kaltmiete: string;
  flaeche: string;
  grest: string;
  notar: string;
  grundbuch: string;
  makler: string;
  grundanteil: string;
  afaSatz: string;
  eigenkapital: string;
  zins: string;
  tilgung: string;
  zinsbindung: string;
  kaufmonat: string;
  anschlusszins: string;
  anschlusstilgung: string;
  hausgeld: string;
  verwaltung: string;
  ausgabensteigerung: string;
  wertsteigerung: string;
  mietsteigerung: string;
  mietintervall: string;
  leerstand: string;
  steuersatz: string;
  speku10: boolean;
  haltedauer: string;
  verkaufskosten: string;
}

const START: FormZustand = {
  kaufpreis: "400000",
  kaltmiete: "1200",
  flaeche: "80",
  grest: "6.5",
  notar: "1.5",
  grundbuch: "0.5",
  makler: "0",
  grundanteil: "20",
  afaSatz: "2",
  eigenkapital: "80000",
  zins: "4.0",
  tilgung: "2.0",
  zinsbindung: "0",
  kaufmonat: "1",
  anschlusszins: "4.0",
  anschlusstilgung: "2.0",
  hausgeld: "150",
  verwaltung: "25",
  ausgabensteigerung: "2",
  wertsteigerung: "2",
  mietsteigerung: "1.5",
  mietintervall: "1",
  leerstand: "2",
  steuersatz: "42",
  speku10: true,
  haltedauer: "15",
  verkaufskosten: "0",
};

/* ── Rechenlogik (unverändert aus der Vorlage übernommen) ─────── */

interface JahresZeile {
  jahr: number;
  mieteMonat: number;
  einnahmen: number;
  ausgaben: number;
  operativerCF: number;
  zinsJahr: number;
  tilgJahr: number;
  cfVorSteuer: number;
  afaJahr: number;
  steuerlErgebnis: number;
  steuerEffekt: number;
  cfNachSteuer: number;
  restschuldEnde: number;
  immowert: number;
  eigenkapitalImmo: number;
  kumCF: number;
}

interface Ergebnis {
  gesamtinvestition: number;
  nebenkostenBetrag: number;
  kreditsumme: number;
  eigenkapital: number;
  bruttomietrendite: number;
  cfJahr1Monat: number;
  verkaufserloesNetto: number;
  gesamtgewinn: number;
  haltedauer: number;
  rows: JahresZeile[];
}

const zahl = (v: string) => {
  const n = parseFloat(String(v).replace(",", "."));
  return isFinite(n) ? n : 0;
};

function berechne(f: FormZustand): Ergebnis {
  const kaufpreis = zahl(f.kaufpreis);
  const kaltmiete = zahl(f.kaltmiete);
  const grest = zahl(f.grest);
  const notar = zahl(f.notar);
  const grundbuch = zahl(f.grundbuch);
  const makler = zahl(f.makler);
  const grundanteil = zahl(f.grundanteil);
  const afaSatz = zahl(f.afaSatz);
  const eigenkapital = zahl(f.eigenkapital);
  const zins = zahl(f.zins);
  const tilgung = zahl(f.tilgung);
  const zinsbindung = zahl(f.zinsbindung);
  const anschlusszins = zahl(f.anschlusszins);
  const anschlusstilgung = zahl(f.anschlusstilgung);
  const kaufmonat = Math.min(Math.max(zahl(f.kaufmonat), 1), 12);
  const hausgeld = zahl(f.hausgeld);
  const verwaltung = zahl(f.verwaltung);
  const ausgabensteigerung = zahl(f.ausgabensteigerung);
  const wertsteigerung = zahl(f.wertsteigerung);
  const mietsteigerung = zahl(f.mietsteigerung);
  const mietintervall = Math.max(zahl(f.mietintervall), 1);
  const leerstand = zahl(f.leerstand);
  const steuersatz = zahl(f.steuersatz);
  const speku10 = f.speku10;
  const haltedauer = Math.max(zahl(f.haltedauer), 1);
  const verkaufskosten = zahl(f.verkaufskosten);

  // Kaufnebenkosten und Investitionssumme
  const nebenkostenSatz = grest + notar + grundbuch + makler;
  const nebenkostenBetrag = (kaufpreis * nebenkostenSatz) / 100;
  const gesamtinvestition = kaufpreis + nebenkostenBetrag;
  const kreditsumme = Math.max(gesamtinvestition - eigenkapital, 0);

  // AfA
  const gebaeudeanteil = 100 - grundanteil;
  const afaBasis = (gesamtinvestition * gebaeudeanteil) / 100;
  const afaJahr = (afaBasis * afaSatz) / 100;

  // Annuitätendarlehen, Monat für Monat simuliert
  const totalMonths = haltedauer * 12;
  let restschuld = kreditsumme;
  let curZins = zins;
  let annuitaetMonat = (kreditsumme * (zins + tilgung)) / 100 / 12;
  const monthly: { zinsAnteil: number; tilgAnteil: number; restschuld: number }[] = [];
  for (let m = 1; m <= totalMonths; m++) {
    if (zinsbindung > 0 && m === Math.round(zinsbindung * 12) + 1) {
      curZins = anschlusszins;
      annuitaetMonat = (restschuld * (anschlusszins + anschlusstilgung)) / 100 / 12;
    }
    const zinsAnteil = (restschuld * curZins) / 100 / 12;
    let tilgAnteil = annuitaetMonat - zinsAnteil;
    if (tilgAnteil > restschuld) tilgAnteil = restschuld;
    if (tilgAnteil < 0) tilgAnteil = 0;
    restschuld = Math.max(restschuld - tilgAnteil, 0);
    monthly.push({ zinsAnteil, tilgAnteil, restschuld });
  }

  const monateJahr1 = 13 - kaufmonat;
  const rows: JahresZeile[] = [];
  // Eigenkapitaleinsatz als Startpunkt der Vermögensbetrachtung
  let kumCF = -eigenkapital;

  for (let jahr = 1; jahr <= haltedauer; jahr++) {
    const monateEigentum = jahr === 1 ? monateJahr1 : 12;
    const steps = Math.floor((jahr - 1) / mietintervall);
    const mieteMonat = kaltmiete * Math.pow(1 + mietsteigerung / 100, steps);
    const einnahmenBrutto = mieteMonat * monateEigentum;
    const einnahmen = einnahmenBrutto * (1 - leerstand / 100);

    const hausgeldMonat = hausgeld * Math.pow(1 + ausgabensteigerung / 100, jahr - 1);
    const verwaltungMonat = verwaltung * Math.pow(1 + ausgabensteigerung / 100, jahr - 1);
    const ausgaben = (hausgeldMonat + verwaltungMonat) * monateEigentum;

    const operativerCF = einnahmen - ausgaben;

    const startM = (jahr - 1) * 12;
    const endM = jahr * 12;
    let zinsJahr = 0;
    let tilgJahr = 0;
    for (let m = startM; m < endM; m++) {
      zinsJahr += monthly[m].zinsAnteil;
      tilgJahr += monthly[m].tilgAnteil;
    }

    const cfVorSteuer = operativerCF - zinsJahr - tilgJahr;
    const steuerlErgebnis = operativerCF - zinsJahr - afaJahr;
    const steuerEffekt = (-steuerlErgebnis * steuersatz) / 100;
    const cfNachSteuer = cfVorSteuer + steuerEffekt;

    kumCF += cfNachSteuer;

    const immowert = kaufpreis * Math.pow(1 + wertsteigerung / 100, jahr);
    const restschuldEnde = monthly[endM - 1].restschuld;
    const eigenkapitalImmo = immowert - restschuldEnde;

    rows.push({
      jahr,
      mieteMonat,
      einnahmen,
      ausgaben,
      operativerCF,
      zinsJahr,
      tilgJahr,
      cfVorSteuer,
      afaJahr,
      steuerlErgebnis,
      steuerEffekt,
      cfNachSteuer,
      restschuldEnde,
      immowert,
      eigenkapitalImmo,
      kumCF,
    });
  }

  // Verkauf am Ende der Haltedauer
  const last = rows[rows.length - 1];
  const verkaufspreis = last.immowert;
  const verkaufskostenBetrag = (verkaufspreis * verkaufskosten) / 100;
  const restschuldVerkauf = last.restschuldEnde;
  let steuerVerkauf = 0;
  if (!(speku10 && haltedauer >= 10)) {
    const kumAfa = afaJahr * haltedauer;
    const buchwert = gesamtinvestition - kumAfa;
    const veraeusserungsgewinn = Math.max(verkaufspreis - verkaufskostenBetrag - buchwert, 0);
    steuerVerkauf = (veraeusserungsgewinn * steuersatz) / 100;
  }
  const verkaufserloesNetto =
    verkaufspreis - verkaufskostenBetrag - restschuldVerkauf - steuerVerkauf;
  // kumCF enthält bereits minus Eigenkapital am Start
  const gesamtvermoegen = verkaufserloesNetto + (last.kumCF + eigenkapital);
  const gesamtgewinn = gesamtvermoegen - eigenkapital;

  const bruttomietrendite = kaufpreis > 0 ? ((kaltmiete * 12) / kaufpreis) * 100 : 0;
  const cfJahr1Monat = rows[0].cfNachSteuer / monateJahr1;

  return {
    gesamtinvestition,
    nebenkostenBetrag,
    kreditsumme,
    eigenkapital,
    bruttomietrendite,
    cfJahr1Monat,
    verkaufserloesNetto,
    gesamtgewinn,
    haltedauer,
    rows,
  };
}

/* ── Formatierung ─────────────────────────────────────────────── */

const eur = (v: number) => v.toLocaleString("de-DE", { maximumFractionDigits: 0 }) + " €";
const pct = (v: number) => v.toLocaleString("de-DE", { maximumFractionDigits: 2 }) + " %";
const farbe = (v: number) =>
  v >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive";

/* ── Kleine Bausteine im CI ───────────────────────────────────── */

function Feld({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] leading-snug text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

function Block({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <Card className="p-5 space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-primary">{titel}</h3>
      {children}
    </Card>
  );
}

function KpiKarte({ label, wert, farbklasse }: { label: string; wert: string; farbklasse?: string }) {
  return (
    <Card className="p-4 border-l-4 border-l-primary">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold mt-1 ${farbklasse || "text-foreground"}`}>{wert}</p>
    </Card>
  );
}

/* ── Seite ────────────────────────────────────────────────────── */

export default function KalkulationInvestagon() {
  const [form, setForm] = useState<FormZustand>(START);
  const [ergebnis, setErgebnis] = useState<Ergebnis | null>(null);

  const set = <K extends keyof FormZustand>(key: K, value: FormZustand[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const input = (key: keyof FormZustand) => (
    <Input
      value={String(form[key])}
      onChange={(e) => set(key, e.target.value as FormZustand[typeof key])}
      inputMode="decimal"
    />
  );

  // Wie in der Vorlage: beim Öffnen einmal mit den Startwerten rechnen.
  useEffect(() => {
    setErgebnis(berechne(START));
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Kalkulation Investagon"
          subtitle="Immobilien-Investitionsrechner: Finanzierung, Abschreibung, Cashflow und Verkauf über die gesamte Haltedauer"
        >
          {/* Entwurfs-Badge wie in der Sidebar: Die Seite ist im Aufbau und
              nur für Admin und Inhaber sichtbar, siehe draftRoutes.ts. */}
          <Badge className="bg-orange-500/15 text-orange-500 border border-orange-500/30 hover:bg-orange-500/20 font-semibold uppercase tracking-wide">
            Entwurf
          </Badge>
        </PageHeader>

        <Card className="p-4 border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/50">
          <div className="flex gap-3 text-sm">
            <Info className="h-4 w-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-amber-900/90 dark:text-amber-200/90 leading-relaxed">
              Unverbindliche Musterberechnung auf Basis eigener Annahmen und allgemein üblicher
              Finanzierungs- und Steuerformeln. Keine Anlage-, Steuer- oder Rechtsberatung. Alle
              Werte bitte durch Steuerberater und Finanzierungsberater prüfen lassen.
            </p>
          </div>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[380px_1fr] items-start">
          {/* Eingaben */}
          <div className="space-y-4">
            <Block titel="Objekt">
              <Feld label="Kaufpreis (€)">{input("kaufpreis")}</Feld>
              <Feld label="Kaltmiete pro Monat (€)">{input("kaltmiete")}</Feld>
              <Feld label="Wohnfläche (m², optional)">{input("flaeche")}</Feld>
            </Block>

            <Block titel="Kaufnebenkosten">
              <div className="grid grid-cols-2 gap-4">
                <Feld label="Grunderwerbsteuer (%)">{input("grest")}</Feld>
                <Feld label="Notar und Gericht (%)">{input("notar")}</Feld>
                <Feld label="Grundbucheintragung (%)">{input("grundbuch")}</Feld>
                <Feld label="Makler beim Kauf (%)">{input("makler")}</Feld>
              </div>
            </Block>

            <Block titel="Abschreibung (AfA)">
              <div className="grid grid-cols-2 gap-4">
                <Feld label="Grundstücksanteil (%)">{input("grundanteil")}</Feld>
                <Feld label="AfA-Satz (% pro Jahr)">{input("afaSatz")}</Feld>
              </div>
              <p className="text-[11px] text-muted-foreground/80 leading-snug">
                Standard linear: 2 Prozent (Bestand), 2,5 Prozent (Baujahr vor 1925), 3 Prozent
                (bestimmte Neubauten). Bitte prüfen, welcher Satz für das Objekt zutrifft.
              </p>
            </Block>

            <Block titel="Finanzierung">
              <Feld label="Eigenkapital (€)">{input("eigenkapital")}</Feld>
              <div className="grid grid-cols-2 gap-4">
                <Feld label="Zins (% pro Jahr)">{input("zins")}</Feld>
                <Feld label="Anfängliche Tilgung (% pro Jahr)">{input("tilgung")}</Feld>
                <Feld label="Zinsbindung (Jahre, 0 = ganze Laufzeit)">{input("zinsbindung")}</Feld>
                <Feld label="Kaufmonat (1 bis 12)">{input("kaufmonat")}</Feld>
                <Feld label="Anschlusszins (%)">{input("anschlusszins")}</Feld>
                <Feld label="Anschlusstilgung (%)">{input("anschlusstilgung")}</Feld>
              </div>
            </Block>

            <Block titel="Bewirtschaftungskosten">
              <div className="grid grid-cols-2 gap-4">
                <Feld label="Hausgeld und Rücklage (€/Monat)">{input("hausgeld")}</Feld>
                <Feld label="Verwaltungskosten (€/Monat)">{input("verwaltung")}</Feld>
              </div>
              <Feld label="Steigerung Ausgaben (% pro Jahr)">{input("ausgabensteigerung")}</Feld>
            </Block>

            <Block titel="Marktannahmen">
              <div className="grid grid-cols-2 gap-4">
                <Feld label="Wertsteigerung (% pro Jahr)">{input("wertsteigerung")}</Feld>
                <Feld label="Mietsteigerung (% pro Jahr)">{input("mietsteigerung")}</Feld>
                <Feld label="Mietsteigerung alle ... Jahre">{input("mietintervall")}</Feld>
                <Feld label="Leerstandsrate (%)">{input("leerstand")}</Feld>
              </div>
            </Block>

            <Block titel="Steuer">
              <Feld
                label="Persönlicher Grenzsteuersatz (%)"
                hint="Vereinfachte Annahme eines konstanten Grenzsteuersatzes statt der vollen progressiven Berechnung nach §32a EStG."
              >
                {input("steuersatz")}
              </Feld>
              <label className="flex items-start gap-3 text-sm cursor-pointer">
                <Checkbox
                  checked={form.speku10}
                  onCheckedChange={(c) => set("speku10", c === true)}
                  className="mt-0.5"
                />
                <span>Verkauf nach mindestens 10 Jahren steuerfrei (§23 EStG)</span>
              </label>
            </Block>

            <Block titel="Verkauf und Haltedauer">
              <div className="grid grid-cols-2 gap-4">
                <Feld label="Haltedauer (Jahre)">{input("haltedauer")}</Feld>
                <Feld label="Verkaufskosten (%)">{input("verkaufskosten")}</Feld>
              </div>
              <Button onClick={() => setErgebnis(berechne(form))} className="w-full gap-2">
                <Calculator className="h-4 w-4" />
                Berechnen
              </Button>
            </Block>
          </div>

          {/* Ergebnis */}
          <div className="space-y-4">
            {ergebnis && (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <KpiKarte label="Gesamtinvestition" wert={eur(ergebnis.gesamtinvestition)} />
                  <KpiKarte label="Kaufnebenkosten" wert={eur(ergebnis.nebenkostenBetrag)} />
                  <KpiKarte label="Kreditsumme" wert={eur(ergebnis.kreditsumme)} />
                  <KpiKarte label="Eigenkapitaleinsatz" wert={eur(ergebnis.eigenkapital)} />
                  <KpiKarte label="Bruttomietrendite" wert={pct(ergebnis.bruttomietrendite)} />
                  <KpiKarte
                    label="Cashflow nach Steuer, Monat (Jahr 1)"
                    wert={eur(ergebnis.cfJahr1Monat)}
                    farbklasse={farbe(ergebnis.cfJahr1Monat)}
                  />
                  <KpiKarte
                    label={`Verkaufserlös netto (Jahr ${ergebnis.haltedauer})`}
                    wert={eur(ergebnis.verkaufserloesNetto)}
                  />
                  <KpiKarte
                    label="Gesamtgewinn nach Haltedauer"
                    wert={eur(ergebnis.gesamtgewinn)}
                    farbklasse={farbe(ergebnis.gesamtgewinn)}
                  />
                </div>

                <Card className="p-5">
                  <h3 className="text-sm font-semibold text-primary mb-3">
                    Jahresübersicht über die Haltedauer
                  </h3>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Jahr</TableHead>
                          <TableHead className="text-right">Miete/Monat</TableHead>
                          <TableHead className="text-right">Einnahmen</TableHead>
                          <TableHead className="text-right">Ausgaben</TableHead>
                          <TableHead className="text-right">Operativer CF</TableHead>
                          <TableHead className="text-right">Zinsen</TableHead>
                          <TableHead className="text-right">Tilgung</TableHead>
                          <TableHead className="text-right">CF vor Steuer</TableHead>
                          <TableHead className="text-right">AfA</TableHead>
                          <TableHead className="text-right">Steuerl. Ergebnis</TableHead>
                          <TableHead className="text-right">Steuer</TableHead>
                          <TableHead className="text-right">CF nach Steuer</TableHead>
                          <TableHead className="text-right">Restschuld</TableHead>
                          <TableHead className="text-right">Immobilienwert</TableHead>
                          <TableHead className="text-right">Eigenkapital (Immo)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ergebnis.rows.map((r) => (
                          <TableRow key={r.jahr}>
                            <TableCell className="font-medium">{r.jahr}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">{eur(r.mieteMonat)}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">{eur(r.einnahmen)}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">{eur(-r.ausgaben)}</TableCell>
                            <TableCell className={`text-right whitespace-nowrap ${farbe(r.operativerCF)}`}>
                              {eur(r.operativerCF)}
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">{eur(-r.zinsJahr)}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">{eur(-r.tilgJahr)}</TableCell>
                            <TableCell className={`text-right whitespace-nowrap ${farbe(r.cfVorSteuer)}`}>
                              {eur(r.cfVorSteuer)}
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">{eur(-r.afaJahr)}</TableCell>
                            <TableCell className={`text-right whitespace-nowrap ${farbe(-r.steuerlErgebnis)}`}>
                              {eur(r.steuerlErgebnis)}
                            </TableCell>
                            <TableCell className={`text-right whitespace-nowrap ${farbe(r.steuerEffekt)}`}>
                              {eur(r.steuerEffekt)}
                            </TableCell>
                            <TableCell className={`text-right whitespace-nowrap ${farbe(r.cfNachSteuer)}`}>
                              {eur(r.cfNachSteuer)}
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">{eur(r.restschuldEnde)}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">{eur(r.immowert)}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">{eur(r.eigenkapitalImmo)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
