import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { berechneInvestment, standardEingabe, type InvestmentEingabe } from "@/lib/investmentrechner/rechenkern";
import { leereUnterlagenDaten } from "@/lib/investmentrechner/unterlagenAuslesen";
import { Analyse } from "./Analyse";
import { ExposeDokument } from "./ExposeDokument";

/*
 * Der Rechenweg unter jeder Zahl, in Analyse und Berechnung.
 *
 * Geprüft wird am gerenderten Baum: Jede Kachel der ersten Seite trägt genau
 * eine Rechenweg-Zeile, und die Zeile endet mit genau der Zahl, die groß
 * darüber steht. Damit ist sichergestellt, dass Zeile und Kachel aus
 * demselben Ergebnis lesen und nicht zwei Rechnungen nebeneinander stehen.
 */

const ZAHLT_DRAUF: InvestmentEingabe = {
  ...standardEingabe,
  clientName: "Familie Muster",
  taxableIncomeCustomer: 62000,
  purchasePrice: 250000,
  furniturePrice: 8000,
  monthlyColdRent: 900,
  monthlyOperatingCosts: 50,
  equity: 12500,
};

const BEKOMMT_RAUS: InvestmentEingabe = { ...ZAHLT_DRAUF, monthlyColdRent: 1400 };

const glatt = (text: string | null | undefined) => (text ?? "").replace(/\u00a0|\u202f/g, " ").trim();

/** Die Zahl hinter „=“ oder „≈“ am Ende der Zeile. */
function ergebnisDerZeile(zeile: string): string {
  const teile = glatt(zeile).split(/ [=≈] /);
  return teile[teile.length - 1];
}

/**
 * Jede Kachel mit ihrer großen Zahl und ihrer Rechenweg-Zeile. Die geteilte
 * Cashflow-Kachel zählt als zwei, je Hälfte eine Zahl.
 */
function kacheln(wurzel: HTMLElement, selektor: string) {
  return [...wurzel.querySelectorAll(selektor)].map((kachel) => ({
    // Die Eigenkapitalrendite steht mit ihrer Beschriftung in einer eigenen Zeile.
    zahl: glatt(kachel.querySelector(":scope > strong, :scope > .ekr-zeile > strong")?.textContent),
    zeilen: [...kachel.querySelectorAll(":scope > .rechenweg")].map((zeile) => zeile.textContent ?? ""),
  }));
}

const SELEKTOR_KACHELN = [
  ".metric-card",
  ".cashflow-teil",
  ".cashflow-band--oben > div:not(.cashflow-geteilt)",
  ".cashflow-band--drei > div",
  ".expose-wealth-grid > div",
].join(", ");

function analyse(eingabe: InvestmentEingabe) {
  const result = berechneInvestment(eingabe);
  return render(
    <TooltipProvider>
      <Analyse
        input={eingabe}
        result={result}
        documents={[]}
        documentData={leereUnterlagenDaten}
        onOpenDocuments={() => undefined}
      />
    </TooltipProvider>,
  ).container;
}

function deckblatt(eingabe: InvestmentEingabe) {
  const result = berechneInvestment(eingabe);
  const { container } = render(
    <ExposeDokument input={eingabe} result={result} photos={[]} documents={[]} documentData={leereUnterlagenDaten} />,
  );
  // Seit dem 07.10.2026 stehen die hellen Kennzahlen auf der Seite hinter dem Deckblatt.
  return container.querySelector(".kennzahlen-page") as HTMLElement;
}

for (const [fall, eingabe] of [
  ["negativem Cashflow", ZAHLT_DRAUF],
  ["positivem Cashflow", BEKOMMT_RAUS],
] as const) {
  describe(`Rechenweg unter jeder Zahl, bei ${fall}`, () => {
    it("Analyse: acht helle Zahlen, jede mit ihrer Zeile", () => {
      const wurzel = analyse(eingabe);
      expect(wurzel.querySelectorAll(".metrics-grid .metric-card")).toHaveLength(8);
      const alle = kacheln(wurzel, SELEKTOR_KACHELN);
      // Die dunkle Leiste ist seit dem 07.10.2026 durch den Ergebnisteil des Deckblatts ersetzt.
      expect(wurzel.querySelector(".cashflow-band")).toBeNull();
      expect(alle).toHaveLength(8);
      for (const { zahl, zeilen } of alle) {
        expect(zeilen, zahl).toHaveLength(1);
        expect(ergebnisDerZeile(zeilen[0]), zeilen[0]).toBe(zahl);
      }
    });

    it("Berechnung: jede Kennzahl hinter dem Deckblatt mit ihrer Zeile", () => {
      const blatt = deckblatt(eingabe);
      const alle = kacheln(blatt, SELEKTOR_KACHELN);
      // Die vier hellen Kacheln; Leiste und Vermögensraster gibt es im Druck seit dem 07.10.2026 nicht mehr.
      expect(alle).toHaveLength(4);
      for (const { zahl, zeilen } of alle) {
        expect(zeilen, zahl).toHaveLength(1);
        expect(ergebnisDerZeile(zeilen[0]), zeilen[0]).toBe(zahl);
      }
    });
  });
}
