/**
 * Die Modellrechnungen des Handbuchs und der Handbuch-Seite.
 *
 * Alles rechnet über den Kern des Investmentrechners
 * (`investmentrechner/rechenkern.ts`), keine zweite Formel. Die Strategie
 * vom 26.09.2026 hatte die Zahlen in Python nachgebaut (modell.py); hier
 * laufen sie durch den echten Rechenkern, damit Handbuch, Landingpage und
 * Investmentrechner dieselben Zahlen zeigen.
 *
 * Die Beispielwohnung (seit dem 17.10.2026, Entscheidung Christian): je
 * Objekt EINE Wohnung, dieselbe wie im Analysetool und in den Exposés
 * (`OS_WOHNUNGEN` in analyseVorsorge.ts). Für das Handbuch gilt die Wohnung
 * im Rahmen (Obergrenze der Spanne) mit dem größten Steuervorteil im ersten
 * Jahr, sonst die günstigste; dieselbe zeigt die Ergebnisseite unter „Mehr
 * Netto vom Brutto“. Gerechnet ehrlich wie im Exposé: Kaufpreis voll
 * finanziert zu 4,8 % Zins und 1,2 % Tilgung, Kaufnebenkosten Berlin 8,0 %
 * oder Brandenburg 8,5 % aus Eigenkapital, AfA und Gebäudeanteil der Wohnung
 * (erhöhte AfA nur mit anerkanntem Restnutzungsdauer-Gutachten).
 * ponytail: Das Handbuch rechnet die Beispielwohnung weiter mit dem
 * Rechenkern des Investmentrechners; die zwei Wege (osWege.ts) mit dem
 * Exposé-Rechner. Im ersten Jahr liegen beide nah beieinander, die Restschuld
 * nach Jahrzehnten weicht ab (monatlich gegen jährlich).
 */
import {
  berechneInvestment,
  grenzsteuersatz,
  standardEingabe,
  type InvestmentEingabe,
  type InvestmentErgebnis,
} from "@/lib/investmentrechner/rechenkern";
import { zvEAusBrutto } from "@/lib/steuerRechner";
import { OS_WOHNUNGEN, mietsteigerungProzent, rechneWohnung, type OsWohnung } from "@/lib/analyseVorsorge";
import { KAUFNEBENKOSTEN, type Bundesland } from "./osObjekte";
import { aufbauSprache, euro, tx } from "./diagramme";
import {
  BRUTTO_STELLVERTRETER,
  handbuchRahmen,
  type BruttoId,
  type HandbuchAntworten,
  type HandbuchRahmen,
} from "../../../supabase/functions/_shared/handbuch-funnel.ts";

/** Die Sätze, die für jede Beispielwohnung gleich sind. */
export const MODELL_SAETZE = {
  notar: 1.5,
  grundbuch: 0.5,
  zins: 4.8,
  tilgung: 1.2,
  kostensteigerung: 2,
  wertsteigerung: 1.5,
  finanzierungsnebenkosten: 0,
} as const;

export interface Modellwohnung {
  id: string;
  titel: string;
  ort: string;
  /** „WE 05, 70,9 m², 3 Zimmer, mit Garage“, wie im Analysetool. */
  beispiel: string;
  kaufpreis: number;
  /** Kaltmiete inklusive Stellplatz- oder Garagenmiete, so rechnet das Exposé. */
  kaltmiete: number;
  garage: number;
  nichtUmlagefaehig: number;
  ruecklage: number;
  flaeche: number;
  land: Bundesland;
  grunderwerbsteuer: number;
  /** Kaufnebenkosten in Prozent; 0, wenn der Verkäufer sie trägt (Cottbus). */
  kaufnebenkosten: number;
  nebenkostenTraegtVerkaeufer: boolean;
  gebaeudeanteil: number;
  afa: number;
  mietsteigerung: number;
}

