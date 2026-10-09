/**
 * Bankgespräch und Risiko, seit dem 09.10.2026.
 *
 * Kennzahlen, die eine Bank oder ein vorsichtiger Kunde fragt und die das
 * Ergebnis des Rechenkerns schon enthält, nur nicht ausgerechnet:
 * Zinsänderungsrisiko, Eigenkapitalrendite ohne Wertsteigerung,
 * Spielraum bis zur 15-Prozent-Grenze und die Übersicht fürs Bankgespräch.
 * Angeregt durch den Abgleich mit einem Excel-Kalkulationstool.
 *
 * Alles rein und nur lesend: Der Rechenkern und seine Vergleichswerte
 * (rechenkern.golden.json) bleiben unberührt.
 */

import {
  annuitaetsjahr,
  ausgewiesenerKaufpreis,
  eigenkapitalrendite,
  prozentAnteil,
  standardEingabe,
  steuerprofil,
  type Eigenkapitalrendite,
  type InvestmentEingabe,
  type InvestmentErgebnis,
  type Jahreswert,
} from "./rechenkern";

/**
 * Cashflow nach Steuer eines Jahres, wenn statt der gerechneten Zinsen
 * `zinsen` (Euro im Jahr) anfielen. Tilgung, Miete und Kosten bleiben, wie im
 * Excel-Vorbild: Gefragt ist, was eine andere Zinshöhe allein bewirkt.
 *
 * Die Steuer rechnet wie im Rechenkern, also im Tarifmodus mit der
 * Progression, sonst mit dem festen Satz. Bei `zinsen = jahr.interest` kommt
 * genau `jahr.cashflowAfterTax` heraus (Test).
 */
export function cashflowNachSteuerBeiZins(input: InvestmentEingabe, jahr: Jahreswert, zinsen: number): number {
  const t = { ...standardEingabe, ...input };
  const weniger = jahr.interest - zinsen;
  const vorSteuer = jahr.cashflowBeforeTax + weniger;
  const ergebnis = jahr.allocatedTaxableResult + weniger;
  const steuerNachher =
    t.taxCalculationMode === "tariff"
      ? steuerprofil(
          Math.max(0, jahr.taxableIncomeBefore + ergebnis),
          t.jointAssessment,
          t.churchTaxRate,
          t.includeSolidaritySurcharge,
        ).totalTax
      : jahr.taxBefore.totalTax + ergebnis * prozentAnteil(t.marginalTaxRate);
  return vorSteuer + jahr.taxBefore.totalTax - steuerNachher;
}

export interface Zinsrisiko {
  /** Kalenderjahr der Betrachtung. */
  jahr: number;
  /** Restschuld aller Darlehen zu Beginn des Jahres. */
  restschuldBeginn: number;
  /** Gerechneter Zins des Jahres in Prozent der Restschuld, als Faktor. */
  zinsHeute: number;
  /**
   * Zinssatz (Faktor), bei dem der Cashflow nach Steuer genau 0 wird.
   * `null`, wenn er auch ohne jeden Zins negativ bliebe.
   */
  zinsBeiNull: number | null;
  /** Was ein Prozentpunkt mehr Zins nach Steuer je Monat kostet, positiv. */
  mehrkostenJeProzentpunktMonat: number;
}

/** Restschuld zu Beginn des Jahres `index`: am Anfang die Darlehenssumme, danach das Vorjahresende. */
function restschuldBeginn(result: InvestmentErgebnis, index: number): number {
  return index === 0 ? result.totalDebt : result.years[index - 1].remainingDebt;
}

/**
 * Zinsänderungsrisiko für ein Jahr der Prognose (Index ab 0). `null` ohne
 * Darlehen oder ohne dieses Jahr.
 */
