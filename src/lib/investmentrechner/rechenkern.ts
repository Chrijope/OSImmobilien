/**
 * Rechenkern des Investmentrechners.
 *
 * Eins zu eins aus der Web-App „OS Immobilien Investmentrechner" übernommen.
 * Die Feldnamen im Eingabe- und Ergebnisobjekt sind bewusst die englischen
 * Originalnamen, damit die Referenzwerte in rechenkern.golden.json direkt
 * vergleichbar bleiben. Nur die Funktionsnamen sind deutsch.
 *
 * Alle Funktionen sind rein: keine Seiteneffekte, kein Datenzugriff.
 */

import { nebenkostenBasis } from "../kaufnebenkosten";

export type Steuerklasse = "I" | "II" | "III" | "IV" | "V" | "VI";
export type Steuerberechnungsmodus = "tariff" | "manual";
export type AfaMethode = "linear" | "declining";
export type Erhaltungsaufwandmodus = "expense" | "capitalize";
/** Tilgungszuschuss des KfW-Darlehens: in Prozent des Darlehens oder als Betrag. */
export type KfwZuschussArt = "percent" | "euro";

export interface InvestmentEingabe {
  clientName: string;
  annualGrossIncome: number;
  taxClass: Steuerklasse;
  jointAssessment: boolean;
  taxableIncomeCustomer: number;
  taxableIncomeSpouse: number;
  annualTaxableIncomeGrowth: number;
  churchTaxRate: number;
  includeSolidaritySurcharge: boolean;
  investmentShare: number;
  taxCalculationMode: Steuerberechnungsmodus;
  marginalTaxRate: number;
  propertyTitle: string;
  address: string;
  propertyType: string;
  area: number;
  rooms: number;
  constructionYear: number;
  purchasePrice: number;
  /*
    Der frühere Schalter `furnitureSeparatedInContract` („Möbel im
    Notarvertrag gesondert ausgewiesen“) ist seit dem 30.09.2026 weg: Möbel
    tragen jetzt immer keine Kaufnebenkosten, er steuerte nur noch die
    Grunderwerbsteuer-Basis. Gespeicherte Stände mit dem Feld lesen sich
    weiter, `eingabeAusJson` übernimmt nur bekannte Felder.
  */
  furniturePrice: number;
  /**
   * Davon Anteil an der Instandhaltungsrücklage, den der Käufer mit dem
   * Kaufpreis übernimmt. Keine Abschreibung, keine Werbungskosten, aber
   * grunderwerbsteuerpflichtig.
   */
  maintenanceReserve: number;
  transferTaxRate: number;
  notaryRate: number;
  landRegisterRate: number;
  brokerRate: number;
  otherPurchaseCostRate: number;
  /**
   * All-inclusive-Modell, seit dem 09.10.2026: Der Kaufpreis wird um die
   * Kaufnebenkosten erhöht, dafür fallen keine gesonderten an. Die Sätze
   * oben bleiben die Grundlage, aus ihnen entsteht der Aufschlag. Gespeicherte
   * Stände ohne das Feld bekommen den Standard, also aus.
   */
  allInclusive: boolean;
  equity: number;
  /**
   * Finanzierungsnebenkosten in Prozent der Darlehenssumme (Bank plus
   * Nachrang), vor allem die Grundschuldeintragung. Seit dem 25.09.2026,
   * Standard 0,2 Prozent wie bei Investagon (`register_fee_rate`).
   */
  financingCostRate: number;
  juniorLoanAmount: number;
  seniorInterestRate: number;
  seniorRepaymentRate: number;
  juniorInterestRate: number;
  juniorRepaymentRate: number;
  /*
    KfW-Darlehen, seit dem 07.10.2026, als drittes Darlehen neben Bank und
    Nachrang (siehe `kfwTilgungsplan`). Ohne Schalter rechnet nichts davon,
    gespeicherte Stände ohne die Felder bekommen die Standardwerte, also aus.
  */
  kfwEnabled: boolean;
  /** Nur Beschriftung, etwa „KfW 261 Sanierung“. Konditionen sind nicht hinterlegt. */
  kfwProgram: string;
  kfwLoanAmount: number;
  kfwInterestRate: number;
  /** Zinsbindung in Jahren. Gerechnet wird danach mit demselben Zins, wie beim Bankdarlehen. */
  kfwFixedRateYears: number;
  /** Gesamtlaufzeit in Jahren, das Darlehen ist danach voll getilgt. */
  kfwTermYears: number;
  /** Tilgungsfreie Anlaufjahre, 0 bis 5, immer kürzer als die Laufzeit. */
  kfwGracePeriodYears: number;
  kfwGrantMode: KfwZuschussArt;
  /** Tilgungszuschuss, je nach `kfwGrantMode` in Prozent oder Euro. 0 heißt keiner. */
  kfwGrantValue: number;
  /**
   * Gutschrift des Zuschusses am Ende dieses Jahres, laut Zusage. Pflicht,
   * sobald ein Zuschuss eingetragen ist: 0 heißt, der Zuschuss wird nicht
   * gerechnet (Prüfung vom 07.10.2026, vorher galt 0 als Ende der Anlaufzeit).
   */
  kfwGrantYear: number;
  monthlyColdRent: number;
  monthlyOperatingCosts: number;
  /**
   * Zuführung zur Instandhaltungsrücklage je Monat, seit dem 25.09.2026 ein
   * eigenes Feld. Sie zählt im Cashflow, aber nicht in den Werbungskosten,
   * siehe `RUECKLAGENZUFUEHRUNG_ABZIEHBAR`.
   */
  monthlyReserveContribution: number;
  vacancyRate: number;
  annualRentGrowth: number;
  annualCostGrowth: number;
  annualValueGrowth: number;
  buildingShare: number;
  depreciationMethod: AfaMethode;
  buildingDepreciationRate: number;
  specialDepreciationRate: number;
  specialDepreciationYears: number;
  furnitureDepreciationYears: number;
  rehabExpense: number;
  rehabMode: Erhaltungsaufwandmodus;
  rehabDistributionYears: number;
  startYear: number;
  forecastYears: number;
  /*
    Altersvorsorge, seit dem 09.10.2026, nur für das Deckblatt
    „Vermögensaufbau & Altersvorsorge“ (siehe altersvorsorge.ts). Der
    Rechenkern selbst liest sie nicht. 0 beim Alter heißt: nicht eingetragen.
  */
  clientAge: number;
  retirementAge: number;
  inflationRate: number;
  /**
   * Welche Bedeutung die Eingabe hat, für gespeicherte Stände. Ab Version 2
   * (25.09.2026) ist `purchasePrice` der Gesamtkaufpreis samt Möbeln; bis
   * dahin war es der Preis ohne Möbel. Gerechnet wird damit nichts, siehe
   * `eingabeAusJson` in investmentBerechnungenStore.ts.
   */
  eingabeVersion: number;
}

/** Die aktuelle Version der Eingabe, siehe `eingabeVersion`. */
export const EINGABE_VERSION = 2;

/** Schlüssel aller Zahlenfelder der Eingabe, für typsichere Setter in der Oberfläche. */
export type ZahlenFeld = {
  [K in keyof InvestmentEingabe]: InvestmentEingabe[K] extends number ? K : never;
}[keyof InvestmentEingabe];

/** Schlüssel aller Textfelder der Eingabe. */
export type TextFeld = {
  [K in keyof InvestmentEingabe]: InvestmentEingabe[K] extends string ? K : never;
}[keyof InvestmentEingabe];

export interface Steuerprofil {
  taxableIncome: number;
  incomeTax: number;
  solidarity: number;
  churchTax: number;
  totalTax: number;
  effectiveRate: number;
}

export interface Annuitaetsjahr {
  interest: number;
  principal: number;
  payment: number;
  closingBalance: number;
}

/** Ein Jahr eines Darlehens in der Jahrestabelle. Der Zuschuss ist keine Tilgung, er mindert nur die Restschuld. */
export interface Darlehensjahr extends Annuitaetsjahr {
  tilgungszuschuss: number;
}

export type Darlehensart = "bank" | "nachrang" | "kfw";

export interface Jahreswert {
  index: number;
  year: number;
  grossRent: number;
  effectiveRent: number;
  /** Summe aller Darlehen, ebenso `principal`, `debtService` und `remainingDebt`. */
  interest: number;
  /** Gezahlte Tilgung, ohne den KfW-Tilgungszuschuss. */
  principal: number;
  debtService: number;
  /** Jedes Darlehen einzeln, seit dem 07.10.2026. Ohne KfW und Nachrang stehen dort Nullen. */
  darlehen: Record<Darlehensart, Darlehensjahr>;
  /** Nicht umlagefähige Kosten, abziehbar. */
  operatingCosts: number;
  /** Zuführung zur Instandhaltungsrücklage, im Cashflow, steuerlich siehe `RUECKLAGENZUFUEHRUNG_ABZIEHBAR`. */
  reserveContribution: number;
  cashflowBeforeTax: number;
  buildingDepreciation: number;
  specialDepreciation: number;
  furnitureDepreciation: number;
  rehabDeduction: number;
  /** Finanzierungsnebenkosten als Werbungskosten, nur im ersten Jahr. */
  financingCostDeduction: number;
  taxableResult: number;
  allocatedTaxableResult: number;
  taxableIncomeBefore: number;
  taxableIncomeAfter: number;
  taxBefore: Steuerprofil;
  taxAfter: Steuerprofil;
  taxEffect: number;
  cashflowAfterTax: number;
  cumulativeCashflowAfterTax: number;
  /** Summe aller Zuzahlungen bis hierher, ohne Gegenrechnung der Ueberschussjahre. */
  cumulativeEigenanteil: number;
  propertyValue: number;
  remainingDebt: number;
  propertyEquity: number;
  totalWealth: number;
  /** Wertsteigerung des Immobilienanteils bis zum Jahresende. Möbel und Rücklage steigen nicht. */
  wertzuwachs: number;
  /** Möbel-AfA-Basis abzüglich aller Möbel-AfA bis zum Jahresende. */
  moebelRestbuchwert: number;
}

