import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { berechneInvestment, standardEingabe, type InvestmentEingabe } from "@/lib/investmentrechner/rechenkern";
import { leereUnterlagenDaten } from "@/lib/investmentrechner/unterlagenAuslesen";
import { Analyse } from "./Analyse";
import { ExposeDokument } from "./ExposeDokument";

/*
 * Kaufpreis und Möbel in der Analyse.
 *
 * Bis zum 25.09.2026 zeigte nur die Berechnung die Kaufpreisdetails. Geprüft
 * wird, dass die Analyse dieselben Zeilen mit denselben Werten zeigt, weil
 * beide Ansichten dieselbe Liste lesen.
 */

/** Die Zeilen als Paare aus Beschriftung und Wert, Leerzeichen vereinheitlicht. */
function paare(zeilen: Element[]): [string, string][] {
  const glatt = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
  return zeilen.map((zeile) => [glatt(zeile.children[0]?.textContent), glatt(zeile.children[1]?.textContent)]);
}

function beideAnsichten(eingabe: InvestmentEingabe) {
  const result = berechneInvestment(eingabe);
  const analyse = render(
    <TooltipProvider>
      <Analyse
        input={eingabe}
        result={result}
        documents={[]}
        documentData={leereUnterlagenDaten}
        onOpenDocuments={() => undefined}
      />
    </TooltipProvider>,
  );
  const analyseZeilen = paare([...analyse.container.querySelectorAll(".purchase-basis-card .tax-profile-grid > div")]);
  analyse.unmount();

  const berechnung = render(
    <ExposeDokument input={eingabe} result={result} photos={[]} documents={[]} documentData={leereUnterlagenDaten} />,
  );
  // Die linke Spalte der Kennzahlen-Seite hinter dem Deckblatt, „Kaufpreisdetails".
  const spalte = berechnung.container.querySelector(".kennzahlen-page .expose-columns > div");
  const berechnungZeilen = paare([...(spalte?.querySelectorAll(".line-item") ?? [])]);
  berechnung.unmount();
  return { analyseZeilen, berechnungZeilen };
}

