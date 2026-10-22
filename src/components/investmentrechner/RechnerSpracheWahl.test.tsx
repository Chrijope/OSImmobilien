import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { berechneInvestment, hausgeldAufstellung, standardEingabe, type InvestmentEingabe } from "@/lib/investmentrechner/rechenkern";
import { InvestmentrechnerInhalt } from "./InvestmentrechnerInhalt";
import { AusfuehrlicheBerechnung } from "./AusfuehrlicheBerechnung";
import { RechnerSpracheContext } from "./RechnerSprache";
import { Hausgeldaufstellung } from "./Auswertungen";

vi.mock("@/lib/investmentrechner/berechnungAnsichtPdf", () => ({ ladeBerechnungsansichtHerunter: vi.fn() }));

/*
 * Sprache, seit dem 22.10.2026 (Christian): Die Eingabemaske links bleibt
 * Deutsch, die rechte Seite und die PDFs folgen der Kundensprache oder, ohne
 * Kunde, einer sichtbaren Wahl. Dazu das Hausgeld in ganzer Höhe.
 */
const zeige = (inhalt: React.ReactNode) => render(<TooltipProvider>{inhalt}</TooltipProvider>);
const eingabe: InvestmentEingabe = {
  ...standardEingabe,
  propertyTitle: "Testwohnung",
  purchasePrice: 250000,
  monthlyColdRent: 900,
  taxableIncomeCustomer: 70000,
  // Weitere nicht umlagefähige Kosten neben dem Hausgeld, etwa Sondereigentumsverwaltung.
  monthlyOperatingCosts: 20,
  monthlyReserveContribution: 40,
  housingFeeTotal: 300,
  housingFeeRecoverable: 200,
  housingFeeNonRecoverable: 60,
};

describe("Sprache der rechten Seite", () => {
  it("ohne Kunde: sichtbare Wahl, Englisch übersetzt die Vorschau, die Eingabemaske bleibt Deutsch", () => {
    const { container } = zeige(<InvestmentrechnerInhalt vorbelegung={{ eingabe, knk: { weg: "bundesland", bundesland: "bayern" } }} />);
    const wahl = within(screen.getByTestId("sprache-wahl")).getByRole("combobox");
    expect(container.querySelector(".result-panel")?.textContent).toContain("Kaufpreisdetails");
    fireEvent.change(wahl, { target: { value: "en" } });
    const rechts = container.querySelector(".result-panel")!;
    expect(rechts.getAttribute("lang")).toBe("en");
    expect(rechts.textContent).toContain("Purchase price details");
    expect(rechts.textContent).toContain("Gross rental yield");
    expect(rechts.textContent).not.toContain("Kaufpreisdetails");
    // Links bleibt alles Deutsch.
    const links = container.querySelector(".input-panel") ?? container;
    expect(links.textContent).toContain("Kunde & Einkommen");
  });

  it("die ausführliche Berechnung auf Englisch", () => {
    const { container } = render(
      <RechnerSpracheContext.Provider value="en">
        <AusfuehrlicheBerechnung input={eingabe} result={berechneInvestment(eingabe)} photos={[]} />
      </RechnerSpracheContext.Provider>,
    );
    const text = container.querySelector(".ba-dokument")!.textContent ?? "";
    expect(text).toContain("Why a let apartment pays off.");
    expect(text).toContain("Internal rate of return (IRR) p.a.");
    expect(text).not.toContain("Warum sich");
    expect(text).not.toContain("Kaltmiete");
  });
});

describe("Hausgeld in ganzer Höhe", () => {
  it("prüft gesamt = umlagefähig + nicht umlagefähig + Rücklage", () => {
    expect(hausgeldAufstellung(eingabe)).toMatchObject({ gesamt: 300, summeTeile: 300, abweichung: 0 });
    const falsch = hausgeldAufstellung({ ...eingabe, housingFeeTotal: 320 });
    expect(falsch.abweichung).toBe(20);
    expect(hausgeldAufstellung(standardEingabe).vorhanden).toBe(false);
  });

  it("zeigt die Aufstellung und eine Abweichung, deutsch und englisch", () => {
    const { container, unmount } = render(<Hausgeldaufstellung input={{ ...eingabe, housingFeeTotal: 320 }} />);
    expect(container.textContent).toContain("Hausgeld gesamt je Monat");
    expect(screen.getByTestId("hausgeld-abweichung").textContent).toMatch(/Abweichung/);
    unmount();
    const en = render(
      <RechnerSpracheContext.Provider value="en">
        <Hausgeldaufstellung input={eingabe} />
      </RechnerSpracheContext.Provider>,
    );
    expect(en.container.textContent).toContain("Service charge total per month");
    expect(en.queryByTestId("hausgeld-abweichung")).toBeNull();
  });

  it("belastet den Cashflow nur mit dem nicht umlagefähigen Teil, den weiteren Kosten und der Rücklage", () => {
    const r = berechneInvestment(eingabe);
    // Gesamt und umlagefähig ändern die Rechnung nicht: Den umlagefähigen Teil zahlt der Mieter.
    const andereAnzeige = berechneInvestment({ ...eingabe, housingFeeTotal: 999, housingFeeRecoverable: 500 });
    expect(r.years).toEqual(andereAnzeige.years);
    // Nicht umlagefähig (60) plus weitere Kosten (20) plus Rücklage (40).
    expect(r.years[0].operatingCosts + r.years[0].reserveContribution).toBeCloseTo((60 + 20 + 40) * 12, 6);
    // Jede Änderung am nicht umlagefähigen Hausgeld wirkt auf den Cashflow (Codex-Befund vom 22.10.2026).
    const mehr = berechneInvestment({ ...eingabe, housingFeeNonRecoverable: 70 });
    expect(r.years[0].cashflowBeforeTax - mehr.years[0].cashflowBeforeTax).toBeCloseTo(120, 6);
    // Ein alter Stand ohne die Aufteilung rechnet wie vorher mit dem einen Feld.
    const alt = berechneInvestment({ ...eingabe, housingFeeNonRecoverable: 0, monthlyOperatingCosts: 80 });
    expect(alt.years[0].operatingCosts).toBeCloseTo(r.years[0].operatingCosts, 6);
  });
});