export function zinsrisiko(input: InvestmentEingabe, result: InvestmentErgebnis, index: number): Zinsrisiko | null {
  const jahr = result.years[index];
  const rest = jahr ? restschuldBeginn(result, index) : 0;
  if (!jahr || rest < 1) return null;
  const cashflow = (zinsen: number) => cashflowNachSteuerBeiZins(input, jahr, zinsen);

  /*
    Mehr Zins senkt den Cashflow immer, die Steuer gibt höchstens den
    Grenzsteuersatz davon zurück. Die Kurve fällt also, und die Nullstelle
    lässt sich durch Halbieren finden. Obergrenze: so lange verdoppeln, bis
    der Cashflow negativ ist (spätestens bei Zinsen über der Restschuld).
  */
  let zinsBeiNull: number | null = null;
  if (cashflow(0) >= 0) {
    let unten = 0;
    let oben = Math.max(rest * 0.01, jahr.interest);
    while (cashflow(oben) > 0 && oben < rest * 100) oben *= 2;
    for (let schritt = 0; schritt < 80; schritt += 1) {
      const mitte = (unten + oben) / 2;
      if (cashflow(mitte) > 0) unten = mitte;
      else oben = mitte;
    }
    zinsBeiNull = (unten + oben) / 2 / rest;
  }

  return {
    jahr: jahr.year,
    restschuldBeginn: rest,
    zinsHeute: jahr.interest / rest,
    zinsBeiNull,
    mehrkostenJeProzentpunktMonat: (cashflow(jahr.interest) - cashflow(jahr.interest + rest * 0.01)) / 12,
  };
}

/**
 * Eigenkapitalrendite nach Christians Formel (siehe `eigenkapitalrendite`),
 * aber ohne den unterstellten Wertzuwachs: nur Tilgung, Möbel-Buchwert und
 * Rücklage zählen als Aufbau. Zeigt, was übrig bleibt, wenn der Wert nicht
 * steigt. Kann negativ sein.
 */
export function eigenkapitalrenditeOhneWertsteigerung(
  input: Pick<InvestmentEingabe, "equity">,
  result: Pick<InvestmentErgebnis, "years" | "vermoegensaufbauMonat">,
): Eigenkapitalrendite {
  const mit = eigenkapitalrendite(input, result);
  const vermoegensaufbau = mit.vermoegensaufbau - (result.years[result.years.length - 1]?.wertzuwachs ?? 0);
  return {
    ...mit,
    vermoegensaufbau,
    rendite: mit.rendite === null ? null : vermoegensaufbau / mit.jahre / mit.nenner,
  };
}

export interface FuenfzehnProzentGrenze {
  /** Anschaffungskosten des Gebäudes ohne den Aufwand, samt Nebenkosten. */
  gebaeude: number;
  /** 15 Prozent davon, Rechnungsbeträge ohne Umsatzsteuer. */
  grenzeNetto: number;
  /** Dieselbe Grenze mit 19 % Umsatzsteuer, wie Handwerkerrechnungen meist lauten. */
  grenzeBrutto: number;
  /** Bereits eingetragener Erhaltungsaufwand. */
  aufwand: number;
  /** Grenze netto minus Aufwand. Negativ heißt überschritten. */
  spielraumNetto: number;
}

/**
 * 15-Prozent-Grenze für anschaffungsnahe Herstellungskosten (§ 6 Abs. 1
 * Nr. 1a EStG): Wer in den ersten drei Jahren nach dem Kauf mehr als 15
 * Prozent der Gebäude-Anschaffungskosten (netto) instand setzt, darf das
 * nicht sofort absetzen. Dieselbe Basis wie die Warnung im Rechenkern
 * (`immediateDeductionRatio`), hier als Betrag. `null` ohne Gebäudewert.
 */
export function fuenfzehnProzentGrenze(result: InvestmentErgebnis): FuenfzehnProzentGrenze | null {
  const gebaeude = result.gebaeudeanteilKaufpreis + result.nebenkostenGebaeude - result.erhaltungsaufwand;
  if (!(gebaeude > 0)) return null;
  const grenzeNetto = gebaeude * 0.15;
  return {
    gebaeude,
    grenzeNetto,
    grenzeBrutto: grenzeNetto * 1.19,
    aufwand: result.erhaltungsaufwand,
    spielraumNetto: grenzeNetto - result.erhaltungsaufwand,
  };
}

/**
 * Kalenderjahr, in dem ein Annuitätendarlehen mit fester Jahresrate getilgt
 * ist. `null` ohne Betrag, ohne Tilgung oder nach mehr als 100 Jahren.
 */
export function volltilgungsjahr(
  betrag: number,
  zinsProzent: number,
  tilgungProzent: number,
  startjahr: number,
): number | null {
  if (!(betrag > 0) || !(tilgungProzent > 0)) return null;
  const zins = prozentAnteil(zinsProzent);
  const rate = betrag * (zins + prozentAnteil(tilgungProzent));
  let rest = betrag;
  for (let jahr = 0; jahr < 100; jahr += 1) {
    rest = annuitaetsjahr(rest, zins, rate).closingBalance;
    if (rest < 0.005) return Math.round(startjahr) + jahr;
  }
  return null;
}

