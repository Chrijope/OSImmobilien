import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Cashflowleiste } from "./Felder";
import { berechneInvestment, standardEingabe } from "@/lib/investmentrechner/rechenkern";
import { formatEuro, formatEuroCent } from "@/lib/investmentrechner/formatierer";

/**
 * Die dunklen Kacheln auf der ersten Seite des Investmentrechners.
 *
 * Christian am 25.09.2026: Die Renditekachel entfällt. Die Kachel für den
 * monatlichen Betrag heißt je nach Vorzeichen „Das bekommst du raus“ oder
 * „Das zahlst du monatlich drauf“ und ist geteilt, oben Cashflow vor Steuer,
 * darunter nach Steuer. In der Reihe darunter steht neben Gesamtvermögen und
 * Steuereffekt im ersten Jahr der Steuereffekt über den ganzen Zeitraum.
 * Seit dem 30.09.2026 steht die Eigenkapitalrendite unten in der Kachel
 * „Vermögensaufbau“, die untere Reihe bleibt bei drei Kacheln.
 *
 * Dieser Test hält fest, was in den Kacheln steht. Verschwindet eine Zahl bei
 * einem Umbau, fällt es hier auf und nicht erst im Kundengespräch.
 */

const FALL = {
  ...standardEingabe,
  purchasePrice: 320_000,
  equity: 0,
  seniorInterestRate: 3.8,
  seniorRepaymentRate: 2,
  annualValueGrowth: 1.5,
  forecastYears: 10,
  monthlyColdRent: 980,
  annualGrossIncome: 85_000,
  transferTaxRate: 3.5,
  notaryRate: 1.5,
  landRegisterRate: 0.5,
  brokerRate: 2.5,
  otherPurchaseCostRate: 0,
};

/** Ein Fall, in dem nach Steuer monatlich etwas übrig bleibt. */
const UEBERSCHUSS = {
  ...FALL,
  purchasePrice: 150_000,
  equity: 60_000,
  monthlyColdRent: 1_100,
  seniorInterestRate: 3.5,
  brokerRate: 0,
};

function leisteMit(eingabe: typeof FALL) {
  const result = berechneInvestment(eingabe);
  const ansicht = render(<Cashflowleiste input={eingabe} jahr={result.years[0]} result={result} />);
  return { result, container: ansicht.container };
}

/** Die Kachel, deren Überschrift genau dieser Text ist. */
function kachel(ueberschrift: string | RegExp): HTMLElement {
  const element = screen.getByText(ueberschrift).parentElement;
  expect(element).not.toBeNull();
  return element as HTMLElement;
}

describe("Die Kacheln zeigen Christians Zahlen", () => {
  it("nennt alle Überschriften", () => {
    leisteMit(FALL);

    expect(screen.getByText("Das zahlst du monatlich drauf")).toBeInTheDocument();
    expect(screen.getByText("Cashflow vor Steuer pro Monat")).toBeInTheDocument();
    expect(screen.getByText("Cashflow nach Steuer pro Monat")).toBeInTheDocument();
    expect(screen.getByText("Vermögensaufbau")).toBeInTheDocument();
    expect(screen.getByText("Gesamtvermögen nach 10 Jahren")).toBeInTheDocument();
    expect(screen.getByText("Eigenkapitalrendite p. a.")).toBeInTheDocument();
    expect(screen.getByText("Steuereffekt im ersten Jahr")).toBeInTheDocument();
    expect(screen.getByText("Steuereffekt 10 Jahre gesamt")).toBeInTheDocument();
  });

  it("stellt zwei Kacheln in die obere und drei in die untere Reihe, die Eigenkapitalrendite im Vermögensaufbau", () => {
    const { container } = leisteMit(FALL);

    expect(container.querySelectorAll(".cashflow-band--oben > div")).toHaveLength(2);
    expect(container.querySelectorAll(".cashflow-band--drei > div")).toHaveLength(3);
    expect(kachel("Vermögensaufbau").contains(screen.getByTestId("kachel-eigenkapitalrendite"))).toBe(true);
  });
});

