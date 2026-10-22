import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { berechneInvestment, standardEingabe, type InvestmentEingabe } from "@/lib/investmentrechner/rechenkern";
import { AusfuehrlicheBerechnung, ausfuehrlicheWerte } from "./AusfuehrlicheBerechnung";

/*
 * Ausführliche Berechnung, seit dem 22.10.2026 im Repository (vorher nur im
 * Artefakt). Geprüft: zwölf Seiten, die korrigierte Überschrift, Wohnung und
 * Stellplatz getrennt, IRR, und dass die Monatswerte zum Rechenkern passen.
 */
const eingabe: InvestmentEingabe = {
  ...standardEingabe,
  propertyTitle: "Testwohnung",
  purchasePrice: 285000,
  garagePrice: 15000,
  monthlyColdRent: 940.68,
  monthlyGarageRent: 80,
  area: 72.36,
  equity: 25000,
  taxableIncomeCustomer: 80000,
  acquisitionMonth: 7,
};
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