export interface Bankuebersicht {
  kaufpreis: number;
  /** Gesonderte Kaufnebenkosten, beim All-inclusive-Modell 0. */
  kaufnebenkosten: number;
  gesamtkosten: number;
  eigenkapital: number;
  darlehen: number;
  /** Darlehen durch Kaufpreis, als Faktor. */
  beleihungKaufpreis: number;
  /** Darlehen durch Gesamtkosten, als Faktor. */
  beleihungGesamtkosten: number;
  /** Kaufpreis und Kaltmiete je m² Wohnfläche, `null` ohne Fläche. */
  kaufpreisJeQm: number | null;
  kaltmieteJeQm: number | null;
  /** Kaufpreis durch Jahreskaltmiete, `null` ohne Miete. */
  kaufpreisfaktor: number | null;
  mischzins: number;
  /** Anfängliche Tilgung, gewichtet mit dem Darlehensbetrag, als Faktor. */
  tilgungGewichtet: number;
  kapitaldienstMonat: number;
  /** Miete nach Leerstand minus nicht umlagefähige Kosten und Rücklage im ersten Jahr, je Monat. */
  mietueberschussMonat: number;
  /**
   * Kapitaldienstdeckung (DSCR): Mietüberschuss durch Kapitaldienst im
   * ersten Jahr. Über 1 trägt die Miete die Rate. `null` ohne Kapitaldienst.
   */
  kapitaldienstdeckung: number | null;
  volltilgungBank: number | null;
  volltilgungNachrang: number | null;
}

/**
 * Die Zahlen für das Bankgespräch, aus Eingabe und Ergebnis. Beträge sind wie
 * überall der Anteil dieses Kunden; Preise je m² beziehen sich auf die ganze
 * Wohnung.
 */
export function bankuebersicht(input: InvestmentEingabe, result: InvestmentErgebnis): Bankuebersicht {
  const t = { ...standardEingabe, ...input };
  const erstes = result.years[0];
  const kaufpreis = result.kaufpreisGesamt;
  const kaufpreisGanz = ausgewiesenerKaufpreis(t, result);
  const jahresmieteGanz = t.monthlyColdRent * 12;
  const mietueberschussMonat = erstes
    ? (erstes.effectiveRent - erstes.operatingCosts - erstes.reserveContribution) / 12
    : 0;
  const kapitaldienstMonat = erstes ? erstes.debtService / 12 : result.monthlyDebtService;
  const kfwTilgung = result.kfwLoanAmount > 0 ? (result.years[0]?.darlehen.kfw.principal ?? 0) : 0;
  const juniorLoan = result.totalDebt - result.seniorLoanAmount - result.kfwLoanAmount;
  const tilgungGewichtet =
    result.totalDebt > 0
      ? (result.seniorLoanAmount * prozentAnteil(t.seniorRepaymentRate) +
          juniorLoan * prozentAnteil(t.juniorRepaymentRate) +
          kfwTilgung) /
        result.totalDebt
      : 0;
  return {
    kaufpreis,
    kaufnebenkosten: result.purchaseCosts,
    gesamtkosten: result.totalInvestment,
    eigenkapital: Math.max(0, t.equity),
    darlehen: result.totalDebt,
    beleihungKaufpreis: kaufpreis > 0 ? result.totalDebt / kaufpreis : 0,
    beleihungGesamtkosten: result.totalInvestment > 0 ? result.totalDebt / result.totalInvestment : 0,
    kaufpreisJeQm: t.area > 0 ? kaufpreisGanz / t.area : null,
    kaltmieteJeQm: t.area > 0 ? t.monthlyColdRent / t.area : null,
    kaufpreisfaktor: jahresmieteGanz > 0 ? kaufpreisGanz / jahresmieteGanz : null,
    mischzins: result.mischzins,
    tilgungGewichtet,
    kapitaldienstMonat,
    mietueberschussMonat,
    kapitaldienstdeckung: kapitaldienstMonat > 0 ? mietueberschussMonat / kapitaldienstMonat : null,
    volltilgungBank: volltilgungsjahr(result.seniorLoanAmount, t.seniorInterestRate, t.seniorRepaymentRate, t.startYear),
    volltilgungNachrang: volltilgungsjahr(juniorLoan, t.juniorInterestRate, t.juniorRepaymentRate, t.startYear),
  };
}