export interface InvestmentErgebnis {
  purchaseCostRate: number;
  /** Gesonderte Kaufnebenkosten. Beim All-inclusive-Modell 0, sie stecken dann im Kaufpreis. */
  purchaseCosts: number;
  /** Das All-inclusive-Modell ist an, siehe `InvestmentEingabe.allInclusive`. */
  allInclusive: boolean;
  /**
   * Der Aufschlag auf den Kaufpreis beim All-inclusive-Modell: die Kaufnebenkosten,
   * genau wie im normalen Modell gerechnet. 0 ohne das Modell.
   */
  allInclusiveAufschlag: number;
  totalInvestment: number;
  seniorLoanAmount: number;
  /** KfW-Darlehen, anteilig und auf den Finanzierungsbedarf gedeckelt. 0 ohne Schalter. */
  kfwLoanAmount: number;
  /** Der KfW-Betrag war höher als der Finanzierungsbedarf und wurde gekürzt. */
  kfwGekuerzt: boolean;
  /** Kaufpreis und Kaufnebenkosten minus Eigenkapital und Nachrang: was Bank und KfW zusammen finanzieren. */
  finanzierungsbedarf: number;
  /** Tilgungszuschuss laut Eingabe in Euro (Prozent schon umgerechnet), vor jeder Kürzung. */
  kfwTilgungszuschussNominal: number;
  /**
   * Was davon tatsächlich gutgeschrieben wird: höchstens die Restschuld im
   * Gutschriftmonat, 0 ohne Gutschriftjahr oder nach der vollen Tilgung.
   */
  kfwTilgungszuschuss: number;
  /** Ein Zuschuss ist eingetragen, aber kein Gutschriftjahr: Er wird nicht gerechnet. */
  kfwZuschussOhneJahr: boolean;
  /** Restschuld des KfW-Darlehens am Ende seiner Zinsbindung, auch wenn die Prognose kürzer ist. */
  kfwRestschuldZinsbindung: number;
  /** Die gerechneten tilgungsfreien Jahre: höchstens fünf und kürzer als die Laufzeit. */
  kfwAnlaufJahre: number;
  /** Rate des KfW-Darlehens je Monat nach den tilgungsfreien Jahren (Annuität). */
  kfwAnnuitaetMonat: number;
  /**
   * Mischzins: Sollzins aller Darlehen, gewichtet mit ihrem Anfangsbetrag,
   * als Faktor. 0 ohne Darlehen.
   */
  mischzins: number;
  /**
   * Die Gesamtrate springt, weil die tilgungsfreie Zeit der KfW endet. `jahr`
   * zählt ab 1, Raten je Monat. `null` ohne tilgungsfreie Jahre.
   */
  rateSprung: { jahr: number; kalenderjahr: number; rateVorher: number; rateNachher: number } | null;
  /** Der gerechnete Miteigentumsanteil als Faktor, bei Zusammenveranlagung 1. Für Grenzen je m² der ganzen Wohnung. */
  anteil: number;
  totalDebt: number;
  financingGap: number;
  monthlyDebtService: number;
  grossYield: number;
  netYield: number;
  effectiveAnnualRent: number;
  depreciationBasis: number;
  immediateDeductionRatio: number;
  simpleThresholdExceeded: boolean;
  combinedTaxableIncome: number;
  taxProfile: Steuerprofil;
  marginalIncomeTaxRate: number;
  marginalTotalTaxRate: number;
  cumulativeTaxEffect: number;
  irr: number | null;
  irrWithoutAppreciation: number | null;
  /**
   * Was der Kunde ueber die ganze Laufzeit einsetzt: eingetragenes
   * Eigenkapital plus Finanzierungsnebenkosten plus die Summe aller
   * monatlichen Zuzahlungen.
   */
  eigenkapitalBasis: number;
  /** Was der Kunde im ersten Jahr monatlich selbst zuzahlt, positiv. */
  eigenanteilMonat: number;
  /** Zuwachs an Eigenkapital in der Immobilie je Monat, mit Wertzuwachs. */
  vermoegensaufbauMonat: number;
  /**
   * Immobilie minus Darlehen zu Beginn, mindestens null: der Stand, von dem
   * aus der Vermögensaufbau zählt. Seit dem 25.09.2026 als eigenes Feld, damit
   * der Rechenweg unter der Kachel ihn zeigen kann, statt ihn nachzurechnen.
   */
  vermoegenStart: number;
  /** Davon der harte Teil: die gezahlte Tilgung je Monat, ohne KfW-Tilgungszuschuss. */
  tilgungMonat: number;
  /** Summe der gezahlten Tilgung im Prognosezeitraum, alle Darlehen, ohne Zuschuss. */
  getilgtGesamt: number;
  /** Im Prognosezeitraum gutgeschriebener KfW-Tilgungszuschuss. Er steckt im Vermögensaufbau, nicht in der Tilgung. */
  tilgungszuschussPrognose: number;
  /** Was aus jedem eingesetzten Euro wird, ueber die ganze Laufzeit. */
  faktorJeEuro: number;
  /*
    Die Kalkulationsbasis, seit dem 25.09.2026 als eigene Felder. Alle Beträge
    sind der Anteil dieses Kunden, also schon mit dem Miteigentumsanteil
    gerechnet. Die Oberfläche liest sie, statt selbst zu rechnen.
  */
  /** Gesamtkaufpreis, beim All-inclusive-Modell samt `allInclusiveAufschlag`. */
  kaufpreisGesamt: number;
  /** Davon Möbel/Inventar, gedeckelt auf den Kaufpreis. */
  moebelAnteil: number;
  /** Davon Erhaltungsaufwand. */
  erhaltungsaufwand: number;
  /** Davon Anteil an der Instandhaltungsrücklage, ein Guthaben ohne Abschreibung. */
  ruecklage: number;
  /** Kaufpreis ohne Möbel und Rücklage: das, was in Grund und Boden und Gebäude aufgeteilt wird. */
  immobilienanteil: number;
  /** Grund und Boden, der Teil des Immobilienanteils ohne Abschreibung. */
  grundstuecksanteil: number;
  /** Gebäude (Wohnung), der Rest des Immobilienanteils. */
  gebaeudeanteilKaufpreis: number;
  /**
   * Worauf alle prozentualen Kaufnebenkosten laufen, auch die
   * Grunderwerbsteuer: der Kaufpreis der Immobilie, also Gesamtkaufpreis ohne
   * Erhaltungsaufwand und ohne Möbel (seit dem 30.09.2026, siehe
   * `nebenkostenBasis` in kaufnebenkosten.ts). Ohne beide ist das der
   * Gesamtkaufpreis.
   */
  nebenkostenBasis: number;
  grunderwerbsteuer: number;
  /** Notar und Grundbuch als Beträge, damit die Oberfläche sie zeigt, statt nachzurechnen. */
  notarkosten: number;
  grundbuchkosten: number;
  /**
   * Die Kaufnebenkosten, nach dem Gebäudeanteil geteilt. Zusammen ergeben sie
   * `purchaseCosts`, beim All-inclusive-Modell den Aufschlag; dort sind auch
   * Grunderwerbsteuer, Notar und Grundbuch die Bestandteile des Aufschlags.
   * Die Möbel tragen seit dem 30.09.2026 keine mehr.
   */
  nebenkostenGrundstueck: number;
  nebenkostenGebaeude: number;
  /** Der Möbelanteil, verteilt über die Möbel-Nutzungsdauer. Ohne Nebenkosten. */
  moebelAfaBasis: number;
  /**
   * Finanzierungsnebenkosten: Satz mal Darlehenssumme. Sie stecken in
   * `totalInvestment` und im Einsatz zu Beginn, nicht im Darlehen.
   */
  finanzierungsnebenkosten: number;
  years: Jahreswert[];
}

/** Standardwerte, mit denen der Rechner startet (Original „ue"). */
export const standardEingabe: InvestmentEingabe = {
  clientName: "",
  annualGrossIncome: 0,
  taxClass: "I",
  jointAssessment: false,
  taxableIncomeCustomer: 0,
  taxableIncomeSpouse: 0,
  annualTaxableIncomeGrowth: 0,
  churchTaxRate: 0,
  includeSolidaritySurcharge: true,
  investmentShare: 100,
  taxCalculationMode: "tariff",
  marginalTaxRate: 42,
  propertyTitle: "",
  address: "",
  propertyType: "",
  area: 0,
  rooms: 0,
  constructionYear: 0,
  purchasePrice: 0,
  furniturePrice: 0,
  maintenanceReserve: 0,
  transferTaxRate: 3.5,
  notaryRate: 1,
  landRegisterRate: 0.5,
  brokerRate: 0,
  otherPurchaseCostRate: 0,
  allInclusive: false,
  equity: 0,
  financingCostRate: 0.2,
  juniorLoanAmount: 0,
  seniorInterestRate: 4,
  seniorRepaymentRate: 1.5,
  juniorInterestRate: 6,
  juniorRepaymentRate: 1,
  kfwEnabled: false,
  kfwProgram: "",
  kfwLoanAmount: 0,
  kfwInterestRate: 2.5,
  kfwFixedRateYears: 10,
  kfwTermYears: 30,
  kfwGracePeriodYears: 0,
  kfwGrantMode: "percent",
  kfwGrantValue: 0,
  kfwGrantYear: 0,
  monthlyColdRent: 0,
  monthlyOperatingCosts: 0,
  monthlyReserveContribution: 0,
  vacancyRate: 0,
  annualRentGrowth: 2,
  annualCostGrowth: 2,
  annualValueGrowth: 1.5,
  buildingShare: 80,
  depreciationMethod: "linear",
  buildingDepreciationRate: 2,
  specialDepreciationRate: 0,
  specialDepreciationYears: 4,
  furnitureDepreciationYears: 10,
  rehabExpense: 0,
  rehabMode: "expense",
  rehabDistributionYears: 1,
  startYear: 2026,
  forecastYears: 10,
  clientAge: 0,
  retirementAge: 67,
  inflationRate: 2,
  eingabeVersion: EINGABE_VERSION,
};

