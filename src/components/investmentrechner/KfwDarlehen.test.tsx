import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { berechneInvestment, standardEingabe, type InvestmentEingabe } from "@/lib/investmentrechner/rechenkern";
import { leereUnterlagenDaten } from "@/lib/investmentrechner/unterlagenAuslesen";
import { EingabeFinanzierung } from "./Eingabebereiche";
import { ExposeDokument } from "./ExposeDokument";
import { Analyse } from "./Analyse";

/*
 * KfW-Darlehen in Eingabe, Analyse und Berechnung, seit dem 07.10.2026.
 * Ohne Schalter darf nirgends etwas davon stehen.
 */

const OHNE: InvestmentEingabe = {
  ...standardEingabe,
  clientName: "Musterkunde",
  taxableIncomeCustomer: 80000,
  purchasePrice: 405000,
  equity: 20250,
  seniorInterestRate: 3.8,
  seniorRepaymentRate: 2,
  monthlyColdRent: 1350,
  monthlyOperatingCosts: 60,
};

const MIT: InvestmentEingabe = {
  ...OHNE,
  kfwEnabled: true,
  kfwProgram: "KfW 297/298 Klimafreundlicher Neubau",
  kfwLoanAmount: 150000,
  kfwInterestRate: 2.1,
  kfwFixedRateYears: 10,
  kfwTermYears: 30,
  kfwGracePeriodYears: 3,
};

const zeige = (inhalt: React.ReactNode) => render(<TooltipProvider>{inhalt}</TooltipProvider>);

function finanzierung(eingabe: InvestmentEingabe, aendere = vi.fn()) {
  zeige(
    <EingabeFinanzierung
      input={eingabe}
      result={berechneInvestment(eingabe)}
      setzeZahl={vi.fn()}
      setzeText={vi.fn()}
      aendere={aendere}
    />,
  );
  return aendere;
}

function berechnung(eingabe: InvestmentEingabe, sprache: "de" | "en" = "de", deckblatt: "blick" | "jahre" = "blick") {
  return zeige(
    <ExposeDokument
      input={eingabe}
      result={berechneInvestment(eingabe)}
      photos={[]}
      documents={[]}
      documentData={leereUnterlagenDaten}
      sprache={sprache}
      deckblatt={deckblatt}
    />,
  ).container.textContent ?? "";
}

describe("Eingabe unter Finanzierung", () => {
  it("zeigt ohne Schalter nur den Schalter und schaltet ihn ein", () => {
    const aendere = finanzierung(OHNE);
    expect(screen.queryByRole("combobox", { name: "Programm" })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: /KfW-Darlehen/ }));
    expect(aendere).toHaveBeenCalledWith({ kfwEnabled: true });
  });

  it("zeigt mit Schalter Programm, Konditionen, Mischzins und Ratensprung", () => {
    finanzierung(MIT);
    const programm = screen.getByRole("combobox", { name: "Programm" });
    const vorschlaege = Array.from(programm.querySelectorAll("option")).map((o) => o.textContent);
    expect(vorschlaege).toContain("KfW 297/298 Klimafreundlicher Neubau");
    expect(vorschlaege).toContain("KfW 261 Sanierung");
    expect(screen.getByText(/Mischzins 3,17\s%/)).toBeInTheDocument();
    expect(screen.getByText(/Ab Jahr 4 \(2029\) steigt die Rate auf 1\.839,44\s€/)).toBeInTheDocument();
    expect(screen.getByText(/minus Eigenkapital, Nachrang und KfW-Darlehen/)).toBeInTheDocument();
  });

  it("warnt bei zu hohem Betrag und zu vielen tilgungsfreien Jahren", () => {
    finanzierung({ ...MIT, kfwLoanAmount: 600000, kfwGracePeriodYears: 8 });
    expect(screen.getByText(/höher als der Finanzierungsbedarf von 405\.000\s€/)).toBeInTheDocument();
    expect(screen.getByText(/höchstens 5 betragen\. Gerechnet wird mit 5/)).toBeInTheDocument();
  });
});

