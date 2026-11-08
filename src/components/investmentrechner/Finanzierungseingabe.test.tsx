import { describe, expect, it, vi } from "vitest";
// Die Eingaben dazu sind seit dem 08.11.2026 ausgeblendet (ausgeblendeteFelder.ts); die Tests laufen wieder, sobald sie gezeigt werden.
import { UNWIRKSAME_FELDER_ZEIGEN } from "@/lib/investmentrechner/ausgeblendeteFelder";
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
  // Bis 29.10.2026 der Standard; die Zahlen dieses Tests hängen daran.
  seniorInterestRate: 4,
  seniorRepaymentRate: 1.5,
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
  it.skipIf(!UNWIRKSAME_FELDER_ZEIGEN)("zeigt den Betrag in Prozent und in Euro und merkt sich, worin getippt wird", () => {
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

describe("Ausgeblendete Felder und Grenzsteuersatz (08.11.2026)", () => {
  it("zeigt keine Felder ohne Wirkung auf Analyse und PDF", () => {
    zeige(EINGABE);
    for (const label of [/^Betrag in % des Kaufpreises/, /^Betrag in €/, /^Zinsbindung/, /^Tilgungsart/, /^Tilgungsfreie Anlaufjahre/, /^Leerstand/, /^Mietsteigerung/, /^Übergang Nutzen und Lasten/, /^Betrachtungszeitraum/]) {
      expect(screen.queryByLabelText(label), String(label)).toBeNull();
    }
    expect(screen.queryByRole("checkbox", { name: /KfW-Darlehen/ })).toBeNull();
    expect(screen.queryByText("Effektive Jahresmiete")).toBeNull();
    expect(screen.getByTestId("darlehen-100")).toHaveTextContent(/100 % des Kaufpreises/);
  });

  it("automatisch aus dem Einkommen, Schnellwahl und freies Feld setzen manuell, zurück auf automatisch", () => {
    const eingabe = { ...EINGABE, taxableIncomeCustomer: 62000, churchTaxRate: 8 };
    const aendere = zeige(eingabe);
    const feld = screen.getByTestId("grenzsteuersatz");
    expect(feld).toHaveAttribute("data-modus", "automatisch");
    const r = berechneInvestment(eingabe);
    expect(screen.getByLabelText(/^Grenzsteuersatz für Analyse und PDF/)).toHaveValue(Math.round(r.marginalTotalTaxRate * 10000) / 100);
    for (const prozent of [42, 37, 32]) {
      fireEvent.click(screen.getByRole("button", { name: `${prozent} %` }));
      expect(aendere).toHaveBeenLastCalledWith({ taxCalculationMode: "manual", marginalTaxRate: prozent });
    }
    fireEvent.change(screen.getByLabelText(/^Grenzsteuersatz für Analyse und PDF/), { target: { value: "39.5" } });
    expect(aendere).toHaveBeenLastCalledWith({ taxCalculationMode: "manual", marginalTaxRate: 39.5 });
  });

  it("manuell: Knopf „Zurück auf automatisch“ und der angezeigte Satz ist der eingetragene", () => {
    const aendere = zeige({ ...EINGABE, taxableIncomeCustomer: 62000, taxCalculationMode: "manual", marginalTaxRate: 37 });
    expect(screen.getByTestId("grenzsteuersatz")).toHaveAttribute("data-modus", "manuell");
    expect(screen.getByLabelText(/^Grenzsteuersatz für Analyse und PDF/)).toHaveValue(37);
    fireEvent.click(screen.getByRole("button", { name: "Zurück auf automatisch" }));
    expect(aendere).toHaveBeenLastCalledWith({ taxCalculationMode: "tariff" });
  });
});
