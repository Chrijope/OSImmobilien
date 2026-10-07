/**
 * Die Zahlen der beiden Deckblätter der Berechnung, seit dem 07.10.2026.
 *
 * Christian wollte, dass jeder Vertriebspartner selbst wählt, mit welchem
 * Deckblatt er die Objektvorstellung beginnt: „Ergebnis auf einen Blick“ oder
 * „Jahr für Jahr“. Beide betrachten die ersten zehn Jahre, auch wenn der
 * Rechner länger prognostiziert; ist der Zeitraum kürzer, eben so viele.
 *
 * Gerechnet wird hier nichts Neues. Jede Zahl ist ein Feld der Jahrestabelle
 * (`result.years`) oder ein Durchschnitt daraus. Einzige Herleitung: der
 * Vermögensaufbau je Monat über genau diese Jahre, nach derselben Formel wie
 * `vermoegensaufbauMonat` im Rechenkern. Bei zehn Prognosejahren ist er
 * identisch mit dem Wert dort.
 */
import {
  eigenkapitalrendite,
  type Eigenkapitalrendite,
  type InvestmentEingabe,
  type InvestmentErgebnis,
  type Jahreswert,
} from "./rechenkern";

export type DeckblattVariante = "blick" | "jahre";

export const DECKBLATT_STANDARD: DeckblattVariante = "blick";

/** Wie viele Jahre die Deckblätter zeigen. */
export const DECKBLATT_JAHRE = 10;

export interface DeckblattWerte {
  /** Die gezeigten Jahre, höchstens zehn. */
  jahre: Jahreswert[];
  /** Das letzte gezeigte Jahr, darauf beziehen sich Vermögen und Restschuld. */
  letztes: Jahreswert;
  /** Der Monat im ersten Jahr, alle Beträge je Monat, Abzüge negativ. */
  monat: {
    miete: number;
    rate: number;
    tilgung: number;
    kosten: number;
    vorSteuer: number;
    steuer: number;
    nachSteuer: number;
  };
  /** Ø Cashflow nach Steuer je Monat, Jahre 2 bis 10. `null`, wenn es nur ein Jahr gibt. */
  nachSteuerAbJahr2: number | null;
  /**
   * Was der Kunde im Schnitt monatlich zuzahlt, positiv. Grundlage sind die
   * Jahre 2 bis 10, bei nur einem Jahr das erste. `null`, wenn sich die
   * Immobilie in dieser Zeit selbst trägt.
   */
  zuzahlungMonat: number | null;
  vermoegensaufbauMonat: number;
  eigenkapitalrendite: Eigenkapitalrendite;
  /** Summe der Zuzahlungen nach Steuer bis zum letzten gezeigten Jahr, ohne Gegenrechnung der Überschüsse. */
  selbstEingezahlt: number;
  /** Summe der Überschüsse nach Steuer in derselben Zeit. */
  ueberschuesse: number;
  /** Gesamtvermögen im letzten gezeigten Jahr: Anteil plus Summe der Cashflows nach Steuer. */
  fuerDichBleibt: number;
  /** Was aus jedem selbst eingezahlten Euro wird. `null` ohne Zuzahlung. */
  jeEingezahltemEuro: number | null;
  steuerErstesJahr: number;
  steuerSumme: number;
  /** Ø Cashflow nach Steuer je Monat über alle gezeigten Jahre. */
  nachSteuerSchnitt: number;
}

const schnitt = (werte: number[]) => (werte.length ? werte.reduce((a, b) => a + b, 0) / werte.length : 0);

export function deckblattWerte(
  input: Pick<InvestmentEingabe, "equity">,
  result: Pick<InvestmentErgebnis, "years" | "vermoegenStart">,
): DeckblattWerte {
  if (!result.years.length) throw new Error("Die Jahrestabelle ist leer");
  const jahre = result.years.slice(0, DECKBLATT_JAHRE);
  const erstes = jahre[0];
  const letztes = jahre[jahre.length - 1];

  const nachSteuerAbJahr2 = jahre.length > 1 ? schnitt(jahre.slice(1).map((j) => j.cashflowAfterTax)) / 12 : null;
  const kern = nachSteuerAbJahr2 ?? erstes.cashflowAfterTax / 12;
  // Unter einem halben Euro stünde „Ø 0 € im Monat“ da, das ist kein Zuzahlen.
  const zuzahlungMonat = kern <= -0.5 ? -kern : null;

  const vermoegensaufbauMonat = (letztes.propertyEquity - result.vermoegenStart) / (jahre.length * 12);
  const selbstEingezahlt = letztes.cumulativeEigenanteil;

  return {
    jahre,
    letztes,
    monat: {
      miete: erstes.effectiveRent / 12,
      rate: -erstes.debtService / 12,
      tilgung: erstes.principal / 12,
      kosten: -(erstes.operatingCosts + erstes.reserveContribution) / 12,
      vorSteuer: erstes.cashflowBeforeTax / 12,
      steuer: erstes.taxEffect / 12,
      nachSteuer: erstes.cashflowAfterTax / 12,
    },
    nachSteuerAbJahr2,
    zuzahlungMonat,
    vermoegensaufbauMonat,
    // Christians Formel aus dem Rechenkern, auf genau die gezeigten Jahre angewandt.
    eigenkapitalrendite: eigenkapitalrendite(input, { years: jahre, vermoegensaufbauMonat }),
    selbstEingezahlt,
    // Zuzahlungen minus saldierte Summe: genau die Überschüsse, nie negativ.
    ueberschuesse: Math.max(0, selbstEingezahlt + letztes.cumulativeCashflowAfterTax),
    fuerDichBleibt: letztes.totalWealth,
    // Unter einem Euro Eigenbeitrag ergäbe die Division eine unsinnig große Zahl.
    jeEingezahltemEuro: selbstEingezahlt >= 1 ? letztes.propertyEquity / selbstEingezahlt : null,
    steuerErstesJahr: erstes.taxEffect,
    steuerSumme: jahre.reduce((summe, j) => summe + j.taxEffect, 0),
    nachSteuerSchnitt: schnitt(jahre.map((j) => j.cashflowAfterTax)) / 12,
  };
}

const SPEICHERSCHLUESSEL = "investmentrechner.deckblatt";

/** Die zuletzt gewählte Variante dieses Browsers. Ohne Speicher oder mit Unbekanntem gilt der Standard. */
export function gemerkteDeckblattVariante(): DeckblattVariante {
  try {
    const wert = window.localStorage.getItem(SPEICHERSCHLUESSEL);
    return wert === "blick" || wert === "jahre" ? wert : DECKBLATT_STANDARD;
  } catch {
    return DECKBLATT_STANDARD;
  }
}

export function merkeDeckblattVariante(variante: DeckblattVariante): void {
  try {
    window.localStorage.setItem(SPEICHERSCHLUESSEL, variante);
  } catch {
    /* Ohne Speicher (privates Fenster) gilt die Wahl nur bis zum Neuladen. */
  }
}
