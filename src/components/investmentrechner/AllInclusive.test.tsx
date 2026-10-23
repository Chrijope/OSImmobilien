import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { berechneInvestment, standardEingabe, type InvestmentEingabe } from "@/lib/investmentrechner/rechenkern";
import { standardKaufnebenkostenauswahl } from "@/lib/investmentrechner/kaufnebenkostenAuswahl";
import { leereUnterlagenDaten } from "@/lib/investmentrechner/unterlagenAuslesen";
import type { Herkunft } from "@/lib/investmentrechner/herkunft";
import { EingabeObjekt } from "./Eingabebereiche";
import { ExposeDokument } from "./ExposeDokument";
import { Analyse } from "./Analyse";

// Die erwarteten Werte stammen aus der Zeit vor 10/2026, als der Rechner mit
// 3,5 % Grunderwerbsteuer und 1,0 % Notar startete. Sie prüfen die Mechanik,
// nicht die Standardsätze, deshalb stehen die alten Sätze hier fest.
const basisEingabe: InvestmentEingabe = { ...standardEingabe, transferTaxRate: 3.5, notaryRate: 1 };

/*
 * All-inclusive-Modell in Eingabe, Analyse und Berechnung, seit dem 09.10.2026.
 * 200.000 € Kaufpreis mit 5 Prozent Kaufnebenkosten ergeben 210.000 € all-inclusive.
 */

const NORMAL: InvestmentEingabe = {
  ...basisEingabe,
  clientName: "Musterkunde",
  taxableIncomeCustomer: 70000,
  purchasePrice: 200000,
  // Bank 100 % des Kaufpreises (Standard), das Eigenkapital trägt die 10.000 € Nebenkosten.
  monthlyColdRent: 700,
  monthlyOperatingCosts: 40,
};
const ALL_IN: InvestmentEingabe = { ...NORMAL, allInclusive: true };

const zeige = (inhalt: React.ReactNode) => render(<TooltipProvider>{inhalt}</TooltipProvider>);

function objekt(eingabe: InvestmentEingabe, aendere = vi.fn(), herkunft?: Herkunft) {
  zeige(
    <EingabeObjekt
      input={eingabe}
      result={berechneInvestment(eingabe)}
      setzeZahl={vi.fn()}
      setzeText={vi.fn()}
      aendere={aendere}
      knk={standardKaufnebenkostenauswahl}
      setzeKnk={vi.fn()}
      herkunft={herkunft}
    />,
  );
  return aendere;
}

const schalter = () => screen.getByRole("checkbox", { name: /All-inclusive \(Kaufnebenkosten im Kaufpreis enthalten\)/ });

describe("Schalter bei den Kaufnebenkosten", () => {
  it("schaltet nur das Modell, das Eigenkapital folgt als Rest der Finanzierung (seit dem 23.10.2026)", () => {
    expect(berechneInvestment(NORMAL).eigenkapital).toBeCloseTo(10000, 6);
    // 100 % vom Kaufpreis all-inclusive finanziert auch die Nebenkosten.
    expect(berechneInvestment(ALL_IN).eigenkapital).toBeCloseTo(0, 6);
    const faelle: (Herkunft | undefined)[] = [
      undefined,
      { seniorLoanValue: { quelle: "eigen", text: "" } },
      { purchasePrice: { quelle: "objekt", text: "Aus der Objektanlage" } },
    ];
    for (const herkunft of faelle) {
      const aendere = vi.fn();
      const { unmount } = render(
        <TooltipProvider>
          <EingabeObjekt
            input={NORMAL}
            result={berechneInvestment(NORMAL)}
            setzeZahl={vi.fn()}
            setzeText={vi.fn()}
            aendere={aendere}
            knk={standardKaufnebenkostenauswahl}
            setzeKnk={vi.fn()}
            herkunft={herkunft}
          />
        </TooltipProvider>,
      );
      fireEvent.click(schalter());
      expect(aendere, JSON.stringify(herkunft)).toHaveBeenCalledWith({ allInclusive: true });
      unmount();
    }
  });

  it("schreibt beim Ausschalten nichts zurück", () => {
    const aendere = objekt(ALL_IN, vi.fn());
    fireEvent.click(schalter());
    expect(aendere).toHaveBeenCalledWith({ allInclusive: false });
  });

  it("zeigt bei eingeschaltetem Modell den Kaufpreis all-inclusive und lässt die Sätze änderbar", () => {
    objekt({ ...ALL_IN, otherPurchaseCostRate: 0 });
    expect(schalter()).toBeChecked();
    expect(screen.getByTestId("hinweis-all-inclusive").textContent).toMatch(
      /^Kaufpreis all-inclusive: 210\.000\s€ \(Kaufpreis 200\.000\s€ plus Kaufnebenkosten 10\.000\s€\)$/,
    );
    expect(screen.getByText(/im Kaufpreis enthalten · 5,00\s%/)).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: /Sonstige KNK/ })).not.toBeDisabled();
  });
});

