import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { berechneInvestment, standardEingabe, type InvestmentEingabe } from "@/lib/investmentrechner/rechenkern";
import { standardKaufnebenkostenauswahl } from "@/lib/investmentrechner/kaufnebenkostenAuswahl";
import { EingabeKunde, EingabeObjekt, EingabeSteuer } from "./Eingabebereiche";

/*
 * Oberfläche zu den Korrekturen vom 22.10.2026: Hinweise zu 15-Prozent-Grenze
 * und Sanierungsfall, § 7b, Baujahr und AfA-Satz, Anteil bei Zusammenveranlagung.
 */

const zeige = (inhalt: React.ReactNode) => render(<TooltipProvider>{inhalt}</TooltipProvider>);
const basis: InvestmentEingabe = { ...standardEingabe, purchasePrice: 285000, area: 72.36, taxableIncomeCustomer: 80000 };

function steuer(aenderung: Partial<InvestmentEingabe>) {
  const eingabe = { ...basis, ...aenderung };
  return zeige(
    <EingabeSteuer input={eingabe} result={berechneInvestment(eingabe)} setzeZahl={vi.fn()} setzeText={vi.fn()} aendere={vi.fn()} />,
  );
}

describe("Sanierungsanteil in Bereich 06", () => {
  it("zeigt unter der Grenze Grenze, Anteil und Sofortabzug", () => {
    steuer({ rehabExpense: 20000 });
    const karte = screen.getByTestId("sanierung-pruefung");
    expect(karte.textContent).toMatch(/15-Prozent-Prüfung/);
    expect(karte.textContent).toMatch(/Grenze \d{2}\.\d{3}\s€/);
    expect(karte.textContent).toMatch(/bleibt Erhaltungsaufwand/);
    expect(karte.textContent).toMatch(/Steuerberatung/);
    expect(screen.getByText("Verteilung des Aufwands")).toBeInTheDocument();
  });

  it("über der Grenze: anschaffungsnah, keine Verteilung", () => {
    steuer({ rehabExpense: 40000 });
    expect(screen.getByTestId("sanierung-pruefung").textContent).toMatch(/anschaffungsnaher Herstellungsaufwand/);
    expect(screen.queryByText("Verteilung des Aufwands")).toBeNull();
  });

  it("Sanierung durch den Verkäufer: Anschaffungskosten, keine Wahl der Behandlung", () => {
    steuer({ rehabExpense: 20000, rehabScenario: "durchVerkaeufer" });
    expect(screen.getByTestId("sanierung-pruefung").textContent).toMatch(/Anschaffungskosten/);
    expect(screen.queryByText("Steuerliche Behandlung")).toBeNull();
  });

  it("nennt die Grenzen des Steuermodells", () => {
    steuer({});
    expect(screen.getByTestId("steuermodell-grenzen").textContent).toMatch(/Verlustvorträge/);
  });
});

describe("§ 7b", () => {
  it("zeigt Prüfung und Voraussetzungen", () => {
    steuer({ specialDepreciationRate: 5, specialDepreciationYears: 4 });
    const hinweis = screen.getByTestId("hinweis-7b");
    expect(hinweis.textContent).toMatch(/Bemessungsgrundlage/);
    expect(hinweis.textContent).toMatch(/Effizienzhaus 40/);
  });
  it("warnt über der Baukostenobergrenze", () => {
    steuer({ area: 40, specialDepreciationRate: 5, specialDepreciationYears: 4 });
    expect(screen.getByTestId("hinweis-7b").textContent).toMatch(/Keine Sonder-AfA/);
  });
});

describe("Baujahr und AfA-Satz", () => {
  function objekt(eingabe: InvestmentEingabe) {
    const aendere = vi.fn();
    const setzeZahl = vi.fn();
    zeige(
      <EingabeObjekt
        input={eingabe}
        result={berechneInvestment(eingabe)}
        setzeZahl={setzeZahl}
        setzeText={vi.fn()}
        aendere={aendere}
        knk={standardKaufnebenkostenauswahl}
        setzeKnk={vi.fn()}
      />,
    );
    const feld = screen.getByText("Baujahr").closest("label")!.querySelector("input")!;
    return { aendere, setzeZahl, feld };
  }

  it("passt den Regelsatz an das neue Baujahr an", () => {
    const { aendere, feld } = objekt({ ...basis, constructionYear: 1990, buildingDepreciationRate: 2 });
    fireEvent.change(feld, { target: { value: "2024" } });
    expect(aendere).toHaveBeenCalledWith({ constructionYear: 2024, buildingDepreciationRate: 3 });
  });

  it("lässt einen bewusst anderen Satz stehen", () => {
    const { aendere, setzeZahl, feld } = objekt({ ...basis, constructionYear: 1990, buildingDepreciationRate: 4 });
    fireEvent.change(feld, { target: { value: "1900" } });
    expect(aendere).not.toHaveBeenCalled();
    expect(setzeZahl).toHaveBeenCalledWith("constructionYear", 1900);
  });
});

describe("Anteil am Investment", () => {
  it("bleibt bei Zusammenveranlagung änderbar", () => {
    const eingabe = { ...basis, jointAssessment: true, investmentShare: 50 };
    zeige(<EingabeKunde input={eingabe} result={berechneInvestment(eingabe)} setzeZahl={vi.fn()} setzeText={vi.fn()} aendere={vi.fn()} />);
    const feld = screen.getByText("Anteil am Investment").closest("label")!.querySelector("input")!;
    expect(feld.disabled).toBe(false);
    expect(feld.value).toBe("50");
  });
});