/**
 * Ist die Zuführung zur Instandhaltungsrücklage bei Zahlung als Werbungskosten
 * abziehbar? Die einzige Stelle, an der das entschieden wird.
 *
 * Nein, seit dem 25.09.2026. Nach dem BFH (Urteil vom 14.01.2025, IX R
 * 19/24) sind Zahlungen in die Erhaltungsrücklage erst abziehbar, wenn die
 * Gemeinschaft das Geld tatsächlich für Erhaltung ausgibt, nicht schon bei
 * der Einzahlung. Wann das geschieht, weiß der Rechner nicht, deshalb zieht
 * er die Zuführung gar nicht ab. Im Cashflow zählt sie trotzdem, denn sie
 * verlässt das Konto des Kunden jeden Monat.
 *
 * Das ist eine bewusste Abweichung von Investagon, das die Zuführung mit dem
 * übrigen Hausgeld absetzt. Christian kann sie hier umstellen: `true` rechnet
 * wie Investagon.
 */
export const RUECKLAGENZUFUEHRUNG_ABZIEHBAR = false;

/** Prozentangabe (z. B. 3,5) in einen Faktor (0,035) umrechnen, negative Werte werden zu 0. */
export const prozentAnteil = (wert: number): number => Math.max(0, wert) / 100;

/** NaN und Unendlich auf 0 abfangen, damit leere Eingaben nicht durchschlagen. */
export const endlicheZahl = (wert: number): number => (Number.isFinite(wert) ? wert : 0);

/**
 * Einkommensteuer nach dem Tarif 2026 (§ 32a EStG in der Fassung des
 * Steuerfortentwicklungsgesetzes): Grundfreibetrag 12.348 Euro, erste
 * Progressionszone bis 17.799 Euro, zweite bis 69.878 Euro, Spitzensatz 42 %
 * bis 277.825 Euro, darüber 45 %. Das zvE wird wie im Gesetz auf volle Euro
 * abgerundet, ebenso der Steuerbetrag. Splitting: Steuer auf das halbe
 * Einkommen, verdoppelt.
 */
export function einkommensteuerTarif2026(zvE: number, splitting = false): number {
  const einkommen = Math.max(0, Math.floor(endlicheZahl(zvE)));
  if (splitting) return 2 * einkommensteuerTarif2026(Math.floor(einkommen / 2), false);
  const x = einkommen;
  let steuer = 0;
  if (x <= 12348) steuer = 0;
  else if (x <= 17799) {
    const y = (x - 12348) / 1e4;
    steuer = (914.51 * y + 1400) * y;
  } else if (x <= 69878) {
    const z = (x - 17799) / 1e4;
    steuer = (173.1 * z + 2397) * z + 1034.87;
  } else steuer = x <= 277825 ? 0.42 * x - 11135.63 : 0.45 * x - 19470.38;
  return Math.max(0, Math.floor(steuer));
}

/**
 * Solidaritätszuschlag: 5,5 % der Einkommensteuer, aber wegen der Freigrenze
 * (20.350 Euro, bei Splitting 40.700 Euro) höchstens 11,9 % des Betrags, um
 * den die Steuer die Freigrenze übersteigt (Milderungszone).
 */
export function solidaritaetszuschlag(einkommensteuer: number, splitting = false): number {
  const freigrenze = splitting ? 40700 : 20350;
  const regulaer = Math.max(0, einkommensteuer) * 0.055;
  const milderung = Math.max(0, einkommensteuer - freigrenze) * 0.119;
  return Math.min(regulaer, milderung);
}

/** Vollständiges Steuerprofil für ein zvE: ESt, Soli, Kirchensteuer, Gesamt, effektiver Satz. */
export function steuerprofil(
  zvE: number,
  splitting: boolean,
  kirchensteuersatz: number,
  mitSoli: boolean,
): Steuerprofil {
  const einkommen = Math.max(0, zvE);
  const einkommensteuer = einkommensteuerTarif2026(einkommen, splitting);
  const soli = mitSoli ? solidaritaetszuschlag(einkommensteuer, splitting) : 0;
  const kirchensteuer = einkommensteuer * prozentAnteil(kirchensteuersatz);
  const gesamt = einkommensteuer + soli + kirchensteuer;
  return {
    taxableIncome: einkommen,
    incomeTax: einkommensteuer,
    solidarity: soli,
    churchTax: kirchensteuer,
    totalTax: gesamt,
    effectiveRate: einkommen > 0 ? gesamt / einkommen : 0,
  };
}

/**
 * Grenzsteuersatz als Differenzenquotient über 100 Euro zusätzliches zvE,
 * wahlweise nur auf die Einkommensteuer oder auf die Gesamtbelastung.
 */
export function grenzsteuersatz(
  zvE: number,
  splitting: boolean,
  kirchensteuersatz: number,
  mitSoli: boolean,
  gesamtbelastung: boolean,
): number {
  const basis = steuerprofil(zvE, splitting, kirchensteuersatz, mitSoli);
  const plusHundert = steuerprofil(zvE + 100, splitting, kirchensteuersatz, mitSoli);
  return gesamtbelastung
    ? (plusHundert.totalTax - basis.totalTax) / 100
    : (plusHundert.incomeTax - basis.incomeTax) / 100;
}

/** Ein Jahr Annuitätendarlehen: Zins auf den Restsaldo, Rest der Jahresrate ist Tilgung. */
export function annuitaetsjahr(restsaldo: number, zinssatz: number, jahresrate: number): Annuitaetsjahr {
  if (restsaldo <= 0) return { interest: 0, principal: 0, payment: 0, closingBalance: 0 };
  const zinsen = restsaldo * zinssatz;
  const tilgungRoh = Math.max(0, jahresrate - zinsen);
  const tilgung = Math.min(restsaldo, tilgungRoh);
  return {
    interest: zinsen,
    principal: tilgung,
    payment: zinsen + tilgung,
    closingBalance: Math.max(0, restsaldo - tilgung),
  };
}

/** Das KfW-Darlehen Monat für Monat, zu Jahren zusammengefasst. */
export interface KfwTilgungsplan {
  jahre: Darlehensjahr[];
  /** Rate je Monat im ersten Monat. */
  ersteRate: number;
  /** Rate je Monat ab dem Ende der tilgungsfreien Zeit, auf den vollen Betrag berechnet. */
  annuitaet: number;
  /** Tatsächlich gezahlte Rate im letzten Monat der Anlaufzeit und im ersten danach. */
  rateVorAnlaufende: number;
  rateNachAnlaufende: number;
  restschuldZinsbindung: number;
  /** Was vom Zuschuss tatsächlich gutgeschrieben wurde: höchstens die Restschuld, 0 nach der Tilgung. */
  zuschussAngerechnet: number;
  /** Jahr (ab 0), in dem der Zuschuss gutgeschrieben wird, oder -1 ohne Gutschrift. */
  zuschussJahr: number;
}

/**
 * Tilgungsplan des KfW-Darlehens, monatlich wie bei der KfW.
 *
 * In den tilgungsfreien Anlaufjahren zahlt der Kunde nur Zinsen. Danach eine
 * gleichbleibende Annuität, berechnet auf den vollen Kreditbetrag über die
 * Restlaufzeit.
 *
 * Der Tilgungszuschuss wird am Ende des Jahres `zuschussNachJahren`
 * gutgeschrieben und mindert nur die Restschuld. Die Annuität bleibt, die
 * Laufzeit verkürzt sich (Merkblatt KfW 261). Ohne Gutschriftjahr (0) wird
 * kein Zuschuss gerechnet: Den Zeitpunkt nennt die Zusage, raten wir ihn,
 * stünde eine Restschuld da, die es nicht gibt (Prüfung vom 07.10.2026).
 *
 * Nach der Zinsbindung rechnet der Plan mit demselben Zins weiter, wie das
 * Bankdarlehen auch; `restschuldZinsbindung` nennt, was dann anzuschließen ist.
 */
