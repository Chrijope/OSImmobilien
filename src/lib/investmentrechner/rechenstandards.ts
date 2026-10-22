/**
 * Rechenstandards aus dem Vertriebspaket, seit dem 16.10.2026: Regel-AfA
 * neben erhöhter AfA, Stresstest mit drei Fällen und Wertentwicklung als
 * Szenario 0/1/2 Prozent mit Kaufkraft.
 *
 * Nur Zusatzanzeige: Jede Zahl entsteht aus einer abgewandelten Kopie der
 * Eingabe, die gespeicherte Eingabe und ihr Ergebnis bleiben, wie sie sind.
 * Der Rechenkern und rechenkern.golden.json sind unberührt.
 */

import { linearerAfaSatz, type LinearerSatz } from "@/lib/afaSaetze";
import { cashflowNachSteuerBeiZins } from "./bankgespraech";
import { berechneInvestment, monateErstesJahr, type InvestmentEingabe, type InvestmentErgebnis } from "./rechenkern";

export interface RegelAfa {
  /** Gesetzlicher linearer Satz nach Baujahr: 2,5 vor 1925, 2 ab 1925, 3 ab 2023. */
  regel: LinearerSatz;
  /** Linear über dem Regelsatz: Das geht nur mit Restnutzungsdauer-Gutachten. */
  erhoeht: boolean;
  /** Degressiv eingestellt: 5 Prozent nur bei Baubeginn 10/2023 bis 9/2029. */
  degressiv: boolean;
  /** Ergebnis mit Regel-AfA, nur wenn `erhoeht`. */
  mitRegelAfa: InvestmentErgebnis | null;
}

/** Die Eingabe mit dem gesetzlichen linearen Satz statt des eingestellten. */
function mitRegelsatz(input: InvestmentEingabe): InvestmentEingabe {
  return {
    ...input,
    depreciationMethod: "linear",
    buildingDepreciationRate: linearerAfaSatz(input.constructionYear).satz,
  };
}

export function regelAfa(input: InvestmentEingabe): RegelAfa {
  const regel = linearerAfaSatz(input.constructionYear);
  const erhoeht = input.depreciationMethod === "linear" && input.buildingDepreciationRate > regel.satz + 1e-9;
  return {
    regel,
    erhoeht,
    degressiv: input.depreciationMethod === "declining",
    mitRegelAfa: erhoeht ? berechneInvestment(mitRegelsatz(input)) : null,
  };
}

/** Belastung je Monat, positiv heißt: der Kunde zahlt zu. */
export interface Belastung {
  vorSteuer: number;
  nachSteuer: number;
}

export interface Stressfall {
  titel: string;
  beschreibung: string;
  /** Kalenderjahr, in dem der Fall greift. */
  jahr: number;
  basis: Belastung;
  stress: Belastung;
  /** „monat“: Belastung je Monat. „einmalig“: Mehrbelastung in diesem Jahr, als Betrag. */
  einheit: "monat" | "einmalig";
  /** Gesetzt, wenn der Fall hier nichts ändert, mit Begründung. */
  entfaellt?: string;
}

/** Seit dem 22.10.2026 mit den Monaten des Jahres: Im ersten Jahr zählen nur die ab dem Übergang. */
const belastungMonat = (jahr: { cashflowBeforeTax: number; cashflowAfterTax: number }, monate = 12): Belastung => ({
  vorSteuer: -jahr.cashflowBeforeTax / monate,
  nachSteuer: -jahr.cashflowAfterTax / monate,
});

const ANSCHLUSS_AB_JAHR = 11;
const LEERSTAND_MONATE = 3;

