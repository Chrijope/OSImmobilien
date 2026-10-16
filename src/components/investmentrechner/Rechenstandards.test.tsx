import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { berechneInvestment, standardEingabe, type InvestmentEingabe } from "@/lib/investmentrechner/rechenkern";
import { leereUnterlagenDaten } from "@/lib/investmentrechner/unterlagenAuslesen";
import { Analyse } from "./Analyse";

describe("Karte Rechenstandards in der Analyse", () => {
  it("zeigt Belastung vor und nach Steuer, Regel-AfA, Stresstest und Wertszenarien", () => {
    const eingabe: InvestmentEingabe = {
      ...standardEingabe,
      purchasePrice: 300_000,
      monthlyColdRent: 950,
      monthlyOperatingCosts: 60,
      taxableIncomeCustomer: 48_000,
      constructionYear: 1990,
      buildingDepreciationRate: 4,
    };
    const analyse = render(
      <TooltipProvider>
        <Analyse input={eingabe} result={berechneInvestment(eingabe)} documents={[]} documentData={leereUnterlagenDaten} onOpenDocuments={() => undefined} />
      </TooltipProvider>,
    );
    const text = analyse.getByTestId("karte-stresstest").textContent ?? "";
    for (const teil of [
      "Zuzahlung vor Steuer",
      "Zuzahlung nach Steuer",
      "Regel-AfA2 % linear",
      "mit Regel-AfA",
      "Erhöhte AfA nur mit anerkanntem Gutachten",
      "Gutachten abgelehnt",
      "Zins +1 Punkt ab Jahr 11",
      "3 Monate Leerstand",
      "in heutiger Kaufkraft",
    ]) {
      expect(text).toContain(teil);
    }
  });
});