describe("Die alte Renditekachel bleibt entfernt", () => {
  it("zeigt weder die Rendite auf das eingesetzte Geld noch den internen Zinsfuß", () => {
    const { result, container } = leisteMit(FALL);

    expect(result.irr).not.toBeNull();
    expect(screen.queryByText("Rendite auf dein eingesetztes Geld")).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Zinsfu/);
    expect(container.textContent).not.toMatch(/Wertsteigerung/);
  });

  it("zeigt eine Prozentzahl nur in der Eigenkapitalrendite", () => {
    // Seit dem 30.09.2026 da, freigegeben von Christian. Alles übrige in den
    // Kacheln bleibt reine Beträge.
    const { container } = leisteMit({ ...FALL, equity: 20_000 });
    for (const kachelElement of container.querySelectorAll(".cashflow-band > div")) {
      const ohneEkr = kachelElement.cloneNode(true) as HTMLElement;
      ohneEkr.querySelector("[data-testid='kachel-eigenkapitalrendite']")?.remove();
      expect(ohneEkr.textContent).not.toMatch(/\d\s?%/);
    }
    const ekr = screen.getByTestId("kachel-eigenkapitalrendite").querySelector("strong")?.textContent ?? "";
    // Eine Nachkommastelle.
    expect(ekr).toMatch(/^\d+,\d\s?%$/);
  });
});

describe("Eigenkapitalrendite", () => {
  it("sagt ohne Eigenkapital und ohne Zuzahlung vor Steuer, warum keine Zahl dasteht", () => {
    // Überschuss vor Steuer, kein Eigenkapital: Der Nenner ist null.
    const { result } = leisteMit({ ...UEBERSCHUSS, equity: 0 });
    expect(result.years[0].cashflowBeforeTax).toBeGreaterThan(0);
    const ekrKachel = screen.getByTestId("kachel-eigenkapitalrendite");
    expect(ekrKachel.querySelector("strong")).toBeNull();
    expect(screen.getByTestId("eigenkapitalrendite-nicht-bestimmbar")).toHaveTextContent(
      "Nicht sinnvoll bestimmbar: Du setzt kein Eigenkapital ein und zahlst monatlich nichts zu.",
    );
  });

  it("rechnet mit dem angezeigten Cashflow vor Steuer", () => {
    const { result } = leisteMit({ ...FALL, equity: 20_000 });
    const vorSteuer = kachel("Das zahlst du monatlich drauf").querySelector(".cashflow-teil strong")?.textContent ?? "";
    const betrag = formatEuroCent(-result.years[0].cashflowBeforeTax / 12);
    expect(vorSteuer.replace(/^−/, "")).toBe(betrag);
    expect(screen.getByTestId("kachel-eigenkapitalrendite").querySelector(".rechenweg")?.textContent).toContain(
      `Zuzahlung vor Steuer ${betrag} × 12`,
    );
  });

  it("nennt den Gegenfall zu den Kaufnebenkosten", () => {
    leisteMit({ ...FALL, equity: 0 });
    expect(screen.getByTestId("eigenkapitalrendite-hinweis")).toHaveTextContent(
      /Kaufnebenkosten [\d.]+\s€ selbst gezahlt: [\d,]+\s%, Rate [\d.,]+\s€ niedriger\./,
    );
  });

  it("färbt eine negative Eigenkapitalrendite rot", () => {
    // Möbel verlieren mehr an Wert, als getilgt wird; eine negative Wertsteigerung kappt der Kern auf null.
    leisteMit({ ...FALL, equity: 20_000, furniturePrice: 30_000, annualValueGrowth: 0, seniorRepaymentRate: 0.1 });
    expect(screen.getByTestId("kachel-eigenkapitalrendite").className).toContain("negativ");
  });
});

describe("Die Überschrift der Cashflow-Kachel folgt dem Vorzeichen", () => {
  it("heißt „Das zahlst du monatlich drauf“, wenn nach Steuer etwas fehlt", () => {
    const { result } = leisteMit(FALL);

    expect(result.years[0].cashflowAfterTax).toBeLessThan(0);
    expect(screen.getByText("Das zahlst du monatlich drauf")).toBeInTheDocument();
    expect(screen.queryByText("Das bekommst du raus")).not.toBeInTheDocument();
  });

  it("heißt „Das bekommst du raus“, wenn nach Steuer etwas übrig bleibt", () => {
    const { result } = leisteMit(UEBERSCHUSS);

    expect(result.years[0].cashflowAfterTax).toBeGreaterThan(0);
    expect(screen.getByText("Das bekommst du raus")).toBeInTheDocument();
    expect(screen.queryByText("Das zahlst du monatlich drauf")).not.toBeInTheDocument();
  });

  it("zeigt beide Cashflows mit Vorzeichen, das Minus als Rechenzeichen", () => {
    leisteMit(FALL);
    const geteilt = kachel("Das zahlst du monatlich drauf");

    const werte = [...geteilt.querySelectorAll(".cashflow-teil strong")].map((element) => element.textContent ?? "");
    expect(werte).toHaveLength(2);
    for (const wert of werte) expect(wert.startsWith("−")).toBe(true);
    // Kein Bindestrich als Minus.
    expect(geteilt.textContent).not.toMatch(/-\s?\d/);
  });

  it("zeigt einen Überschuss als Pluszahl", () => {
    leisteMit(UEBERSCHUSS);
    const geteilt = kachel("Das bekommst du raus");

    const nachSteuer = geteilt.querySelectorAll(".cashflow-teil strong")[1]?.textContent ?? "";
    expect(nachSteuer).toMatch(/^\+\s?\d/);
  });
});