/** Die drei Fälle des Vertriebspakets. Leere Liste ohne Prognosejahre. */
export function stresstest(input: InvestmentEingabe, result: InvestmentErgebnis): Stressfall[] {
  const erstes = result.years[0];
  if (!erstes) return [];
  const faelle: Stressfall[] = [];

  // 1. Gutachten abgelehnt: das Finanzamt erkennt nur die Regel-AfA an.
  const afa = regelAfa(input);
  const regelErstes = afa.mitRegelAfa?.years[0];
  faelle.push({
    titel: "Gutachten abgelehnt",
    beschreibung: `Regel-AfA ${afa.regel.satz.toLocaleString("de-DE")} % statt ${input.buildingDepreciationRate.toLocaleString("de-DE")} %`,
    jahr: erstes.year,
    basis: belastungMonat(erstes, monateErstesJahr(result)),
    stress: regelErstes ? belastungMonat(regelErstes, monateErstesJahr(afa.mitRegelAfa!)) : belastungMonat(erstes, monateErstesJahr(result)),
    einheit: "monat",
    entfaellt: afa.erhoeht ? undefined : "Es ist keine erhöhte AfA eingestellt.",
  });

  /*
    2. Zins plus ein Prozentpunkt ab Jahr 11. Gerechnet über den vorhandenen
    Anschlusszins: Zinsbindung zehn Jahre, Anschluss ein Punkt über dem
    eingetragenen Anschlusszins oder, ohne ihn, über dem Zins von heute. Die
    Basis läuft mit demselben Anschluss ohne den Punkt, denn die neue Rate
    (Restschuld mal Zins plus Tilgung) ist eine andere als die von heute; nur
    so zeigt der Unterschied allein den Punkt. Beide Läufe gehen mindestens bis
    Jahr 11, auch wenn die Prognose kürzer ist. Das Nachrangdarlehen hat keinen
    Anschluss und bleibt.
  */
  const jahre = Math.max(input.forecastYears, ANSCHLUSS_AB_JAHR);
  const bindung = ANSCHLUSS_AB_JAHR - 1;
  const anschluss = (plus: number) => {
    const zins = (folge: number, heute: number) => (folge > 0 ? folge : heute) + plus;
    return berechneInvestment({
      ...input,
      forecastYears: jahre,
      seniorFixedRateYears: bindung,
      seniorFollowUpRate: zins(input.seniorFollowUpRate, input.seniorInterestRate),
      secondFixedRateYears: bindung,
      secondFollowUpRate: zins(input.secondFollowUpRate, input.secondInterestRate),
      kfwFixedRateYears: bindung,
      kfwFollowUpRate: zins(input.kfwFollowUpRate, input.kfwInterestRate),
    });
  };
  const basisLang = anschluss(0);
  const zinsLang = anschluss(1);
  const basisJahr11 = basisLang.years[ANSCHLUSS_AB_JAHR - 1];
  const zinsJahr11 = zinsLang.years[ANSCHLUSS_AB_JAHR - 1];
  faelle.push({
    titel: `Zins +1 Punkt ab Jahr ${ANSCHLUSS_AB_JAHR}`,
    beschreibung: "Anschlusszins einen Prozentpunkt höher, Tilgung wie eingestellt",
    jahr: basisJahr11.year,
    basis: belastungMonat(basisJahr11),
    stress: belastungMonat(zinsJahr11),
    einheit: "monat",
    entfaellt: result.totalDebt > 0 ? undefined : "Ohne Darlehen gibt es keinen Anschlusszins.",
  });

  /*
    3. Drei Monate Leerstand, einmalig im ersten Jahr. Weniger Miete wirkt auf
    Cashflow und steuerliches Ergebnis genau wie mehr Zins, deshalb rechnet
    `cashflowNachSteuerBeiZins` die Steuer samt Progression mit.
  */
  const ausfall = (erstes.effectiveRent / monateErstesJahr(result)) * LEERSTAND_MONATE;
  const nachSteuerLeer = cashflowNachSteuerBeiZins(input, erstes, erstes.interest + ausfall);
  faelle.push({
    titel: `${LEERSTAND_MONATE} Monate Leerstand`,
    beschreibung: "Einmalig im ersten Jahr, ohne Miete, Kosten laufen weiter",
    jahr: erstes.year,
    basis: { vorSteuer: 0, nachSteuer: 0 },
    stress: { vorSteuer: ausfall, nachSteuer: erstes.cashflowAfterTax - nachSteuerLeer },
    einheit: "einmalig",
    entfaellt: ausfall > 0 ? undefined : "Es ist keine Miete eingetragen.",
  });
  return faelle;
}

export interface Wertszenario {
  /** Wertsteigerung je Jahr in Prozent. */
  prozent: number;
  /** Wert am Ende der Prognose, nominal. */
  wert: number;
  /** Derselbe Wert in heutiger Kaufkraft, abgezinst mit der Inflation. */
  wertKaufkraft: number;
  /** Wert minus Restschuld am Ende, nominal. */
  vermoegen: number;
  vermoegenKaufkraft: number;
}

export const WERTSZENARIEN = [0, 1, 2] as const;

/** Wertentwicklung 0, 1 und 2 Prozent im Jahr, jeweils mit Kaufkraftzeile. `null` ohne Prognosejahre. */
export function wertszenarien(input: InvestmentEingabe): { jahr: number; inflation: number; szenarien: Wertszenario[] } | null {
  const ergebnisse = WERTSZENARIEN.map((prozent) => berechneInvestment({ ...input, annualValueGrowth: prozent }));
  const jahre = ergebnisse[0].years.length;
  if (jahre === 0) return null;
  const inflation = Math.max(0, input.inflationRate);
  const abzinsung = (1 + inflation / 100) ** jahre;
  return {
    jahr: ergebnisse[0].years[jahre - 1].year,
    inflation,
    szenarien: ergebnisse.map((ergebnis, i) => {
      const letztes = ergebnis.years[jahre - 1];
      return {
        prozent: WERTSZENARIEN[i],
        wert: letztes.propertyValue,
        wertKaufkraft: letztes.propertyValue / abzinsung,
        vermoegen: letztes.propertyEquity,
        vermoegenKaufkraft: letztes.propertyEquity / abzinsung,
      };
    }),
  };
}