export function kfwTilgungsplan(
  betrag: number,
  zinsProzent: number,
  laufzeitJahre: number,
  anlaufJahre: number,
  zinsbindungJahre: number,
  zuschuss: number,
  zuschussNachJahren: number,
  prognoseJahre: number,
): KfwTilgungsplan {
  const i = prozentAnteil(zinsProzent) / 12;
  const laufzeit = Math.max(1, Math.round(laufzeitJahre)) * 12;
  const anlauf = Math.min(laufzeit - 12, Math.max(0, Math.round(anlaufJahre)) * 12);
  const bindung = Math.max(0, Math.round(zinsbindungJahre)) * 12;
  const zuschussMonat = zuschuss > 0 && zuschussNachJahren >= 1 ? Math.round(zuschussNachJahren) * 12 : -1;
  const leer = (): Darlehensjahr => ({ interest: 0, principal: 0, payment: 0, closingBalance: 0, tilgungszuschuss: 0 });
  const jahre = Array.from({ length: prognoseJahre }, leer);
  const monateMitRate = laufzeit - anlauf;
  const anfang = Math.max(0, betrag);
  // Vor jedem Zuschuss bestimmt und danach unverändert.
  const rate = anfang > 0 ? (i > 0 ? (anfang * i) / (1 - (1 + i) ** -monateMitRate) : anfang / monateMitRate) : 0;

  let rest = anfang;
  let ersteRate = 0;
  let rateVorAnlaufende = 0;
  let rateNachAnlaufende = 0;
  let zuschussAngerechnet = 0;
  let restschuldZinsbindung = bindung === 0 ? rest : 0;
  for (let monat = 1; monat <= laufzeit && rest > 0; monat += 1) {
    const zinsen = rest * i;
    const tilgung = monat <= anlauf ? 0 : Math.min(rest, rate - zinsen);
    rest -= tilgung;
    let zuschussJetzt = 0;
    if (monat === zuschussMonat) {
      zuschussJetzt = Math.min(rest, zuschuss);
      rest -= zuschussJetzt;
      zuschussAngerechnet = zuschussJetzt;
    }
    if (rest < 0.005) rest = 0;
    const zahlung = zinsen + tilgung;
    if (monat === 1) ersteRate = zahlung;
    if (monat === anlauf) rateVorAnlaufende = zahlung;
    if (monat === anlauf + 1) rateNachAnlaufende = zahlung;
    if (monat === bindung) restschuldZinsbindung = rest;
    const jahr = jahre[Math.floor((monat - 1) / 12)];
    if (!jahr) continue;
    jahr.interest += zinsen;
    jahr.principal += tilgung;
    jahr.payment += zahlung;
    jahr.tilgungszuschuss += zuschussJetzt;
    jahr.closingBalance = rest;
  }
  return {
    jahre,
    ersteRate,
    annuitaet: rate,
    rateVorAnlaufende,
    rateNachAnlaufende,
    restschuldZinsbindung,
    zuschussAngerechnet,
    zuschussJahr: zuschussAngerechnet > 0 ? zuschussMonat / 12 - 1 : -1,
  };
}

/** Die Jahresraten eines Darlehens mit fester Jahresrate, unabhängig von der Prognoselänge. */
function jahresraten(betrag: number, zinssatz: number, jahresrate: number, jahre: number): number[] {
  const raten: number[] = [];
  let rest = betrag;
  for (let jahr = 0; jahr < jahre; jahr += 1) {
    const ergebnis = annuitaetsjahr(rest, zinssatz, jahresrate);
    raten.push(ergebnis.payment);
    rest = ergebnis.closingBalance;
  }
  return raten;
}

/** Kapitalwert einer Zahlungsreihe bei gegebenem Zinssatz. */
export function kapitalwert(zinssatz: number, zahlungen: number[]): number {
  return zahlungen.reduce((summe, zahlung, periode) => summe + zahlung / (1 + zinssatz) ** periode, 0);
}

/**
 * Interner Zinsfuß per Bisektion zwischen -99,9 % und 1000 %. Ohne
 * Vorzeichenwechsel in der Zahlungsreihe gibt es keine Lösung, dann null.
 */
export function internerZinsfuss(zahlungen: number[]): number | null {
  if (!zahlungen.some((z) => z < 0) || !zahlungen.some((z) => z > 0)) return null;
  let untere = -0.999;
  let obere = 10;
  let wertUnten = kapitalwert(untere, zahlungen);
  let wertOben = kapitalwert(obere, zahlungen);
  if (wertUnten * wertOben > 0) return null;
  for (let schritt = 0; schritt < 180; schritt += 1) {
    const mitte = (untere + obere) / 2;
    const wertMitte = kapitalwert(mitte, zahlungen);
    if (Math.abs(wertMitte) < 1e-4) return mitte;
    if (wertUnten * wertMitte <= 0) {
      obere = mitte;
      wertOben = wertMitte;
    } else {
      untere = mitte;
      wertUnten = wertMitte;
    }
  }
  return (untere + obere) / 2;
}

/**
 * Gesamtberechnung: Kaufkosten, Finanzierung, Steuerprofil und Jahresprognose.
 *
 * `hoechstJahre` deckelt die Prognose. Die Oberfläche bleibt bei 30; nur die
 * Altersvorsorge (siehe altersvorsorge.ts) rechnet bis zum Rentenbeginn und
 * darüber hinaus weiter, seit dem 09.10.2026.
 */
