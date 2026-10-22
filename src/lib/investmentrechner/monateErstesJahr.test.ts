import { describe, expect, it } from "vitest";
import { berechneInvestment, standardEingabe, type InvestmentEingabe } from "./rechenkern";
import { stresstest } from "./rechenstandards";
import { haushaltsrechnung } from "./bankunterlagen";
import { deckblattWerte } from "./deckblattWerte";

/*
 * Codex-Nachprüfung vom 22.10.2026: Monatswerte des ersten Jahres teilen
 * durch die Monate ab dem Übergang, nicht durch 12. Übergang im Juli: sechs
 * Monate.
 */
const eingabe: InvestmentEingabe = {
  ...standardEingabe,
  purchasePrice: 250000,
  monthlyColdRent: 900,
  monthlyOperatingCosts: 60,
  monthlyReserveContribution: 40,
  taxableIncomeCustomer: 70000,
  acquisitionMonth: 7,
};
const r = berechneInvestment(eingabe);
const erstes = r.years[0];

describe("Monatswerte im kurzen ersten Jahr", () => {
  it("Stresstest: Belastung und Leerstand je Monat ab dem Übergang", () => {
    const faelle = stresstest(eingabe, r);
    const leerstand = faelle.find((f) => f.einheit === "einmalig")!;
    expect(leerstand.stress.vorSteuer).toBeCloseTo((erstes.effectiveRent / 6) * 3, 6);
    expect(faelle[0].basis.vorSteuer).toBeCloseTo(-erstes.cashflowBeforeTax / 6, 6);
  });

  it("Haushaltsrechnung: Bewirtschaftung je Monat", () => {
    const h = haushaltsrechnung({ einkuenfte: [], ausgaben: [] }, r);
    expect(h.bewirtschaftungMonat).toBeCloseTo((erstes.operatingCosts + erstes.reserveContribution) / 6, 6);
    expect(h.bewirtschaftungMonat).toBeCloseTo(100, 6);
  });

  it("Deckblatt: Kosten im Monat des ersten Jahres", () => {
    const w = deckblattWerte(eingabe, r);
    expect(w.monat.kosten).toBeCloseTo(-100, 6);
  });
});
