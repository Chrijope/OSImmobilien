/**
 * Die Modellrechnungen des Handbuchs und der Handbuch-Seite.
 *
 * Alles rechnet über den Kern des Investmentrechners
 * (`investmentrechner/rechenkern.ts`), keine zweite Formel. Die Strategie
 * vom 26.09.2026 hatte die Zahlen in Python nachgebaut (modell.py); hier
 * laufen sie durch den echten Rechenkern, damit Handbuch, Landingpage und
 * Investmentrechner dieselben Zahlen zeigen.
 *
 * Die Modellwohnung: Bestand in Bayern, Baujahr 1965, Kaufpreis nach dem
 * Rahmen, gleiche Bruttomietrendite 4,75 %, Kaufnebenkosten 5,0 % aus
 * Eigenkapital, Kaufpreis voll finanziert zu 4,0 % Zins und 1,5 % Tilgung.
 * Ab Kapitel 7 rechnet das Handbuch mit einem Kaufpreis, der zum Rahmen
 * passt (80.000 bis 300.000 €), sonst bekäme jemand mit 80.000 € Rahmen eine
 * Musterrechnung über 240.000 € (Strategie 3.2).
 */
import {
  berechneInvestment,
  grenzsteuersatz,
  standardEingabe,
  type InvestmentEingabe,
  type InvestmentErgebnis,
} from "@/lib/investmentrechner/rechenkern";
import { zvEAusBrutto } from "@/lib/steuerRechner";
import { aufbauSprache, eur, euro, tx } from "./diagramme";
import {
  BRUTTO_STELLVERTRETER,
  handbuchRahmen,
  type BruttoId,
  type HandbuchAntworten,
  type HandbuchRahmen,
} from "../../../supabase/functions/_shared/handbuch-funnel.ts";

/** Kaufpreis der Grundwohnung, auf die sich alle Skalierungen beziehen. */
export const BASIS_KAUFPREIS = 240000;
const BASIS_MIETE = 950;
const BASIS_NICHT_UMLAGEFAEHIG = 70;
const BASIS_RUECKLAGE = 40;

/** Grenzen des Modellkaufpreises. */
export const MODELL_KAUFPREIS_MIN = 80000;
export const MODELL_KAUFPREIS_MAX = 300000;

/** Die Sätze der Modellrechnung, einmal hier, damit Text und Rechnung übereinstimmen. */
export const MODELL_SAETZE = {
  grunderwerbsteuer: 3.5,
  notar: 1.0,
  grundbuch: 0.5,
  kaufnebenkosten: 5.0,
  zins: 4.0,
  tilgung: 1.5,
  gebaeudeanteil: 80,
  afa: 2,
  mietsteigerung: 2,
  kostensteigerung: 2,
  wertsteigerung: 1.5,
  finanzierungsnebenkosten: 0.2,
  baujahr: 1965,
} as const;

export interface Modellwohnung {
  kaufpreis: number;
  kaltmiete: number;
  nichtUmlagefaehig: number;
  ruecklage: number;
  flaeche: number;
}

const auf5 = (n: number) => Math.round(n / 5) * 5;

/** Die Modellwohnung, skaliert auf einen Kaufpreis. Gleiche Mietrendite, Kosten anteilig. */
export function modellwohnung(kaufpreis: number = BASIS_KAUFPREIS): Modellwohnung {
  const f = kaufpreis / BASIS_KAUFPREIS;
  return {
    kaufpreis,
    kaltmiete: auf5(BASIS_MIETE * f),
    nichtUmlagefaehig: auf5(BASIS_NICHT_UMLAGEFAEHIG * f),
    ruecklage: Math.max(10, auf5(BASIS_RUECKLAGE * f)),
    flaeche: Math.round(kaufpreis / 4000),
  };
}

/** Kaufpreis der persönlichen Modellwohnung: empfohlener Rahmen, auf 10.000 € abgerundet, 80.000 bis 300.000 €. */
export function modellKaufpreis(rahmen: Pick<HandbuchRahmen, "empf">): number {
  const abgerundet = Math.floor(rahmen.empf / 10000) * 10000;
  return Math.max(MODELL_KAUFPREIS_MIN, Math.min(MODELL_KAUFPREIS_MAX, abgerundet));
}

