import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { berechneInvestment, mitEigenkapital, standardEingabe, type InvestmentEingabe } from "@/lib/investmentrechner/rechenkern";
import { AusfuehrlicheBerechnung, ausfuehrlicheWerte } from "./AusfuehrlicheBerechnung";

/*
 * Ausführliche Berechnung, seit dem 22.10.2026 im Repository (vorher nur im
 * Artefakt). Geprüft: zwölf Seiten, die korrigierte Überschrift, Wohnung und
 * Stellplatz getrennt, IRR, und dass die Monatswerte zum Rechenkern passen.
 */
const eingabe: InvestmentEingabe = mitEigenkapital(
  {
    ...standardEingabe,
    propertyTitle: "Testwohnung",
    purchasePrice: 285000,
    garagePrice: 15000,
    monthlyColdRent: 940.68,
    monthlyGarageRent: 80,
    area: 72.36,
    taxableIncomeCustomer: 80000,
    acquisitionMonth: 7,
  },
  25000,
);
const ergebnis = berechneInvestment(eingabe);

describe("Ausführliche Berechnung", () => {
  it("zeigt zwölf Seiten mit der korrigierten Überschrift", () => {
    const { container } = render(<AusfuehrlicheBerechnung input={eingabe} result={ergebnis} photos={[]} />);
    const vorschau = container.querySelector(".ba-dokument")!;
    expect(vorschau.querySelectorAll(".ba-seite")).toHaveLength(12);
    expect(vorschau.textContent).toContain("Warum sich eine vermietete Wohnung rechnet.");
    expect(vorschau.textContent).not.toContain("Warum eine vermietete Wohnung rechnet");
    expect(vorschau.textContent).toContain("Bruttomietrendite Wohnung");
    expect(vorschau.textContent).toContain("4,18");
    expect(vorschau.textContent).toContain("Interner Zinsfuß (IRR) p. a.");
    expect(vorschau.textContent).toContain("Juli 2026");
  });

  it("rechnet Monatswerte des ersten Jahres auf seine Monate ab dem Übergang", () => {
    const werte = ausfuehrlicheWerte(eingabe, ergebnis);
    expect(werte.ersteMonate).toBe(6);
    expect(werte.monat!.miete).toBeCloseTo(ergebnis.years[0].effectiveRent / 6, 6);
    // Die Raten der Darlehen ergeben zusammen die Kreditrate.
    expect(werte.darlehen.reduce((s, d) => s + d.rateMonat, 0)).toBeCloseTo(ergebnis.monthlyDebtService, 6);
  });
});

/* Codex-Nachprüfung vom 22.10.2026. */
describe("Erlös bei Verkauf und Zehnjahresfrist", () => {
  const beispiel: InvestmentEingabe = mitEigenkapital(
    {
      ...standardEingabe,
      purchasePrice: 300000,
      transferTaxRate: 0,
      notaryRate: 0,
      landRegisterRate: 0,
      annualValueGrowth: 0,
      forecastYears: 10,
    },
    60000,
  );
  it("ist Immobilienwert minus Restschuld, wie im IRR (seit dem 23.10.2026 ohne Verkaufskosten)", () => {
    const r = berechneInvestment(beispiel);
    const werte = ausfuehrlicheWerte(beispiel, r);
    const letztes = r.years[9];
    expect(werte.erloesEnde).toBeCloseTo(letztes.propertyValue - letztes.remainingDebt, 6);
    // Das eingesetzte Eigenkapital steckt darin: mehr als 60.000 Euro, nicht nur die Tilgung.
    expect(werte.erloesEnde).toBeGreaterThan(100000);
    expect(werte.stichjahre[1].erloes).toBeCloseTo(werte.erloesEnde, 6);
    expect(werte.stichjahre[1]).not.toHaveProperty("verkaufskosten");
  });

  it("nennt die Steuerfreiheit nur nach zehn vollen Jahren ab dem Übergang und unter Vorbehalt", () => {
    const zehn = render(<AusfuehrlicheBerechnung input={beispiel} result={berechneInvestment(beispiel)} photos={[]} />);
    expect(zehn.container.querySelector(".ba-titel")!.textContent).toContain("sofern die Zehnjahresfrist ab Kaufvertrag abgelaufen ist");
    zehn.unmount();
    // Übergang im Juli: Nach zehn Tabellenjahren sind erst neuneinhalb Jahre vergangen.
    const juli = { ...beispiel, acquisitionMonth: 7 };
    const kurz = render(<AusfuehrlicheBerechnung input={juli} result={berechneInvestment(juli)} photos={[]} />);
    expect(kurz.container.querySelector(".ba-titel")!.textContent).toContain("vor Ablauf von zehn Jahren steuerpflichtig");
  });
});