function ausOs(w: OsWohnung): Modellwohnung {
  const o = w.objekt;
  const land: Bundesland = o.bundeslandId === "be" ? "Berlin" : "Brandenburg";
  const verkaeufer = !!w.nebenkostenTraegtVerkaeufer;
  return {
    id: w.id,
    titel: w.titel,
    ort: w.ort,
    beispiel: w.beispiel,
    kaufpreis: o.kaufpreis,
    kaltmiete: o.kaltmieteMonat,
    garage: o.stellplatzMieteMonat ?? 0,
    nichtUmlagefaehig: o.hausgeldNichtUmlegbarMonat ?? 0,
    ruecklage: o.ruecklageMonat ?? 0,
    flaeche: o.wohnflaeche ?? 0,
    land,
    grunderwerbsteuer: KAUFNEBENKOSTEN[land].grunderwerbsteuer,
    kaufnebenkosten: verkaeufer ? 0 : KAUFNEBENKOSTEN[land].gesamt,
    nebenkostenTraegtVerkaeufer: verkaeufer,
    gebaeudeanteil: o.gebaeudeanteilProzent ?? 80,
    afa: w.afaProzent,
    mietsteigerung: mietsteigerungProzent(w),
  };
}

const HAUFF = OS_WOHNUNGEN.find((w) => w.id === "hauff") ?? OS_WOHNUNGEN[0];

/** Kaufpreis der Grundwohnung (Hauffstraße 38, WE 05), auf die sich Landingpage und Steuertabelle beziehen. */
export const BASIS_KAUFPREIS = HAUFF.objekt.kaufpreis;

/** Die Beispielwohnung zum Kaufpreis; ohne passende Wohnung die Hauffstraße anteilig skaliert. */
export function modellwohnung(kaufpreis: number = BASIS_KAUFPREIS): Modellwohnung {
  const echt = OS_WOHNUNGEN.find((w) => w.objekt.kaufpreis === kaufpreis);
  if (echt) return ausOs(echt);
  const basis = ausOs(HAUFF);
  const f = kaufpreis / basis.kaufpreis;
  return {
    ...basis,
    beispiel: "",
    kaufpreis,
    kaltmiete: Math.round(basis.kaltmiete * f),
    nichtUmlagefaehig: Math.round(basis.nichtUmlagefaehig * f),
    ruecklage: Math.round(basis.ruecklage * f),
    flaeche: Math.round(basis.flaeche * f),
  };
}

/**
 * Die Beispielwohnung zum Rahmen: im Rahmen die mit dem größten Steuervorteil
 * im ersten Jahr (Exposé-Rechner, Grenzsteuersatz der Antwort), sonst die
 * günstigste. Dieselbe Regel nutzt „Mehr Netto vom Brutto“ (osWege.ts).
 */
export function beispielOsWohnung(rahmenBis: number, grenzsatz: number): OsWohnung {
  const imRahmen = OS_WOHNUNGEN.filter((w) => w.objekt.kaufpreis <= rahmenBis);
  if (imRahmen.length === 0) return [...OS_WOHNUNGEN].sort((x, y) => x.objekt.kaufpreis - y.objekt.kaufpreis)[0];
  const steuer = (w: OsWohnung) => rechneWohnung(w, 40, 67, grenzsatz).jahr1.steuerMonat;
  return [...imRahmen].sort((x, y) => steuer(y) - steuer(x))[0];
}