/**
 * Zu versteuerndes Einkommen aus dem Jahresbrutto, wie im Steuerrechner:
 * Grundtarif, Steuerklasse I, kinderlos, ohne Kirchensteuer.
 */
export function zveAusBrutto(brutto: number): number {
  return zvEAusBrutto(brutto, {
    jahresbrutto: brutto,
    steuerklasse: "I",
    kinder: 0,
    kirchensteuer: false,
    bestehendeImmobilien: 0,
    hebelziel: "ausgewogen",
  });
}

/** zvE zur Antwort bei Frage 3. */
export function zveZuBrutto(brutto: BruttoId): number {
  return zveAusBrutto(BRUTTO_STELLVERTRETER[brutto]);
}

/**
 * Grenzsteuersatz der Einkommensteuer allein, in ganzen Prozent (Anzeige
 * „rund 42 %“). `gemeinsam`: Splittingtarif, derselbe Kern wie im
 * Investmentrechner (`grenzsteuersatz` mit `splitting`).
 */
export function grenzsatzProzent(zve: number, gemeinsam = false): number {
  return Math.round(grenzsteuersatz(zve, gemeinsam, 0, false, false) * 100);
}

export interface ModellOptionen {
  zve?: number;
  jahre?: number;
  wertsteigerung?: number;
  /**
   * Gemeinsam veranlagt (Schalter bei Frage 3, seit dem 26.09.2026 wirksam):
   * `zve` ist dann das gemeinsame zu versteuernde Einkommen, gerechnet wird
   * mit dem Splittingtarif des Rechenkerns (`jointAssessment`).
   */
  gemeinsam?: boolean;
}

/** Die Eingabe für den Rechenkern. */
export function modellEingabe(kaufpreis: number, optionen: ModellOptionen = {}): InvestmentEingabe {
  const w = modellwohnung(kaufpreis);
  const s = MODELL_SAETZE;
  return {
    ...standardEingabe,
    clientName: "Modellrechnung",
    taxClass: optionen.gemeinsam ? "III" : "I",
    jointAssessment: !!optionen.gemeinsam,
    taxableIncomeCustomer: Math.max(0, optionen.zve ?? zveAusBrutto(BRUTTO_STELLVERTRETER["80_120"])),
    churchTaxRate: 0,
    includeSolidaritySurcharge: true,
    investmentShare: 100,
    taxCalculationMode: "tariff",
    propertyTitle: "Modellwohnung",
    propertyType: "Bestand",
    area: w.flaeche,
    constructionYear: s.baujahr,
    purchasePrice: w.kaufpreis,
    furniturePrice: 0,
    maintenanceReserve: 0,
    transferTaxRate: s.grunderwerbsteuer,
    notaryRate: s.notar,
    landRegisterRate: s.grundbuch,
    brokerRate: 0,
    otherPurchaseCostRate: 0,
    // Die Nebenkosten kommen aus Eigenkapital, der Kaufpreis wird finanziert.
    equity: (w.kaufpreis * s.kaufnebenkosten) / 100,
    financingCostRate: s.finanzierungsnebenkosten,
    juniorLoanAmount: 0,
    seniorInterestRate: s.zins,
    seniorRepaymentRate: s.tilgung,
    monthlyColdRent: w.kaltmiete,
    monthlyOperatingCosts: w.nichtUmlagefaehig,
    monthlyReserveContribution: w.ruecklage,
    vacancyRate: 0,
    annualRentGrowth: s.mietsteigerung,
    annualCostGrowth: s.kostensteigerung,
    annualValueGrowth: optionen.wertsteigerung ?? s.wertsteigerung,
    buildingShare: s.gebaeudeanteil,
    depreciationMethod: "linear",
    buildingDepreciationRate: s.afa,
    specialDepreciationRate: 0,
    rehabExpense: 0,
    forecastYears: optionen.jahre ?? 30,
  };
}

export function rechneModell(kaufpreis: number, optionen: ModellOptionen = {}): InvestmentErgebnis {
  return berechneInvestment(modellEingabe(kaufpreis, optionen));
}

/** Das erste Jahr in Monatswerten, so wie es in der Musterrechnung steht. */
export interface ErstesJahr {
  miete: number;
  kosten: number;
  ruecklage: number;
  zins: number;
  tilgung: number;
  vorSteuer: number;
  steuerwirkung: number;
  nachSteuer: number;
  vermietungsergebnisJahr: number;
  afaJahr: number;
}