describe("Steuereffekt über den ganzen Zeitraum", () => {
  it("ist die Summe der Jahreswerte aus der Jahrestabelle", () => {
    const { result } = leisteMit(FALL);
    const summe = result.years.reduce((gesamt, jahr) => gesamt + jahr.taxEffect, 0);

    expect(result.cumulativeTaxEffect).toBeCloseTo(summe, 6);
    const wert = kachel("Steuereffekt 10 Jahre gesamt").querySelector("strong")?.textContent ?? "";
    expect(wert.replace(/^\+/, "")).toBe(formatEuro(summe));
  });

  it("folgt dem eingestellten Betrachtungszeitraum", () => {
    leisteMit({ ...FALL, forecastYears: 15 });

    expect(screen.getByText("Steuereffekt 15 Jahre gesamt")).toBeInTheDocument();
  });
});

describe("Jede Zahl trägt ihre Einordnung", () => {
  it("trennt beim Vermögensaufbau die harte Tilgung vom Rest", () => {
    // Der Wertzuwachs ist eine Annahme, die Tilgung nicht. Steht nur eine Zahl
    // da, liest sie sich, als wäre alles gesichert.
    leisteMit(FALL);

    expect(screen.getByText(/davon .* Tilgung/)).toBeInTheDocument();
    expect(screen.getByText(/je eingezahltem Euro/)).toBeInTheDocument();
  });

  it("zeigt als Gesamtvermögen nicht den Immobilienwert", () => {
    /*
      Eine belastete Immobilie ist nicht das Vermögen ihres Eigentümers. Der
      erste Entwurf zeigte hier den reinen Immobilienwert.
    */
    const { result } = leisteMit(FALL);
    const letztes = result.years[result.years.length - 1];

    expect(letztes.totalWealth).toBeLessThan(letztes.propertyValue);
    expect(kachel("Gesamtvermögen nach 10 Jahren").querySelector("strong")?.textContent).toBe(
      formatEuro(letztes.totalWealth),
    );
  });

  it("sagt beim Steuereffekt, dass er im Cashflow nach Steuer schon steckt", () => {
    leisteMit(FALL);

    expect(screen.getByText(/im Cashflow nach Steuer enthalten/)).toBeInTheDocument();
  });
});

/*
 * Christian am 30.09.2026: Cashflow vor und nach Steuer standen gleich hoch
 * da. Ursache war kein Rechenfehler, sondern ein fehlendes zu versteuerndes
 * Einkommen. Das sagt jetzt ein Satz unter dem Cashflow nach Steuer.
 */
describe("Hinweis ohne Steuerwirkung", () => {
  it("nennt das fehlende zvE, wenn beide Cashflows deshalb gleich sind", () => {
    const { result } = leisteMit({ ...FALL, taxableIncomeCustomer: 0 });
    expect(result.years[0].cashflowAfterTax).toBeCloseTo(result.years[0].cashflowBeforeTax, 6);
    expect(screen.getByTestId("hinweis-ohne-steuerwirkung")).toHaveTextContent(
      "Ohne zu versteuerndes Einkommen keine Steuerwirkung",
    );
  });

  it("nennt den fehlenden Satz im manuellen Modus", () => {
    leisteMit({ ...FALL, taxCalculationMode: "manual", marginalTaxRate: 0 });
    expect(screen.getByTestId("hinweis-ohne-steuerwirkung")).toHaveTextContent("Ohne Steuersatz keine Steuerwirkung");
  });

  it("schweigt, sobald ein Einkommen eingetragen ist", () => {
    const { result } = leisteMit({ ...FALL, taxableIncomeCustomer: 70_000 });
    expect(result.years[0].taxEffect).not.toBe(0);
    expect(screen.queryByTestId("hinweis-ohne-steuerwirkung")).toBeNull();
  });
});