export function berechneInvestment(eingabe: InvestmentEingabe, hoechstJahre = 30): InvestmentErgebnis {
  // Alle Zahlenfelder gegen NaN absichern, Texte und Schalter bleiben unverändert.
  // Fehlende Felder kommen aus der Standardeingabe: Eine Eingabe von vor
  // einem neuen Feld (etwa dem Rücklagenanteil vom 25.09.2026) rechnet sonst
  // mit undefined, und das färbt jede Zahl zu NaN.
  const t = Object.fromEntries(
    Object.entries({ ...standardEingabe, ...eingabe }).map(([schluessel, wert]) => [
      schluessel,
      typeof wert === "number" ? endlicheZahl(wert) : wert,
    ]),
  ) as unknown as InvestmentEingabe;

  /*
    Der Miteigentumsanteil, seit dem 21.09.2026 an einer Stelle statt gar nicht.

    ## Was vorher falsch war

    Der Anteil wirkte im ganzen Rechenkern an genau einer Zeile: Er teilte das
    steuerliche Ergebnis. Miete, Kosten, Rate, Immobilienwert, Restschuld und
    damit auch der Cashflow blieben auf dem vollen Objekt.

    Die Folge war die Umkehrung der Wahrheit: Wer 50 Prozent eingab, bekam einen
    HOEHEREN monatlichen Eigenanteil angezeigt als jemand, der dieselbe Wohnung
    allein kauft. Der Eigenanteil ist die Zuzahlung minus die Steuerersparnis;
    die Zuzahlung blieb voll, die Ersparnis schrumpfte auf die Haelfte.

    ## Warum die Teilung hier oben steht

    Geteilt werden die Eingaben, nicht die Formeln. Damit rechnet alles
    darunter von selbst anteilig, und es gibt keine zwanzig Stellen, an denen
    eine Multiplikation vergessen werden koennte. Genau so ist der Fehler
    entstanden.

    Geteilt wird, was in Euro gemessen wird und zum Objekt gehoert: Kaufpreis,
    Moebel, Miete, Betriebskosten, Nachrangdarlehen und der Erhaltungsaufwand.
    Prozentsaetze bleiben unberuehrt, denn in einem Bruch werden Zaehler und
    Nenner gleichermassen geteilt: Die Bruttorendite eines halben Objekts ist
    dieselbe wie die des ganzen.

    ## Das Eigenkapital bleibt ungeteilt

    Christians Entscheidung vom 21.09.2026. Bringen zwei Partner
    unterschiedlich viel mit, ist der Anteil am Eigenkapital nicht der
    Miteigentumsanteil. Das Feld wird deshalb als Betrag DIESES Kunden gelesen.

    ## Zusammenveranlagung

    Bei gemeinsamer Veranlagung ist der Anteil steuerlich folgenlos, weil beide
    Haelften in derselben Erklaerung landen. Der Rechenkern setzt ihn deshalb
    selbst auf 100 Prozent, und die Oberflaeche sperrt das Feld dazu passend
    (siehe Eingabebereiche.tsx).

    Die Sperre allein wuerde nicht genuegen: Ein Kunde kann 50 eingetragen und
    die Zusammenveranlagung erst danach angehakt haben. Dann stuende in der
    Eingabe weiter 50, und der Rechner haette ohne diese Zeile das ganze
    Investment halbiert, obwohl dem Ehepaar die ganze Wohnung gehoert.
  */
  const anteil = t.jointAssessment
    ? 1
    : Math.min(1, Math.max(0, prozentAnteil(t.investmentShare)));

  /** Alle Sätze außer der Grunderwerbsteuer: Notar, Grundbuch, Makler, Sonstige. */
  const satzOhneGrunderwerbsteuer =
    prozentAnteil(t.notaryRate) +
    prozentAnteil(t.landRegisterRate) +
    prozentAnteil(t.brokerRate) +
    prozentAnteil(t.otherPurchaseCostRate);
  const summeDerSaetze = prozentAnteil(t.transferTaxRate) + satzOhneGrunderwerbsteuer;
  /*
    Ein Kaufpreis, seit dem 25.09.2026.

    `purchasePrice` ist der Gesamtkaufpreis, so wie er im Kaufvertrag steht.
    Möbel und Erhaltungsaufwand sind darin enthaltene Anteile, keine Beträge
    obendrauf. Vorher waren es zwei Preise, Wohnung und Möbel, und die Möbel
    kamen zu den Gesamtkosten hinzu. Der Investagon-Import speichert aber
    Wohnung plus Möbel als einen Preis, und so doppelte sich der Möbelbetrag,
    sobald ihn jemand zusätzlich eintrug.

    Die Möbel werden auf den Kaufpreis gedeckelt: Mehr Möbel als Kaufpreis
    ist ein Tippfehler, und ein negativer Wohnungsteil rechnete sonst eine
    negative Abschreibung.
  */
  // Ab hier ist jeder Euro der Anteil dieses Kunden, nicht mehr das ganze Objekt.
  const purchasePrice = Math.max(0, t.purchasePrice) * anteil;
  const furniturePrice = Math.min(purchasePrice, Math.max(0, t.furniturePrice) * anteil);
  const wohnungspreis = purchasePrice - furniturePrice;
  /*
    Anteil an der Instandhaltungsrücklage, seit dem 25.09.2026. Er steckt im
    Kaufpreis, ist aber weder Gebäude noch Boden, sondern ein Guthaben bei
    der Eigentümergemeinschaft: keine Abschreibung, keine Werbungskosten.
    Die Grunderwerbsteuer fällt trotzdem darauf an (BFH, II R 49/17), er
    bleibt deshalb in deren Basis. Gedeckelt auf den Kaufpreis ohne Möbel.
  */
  const ruecklage = Math.min(wohnungspreis, Math.max(0, t.maintenanceReserve) * anteil);
  const monthlyColdRent = t.monthlyColdRent * anteil;
  const monthlyOperatingCosts = t.monthlyOperatingCosts * anteil;
  const monthlyReserveContribution = Math.max(0, t.monthlyReserveContribution) * anteil;
  const rehabEingabe = Math.max(0, t.rehabExpense) * anteil;
  /*
    Aufteilung des Kaufpreises, genau einmal und nur hier.

    Der Immobilienanteil ist der Kaufpreis ohne Möbel. Nur er wird über den
    Gebäudeanteil in Grund und Boden und Gebäude geteilt; die Möbel bleiben
    außen vor, sie haben ihre eigene Abschreibung. Vorher stand die Teilung
    als Formel direkt in der AfA-Basis und in der 15-Prozent-Prüfung, jeweils
    mit eigenem Ausgangswert.
  */
  // Ohne Möbel und ohne Rücklage: Nur was Grund und Boden oder Gebäude ist.
  const immobilienanteil = wohnungspreis - ruecklage;
  const gebaeudeanteilKaufpreis = immobilienanteil * prozentAnteil(t.buildingShare);
  const grundstuecksanteil = immobilienanteil - gebaeudeanteilKaufpreis;
  /*
    Erhaltungsaufwand, seit dem 25.09.2026 ohne Doppelzählung.

    Er ist Teil des Kaufpreises und steckt damit schon im Gebäudeanteil.
    Vorher wirkte er doppelt: Bei „Abziehen“ als Werbungskosten und zugleich
    über den Kaufpreis in der Gebäude-AfA, bei „Aktivieren“ einmal über den
    Kaufpreis und ein zweites Mal obendrauf.

    Er mindert nur den Gebäudeteil, nicht den Immobilienanteil vor der
    Aufteilung. Renoviert wird das Gebäude, nie der Boden, und der
    Gebäudeanteil aus Kaufvertrag oder Arbeitshilfe des BMF bezieht sich auf
    den Kaufpreis, in dem der Sanierungsanteil steckt. So bleibt der
    Bodenwert derselbe, gleich wie der Aufwand steuerlich behandelt wird.
    Würde er vor der Aufteilung abgezogen, bekäme der Boden einen Teil des
    Abzugs, und das Gebäude schriebe entsprechend zu viel ab. Investagon
    teilt genauso.

    Mehr Aufwand als Gebäudeteil ist ein Eingabefehler; gedeckelt, damit die
    AfA-Basis nicht negativ wird und nicht mehr abgezogen wird, als im Preis
    steckt. Die Deckelung steht seit dem 30.09.2026 vor den Kaufnebenkosten,
    weil der gedeckelte Aufwand deren Basis mindert.
  */
  const rehabExpense = Math.min(rehabEingabe, gebaeudeanteilKaufpreis);

  /*
    Kaufnebenkosten, seit dem 30.09.2026 auf den Kaufpreis der Immobilie:
    Gesamtkaufpreis ohne Erhaltungsaufwand und ohne Möbel.

    Beide sind bei uns gesonderte Leistungen, im Notarvertrag eigens
    ausgewiesen. Sie stecken im Gesamtkaufpreis, aber Grunderwerbsteuer,
    Notar, Grundbuch, Makler und Sonstige laufen nur auf den Rest. Die Regel
    steht in `nebenkostenBasis`, damit alle Rechner dieselbe nehmen. Vom 25.
    bis 30.09.2026 lief alles auf den ganzen Gesamtkaufpreis, danach kurz auf
    den Gesamtkaufpreis ohne Aufwand; die Möbel trugen bis dahin ihren Anteil,
    die Grunderwerbsteuer nur ohne den Schalter „gesondert ausgewiesen“.

    Die Rücklage bleibt in der Basis: Auf sie fällt Grunderwerbsteuer an (BFH,
    II R 49/17).

    `purchaseCostRate` ist damit immer die Summe der Sätze, bezogen auf die
    Basis. Er bleibt als eigenes Feld, weil Anzeige und PDF ihn lesen.
  */
  const basisNebenkosten = nebenkostenBasis(purchasePrice, rehabExpense, furniturePrice);
  const grunderwerbsteuer = basisNebenkosten * prozentAnteil(t.transferTaxRate);
  const notarkosten = basisNebenkosten * prozentAnteil(t.notaryRate);
  const grundbuchkosten = basisNebenkosten * prozentAnteil(t.landRegisterRate);
  const purchaseCosts = grunderwerbsteuer + basisNebenkosten * satzOhneGrunderwerbsteuer;
  const purchaseCostRate = summeDerSaetze;
  /*
    All-inclusive-Modell, seit dem 09.10.2026 (Vorgabe der Geschäftsführung):
    Der Kaufpreis wird um die Kaufnebenkosten erhöht, gesonderte fallen dafür
    keine an. Gerechnet wird intern genau wie im normalen Modell, nur der
    Ausweis ist ein anderer: Der Aufschlag ist dieselbe Summe auf derselben
    Basis mit denselben Sätzen. Deshalb bleiben Finanzierungsbedarf, Darlehen
    und Gesamtkosten betragsgleich, und der Aufschlag geht wie sonst die
    Nebenkosten nach dem Gebäudeanteil in die AfA-Basis und zum Boden. Die
    Steuer ändert sich also nicht.

    Der Immobilienwert für die Wertentwicklung (`immobilienanteil`,
    `propertyValue`, Wertzuwachs, Vermögen) bleibt auf dem Kaufpreis ohne
    Aufschlag. Sonst stünde der Kunde beim Vermögen besser da als im
    normalen Modell, obwohl er dasselbe kauft.
  */
  const allInclusive = t.allInclusive === true;
  const allInclusiveAufschlag = allInclusive ? purchaseCosts : 0;
  /** Kaufpreis plus Kaufnebenkosten: daraus ergibt sich das Darlehen. */
  const kaufkosten = purchasePrice + purchaseCosts;
  const juniorLoan = Math.max(0, t.juniorLoanAmount) * anteil;
  /*
    Das Eigenkapital wird NICHT anteilig gerechnet, es ist der Betrag dieses
    Kunden. Bringt er mehr mit, als sein Anteil kostet, kappt Math.max das
    Darlehen auf null und der Ueberschuss steht in `financingGap`.
  */
  const finanzierungsbedarf = Math.max(0, kaufkosten - Math.max(0, t.equity) - juniorLoan);
  /*
    KfW-Darlehen, seit dem 07.10.2026. Es ersetzt einen Teil des
    Bankdarlehens, genau wie das Nachrangdarlehen: Die Bank finanziert den
    Rest. Mehr KfW als Finanzierungsbedarf wäre Geld, das niemand braucht,
    deshalb wird gedeckelt und die Oberfläche sagt es.
  */
  const kfwGewuenscht = t.kfwEnabled ? Math.max(0, t.kfwLoanAmount) * anteil : 0;
  const kfwLoanAmount = Math.min(kfwGewuenscht, finanzierungsbedarf);
  const seniorLoanAmount = Math.max(0, finanzierungsbedarf - kfwLoanAmount);
  const totalDebt = seniorLoanAmount + juniorLoan + kfwLoanAmount;
  /*
    Finanzierungsnebenkosten, seit dem 25.09.2026.

    Satz mal Darlehenssumme, vor allem die Grundschuldeintragung. Sie zählen
    zu den Gesamtkosten, genau wie bei Investagon (Sigmundstraße 2: 646,02
    Euro in 375.741 Euro Gesamtkosten, das Darlehen bleibt bei 90 Prozent
    des Kaufpreises).

    Das Darlehen wird deshalb OHNE sie bestimmt, aus Kaufpreis und
    Kaufnebenkosten. Würden sie mitfinanziert, hinge das Darlehen von sich
    selbst ab, und bei gleichem Eigenkapital änderte sich die Darlehenssumme
    mit dem Satz. So bleibt sie gleich, und die Kosten kommen als eigener
    Betrag zum Eigenkapitalbedarf: Sie stehen in `totalInvestment`, in
    `financingGap` und im Einsatz zu Beginn der Zahlungsreihe (Rendite,
    Faktor je Euro). Steuerlich sind sie Werbungskosten im ersten Jahr.
  */
  const finanzierungsnebenkosten = totalDebt * prozentAnteil(t.financingCostRate);
  const totalInvestment = kaufkosten + finanzierungsnebenkosten;
  const financingGap = totalInvestment - totalDebt - Math.max(0, t.equity);
  const seniorJahresrate = seniorLoanAmount * (prozentAnteil(t.seniorInterestRate) + prozentAnteil(t.seniorRepaymentRate));
  const juniorJahresrate = juniorLoan * (prozentAnteil(t.juniorInterestRate) + prozentAnteil(t.juniorRepaymentRate));
  const laufzeit = Math.min(hoechstJahre, Math.max(1, Math.round(t.forecastYears)));
  /*
    Tilgungszuschuss: Prozent vom KfW-Darlehen oder ein Betrag, der anteilig
    gilt wie jeder Euro des Objekts. Gutgeschrieben nur zum Jahr aus der
    Zusage (`kfwGrantYear`), ohne Jahr gar nicht, siehe `kfwTilgungsplan`.
  */
  // Höchstens fünf Anlaufjahre und immer mindestens ein Jahr Tilgung.
  const kfwLaufzeitJahre = Math.max(1, Math.round(t.kfwTermYears));
  const kfwAnlaufJahre = Math.min(5, kfwLaufzeitJahre - 1, Math.max(0, Math.round(t.kfwGracePeriodYears)));
  const kfwTilgungszuschussNominal =
    kfwLoanAmount > 0
      ? t.kfwGrantMode === "euro" ? Math.max(0, t.kfwGrantValue) * anteil : kfwLoanAmount * prozentAnteil(t.kfwGrantValue)
      : 0;
  const kfw = kfwTilgungsplan(
    kfwLoanAmount,
    t.kfwInterestRate,
    kfwLaufzeitJahre,
    kfwAnlaufJahre,
    t.kfwFixedRateYears,
    kfwTilgungszuschussNominal,
    t.kfwGrantYear,
    laufzeit,
  );
  const monthlyDebtService = (seniorJahresrate + juniorJahresrate) / 12 + kfw.ersteRate;
  // Mischzins auf die Anfangsbeträge, nur Darlehen mit Betrag zählen.
  const mischzins =
    totalDebt > 0
      ? (seniorLoanAmount * prozentAnteil(t.seniorInterestRate) +
          juniorLoan * prozentAnteil(t.juniorInterestRate) +
          kfwLoanAmount * prozentAnteil(t.kfwInterestRate)) /
        totalDebt
      : 0;
  /*
    Ende der tilgungsfreien Zeit: Die Annuität beginnt immer mit einem neuen
    Jahr, weil die Anlaufzeit in ganzen Jahren zählt. Verglichen werden die
    tatsächlich gezahlten Raten im letzten Monat davor und im ersten danach,
    aus den Plänen aller Darlehen und unabhängig von der Prognoselänge: Eine
    schon getilgte Bank zahlt dann nichts mehr, ein Zuschuss in der
    Anlaufzeit senkt die Zinsrate davor.
  */
  let rateSprung: InvestmentErgebnis["rateSprung"] = null;
  if (kfwLoanAmount > 0 && kfwAnlaufJahre > 0) {
    const bank = jahresraten(seniorLoanAmount, prozentAnteil(t.seniorInterestRate), seniorJahresrate, kfwAnlaufJahre + 1);
    const nachrang = jahresraten(juniorLoan, prozentAnteil(t.juniorInterestRate), juniorJahresrate, kfwAnlaufJahre + 1);
    const ohneKfw = (jahr: number) => (bank[jahr] + nachrang[jahr]) / 12;
    const rateVorher = ohneKfw(kfwAnlaufJahre - 1) + kfw.rateVorAnlaufende;
    const rateNachher = ohneKfw(kfwAnlaufJahre) + kfw.rateNachAnlaufende;
    if (rateNachher > rateVorher + 0.005) {
      rateSprung = { jahr: kfwAnlaufJahre + 1, kalenderjahr: Math.round(t.startYear) + kfwAnlaufJahre, rateVorher, rateNachher };
    }
  }
  const effectiveAnnualRent = monthlyColdRent * 12 * (1 - Math.min(1, prozentAnteil(t.vacancyRate)));
  // Für die Nettorendite zählt, was der Eigentümer trägt, also auch die Zuführung zur Rücklage.
  const jahresBetriebskosten = (monthlyOperatingCosts + monthlyReserveContribution) * 12;
  /*
    Bruttorendite auf den ausgewiesenen Kaufpreis, beim All-inclusive-Modell
    also samt Aufschlag: Das ist der Preis, den der Kunde zahlt und im Exposé
    sieht, und Jahresmiete durch diesen Preis lässt sich dort nachrechnen.
    Die Rendite fällt dadurch niedriger aus als im normalen Modell, das ist
    gewollt, sonst wirkte derselbe Kauf nur durch den Ausweis besser.
  */
  const kaufpreisAusgewiesen = purchasePrice + allInclusiveAufschlag;
  const grossYield = kaufpreisAusgewiesen > 0 ? (monthlyColdRent * 12) / kaufpreisAusgewiesen : 0;
  const netYield = totalInvestment > 0 ? (effectiveAnnualRent - jahresBetriebskosten) / totalInvestment : 0;
  /*
    Die Nebenkosten gehen nach dem Gebäudeanteil an Gebäude und Boden, wie bei
    Investagon. Auf Erhaltungsaufwand und Möbel entfallen seit dem 30.09.2026
    keine Nebenkosten mehr: Sie liegen außerhalb der Basis, also gehört jeder
    Euro Nebenkosten der Immobilie. Die Rücklage bekommt keinen eigenen
    Anteil, sie ist ein Guthaben ohne Abschreibung; ihr Teil geht mit an Boden
    und Gebäude, statt bei einem Posten zu landen, der nie abgeschrieben wird.
  */
  const nebenkostenGebaeude = purchaseCosts * prozentAnteil(t.buildingShare);
  const nebenkostenGrundstueck = purchaseCosts - nebenkostenGebaeude;
  /*
    Abschreibung, seit dem 25.09.2026 auf der aufgeteilten Basis.

    Gebäude: sein Anteil am Immobilienanteil plus die Nebenkosten, die auf ihn
    entfallen. Vorher wurden die gesamten Nebenkosten mit dem Gebäudeanteil
    multipliziert, also auch der Teil, der auf die Möbel entfällt.

    Möbel: der Möbelanteil, verteilt über die Nutzungsdauer. Vom 25. bis
    30.09.2026 kamen seine anteiligen Nebenkosten dazu; seitdem trägt er
    keine mehr (siehe `nebenkostenBasis`).

    Degressive AfA, Sonder-AfA und der Deckel auf das Restvolumen rechnen
    unverändert, nur auf dieser Basis.
  */
  const depreciationBasis =
    gebaeudeanteilKaufpreis + nebenkostenGebaeude -
    (t.rehabMode === "expense" ? rehabExpense : 0);
  const moebelAfaBasis = furniturePrice;
  const moebelAfaJahr =
    t.furnitureDepreciationYears > 0 ? moebelAfaBasis / t.furnitureDepreciationYears : 0;
  /*
    Vereinfachter Hinweis auf anschaffungsnahe Herstellungskosten (§ 6 Abs. 1
    Nr. 1a EStG): Aufwand über 15 Prozent der Anschaffungskosten des Gebäudes.
    Bezug ist das Gebäude ohne den Aufwand selbst, samt seiner Nebenkosten,
    also die AfA-Basis bei „Abziehen“. Sie gilt für beide Behandlungen, damit
    die Quote nicht davon abhängt, was gerade eingestellt ist.
  */
  const gebaeudeOhneAufwand = gebaeudeanteilKaufpreis + nebenkostenGebaeude - rehabExpense;
  const immediateDeductionRatio = gebaeudeOhneAufwand > 0 ? rehabExpense / gebaeudeOhneAufwand : 0;
  const simpleThresholdExceeded = t.rehabMode === "expense" && immediateDeductionRatio > 0.15;
  const combinedTaxableIncome = Math.max(
    0,
    t.taxableIncomeCustomer + (t.jointAssessment ? t.taxableIncomeSpouse : 0),
  );
  const taxProfile = steuerprofil(
    combinedTaxableIncome,
    t.jointAssessment,
    t.churchTaxRate,
    t.includeSolidaritySurcharge,
  );
  const marginalIncomeTaxRate = grenzsteuersatz(combinedTaxableIncome, t.jointAssessment, 0, false, false);
  const marginalTotalTaxRate = grenzsteuersatz(
    combinedTaxableIncome,
    t.jointAssessment,
    t.churchTaxRate,
    t.includeSolidaritySurcharge,
    true,
  );

  let seniorRest = seniorLoanAmount;
  let juniorRest = juniorLoan;
  let degressiverBuchwert = depreciationBasis;
  let restvolumenAfa = depreciationBasis;
  let kumulierterCashflow = 0;
  let kumulierterEigenanteil = 0;
  let moebelRestbuchwert = moebelAfaBasis;
  const years: Jahreswert[] = [];
  // Mindert der Tilgungszuschuss ab seinem Jahr die AfA-Basis (siehe unten), rechnet die AfA mit dieser.
  let afaBasis = depreciationBasis;

  for (let i = 0; i < laufzeit; i += 1) {
    const grossRent = monthlyColdRent * 12 * (1 + prozentAnteil(t.annualRentGrowth)) ** i;
    const effectiveRent = grossRent * (1 - Math.min(1, prozentAnteil(t.vacancyRate)));
    const kostenfaktor = (1 + prozentAnteil(t.annualCostGrowth)) ** i;
    const operatingCosts = monthlyOperatingCosts * 12 * kostenfaktor;
    const reserveContribution = monthlyReserveContribution * 12 * kostenfaktor;
    const senior = annuitaetsjahr(seniorRest, prozentAnteil(t.seniorInterestRate), seniorJahresrate);
    const junior = annuitaetsjahr(juniorRest, prozentAnteil(t.juniorInterestRate), juniorJahresrate);
    const kfwJahr = kfw.jahre[i];
    const interest = senior.interest + junior.interest + kfwJahr.interest;
    const principal = senior.principal + junior.principal + kfwJahr.principal;
    const debtService = senior.payment + junior.payment + kfwJahr.payment;
    /*
      Steuer: Die KfW-Zinsen sind Werbungskosten wie die Bankzinsen, sie
      stecken in `interest`. Der Tilgungszuschuss ist ein öffentlicher
      Zuschuss zu den Anschaffungskosten und mindert ab dem Jahr der
      Gutschrift die AfA-Basis des Gebäudes (R 21.5 Abs. 1 und R 7.3 Abs. 4
      EStR). Er ist keine Einnahme und keine Tilgung, die der Kunde zahlt.
    */
    if (i === kfw.zuschussJahr && kfwJahr.tilgungszuschuss > 0) {
      const minderung = Math.min(afaBasis, kfwJahr.tilgungszuschuss);
      afaBasis -= minderung;
      restvolumenAfa = Math.max(0, restvolumenAfa - minderung);
      degressiverBuchwert = Math.max(0, degressiverBuchwert - minderung);
    }
    const cashflowBeforeTax = effectiveRent - operatingCosts - reserveContribution - debtService;
    const afaRoh =
      t.depreciationMethod === "declining"
        ? degressiverBuchwert * prozentAnteil(t.buildingDepreciationRate)
        : afaBasis * prozentAnteil(t.buildingDepreciationRate);
    const buildingDepreciation = Math.min(restvolumenAfa, Math.max(0, afaRoh));
    degressiverBuchwert = Math.max(0, degressiverBuchwert - buildingDepreciation);
    restvolumenAfa = Math.max(0, restvolumenAfa - buildingDepreciation);
    const specialDepreciation =
      i < Math.max(0, Math.round(t.specialDepreciationYears))
        ? Math.min(restvolumenAfa, afaBasis * prozentAnteil(t.specialDepreciationRate))
        : 0;
    restvolumenAfa = Math.max(0, restvolumenAfa - specialDepreciation);
    const furnitureDepreciation = i < Math.ceil(t.furnitureDepreciationYears) ? moebelAfaJahr : 0;
    moebelRestbuchwert = Math.max(0, moebelRestbuchwert - furnitureDepreciation);
    const rehabDeduction =
      t.rehabMode === "expense" && i < Math.max(1, t.rehabDistributionYears)
        ? rehabExpense / Math.max(1, t.rehabDistributionYears)
        : 0;
    // Geldbeschaffungskosten sind sofort abziehbare Werbungskosten, im Jahr der Zahlung.
    const financingCostDeduction = i === 0 ? finanzierungsnebenkosten : 0;
    const taxableResult =
      effectiveRent - operatingCosts - interest - buildingDepreciation - specialDepreciation - furnitureDepreciation - rehabDeduction -
      financingCostDeduction - (RUECKLAGENZUFUEHRUNG_ABZIEHBAR ? reserveContribution : 0);
    /*
      Der Anteil steckt seit dem 21.09.2026 schon in den Eingaben oben. Eine
      zweite Multiplikation hier wuerde ihn quadrieren: Bei 50 Prozent kaeme ein
      Viertel heraus. Der Name bleibt, weil die Tabellen ihn lesen.
    */
    const allocatedTaxableResult = taxableResult;
    const taxableIncomeBefore = combinedTaxableIncome * (1 + prozentAnteil(t.annualTaxableIncomeGrowth)) ** i;
    const taxableIncomeAfter = Math.max(0, taxableIncomeBefore + allocatedTaxableResult);
    const taxBefore = steuerprofil(
      taxableIncomeBefore,
      t.jointAssessment,
      t.churchTaxRate,
      t.includeSolidaritySurcharge,
    );
    const taxAfterTarif = steuerprofil(
      taxableIncomeAfter,
      t.jointAssessment,
      t.churchTaxRate,
      t.includeSolidaritySurcharge,
    );
    /*
      Fester Satz, seit dem 25.09.2026 ohne Untergrenze.

      Die Steuerwirkung ist genau −Ergebnis × Satz, so rechnet auch Investagon.
      Vorher stand hier max(0, Steuer vorher + Ergebnis × Satz). Ohne
      eingetragenes Einkommen ist die Steuer vorher 0, und ein Verlust fiel
      damit stillschweigend auf eine Ersparnis von 0. Die Steuer nachher darf
      deshalb negativ werden: Sie ist hier eine Rechengröße, keine
      festgesetzte Steuer. Der Tarifmodus bleibt unverändert.
    */
    const steuerManuell = taxBefore.totalTax + allocatedTaxableResult * prozentAnteil(t.marginalTaxRate);
    const taxAfter: Steuerprofil =
      t.taxCalculationMode === "tariff"
        ? taxAfterTarif
        : {
            ...taxAfterTarif,
            totalTax: steuerManuell,
            effectiveRate: taxableIncomeAfter > 0 ? Math.max(0, steuerManuell) / taxableIncomeAfter : 0,
          };
    const taxEffect = taxBefore.totalTax - taxAfter.totalTax;
    const cashflowAfterTax = cashflowBeforeTax + taxEffect;
    kumulierterCashflow += cashflowAfterTax;
    kumulierterEigenanteil += Math.max(0, -cashflowAfterTax);
    seniorRest = senior.closingBalance;
    juniorRest = junior.closingBalance;
    const remainingDebt = seniorRest + juniorRest + kfwJahr.closingBalance;
    /*
      Der Wert am Jahresende, seit dem 25.09.2026 aus drei Teilen.

      Die Wertsteigerung gilt nur für den Immobilienanteil, also Grund und
      Boden und Gebäude. Die Möbel zählen mit ihrem Restbuchwert: Sie verlieren
      an Wert, statt zu steigen, und vorher standen sie nach zehn Jahren noch
      mit dem vollen Kaufbetrag im Vermögen. Die Rücklage zählt als Guthaben
      mit ihrem Betrag.

      `wertzuwachs` ist die reine Steigerung des Immobilienanteils. Diagramme
      und Berechnung lesen sie direkt, statt „Wert minus Kaufpreis“ zu
      rechnen; das ging mit einem Anteil unter 100 Prozent schief, weil der
      Wert anteilig war, der Kaufpreis aber nicht.
    */
    const wertzuwachs = immobilienanteil * ((1 + prozentAnteil(t.annualValueGrowth)) ** (i + 1) - 1);
    const propertyValue = immobilienanteil + wertzuwachs + moebelRestbuchwert + ruecklage;
    const propertyEquity = propertyValue - remainingDebt;
    const totalWealth = propertyEquity + kumulierterCashflow;
    years.push({
      index: i,
      year: Math.round(t.startYear) + i,
      grossRent,
      effectiveRent,
      interest,
      principal,
      debtService,
      darlehen: {
        bank: { ...senior, tilgungszuschuss: 0 },
        nachrang: { ...junior, tilgungszuschuss: 0 },
        kfw: kfwJahr,
      },
      operatingCosts,
      reserveContribution,
      cashflowBeforeTax,
      buildingDepreciation,
      specialDepreciation,
      furnitureDepreciation,
      rehabDeduction,
      financingCostDeduction,
      taxableResult,
      allocatedTaxableResult,
      taxableIncomeBefore,
      taxableIncomeAfter,
      taxBefore,
      taxAfter,
      taxEffect,
      cashflowAfterTax,
      cumulativeCashflowAfterTax: kumulierterCashflow,
      /*
        Was der Kunde bis einschliesslich dieses Jahres selbst eingezahlt hat,
        OHNE Gegenrechnung. Ueberschussjahre mindern die Summe nicht.

        Die Zeile daneben, `cumulativeCashflowAfterTax`, saldiert. Beide sind
        richtig, aber fuer verschiedene Fragen: "Wie viel Geld muss ich
        aufbringen" gegen "Was bleibt unter dem Strich". Bis zum 21.09.2026
        stand die saldierte Zahl unter der Ueberschrift "Selbst gezahlt", und
        das war die falsche Antwort auf die erste Frage.
      */
      cumulativeEigenanteil: kumulierterEigenanteil,
      propertyValue,
      wertzuwachs,
      moebelRestbuchwert,
      remainingDebt,
      propertyEquity,
      totalWealth,
    });
  }

  /*
    Was der Kunde zu Beginn aus eigener Tasche zahlt: das eingetragene
    Eigenkapital plus die Finanzierungsnebenkosten, die nicht im Darlehen
    stecken (siehe `finanzierungsnebenkosten` oben).
  */
  const eigenkapital = Math.max(0, t.equity) + finanzierungsnebenkosten;
  // Zahlungsreihe mit Modellverkauf zum prognostizierten Wert im letzten Jahr.
  const reiheMitWertzuwachs = [
    -eigenkapital,
    ...years.map((jahr, index) =>
      index === years.length - 1 ? jahr.cashflowAfterTax + jahr.propertyEquity : jahr.cashflowAfterTax,
    ),
  ];
  // Zahlungsreihe mit Verkauf ohne Wertsteigerung: derselbe Wert, nur ohne den Zuwachs.
  const reiheOhneWertzuwachs = [
    -eigenkapital,
    ...years.map((jahr, index) =>
      index === years.length - 1
        ? jahr.cashflowAfterTax + jahr.propertyValue - jahr.wertzuwachs - jahr.remainingDebt
        : jahr.cashflowAfterTax,
    ),
  ];
  /*
    Wann sich eine Eigenkapitalrendite ueberhaupt rechnen laesst.
    
    Bis zum 21.09.2026 stand hier `eigenkapital > 0`. Das Feld ist aber
    standardmaessig leer, und bei einer Finanzierung ueber den Kaufpreis hinaus
    bleibt es auch leer. Die Kachel zeigte dann einen Strich, ohne zu sagen
    warum.
    
    Ein interner Zinsfuss braucht kein Eigenkapital, er braucht eine
    Zahlungsreihe mit mindestens einer Aus- und einer Einzahlung. Zahlt der
    Kunde monatlich zu, ist genau das sein Einsatz, und die Rendite darauf ist
    eine sinnvolle Zahl.
    
    Ein erster Anlauf setzte stattdessen die Kaufnebenkosten als Einsatz an.
    Das war falsch: Ist kein Eigenkapital eingetragen, finanziert der Rechner
    auch die Nebenkosten mit, der Kunde zahlt sie also gar nicht aus eigener
    Tasche. Der Test hat es aufgedeckt.
  */
  const rechenbar = (reihe: number[]) =>
    reihe.some((z) => z < 0) && reihe.some((z) => z > 0);
  const irr = rechenbar(reiheMitWertzuwachs) ? internerZinsfuss(reiheMitWertzuwachs) : null;
  const irrWithoutAppreciation = rechenbar(reiheOhneWertzuwachs)
    ? internerZinsfuss(reiheOhneWertzuwachs)
    : null;

  /*
    Die drei Zahlen, die auf der ersten Seite gross stehen.
    
    Sie rechnen nichts Neues, sie fassen zusammen, was oben schon steht, und zwar
    in der Reihenfolge, in der Christian das Gespraech fuehrt: Was zahle ich
    selbst, was wird daraus, was ist das in Prozent.
  */
  const monate = years.length * 12;
  const ersterMonat = years.length > 0 ? -years[0].cashflowAfterTax / 12 : 0;
  const letztesJahr = years.length > 0 ? years[years.length - 1] : null;

  /*
    Vermoegensaufbau je Monat.
    
    Zaehler ist der Zuwachs an Eigenkapital in der Immobilie, also
    Immobilienwert minus Restschuld am Ende, abzueglich des Standes zu Beginn.
    Bei einer Vollfinanzierung ist der Anfangsstand null, bei eingesetztem
    Eigenkapital nicht; ohne diesen Abzug zaehlten wir das mitgebrachte Geld als
    "aufgebaut".
    
    Die Zahl enthaelt den unterstellten Wertzuwachs. `tilgungMonat` daneben ist
    der harte Teil, der sich zwingend aus dem Tilgungsplan ergibt. Die Oberflaeche
    zeigt beide, sonst steht eine Annahme da, als waere sie eine Tatsache.
  */
  // Der Wert zu Beginn, gemessen wie am Ende: Möbel mit ihrem Buchwert.
  const startEigenkapital = Math.max(0, immobilienanteil + moebelAfaBasis + ruecklage - totalDebt);
  const vermoegenGesamt = letztesJahr ? letztesJahr.propertyEquity - startEigenkapital : 0;
  const vermoegensaufbauMonat = monate > 0 ? vermoegenGesamt / monate : 0;
  // Seit dem 07.10.2026 aus der gezahlten Tilgung summiert: Der KfW-Zuschuss senkt die Restschuld, ist aber keine Tilgung.
  const getilgtGesamt = years.reduce((summe, jahr) => summe + jahr.principal, 0);
  const tilgungszuschussPrognose = years.reduce((summe, jahr) => summe + jahr.darlehen.kfw.tilgungszuschuss, 0);
  const tilgungMonat = monate > 0 ? getilgtGesamt / monate : 0;

  /*
    Was aus jedem eingezahlten Euro wird. Bezug ist alles, was der Kunde
    einsetzt: das Eigenkapital plus die Summe der monatlichen Zuzahlungen ueber
    die ganze Laufzeit. Nur die Jahre zaehlen, in denen er wirklich zuzahlt.
  */
  const summeZuzahlungen = years.reduce(
    (summe, jahr) => summe + Math.max(0, -jahr.cashflowAfterTax),
    0,
  );
  const eingesetztGesamt = eigenkapital + summeZuzahlungen;
  const faktorJeEuro = eingesetztGesamt > 0 ? vermoegenGesamt / eingesetztGesamt : 0;

  return {
    purchaseCostRate,
    purchaseCosts: allInclusive ? 0 : purchaseCosts,
    allInclusive,
    allInclusiveAufschlag,
    totalInvestment,
    seniorLoanAmount,
    kfwLoanAmount,
    kfwGekuerzt: kfwGewuenscht > kfwLoanAmount + 0.005,
    finanzierungsbedarf,
    kfwTilgungszuschussNominal,
    kfwTilgungszuschuss: kfw.zuschussAngerechnet,
    kfwZuschussOhneJahr: kfwTilgungszuschussNominal > 0 && !(t.kfwGrantYear >= 1),
    kfwRestschuldZinsbindung: kfw.restschuldZinsbindung,
    kfwAnlaufJahre,
    kfwAnnuitaetMonat: kfw.annuitaet,
    mischzins,
    rateSprung,
    anteil,
    totalDebt,
    financingGap,
    monthlyDebtService,
    grossYield,
    netYield,
    effectiveAnnualRent,
    depreciationBasis,
    immediateDeductionRatio,
    simpleThresholdExceeded,
    combinedTaxableIncome,
    taxProfile,
    marginalIncomeTaxRate,
    marginalTotalTaxRate,
    cumulativeTaxEffect: years.reduce((summe, jahr) => summe + jahr.taxEffect, 0),
    irr,
    irrWithoutAppreciation,
    eigenkapitalBasis: eigenkapital + summeZuzahlungen,
    eigenanteilMonat: ersterMonat,
    vermoegensaufbauMonat,
    vermoegenStart: startEigenkapital,
    tilgungMonat,
    getilgtGesamt,
    tilgungszuschussPrognose,
    faktorJeEuro,
    kaufpreisGesamt: kaufpreisAusgewiesen,
    moebelAnteil: furniturePrice,
    erhaltungsaufwand: rehabExpense,
    ruecklage,
    immobilienanteil,
    grundstuecksanteil,
    gebaeudeanteilKaufpreis,
    nebenkostenBasis: basisNebenkosten,
    grunderwerbsteuer,
    notarkosten,
    grundbuchkosten,
    nebenkostenGrundstueck,
    nebenkostenGebaeude,
    moebelAfaBasis,
    finanzierungsnebenkosten,
    years,
  };
}

