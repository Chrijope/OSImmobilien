import { describe, expect, it } from "vitest";
import { altersvorsorge, type Altersvorsorge } from "./altersvorsorge";
import { berechneInvestment, standardEingabe, type InvestmentEingabe } from "./rechenkern";

// Christians Beispiel: 35 Jahre, Rente mit 67, Kaufpreis 250.000 €.
const beispiel: InvestmentEingabe = {
  ...standardEingabe,
  clientName: "Beispiel",
  purchasePrice: 250_000,
  equity: 15_000,
  monthlyColdRent: 850,
  monthlyOperatingCosts: 60,
  monthlyReserveContribution: 25,
  annualRentGrowth: 2,
  annualCostGrowth: 2,
  annualValueGrowth: 1.5,
  seniorInterestRate: 4,
  seniorRepaymentRate: 2,
  taxableIncomeCustomer: 60_000,
  clientAge: 35,
  retirementAge: 67,
  inflationRate: 2,
};

function ok(eingabe: InvestmentEingabe): Altersvorsorge {
  const ergebnis = altersvorsorge(eingabe);
  if (ergebnis.status !== "ok") throw new Error(`erwartet ok, war ${ergebnis.status}`);
  return ergebnis;
}

/** Jahre bis zur vollen Tilgung einer Annuität mit fester Jahresrate, unabhängig vom Rechenkern. */
function tilgungsjahre(darlehen: number, zins: number, tilgung: number): number {
  const rate = darlehen * (zins + tilgung);
  let rest = darlehen;
  let jahre = 0;
  while (rest >= 0.5) {
    rest = rest * (1 + zins) - rate;
    jahre += 1;
  }
  return jahre;
}

describe("Altersvorsorge", () => {
  it("findet das Jahr, ab dem die Restschuld 0 ist", () => {
    const a = ok(beispiel);
    const jahre = tilgungsjahre(a.darlehenStart, 0.04, 0.02);
    expect(a.schuldenfrei).toEqual({ jahr: 2026 + jahre, alter: 35 + jahre });
    // Davor steht noch etwas offen, danach nicht mehr.
    const lang = berechneInvestment({ ...beispiel, forecastYears: 60 }, 60).years;
    expect(lang[jahre - 2].remainingDebt).toBeGreaterThan(0.5);
    expect(lang[jahre - 1].remainingDebt).toBeLessThan(0.5);
  });

  it("rechnet den Rentenbeginn über die 30 Jahre der Oberfläche hinaus", () => {
    const a = ok(beispiel);
    expect(a.jahreBisRente).toBe(32);
    expect(a.rentenJahr).toBe(2058);
    expect(a.zumRentenbeginn.restschuld).toBeLessThan(0.5);
    expect(a.zumRentenbeginn.vermoegen).toBeCloseTo(a.zumRentenbeginn.wert, 0);
  });

  it("Rentenphase: keine Rate, Miete nach Kosten und Rücklage, in heutiger Kaufkraft abgezinst", () => {
    const a = ok(beispiel);
    const faktor = 1.02 ** 32;
    expect(a.ruhestand.rate).toBe(0);
    expect(a.ruhestand.mieteNetto).toBeCloseTo((850 - 60 - 25) * faktor, 6);
    expect(a.ruhestand.zusatz).toBeCloseTo(a.ruhestand.mieteNetto, 6);
    expect(a.ruhestand.zusatzHeute).toBeCloseTo(a.ruhestand.zusatz / faktor, 6);
    // Miete und Inflation wachsen hier gleich schnell: heutige Kaufkraft = heutige Nettomiete.
    expect(a.ruhestand.zusatzHeute).toBeCloseTo(765, 6);
    expect(a.nachEntschuldung).toBeNull();
  });

  it("ohne Inflation ist die heutige Kaufkraft der Nennbetrag", () => {
    const a = ok({ ...beispiel, inflationRate: 0 });
    expect(a.ruhestand.zusatzHeute).toBeCloseTo(a.ruhestand.zusatz, 6);
  });

  it("eingesetztes Geld ist Eigenkapital plus Zuzahlungen nach Steuer bis zum Rentenbeginn", () => {
    const a = ok(beispiel);
    const jahre = berechneInvestment({ ...beispiel, forecastYears: 32 }, 32).years;
    expect(a.zumRentenbeginn.zuzahlungen).toBeCloseTo(jahre[31].cumulativeEigenanteil, 6);
    expect(a.zumRentenbeginn.eingesetzt).toBeCloseTo(15_000 + jahre[31].cumulativeEigenanteil, 6);
    expect(a.eigenaufwandHeute).toBeCloseTo(-jahre[0].cashflowAfterTax / 12, 6);
  });

  it("Rentenbeginn vor der Entschuldung: Restschuld und Rate bleiben sichtbar", () => {
    const a = ok({ ...beispiel, seniorRepaymentRate: 1 });
    const jahre = tilgungsjahre(a.darlehenStart, 0.04, 0.01);
    expect(a.zumRentenbeginn.restschuld).toBeGreaterThan(10_000);
    expect(a.ruhestand.rate).toBeGreaterThan(0);
    expect(a.ruhestand.zusatz).toBeCloseTo(a.ruhestand.mieteNetto - a.ruhestand.rate, 6);
    expect(a.schuldenfrei).toEqual({ jahr: 2026 + jahre, alter: 35 + jahre });
    expect(a.nachEntschuldung?.jahr).toBe(2026 + jahre);
    expect(a.nachEntschuldung!.zusatz).toBeGreaterThan(a.ruhestand.zusatz);
  });

  it("ohne Darlehen ist die Wohnung von Anfang an schuldenfrei", () => {
    const a = ok({ ...beispiel, equity: 300_000 });
    expect(a.darlehenStart).toBe(0);
    expect(a.schuldenfrei).toEqual({ jahr: 2026, alter: 35 });
  });

  it("Tilgung 0: Entschuldung nicht absehbar", () => {
    const a = ok({ ...beispiel, seniorRepaymentRate: 0 });
    expect(a.schuldenfrei).toBeNull();
    expect(a.nachEntschuldung).toBeNull();
  });

  it("meldet fehlende oder unpassende Angaben, statt falsch zu rechnen", () => {
    expect(altersvorsorge({ ...beispiel, clientAge: 0 }).status).toBe("ohneAlter");
    expect(altersvorsorge({ ...beispiel, clientAge: 67 }).status).toBe("rentenbeginnErreicht");
    expect(altersvorsorge({ ...beispiel, clientAge: 70 }).status).toBe("rentenbeginnErreicht");
    expect(altersvorsorge({ ...beispiel, clientAge: 5 }).status).toBe("zuWeit");
  });

  it("der Rechenkern bleibt ohne zweiten Wert bei höchstens 30 Jahren", () => {
    expect(berechneInvestment({ ...beispiel, forecastYears: 45 }).years).toHaveLength(30);
  });
});