/** Kaufpreis der persönlichen Beispielwohnung, siehe `beispielOsWohnung`. */
export function modellKaufpreis(rahmen: Pick<HandbuchRahmen, "bis">, grenzsatz = 42): number {
  return beispielOsWohnung(rahmen.bis, grenzsatz).objekt.kaufpreis;
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
    clientName: "Beispielrechnung",
    taxClass: optionen.gemeinsam ? "III" : "I",
    jointAssessment: !!optionen.gemeinsam,
    taxableIncomeCustomer: Math.max(0, optionen.zve ?? zveAusBrutto(BRUTTO_STELLVERTRETER["80_120"])),
    churchTaxRate: 0,
    includeSolidaritySurcharge: true,
    investmentShare: 100,
    taxCalculationMode: "tariff",
    propertyTitle: w.beispiel ? `${w.titel}, ${w.beispiel}` : w.titel,
    propertyType: "Bestand",
    area: w.flaeche,
    constructionYear: 2000,
    purchasePrice: w.kaufpreis,
    furniturePrice: 0,
    maintenanceReserve: 0,
    transferTaxRate: w.nebenkostenTraegtVerkaeufer ? 0 : w.grunderwerbsteuer,
    notaryRate: w.nebenkostenTraegtVerkaeufer ? 0 : s.notar,
    landRegisterRate: w.nebenkostenTraegtVerkaeufer ? 0 : s.grundbuch,
    brokerRate: 0,
    otherPurchaseCostRate: 0,
    // Die Nebenkosten kommen aus Eigenkapital, der Kaufpreis wird finanziert.
    equity: (w.kaufpreis * w.kaufnebenkosten) / 100,
    financingCostRate: s.finanzierungsnebenkosten,
    juniorLoanAmount: 0,
    seniorInterestRate: s.zins,
    seniorRepaymentRate: s.tilgung,
    monthlyColdRent: w.kaltmiete,
    monthlyOperatingCosts: w.nichtUmlagefaehig,
    monthlyReserveContribution: w.ruecklage,
    vacancyRate: 0,
    annualRentGrowth: w.mietsteigerung,
    annualCostGrowth: s.kostensteigerung,
    annualValueGrowth: optionen.wertsteigerung ?? s.wertsteigerung,
    buildingShare: w.gebaeudeanteil,
    depreciationMethod: "linear",
    buildingDepreciationRate: w.afa,
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

/**
 * Das erste Jahr der Beispielwohnung wie im Exposé (Exposé-Rechner über
 * `rechneWohnung`, Steuerwirkung mit dem Grenzsteuersatz). So stehen in
 * Kapitel 6 und 7 dieselben Zahlen wie auf der Ergebnisseite, im Analysetool
 * und im Exposé. Ohne passende OS-Wohnung (skalierter Kaufpreis): null.
 */
export function erstesJahrWieExpose(kaufpreis: number, grenzsatz: number): ErstesJahr | null {
  const w = OS_WOHNUNGEN.find((x) => x.objekt.kaufpreis === kaufpreis);
  if (!w) return null;
  const j = rechneWohnung(w, 40, 67, grenzsatz).erstesJahr;
  const steuer = j.steuerwirkungOhneSanierung;
  return {
    miete: j.mieteNetto / 12,
    kosten: (j.hausgeldNichtUmlegbar + j.mietverwaltung) / 12,
    ruecklage: j.ruecklage / 12,
    zins: j.zinsen / 12,
    tilgung: j.tilgung / 12,
    vorSteuer: (j.cashflow - j.steuerwirkungZahlungswirksam) / 12,
    steuerwirkung: steuer / 12,
    nachSteuer: (j.cashflow - j.steuerwirkungZahlungswirksam + steuer) / 12,
    vermietungsergebnisJahr: j.ergebnisVermietung,
    afaJahr: j.afa,
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
    const j = erstesJahrWieExpose(kaufpreis, grenzsatzProzent(zve, gemeinsam)) ?? erstesJahr(rechneModell(kaufpreis, { zve, jahre: 1, gemeinsam }));
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
  const kaufpreis = modellKaufpreis(rahmen, grenzsatzProzent(zve, gemeinsam));
  const ergebnis = rechneModell(kaufpreis, { zve, gemeinsam });
  return {
    rahmen,
    gemeinsam,
    zve,
    grenzsatz: grenzsatzProzent(zve, gemeinsam),
    kaufpreis,
    wohnung: modellwohnung(kaufpreis),
    ergebnis,
    jahr1: erstesJahrWieExpose(kaufpreis, grenzsatzProzent(zve, gemeinsam)) ?? erstesJahr(ergebnis),
  };
}

/** Der Annahmentext unter jeder Modellrechnung, in der Sprache des Aufbaus (`inSprache`). */
export function annahmenText(kaufpreis: number = BASIS_KAUFPREIS): string {
  const w = modellwohnung(kaufpreis);
  const en = aufbauSprache() === "en";
  const zahl = (n: number) => n.toLocaleString(en ? "en-GB" : "de-DE", { maximumFractionDigits: 2 });
  const proz = (n: number) => (en ? `${zahl(n)}%` : `${zahl(n)} %`);
  const knk = w.nebenkostenTraegtVerkaeufer
    ? en
      ? "the seller bears the incidental purchase costs"
      : "die Kaufnebenkosten trägt laut Angebot der Verkäufer"
    : en
      ? `incidental purchase costs of ${proz(w.kaufnebenkosten)} in ${w.land} (${proz(w.grunderwerbsteuer)} transfer tax, 1.5% notary, 0.5% land register) paid from equity`
      : `Kaufnebenkosten ${proz(w.kaufnebenkosten)} in ${w.land} (${proz(w.grunderwerbsteuer)} Grunderwerbsteuer, 1,5 % Notar, 0,5 % Grundbuch) aus Eigenkapital`;
  const afa =
    w.afa > 2
      ? en
        ? `increased depreciation (AfA) of ${proz(w.afa)}, which requires a remaining useful life report accepted by the tax office (otherwise 2%)`
        : `erhöhte AfA ${proz(w.afa)}, die ein vom Finanzamt anerkanntes Restnutzungsdauer-Gutachten voraussetzt (sonst 2 %)`
      : en
        ? `depreciation (AfA) of ${proz(w.afa)}`
        : `AfA ${proz(w.afa)}`;
  if (en) {
    return (
      `Example: ${w.titel}, ${w.ort} (${w.land})${w.beispiel ? `, ${w.beispiel}` : ""}, ${zahl(w.flaeche)} m², purchase price ${euro(kaufpreis)}, ` +
      `net cold rent ${euro(w.kaltmiete)} per month${w.garage ? ` including ${euro(w.garage)} garage rent` : ""}, ` +
      `non-recoverable service charge ${euro(w.nichtUmlagefaehig)} and maintenance reserve ${euro(w.ruecklage)} per month, figures from the exposé, ` +
      `purchase price fully financed at 4.8% interest and 1.2% repayment, ${knk}, building share ${proz(w.gebaeudeanteil)}, ${afa}, ` +
      "rents as in the exposé scenario, costs plus 2%, value plus 1.5% per year, income tax according to the 2026 tariff including solidarity surcharge, without church tax."
    );
  }
  return (
    `Beispiel ${w.titel}, ${w.ort} (${w.land})${w.beispiel ? `, ${w.beispiel}` : ""}, ${zahl(w.flaeche)} m², Kaufpreis ${euro(kaufpreis)}, ` +
    `Kaltmiete ${euro(w.kaltmiete)} im Monat${w.garage ? ` einschließlich ${euro(w.garage)} Garagenmiete` : ""}, ` +
    `nicht umlagefähiges Hausgeld ${euro(w.nichtUmlagefaehig)} und Rücklage ${euro(w.ruecklage)} im Monat, Zahlen aus dem Exposé, ` +
    `Kaufpreis voll finanziert zu 4,8 % Zins und 1,2 % Tilgung, ${knk}, Gebäudeanteil ${proz(w.gebaeudeanteil)}, ${afa}, ` +
    "Mieten wie im Exposé-Szenario, Kosten plus 2 %, Wert plus 1,5 % im Jahr, Steuer nach Tarif 2026 mit Solidaritätszuschlag, ohne Kirchensteuer."
  );
}