/**
 * Eigenkapitalrendite, freigegeben von Christian am 30.09.2026, genau nach
 * seiner Formel:
 *
 *   (Vermögensaufbau im Zeitraum ÷ Jahre) ÷ (Eigenkapital + Zuzahlung vor Steuer je Monat × 12)
 *
 * Keine zweite Wahrheit: Der Vermögensaufbau ist die Kachel „Vermögensaufbau“
 * mal Monate, das Eigenkapital das Eingabefeld, die Zuzahlung der angezeigte
 * „Cashflow vor Steuer pro Monat“ im ersten Jahr. Christian hat am selben Tag
 * den Cashflow vor Steuer statt nach Steuer gewählt: Nach Steuer ist das erste
 * Jahr wegen des Erhaltungsaufwands fast immer ein Überschuss, die Zuzahlung
 * fiele damit ganz aus dem Nenner. Ein Überschuss vor Steuer zählt als 0.
 *
 * `rendite` ist `null`, wenn der Nenner null ist, also weder Eigenkapital
 * noch eine monatliche Zuzahlung vor Steuer. Ein negativer Vermögensaufbau ergibt
 * bewusst eine negative Zahl, sie sagt mehr als ein Satz ohne Zahl.
 */
export interface Eigenkapitalrendite {
  vermoegensaufbau: number;
  jahre: number;
  eigenkapital: number;
  zuzahlungMonat: number;
  nenner: number;
  rendite: number | null;
}

