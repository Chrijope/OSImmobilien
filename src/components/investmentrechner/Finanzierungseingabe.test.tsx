import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { berechneInvestment, standardEingabe, type InvestmentEingabe } from "@/lib/investmentrechner/rechenkern";
import { EingabeFinanzierung, EingabeKunde, EingabeErtrag } from "./Eingabebereiche";

/*
 * Bereich Finanzierung seit dem 23.10.2026 (Christian): Bankdarlehen und
 * Nachrang in Prozent des Kaufpreises oder in Euro, beide Felder zeigen
 * dieselbe Zahl; das Eigenkapital ist der Rest, dazu Mischzins und
 * Überfinanzierung. Entfallene Felder stehen nicht mehr da.
 */

const EINGABE: InvestmentEingabe = {
  ...standardEingabe,
  purchasePrice: 250000,
  transferTaxRate: 3.5,
  notaryRate: 1,
  landRegisterRate: 0.5,
  seniorLoanMode: "percent",
  seniorLoanValue: 90,
};

function zeige(eingabe: InvestmentEingabe, aendere = vi.fn()) {
  const props = { input: eingabe, result: berechneInvestment(eingabe), setzeZahl: vi.fn(), setzeText: vi.fn(), aendere };
  render(
    <TooltipProvider>
      <EingabeFinanzierung {...props} />
      <EingabeKunde {...props} />
      <EingabeErtrag {...props} />
    </TooltipProvider>,
  );
  return aendere;
}

describe("Finanzierung eingeben", () => {
  it("zeigt den Betrag in Prozent und in Euro und merkt sich, worin getippt wird", () => {
    const aendere = zeige(EINGABE);
    const [prozentBank] = screen.getAllByLabelText(/^Betrag in % des Kaufpreises/) as HTMLInputElement[];
    const [euroBank] = screen.getAllByLabelText(/^Betrag in €/) as HTMLInputElement[];
    expect(prozentBank.value).toBe("90");
    expect(euroBank.value).toBe("225000");
    fireEvent.change(euroBank, { target: { value: "200000" } });
    expect(aendere).toHaveBeenLastCalledWith({ seniorLoanMode: "euro", seniorLoanValue: 200000 });
    fireEvent.change(prozentBank, { target: { value: "80" } });
    expect(aendere).toHaveBeenLastCalledWith({ seniorLoanMode: "percent", seniorLoanValue: 80 });
  });

  it("zeigt das Eigenkapital als Rest und den Mischzins", () => {
    zeige(EINGABE);
    // 250.000 + 12.500 Nebenkosten − 225.000 Bank.
    expect(screen.getByTestId("eigenkapital-rest")).toHaveTextContent(/37\.500\s€/);
    expect(screen.getByTestId("mischzins")).toHaveTextContent(/4,00\s%/);
    expect(screen.queryByTestId("hinweis-ueberfinanzierung")).toBeNull();
  });

  it("warnt bei Überfinanzierung", () => {
    zeige({ ...EINGABE, seniorLoanValue: 110 });
    expect(screen.getByTestId("hinweis-ueberfinanzierung")).toHaveTextContent(/12\.500\s€ über Kaufpreis und Kaufnebenkosten/);
  });

  it("hat keine Felder mehr für Eigenkapital, Finanzierungsnebenkosten, Anschluss, Sondertilgung, Verkaufskosten und Einkommensentwicklung", () => {
    zeige(EINGABE);
    for (const label of [
      /^Eigenkapital$/,
      /Finanzierungsnebenkosten/,
      /Anschlusszins/,
      /Neue Tilgung ab Anschluss/,
      /Umschuldungskosten/,
      /Sondertilgung/,
      /Verkaufskosten/,
      /zvE-Entwicklung/,
      /Zuführung Instandhaltungsrücklage/,
    ]) {
      expect(screen.queryByLabelText(label), String(label)).toBeNull();
    }
    expect(screen.getByLabelText(/^Zu versteuerndes Einkommen/)).toBeInTheDocument();
  });
});
