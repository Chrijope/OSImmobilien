import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { berechneInvestment, hausgeldAufstellung, standardEingabe, type InvestmentEingabe } from "@/lib/investmentrechner/rechenkern";
import { InvestmentrechnerInhalt } from "./InvestmentrechnerInhalt";
import { AusfuehrlicheBerechnung } from "./AusfuehrlicheBerechnung";
import { RechnerSpracheContext } from "./RechnerSprache";
import { Bankgespraech, BankunterlagenTabellen, Hausgeldaufstellung } from "./Auswertungen";
import { KENNZAHL_TEXTE_DE, KENNZAHL_TEXTE_EN } from "@/lib/investmentrechner/kennzahlTexte";

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
    // Seit dem 23.10.2026 ein Umschalter DE/EN „Sprache für Kunde und PDF“.
    const wahl = within(screen.getByTestId("sprache-wahl")).getByRole("radio", { name: "EN" });
    // Deutsch die Analyse im Einhauser-Aufbau; Englisch (noch) die bisherige, damit alles an den Kunden englisch bleibt.
    expect(container.querySelector(".result-panel")?.textContent).toContain("Ihre persönliche Rechnung");
    fireEvent.click(wahl);
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
  it("prüft Hausgeld = umlagefähig + nicht umlagefähig, die Rücklage getrennt (28.10.2026)", () => {
    expect(hausgeldAufstellung({ ...eingabe, housingFeeTotal: 260 })).toMatchObject({ gesamt: 260, summeTeile: 260, ruecklage: 40, vorauszahlung: 300, abweichung: 0 });
    // Ein gespeicherter Stand mit Rücklage im Gesamtbetrag (300) ist keine Abweichung.
    expect(hausgeldAufstellung(eingabe)).toMatchObject({ gesamt: 260, vorauszahlung: 300, abweichung: 0 });
    const falsch = hausgeldAufstellung({ ...eingabe, housingFeeTotal: 320 });
    expect(falsch.abweichung).toBe(60);
    expect(hausgeldAufstellung(standardEingabe).vorhanden).toBe(false);
  });

  it("zeigt die Aufstellung und eine Abweichung, deutsch und englisch", () => {
    const { container, unmount } = render(<Hausgeldaufstellung input={{ ...eingabe, housingFeeTotal: 320 }} />);
    expect(container.textContent).toContain("Hausgeld je Monat (umlagef. + nicht umlagef.)");
    expect(container.textContent).toContain("Vorauszahlung gesamt je Monat");
    expect(screen.getByTestId("hausgeld-abweichung").textContent).toMatch(/Abweichung/);
    unmount();
    const en = render(
      <RechnerSpracheContext.Provider value="en">
        <Hausgeldaufstellung input={eingabe} />
      </RechnerSpracheContext.Provider>,
    );
    expect(en.container.textContent).toContain("Service charge per month");
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

/* Codex-Nachprüfung vom 22.10.2026: keine deutschen Reste in der englischen Ansicht. */
describe("Bankgespräch und Bankunterlagen auf Englisch", () => {
  const mitHaushalt = {
    ...eingabe,
    haushalt: { einkuenfte: [{ bezeichnung: "Salary", betrag: 4000 }], ausgaben: [] },
    vermoegen: { werte: [], verbindlichkeiten: [] },
  };
  it("Knopf, Hinweis und Blöcke englisch", () => {
    const { container } = zeige(
      <RechnerSpracheContext.Provider value="en">
        <Bankgespraech input={eingabe} result={berechneInvestment(eingabe)} />
      </RechnerSpracheContext.Provider>,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Bank meeting PDF");
    expect(text).toContain("Capital requirement and financing");
    expect(text).not.toMatch(/Kaufpreis|Haushaltsrechnung|ausfüllen/);
  });
  it("Haushaltsrechnung als Tabelle englisch", () => {
    const { container } = render(
      <RechnerSpracheContext.Provider value="en">
        <BankunterlagenTabellen input={mitHaushalt} result={berechneInvestment(mitHaushalt)} />
      </RechnerSpracheContext.Provider>,
    );
    expect(container.textContent).toContain("Household budget");
    expect(container.textContent).toContain("Total income");
    expect(container.textContent).not.toMatch(/Summe|Überschuss|Differenz/);
    // Standardposten der leeren Vermögensvorlage übersetzt, eigene Texte bleiben.
    expect(container.textContent).toContain("Bank and savings balances");
    expect(container.textContent).not.toContain("Bank- und Sparguthaben");
    expect(container.textContent).toContain("Salary");
  });

  it("Standardposten der Haushaltsvorlage englisch, eigener Text unverändert", () => {
    const eigene = { ...mitHaushalt, haushalt: { einkuenfte: [{ bezeichnung: "Kindergeld", betrag: 250 }, { bezeichnung: "Mieteinnahme Garage Oma", betrag: 50 }], ausgaben: [] } };
    const { container } = render(
      <RechnerSpracheContext.Provider value="en">
        <BankunterlagenTabellen input={eigene} result={berechneInvestment(eigene)} nur="haushalt" />
      </RechnerSpracheContext.Provider>,
    );
    expect(container.textContent).toContain("Child benefit");
    expect(container.textContent).toContain("Mieteinnahme Garage Oma");
  });
});

describe("Glossar passt zum Rechenkern", () => {
  it("Möbel ohne Nebenkosten, Kreditrate und AfA-Basis mit den neuen Fällen", () => {
    for (const texte of [KENNZAHL_TEXTE_DE, KENNZAHL_TEXTE_EN]) {
      expect(texte.glossar.eintraege.moebelAfa.formel).not.toMatch(/Nebenkosten Möbel|incidental costs furniture/);
      expect(texte.glossar.eintraege.kaufnebenkosten.formel).not.toMatch(/Nebenkosten Möbel|incidental costs furniture/);
    }
    expect(KENNZAHL_TEXTE_DE.glossar.eintraege.kreditrate.formel).toMatch(/Volltilgung.*endfällig.*tilgungsfreien/);
    expect(KENNZAHL_TEXTE_DE.glossar.eintraege.afaBasis.formel).toMatch(/netto.*15 %.*Verkäufer|Verkäufer.*netto.*15 %/);
  });
});