/** Die Kaufpreisformel im Glossar, auf der letzten Seite der Berechnung und in der Analyse. */
const kaufpreisFormel = (wurzel: Element) =>
  wurzel.querySelector('.glossar-eintrag[data-glossar="kaufpreisGesamt"] .glossar-formel')?.textContent ?? "";

function berechnung(eingabe: InvestmentEingabe, sprache: "de" | "en", deckblatt: "blick" | "jahre" | "rente") {
  const { container, unmount } = zeige(
    <ExposeDokument
      input={eingabe}
      result={berechneInvestment(eingabe)}
      photos={[]}
      documents={[]}
      documentData={leereUnterlagenDaten}
      sprache={sprache}
      deckblatt={deckblatt}
    />,
  );
  const text = container.textContent ?? "";
  const kopf = container.querySelector(".hero-price")?.textContent ?? "";
  const formel = kaufpreisFormel(container);
  unmount();
  return { text, kopf, formel };
}

describe("Berechnung, Deckblätter und Analyse", () => {
  for (const deckblatt of ["blick", "jahre", "rente"] as const) {
    it(`Deckblatt „${deckblatt}“ nennt den Kaufpreis all-inclusive, auf Deutsch und Englisch`, () => {
      const de = berechnung(ALL_IN, "de", deckblatt);
      expect(de.kopf).toMatch(/210\.000\s€Kaufpreis all-inclusive/);
      expect(de.text).toContain("im Kaufpreis enthalten");
      expect(de.text).toContain("Der Kaufpreis ist all-inclusive");
      expect(de.text).not.toMatch(/[–—]/);
      const en = berechnung(ALL_IN, "en", deckblatt);
      expect(en.kopf).toMatch(/€210,000Purchase price all-inclusive/);
      expect(en.text).toContain("included in purchase price");
      expect(en.text).not.toMatch(/Kaufpreis all-inclusive|im Kaufpreis enthalten/);
      expect(en.text).not.toMatch(/[–—]/);
    });
  }

  it("zeigt im Glossar den Aufschlag als eigenen Summanden der Kaufpreisformel", () => {
    expect(berechnung(ALL_IN, "de", "blick").formel).toBe(
      "Kaufpreis all-inclusive = Grundstücksanteil + Gebäudeanteil + Möbel + Rücklage + Kaufnebenkosten im Kaufpreis",
    );
    expect(berechnung(ALL_IN, "en", "blick").formel).toBe(
      "Purchase price all-inclusive = land share + building share + furniture + reserve + incidental purchase costs in the price",
    );
    expect(berechnung(NORMAL, "de", "blick").formel).toBe(
      "Kaufpreis gesamt = Grundstücksanteil + Gebäudeanteil + Möbel + Rücklage",
    );
  });

  it("bleibt ohne Schalter beim bisherigen Ausweis", () => {
    const { text, kopf } = berechnung(NORMAL, "de", "blick");
    expect(kopf).toContain("Kaufpreis gesamt");
    expect(text).not.toMatch(/all-inclusive|im Kaufpreis enthalten/);
  });

  it("zeigt in der Analyse dieselben Kaufpreisdetails", () => {
    const { container } = zeige(
      <Analyse
        input={ALL_IN}
        result={berechneInvestment(ALL_IN)}
        documents={[]}
        documentData={leereUnterlagenDaten}
        onOpenDocuments={() => undefined}
      />,
    );
    const karte = container.querySelector(".purchase-basis-card")?.textContent ?? "";
    expect(karte).toMatch(/Kaufpreis all-inclusive210\.000\s€/);
    expect(karte).toMatch(/Kaufnebenkosten \(5,00\s%\)im Kaufpreis enthalten/);
    expect(karte).not.toMatch(/Kaufnebenkosten \(5,00\s%\)0\s€/);
    // Der Aufschlag als Betrag, damit die Zeilen den all-inclusive-Preis ergeben.
    expect(karte).toMatch(/davon Kaufnebenkosten im Kaufpreis \(5,00\s%\)10\.000\s€/);
    expect(kaufpreisFormel(container)).toContain("+ Kaufnebenkosten im Kaufpreis");
  });
});