export function erstesJahr(e: InvestmentErgebnis): ErstesJahr {
  const j = e.years[0];
  return {
    miete: j.effectiveRent / 12,
    kosten: j.operatingCosts / 12,
    ruecklage: j.reserveContribution / 12,
    zins: j.interest / 12,
    tilgung: j.principal / 12,
    vorSteuer: j.cashflowBeforeTax / 12,
    steuerwirkung: j.taxEffect / 12,
    nachSteuer: j.cashflowAfterTax / 12,
    vermietungsergebnisJahr: j.taxableResult,
    afaJahr: j.buildingDepreciation,
  };
}

/** Eine Zeile der Steuertabelle je Einkommensspanne. */
export interface SteuerZeile {
  brutto: BruttoId;
  zve: number;
  grenzsatz: number;
  /** Eigenaufwand im Monat vor Steuer, positiv. */
  vor: number;
  /** Steuerwirkung im Monat, positiv = Entlastung. */
  wirkung: number;
  /** Eigenaufwand im Monat nach Steuer, positiv. */
  nach: number;
}

export const BRUTTO_REIHENFOLGE: BruttoId[] = ["unter_50", "50_80", "80_120", "ueber_120"];

export function steuerTabelle(kaufpreis: number = BASIS_KAUFPREIS, gemeinsam = false): SteuerZeile[] {
  return BRUTTO_REIHENFOLGE.map((brutto) => {
    const zve = zveZuBrutto(brutto);
    const j = erstesJahr(rechneModell(kaufpreis, { zve, jahre: 1, gemeinsam }));
    return {
      brutto,
      zve,
      grenzsatz: grenzsatzProzent(zve, gemeinsam),
      vor: -j.vorSteuer,
      wirkung: j.steuerwirkung,
      nach: -j.nachSteuer,
    };
  });
}

/** Vermögen in der Wohnung am Ziel in 25 Jahren, je nach Startjahr. */
export interface WartenWert {
  bezeichnung: string;
  jahre: number;
  vermoegen: number;
}

export function wartenWerte(zve: number, kaufpreis: number = BASIS_KAUFPREIS, gemeinsam = false): WartenWert[] {
  return [
    { bezeichnung: tx("Start heute", "Start today"), jahre: 25 },
    { bezeichnung: tx("Start in 5 Jahren", "Start in 5 years"), jahre: 20 },
    { bezeichnung: tx("Start in 10 Jahren", "Start in 10 years"), jahre: 15 },
  ].map(({ bezeichnung, jahre }) => {
    const e = rechneModell(kaufpreis, { zve, jahre, gemeinsam });
    return { bezeichnung, jahre, vermoegen: e.years[e.years.length - 1].propertyEquity };
  });
}

/** Wert, Restschuld und Vermögen vom Kauf bis Jahr n. */
export interface Verlauf {
  jahre: number[];
  wert: number[];
  restschuld: number[];
  vermoegen: number[];
}

export function vermoegensVerlauf(e: InvestmentErgebnis): Verlauf {
  const start = e.kaufpreisGesamt;
  const schuld = e.totalDebt;
  return {
    jahre: [0, ...e.years.map((j) => j.index + 1)],
    wert: [start, ...e.years.map((j) => j.propertyValue)],
    restschuld: [schuld, ...e.years.map((j) => j.remainingDebt)],
    vermoegen: [Math.max(0, start - schuld), ...e.years.map((j) => j.propertyEquity)],
  };
}

/** Kontostand und Kaufkraft von 50.000 € über zehn Jahre (Kapitel 3). */
export function kaufkraftVerlauf(): { jahre: number[]; konto: number[]; kaufkraft: number[] } {
  const jahre = Array.from({ length: 11 }, (_, i) => i);
  return {
    jahre,
    konto: jahre.map((t) => 50000 * 1.02 ** t),
    kaufkraft: jahre.map((t) => (50000 * 1.02 ** t) / 1.025 ** t),
  };
}