describe("Berechnung und PDF", () => {
  it("nennt ohne KfW weder KfW noch Mischzins", () => {
    for (const deckblatt of ["blick", "jahre"] as const) {
      const text = berechnung(OHNE, "de", deckblatt);
      expect(text).not.toMatch(/KfW|Mischzins/);
    }
  });

  it("zeigt die Darlehen einzeln, Mischzins, Gesamtrate und Ratensprung", () => {
    const text = berechnung(MIT);
    expect(text).toContain("KfW-Darlehen (KfW 297/298 Klimafreundlicher Neubau)");
    expect(text).toMatch(/Kreditrate \(Mischzins 3,17\s%\)/);
    expect(text).toContain("Mischzins aller Darlehen");
    expect(text).toContain("Gesamtrate im Monat ab Jahr 4 (2029)");
    expect(text).toContain("Ab Jahr 4 (2029) steigt die Kreditrate");
    expect(text).toContain("bis Ende 2035");
    expect(text).toContain("Darlehen je Jahr");
  });

  it("zeigt auf dem Deckblatt Jahr für Jahr den Ratensprung", () => {
    expect(berechnung(MIT, "de", "jahre")).toContain("Ab Jahr 4 (2029) steigt die Kreditrate");
  });

  it("ist auf Englisch englisch und ohne Gedankenstriche", () => {
    const text = berechnung(MIT, "en");
    expect(text).toContain("KfW loan (KfW 297/298 Klimafreundlicher Neubau)");
    expect(text).toContain("Loan instalment (blended rate 3.17%)");
    expect(text).toContain("From year 4 (2029) the loan instalment rises");
    expect(text).toContain("Loans per year");
    expect(text).not.toMatch(/Mischzins|Gesamtrate|tilgungsfrei/);
    expect(text).not.toMatch(/[–—]/);
    expect(berechnung(MIT, "de")).not.toMatch(/[–—]/);
  });
});

describe("Tilgungszuschuss in Eingabe und Berechnung", () => {
  it("verlangt das Gutschriftjahr und rechnet ohne es keinen Zuschuss", () => {
    finanzierung({ ...MIT, kfwGrantValue: 10, kfwGrantYear: 0 });
    expect(screen.getByText(/erst gerechnet, wenn das Gutschriftjahr aus der Zusage eingetragen ist/)).toBeInTheDocument();
    expect(berechnung({ ...MIT, kfwGrantValue: 10, kfwGrantYear: 0 })).not.toMatch(/Tilgungszuschuss/);
  });

  it("zeigt den angerechneten Zuschuss mit Jahr, getrennt von der Tilgung", () => {
    const text = berechnung({ ...MIT, kfwGrantMode: "euro", kfwGrantValue: 15000, kfwGrantYear: 3 });
    expect(text).toMatch(/Der KfW-Tilgungszuschuss von 15\.000\s€ kommt laut Zusage Ende Jahr 3/);
    expect(text).toContain("davon KfW-Tilgungszuschuss im Monat");
    expect(text).toContain("die Rate bleibt gleich, das Darlehen ist früher getilgt");
    expect(text).toContain("Wertzuwachs der Immobilie, Tilgung und KfW-Tilgungszuschuss");
  });

  it("macht eine Kürzung sichtbar, in Eingabe und Berechnung", () => {
    const eingabe = { ...MIT, kfwGrantMode: "euro" as const, kfwGrantValue: 900000, kfwGrantYear: 3 };
    finanzierung(eingabe);
    expect(screen.getByText(/Angerechnet werden nur 150\.000\s€ von 900\.000\s€/)).toBeInTheDocument();
    expect(berechnung(eingabe)).toMatch(/Vom zugesagten Tilgungszuschuss über 900\.000\s€ rechnet die Kalkulation 150\.000\s€ an/);
    expect(berechnung(eingabe, "en")).toMatch(/Of the committed repayment grant of €900,000, the calculation credits €150,000/);
  });
});

describe("Analyse", () => {
  const analyse = (eingabe: InvestmentEingabe) =>
    zeige(
      <Analyse
        input={eingabe}
        result={berechneInvestment(eingabe)}
        documents={[]}
        documentData={leereUnterlagenDaten}
        onOpenDocuments={() => undefined}
      />,
    ).container.textContent ?? "";

  it("zeigt die Darlehenstabelle nur mit KfW", () => {
    expect(analyse(OHNE)).not.toMatch(/Darlehen je Jahr|Mischzins/);
    const text = analyse(MIT);
    expect(text).toContain("Darlehen je Jahr: Rate, Zinsen, Tilgung und Restschuld");
    expect(text).toMatch(/steigt die Rate von 1\.495,00\s€ auf 1\.839,44\s€/);
  });
});
