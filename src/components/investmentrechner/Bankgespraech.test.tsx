import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { berechneInvestment, standardEingabe, type InvestmentEingabe } from "@/lib/investmentrechner/rechenkern";
import { leereUnterlagenDaten } from "@/lib/investmentrechner/unterlagenAuslesen";
import { Analyse } from "./Analyse";

describe("Karte Bankgespräch in der Analyse", () => {
  it("zeigt Beleihung, Zinsänderungsrisiko, beide Eigenkapitalrenditen und die 15-%-Grenze", () => {
    const eingabe: InvestmentEingabe = {
      ...standardEingabe,
      purchasePrice: 300_000,
      rehabExpense: 20_000,
      monthlyColdRent: 950,
      monthlyOperatingCosts: 60,
      taxableIncomeCustomer: 80_000,
      area: 60,
      equity: 20_000,
    };
    const analyse = render(
      <TooltipProvider>
        <Analyse input={eingabe} result={berechneInvestment(eingabe)} documents={[]} documentData={leereUnterlagenDaten} onOpenDocuments={() => undefined} mitBankgespraech />
      </TooltipProvider>,
    );
    const text = analyse.getByTestId("karte-bankgespraech").textContent ?? "";
    for (const teil of [
      "Darlehen in % des Kaufpreises",
      "Kaufpreis je m²5.000",
      "Kapitaldienstdeckung (DSCR)",
      "Zinsänderungsrisiko",
      "Cashflow nach Steuer wird 0 bei",
      "ohne Wertsteigerung",
      "15-%-Grenze anschaffungsnahe Herstellungskosten",
    ]) {
      expect(text).toContain(teil);
    }
    analyse.unmount();
  });

  it("fehlt in der bestehenden Investmentkalkulation", () => {
    const analyse = render(
      <TooltipProvider>
        <Analyse input={standardEingabe} result={berechneInvestment(standardEingabe)} documents={[]} documentData={leereUnterlagenDaten} onOpenDocuments={() => undefined} />
      </TooltipProvider>,
    );
    expect(analyse.queryByTestId("karte-bankgespraech")).toBeNull();
    analyse.unmount();
  });
});