export function eigenkapitalrendite(
  input: Pick<InvestmentEingabe, "equity">,
  result: Pick<InvestmentErgebnis, "years" | "vermoegensaufbauMonat">,
): Eigenkapitalrendite {
  const jahre = result.years.length;
  const vermoegensaufbau = result.vermoegensaufbauMonat * jahre * 12;
  const eigenkapital = Math.max(0, input.equity);
  const zuzahlungMonat = Math.max(0, -(result.years[0]?.cashflowBeforeTax ?? 0) / 12);
  const nenner = eigenkapital + zuzahlungMonat * 12;
  // Unter einem Cent ist der Nenner rechnerisch null, die Division gäbe nur Rauschen.
  const rendite = jahre > 0 && nenner >= 0.01 ? vermoegensaufbau / jahre / nenner : null;
  return { vermoegensaufbau, jahre, eigenkapital, zuzahlungMonat, nenner, rendite };
}

/**
 * Der Gegenfall zu den Kaufnebenkosten, für den Satz unter der Kachel.
 *
 * Deckt das Eigenkapital die Kaufnebenkosten, rechnet der Kern noch einmal mit
 * Eigenkapital minus Kaufnebenkosten (sie wären mitfinanziert). Sonst mit
 * Eigenkapital gleich Kaufnebenkosten (sie wären selbst gezahlt). Geändert
 * wird nur das Eigenkapital. `null` ohne Kaufnebenkosten.
 */