describe("Kaufpreisdetails in der Analyse", () => {
  it("zeigt den Gesamtkaufpreis, die Möbel als Anteil und die Gesamtkosten wie die Berechnung", () => {
    const { analyseZeilen, berechnungZeilen } = beideAnsichten({
      ...standardEingabe,
      purchasePrice: 250000,
      furniturePrice: 8000,
      monthlyColdRent: 900,
    });

    expect(analyseZeilen).toEqual(berechnungZeilen);
    // Die Möbel stecken im Kaufpreis und werden nicht noch einmal addiert.
    // Aufgeteilt wird nur der Kaufpreis ohne Möbel: 242.000 zu 20 und 80 %.
    // Seit dem 30.09.2026 laufen die Nebenkosten auch nur auf diese 242.000.
    // Finanzierungsnebenkosten 0,2 % auf das Darlehen von 262.100.
    expect(analyseZeilen).toEqual([
      ["Gesamtkaufpreis (inkl. Möbel/Inventar)", "250.000 €"],
      ["davon Kaufpreis Immobilie", "242.000 €"],
      ["davon Möbel/Inventar", "8.000 €"],
      ["Grundstücksanteil", "48.400 €"],
      ["Gebäudeanteil (Wohnung)", "193.600 €"],
      ["Grunderwerbsteuer 3,50 % auf 242.000 €", "8.470 €"],
      ["Notar 1,00 % auf 242.000 €", "2.420 €"],
      ["Grundbuch 0,50 % auf 242.000 €", "1.210 €"],
      ["Kaufnebenkosten (5,00 % auf 242.000 €)", "12.100 €"],
      ["Finanzierungsnebenkosten", "524 €"],
      ["Gesamtkosten", "262.624 €"],
    ]);
  });

  it("lässt die Zeile der Finanzierungsnebenkosten weg, wenn der Satz 0 ist", () => {
    const { analyseZeilen, berechnungZeilen } = beideAnsichten({
      ...standardEingabe,
      purchasePrice: 250000,
      financingCostRate: 0,
    });
    expect(analyseZeilen).toEqual(berechnungZeilen);
    expect(analyseZeilen.map(([label]) => label)).not.toContain("Finanzierungsnebenkosten");
    expect(analyseZeilen[analyseZeilen.length - 1]).toEqual(["Gesamtkosten", "262.500 €"]);
  });

  it("lässt die Möbelzeile weg, wenn es keine Möbel gibt", () => {
    const { analyseZeilen, berechnungZeilen } = beideAnsichten({ ...standardEingabe, purchasePrice: 250000 });
    expect(analyseZeilen).toEqual(berechnungZeilen);
    expect(analyseZeilen.map(([label]) => label)).not.toContain("davon Möbel/Inventar");
    expect(analyseZeilen[analyseZeilen.length - 1]).toEqual(["Gesamtkosten", "263.025 €"]);
  });

  it("zeigt bei 50 Prozent Anteil alle Zeilen einheitlich zur Hälfte", () => {
    // Bis zum 25.09.2026 standen Kaufpreis und Möbel hier voll, die
    // Nebenkosten darunter aber schon anteilig.
    const { analyseZeilen, berechnungZeilen } = beideAnsichten({
      ...standardEingabe,
      purchasePrice: 250000,
      furniturePrice: 8000,
      investmentShare: 50,
    });
    expect(analyseZeilen).toEqual(berechnungZeilen);
    expect(analyseZeilen).toEqual([
      ["Gesamtkaufpreis (inkl. Möbel/Inventar)", "125.000 €"],
      ["davon Kaufpreis Immobilie", "121.000 €"],
      ["davon Möbel/Inventar", "4.000 €"],
      ["Grundstücksanteil", "24.200 €"],
      ["Gebäudeanteil (Wohnung)", "96.800 €"],
      ["Grunderwerbsteuer 3,50 % auf 121.000 €", "4.235 €"],
      ["Notar 1,00 % auf 121.000 €", "1.210 €"],
      ["Grundbuch 0,50 % auf 121.000 €", "605 €"],
      ["Kaufnebenkosten (5,00 % auf 121.000 €)", "6.050 €"],
      ["Finanzierungsnebenkosten", "262 €"],
      ["Gesamtkosten", "131.312 €"],
    ]);
  });

  it("zeigt mit Erhaltungsaufwand Kaufpreis der Immobilie, Posten mit Basis und den Hinweis (Christian, 30.09.2026)", () => {
    const eingabe: InvestmentEingabe = {
      ...standardEingabe,
      purchasePrice: 300000,
      rehabExpense: 40000,
      transferTaxRate: 3.5,
      notaryRate: 1,
      landRegisterRate: 0.5,
      buildingShare: 80,
      equity: 13000,
    };
    const { analyseZeilen, berechnungZeilen } = beideAnsichten(eingabe);
    expect(analyseZeilen).toEqual(berechnungZeilen);
    expect(analyseZeilen).toEqual([
      ["Gesamtkaufpreis (inkl. Erhaltungsaufwand)", "300.000 €"],
      ["davon Kaufpreis Immobilie", "260.000 €"],
      ["davon Erhaltungsaufwand (gesonderte Leistung, im Notarvertrag ausgewiesen)", "40.000 €"],
      ["Grundstücksanteil", "60.000 €"],
      ["Gebäudeanteil ohne Erhaltungsaufwand", "200.000 €"],
      ["Grunderwerbsteuer 3,50 % auf 260.000 €", "9.100 €"],
      ["Notar 1,00 % auf 260.000 €", "2.600 €"],
      ["Grundbuch 0,50 % auf 260.000 €", "1.300 €"],
      ["Kaufnebenkosten (5,00 % auf 260.000 €)", "13.000 €"],
      ["Finanzierungsnebenkosten", "600 €"],
      ["Gesamtkosten", "313.600 €"],
    ]);
    const result = berechneInvestment(eingabe);
    const analyse = render(
      <TooltipProvider>
        <Analyse input={eingabe} result={result} documents={[]} documentData={leereUnterlagenDaten} onOpenDocuments={() => undefined} />
      </TooltipProvider>,
    );
    expect(analyse.container.querySelector(".purchase-basis-card")?.textContent).toContain("Das klärt dein Steuerberater.");
    analyse.unmount();
  });

  it("zieht auch die Möbel ab: 13.250 € auf 265.000 € (Christians Bild, 30.09.2026)", () => {
    const eingabe: InvestmentEingabe = {
      ...standardEingabe,
      purchasePrice: 300000,
      rehabExpense: 20000,
      furniturePrice: 15000,
      transferTaxRate: 3.5,
      notaryRate: 1,
      landRegisterRate: 0.5,
      buildingShare: 80,
      equity: 13250,
    };
    const { analyseZeilen, berechnungZeilen } = beideAnsichten(eingabe);
    expect(analyseZeilen).toEqual(berechnungZeilen);
    expect(analyseZeilen).toEqual([
      ["Gesamtkaufpreis (inkl. Erhaltungsaufwand und Möbel/Inventar)", "300.000 €"],
      ["davon Kaufpreis Immobilie", "265.000 €"],
      ["davon Erhaltungsaufwand (gesonderte Leistung, im Notarvertrag ausgewiesen)", "20.000 €"],
      ["davon Möbel/Inventar", "15.000 €"],
      ["Grundstücksanteil", "57.000 €"],
      ["Gebäudeanteil ohne Erhaltungsaufwand", "208.000 €"],
      ["Grunderwerbsteuer 3,50 % auf 265.000 €", "9.275 €"],
      ["Notar 1,00 % auf 265.000 €", "2.650 €"],
      ["Grundbuch 0,50 % auf 265.000 €", "1.325 €"],
      ["Kaufnebenkosten (5,00 % auf 265.000 €)", "13.250 €"],
      ["Finanzierungsnebenkosten", "600 €"],
      ["Gesamtkosten", "313.850 €"],
    ]);
    const result = berechneInvestment(eingabe);
    const analyse = render(
      <TooltipProvider>
        <Analyse input={eingabe} result={result} documents={[]} documentData={leereUnterlagenDaten} onOpenDocuments={() => undefined} />
      </TooltipProvider>,
    );
    expect(analyse.container.querySelector(".purchase-basis-card")?.textContent).toContain(
      "Erhaltungsaufwand und Möbel sind gesonderte Leistungen und im Notarvertrag eigens ausgewiesen.",
    );
    analyse.unmount();
  });
});