/** Eine bis drei Modellwohnungen, die zweite nach drei, die dritte nach sechs Jahren. */
export function portfolioVerlauf(zve: number, kaufpreis: number = BASIS_KAUFPREIS, gemeinsam = false) {
  const jahre = Array.from({ length: 26 }, (_, i) => i);
  const e = rechneModell(kaufpreis, { zve, jahre: 25, gemeinsam });
  const reihe = (start: number) =>
    jahre.map((t) => {
      if (t < start) return 0;
      if (t === start) return Math.max(0, e.kaufpreisGesamt - e.totalDebt);
      return e.years[t - start - 1].propertyEquity;
    });
  const r1 = reihe(0);
  const r2 = reihe(3);
  const r3 = reihe(6);
  const eine = r1;
  const zwei = jahre.map((_, i) => r1[i] + r2[i]);
  const drei = jahre.map((_, i) => r1[i] + r2[i] + r3[i]);
  return { jahre, eine, zwei, drei };
}

/** Alles, was das Handbuch aus den Antworten braucht, an einer Stelle gerechnet. */
export interface HandbuchAuswertung {
  rahmen: HandbuchRahmen;
  /** Gemeinsam veranlagt: Splittingtarif, `zve` ist das gemeinsame. */
  gemeinsam: boolean;
  zve: number;
  grenzsatz: number;
  kaufpreis: number;
  wohnung: Modellwohnung;
  ergebnis: InvestmentErgebnis;
  jahr1: ErstesJahr;
}

export function handbuchAuswertung(a: HandbuchAntworten): HandbuchAuswertung {
  const rahmen = handbuchRahmen(a);
  const gemeinsam = a.gemeinsamVeranlagt === true;
  const zve = zveZuBrutto(a.brutto);
  const kaufpreis = modellKaufpreis(rahmen);
  const ergebnis = rechneModell(kaufpreis, { zve, gemeinsam });
  return {
    rahmen,
    gemeinsam,
    zve,
    grenzsatz: grenzsatzProzent(zve, gemeinsam),
    kaufpreis,
    wohnung: modellwohnung(kaufpreis),
    ergebnis,
    jahr1: erstesJahr(ergebnis),
  };
}

/** Der Annahmentext unter jeder Modellrechnung, in der Sprache des Aufbaus (`inSprache`). */
export function annahmenText(kaufpreis: number = BASIS_KAUFPREIS): string {
  const w = modellwohnung(kaufpreis);
  const rendite = ((w.kaltmiete * 12) / kaufpreis) * 100;
  const en = aufbauSprache() === "en";
  const renditeText = rendite.toLocaleString(en ? "en-GB" : "de-DE", { maximumFractionDigits: 2 });
  if (en) {
    return (
      `Model flat, existing building from 1965 in Bavaria, ${eur(w.flaeche)} m², purchase price ${euro(kaufpreis)}, ` +
      `net cold rent ${euro(w.kaltmiete)} per month (gross rental yield ${renditeText}%), ` +
      `non-recoverable costs ${euro(w.nichtUmlagefaehig)} and maintenance reserve ${euro(w.ruecklage)} per month, ` +
      "purchase price financed at 4.0% interest and 1.5% repayment, incidental purchase costs of 5.0% " +
      "(3.5% real estate transfer tax, 1.0% notary, 0.5% land register) paid from equity, building share 80%, " +
      "straight-line depreciation (AfA) of 2%, rents and costs plus 2%, value plus 1.5% per year, income tax " +
      "according to the 2026 tariff including solidarity surcharge, without church tax."
    );
  }
  return (
    `Modellwohnung, Bestand Baujahr 1965 in Bayern, ${w.flaeche} m², Kaufpreis ${euro(kaufpreis)}, ` +
    `Kaltmiete ${euro(w.kaltmiete)} im Monat (Bruttomietrendite ${renditeText} %), ` +
    `nicht umlagefähige Kosten ${euro(w.nichtUmlagefaehig)} und Rücklage ${euro(w.ruecklage)} im Monat, ` +
    "Finanzierung des Kaufpreises zu 4,0 % Zins und 1,5 % Tilgung, Kaufnebenkosten 5,0 % " +
    "(3,5 % Grunderwerbsteuer, 1,0 % Notar, 0,5 % Grundbuch) aus Eigenkapital, Gebäudeanteil 80 %, " +
    "AfA 2 % linear, Mieten und Kosten plus 2 %, Wert plus 1,5 % im Jahr, Steuer nach Tarif 2026 " +
    "mit Solidaritätszuschlag, ohne Kirchensteuer."
  );
}