export interface EigenkapitalrenditeNebenkosten {
  /** Das Eigenkapital deckt die Kaufnebenkosten heute. */
  selbstGezahlt: boolean;
  kaufnebenkosten: number;
  vergleich: Eigenkapitalrendite;
  /** Rate im Gegenfall minus Rate heute, je Monat. */
  rateDifferenzMonat: number;
}

export function eigenkapitalrenditeNebenkosten(
  input: InvestmentEingabe,
  result: InvestmentErgebnis,
): EigenkapitalrenditeNebenkosten | null {
  const kaufnebenkosten = result.purchaseCosts;
  if (!(kaufnebenkosten > 0)) return null;
  const eigenkapital = Math.max(0, input.equity);
  // Ein halber Cent Spielraum: 13.250 € Eigenkapital gegen 13.249,999… € Nebenkosten aus der Prozentrechnung.
  const selbstGezahlt = eigenkapital >= kaufnebenkosten - 0.005;
  const vergleichEingabe: InvestmentEingabe = {
    ...input,
    equity: selbstGezahlt ? Math.max(0, eigenkapital - kaufnebenkosten) : kaufnebenkosten,
  };
  const vergleichErgebnis = berechneInvestment(vergleichEingabe);
  return {
    selbstGezahlt,
    kaufnebenkosten,
    vergleich: eigenkapitalrendite(vergleichEingabe, vergleichErgebnis),
    rateDifferenzMonat: vergleichErgebnis.monthlyDebtService - result.monthlyDebtService,
  };
}

/**
 * Der Kaufpreis des ganzen Objekts, so wie er im Dokument steht: die Eingabe,
 * beim All-inclusive-Modell samt Aufschlag (seit dem 09.10.2026). Das Ergebnis
 * rechnet mit dem Miteigentumsanteil, der Aufschlag wird deshalb auf das ganze
 * Objekt zurückgerechnet. Für die Stellen, die bisher `purchasePrice` zeigten.
 */
export function ausgewiesenerKaufpreis(
  input: Pick<InvestmentEingabe, "purchasePrice">,
  result: Pick<InvestmentErgebnis, "allInclusiveAufschlag" | "anteil">,
): number {
  const aufschlag = result.anteil > 0 ? (result.allInclusiveAufschlag ?? 0) / result.anteil : 0;
  return input.purchasePrice + aufschlag;
}
