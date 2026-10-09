import { describe, expect, it } from "vitest";
import golden from "./rechenkern.golden.json";
import {
  ausgewiesenerKaufpreis,
  berechneInvestment,
  eigenkapitalrenditeNebenkosten,
  type InvestmentEingabe,
} from "./rechenkern";
import { kaufpreisHinweis, kaufpreiszeilen } from "@/components/investmentrechner/Auswertungen";
import { DOKUMENT_TEXTE_DE, dokumentTexteFuer } from "./dokumentTexte";
import { kennzahlTexteFuer } from "./kennzahlTexte";
import { glossar, rechenwege } from "./kennzahlErklaerungen";
import { formatEuro } from "./formatierer";

/*
 * All-inclusive-Modell, seit dem 09.10.2026: Der Kaufpreis wird um die
 * Kaufnebenkosten erhöht, gesonderte fallen nicht an. Bei gleichen Sätzen
 * muss alles außer dem Ausweis gleich bleiben wie im normalen Modell.
 */

const standard = (golden as unknown as { standard: { input: InvestmentEingabe } }).standard.input;

const faelle: Record<string, InvestmentEingabe> = {
  // Mit Möbeln, Kirchensteuer und Eigenkapital, aus den Golden-Tests.
  standard,
  // Erhaltungsaufwand, Rücklage, halber Anteil und KfW. (Der Startmonat Juli
  // aus dem MORE-Original entfällt: OS Immobilien hat keinen Startmonat.)
  gemischt: {
    ...standard,
    investmentShare: 50,
    rehabExpense: 25_000,
    rehabMode: "expense",
    rehabDistributionYears: 2,
    maintenanceReserve: 3_000,
    kfwEnabled: true,
    kfwLoanAmount: 50_000,
    kfwGracePeriodYears: 2,
  },
  // Vollfinanzierung ohne Eigenkapital.
  ohneEigenkapital: { ...standard, equity: 0 },
};

describe("All-inclusive gegen normales Modell bei gleichen Sätzen", () => {
  for (const [name, eingabe] of Object.entries(faelle)) {
    const normal = berechneInvestment({ ...eingabe, allInclusive: false });
    const allIn = berechneInvestment({ ...eingabe, allInclusive: true });

    it(`${name}: gleiches Darlehen, gleiche Gesamtkosten, gleiche AfA-Basis`, () => {
      expect(normal.purchaseCosts).toBeGreaterThan(0);
      expect(allIn.totalDebt).toBeCloseTo(normal.totalDebt, 6);
      expect(allIn.seniorLoanAmount).toBeCloseTo(normal.seniorLoanAmount, 6);
      expect(allIn.finanzierungsbedarf).toBeCloseTo(normal.finanzierungsbedarf, 6);
      expect(allIn.totalInvestment).toBeCloseTo(normal.totalInvestment, 6);
      expect(allIn.financingGap).toBeCloseTo(normal.financingGap, 6);
      expect(allIn.monthlyDebtService).toBeCloseTo(normal.monthlyDebtService, 6);
      expect(allIn.depreciationBasis).toBeCloseTo(normal.depreciationBasis, 6);
      expect(allIn.netYield).toBeCloseTo(normal.netYield, 6);
    });

    it(`${name}: ausgewiesener Kaufpreis ist Kaufpreis plus Nebenkosten, Nebenkosten 0`, () => {
      expect(allIn.allInclusive).toBe(true);
      expect(allIn.purchaseCosts).toBe(0);
      expect(allIn.allInclusiveAufschlag).toBeCloseTo(normal.purchaseCosts, 6);
      expect(allIn.kaufpreisGesamt).toBeCloseTo(normal.kaufpreisGesamt + normal.purchaseCosts, 6);
      expect(normal.allInclusive).toBe(false);
      expect(normal.allInclusiveAufschlag).toBe(0);
      // Das ganze Objekt, auch bei halbem Anteil.
      expect(ausgewiesenerKaufpreis(eingabe, allIn)).toBeCloseTo(
        eingabe.purchasePrice + normal.purchaseCosts / normal.anteil,
        6,
      );
      expect(ausgewiesenerKaufpreis(eingabe, normal)).toBe(eingabe.purchasePrice);
    });

    it(`${name}: gleicher Immobilienwert und gleiches Vermögen`, () => {
      expect(allIn.immobilienanteil).toBeCloseTo(normal.immobilienanteil, 6);
      expect(allIn.vermoegenStart).toBeCloseTo(normal.vermoegenStart, 6);
      expect(allIn.vermoegensaufbauMonat).toBeCloseTo(normal.vermoegensaufbauMonat, 6);
      expect(allIn.faktorJeEuro).toBeCloseTo(normal.faktorJeEuro, 6);
    });

    it(`${name}: jedes Jahr gleiche AfA, gleiche Steuer und gleicher Cashflow nach Steuer`, () => {
      expect(allIn.years).toHaveLength(normal.years.length);
      allIn.years.forEach((jahr, i) => {
        const soll = normal.years[i];
        for (const feld of [
          "buildingDepreciation",
          "specialDepreciation",
          "furnitureDepreciation",
          "rehabDeduction",
          "taxableResult",
          "taxEffect",
          "cashflowBeforeTax",
          "cashflowAfterTax",
          "propertyValue",
          "wertzuwachs",
          "remainingDebt",
          "propertyEquity",
          "totalWealth",
        ] as const) {
          expect(jahr[feld], `years[${i}].${feld}`).toBeCloseTo(soll[feld], 6);
        }
      });
      expect(allIn.irr).toBeCloseTo(normal.irr ?? Number.NaN, 9);
    });

    it(`${name}: Bruttorendite auf den all-inclusive-Preis`, () => {
      const jahresmiete = normal.grossYield * normal.kaufpreisGesamt;
      expect(allIn.grossYield).toBeCloseTo(jahresmiete / allIn.kaufpreisGesamt, 9);
      expect(allIn.grossYield).toBeLessThan(normal.grossYield);
    });
  }

  it("ohne das Feld (alter Stand im Speicher) rechnet wie das normale Modell", () => {
    const { allInclusive: _weg, ...ohneFeld } = { ...standard, allInclusive: false };
    const alt = berechneInvestment(ohneFeld as InvestmentEingabe);
    expect(alt.allInclusive).toBe(false);
    expect(alt.purchaseCosts).toBeCloseTo(berechneInvestment(standard).purchaseCosts, 6);
  });

  it("bietet keinen Gegenfall zu den Kaufnebenkosten an", () => {
    const eingabe = { ...standard, allInclusive: true };
    expect(eigenkapitalrenditeNebenkosten(eingabe, berechneInvestment(eingabe))).toBeNull();
  });
});

describe("Ausweis in Kaufpreisdetails, Hinweis und Rechenweg", () => {
  const eingabe = { ...standard, allInclusive: true };
  const ergebnis = berechneInvestment(eingabe);
  const mitAufwand = berechneInvestment({ ...eingabe, rehabExpense: 20_000 });

  it("nennt den Kaufpreis all-inclusive und die Nebenkosten als enthalten, nie als 0 €", () => {
    for (const r of [ergebnis, mitAufwand]) {
      const de = kaufpreiszeilen(r, "de");
      expect(de[0].label).toBe("Kaufpreis all-inclusive");
      const nk = de.find((z) => z.label.startsWith("Kaufnebenkosten"));
      expect(nk?.wert).toBe("im Kaufpreis enthalten");
      expect(de.some((z) => /^Grunderwerbsteuer|^Notar|^Grundbuch/.test(z.label))).toBe(false);
      const en = kaufpreiszeilen(r, "en");
      expect(en[0].label).toBe("Purchase price all-inclusive");
      expect(en.find((z) => z.label.startsWith("Incidental purchase costs"))?.wert).toBe("included in purchase price");
      expect(de.at(-1)?.label).toBe("Gesamtkosten");
    }
  });

  it("ergibt aus Grundstück, Gebäude, Möbeln, Rücklage und Aufschlag den all-inclusive-Preis", () => {
    for (const r of [ergebnis, mitAufwand, berechneInvestment({ ...faelle.gemischt, allInclusive: true })]) {
      const summe = r.grundstuecksanteil + r.gebaeudeanteilKaufpreis + r.moebelAnteil + r.ruecklage + r.allInclusiveAufschlag;
      expect(summe).toBeCloseTo(r.kaufpreisGesamt, 6);
      const aufschlag = (sprache: "de" | "en", anfang: string) =>
        kaufpreiszeilen(r, sprache).find((z) => z.label.startsWith(anfang))?.wert;
      expect(aufschlag("de", "davon Kaufnebenkosten im Kaufpreis")).toBe(formatEuro(r.allInclusiveAufschlag, "de"));
      expect(aufschlag("en", "of which incidental purchase costs in the price")).toBe(formatEuro(r.allInclusiveAufschlag, "en"));
    }
    // Ohne das Modell gibt es die Zeile nicht.
    expect(kaufpreiszeilen(berechneInvestment(standard)).some((z) => z.label.includes("im Kaufpreis"))).toBe(false);
  });

  it("tauscht im Glossar nur beim Modell die Kaufpreisformel", () => {
    const formel = (allInclusive: boolean, sprache: "de" | "en") =>
      glossar(kennzahlTexteFuer(sprache), { allInclusive })
        .gruppen.flatMap((g) => g.eintraege)
        .find((e) => e.schluessel === "kaufpreisGesamt")?.formel ?? "";
    expect(formel(true, "de")).toMatch(/\+ Rücklage \+ Kaufnebenkosten im Kaufpreis$/);
    expect(formel(true, "en")).toMatch(/\+ reserve \+ incidental purchase costs in the price$/);
    expect(formel(false, "de")).not.toContain("Kaufnebenkosten");
    for (const sprache of ["de", "en"] as const) {
      const e = kennzahlTexteFuer(sprache).glossar.kaufpreisAllInclusive;
      expect(`${e.titel} ${e.bedeutung} ${e.formel}`).not.toMatch(/[–—]/);
    }
  });

  it("zeigt den festen Hinweis, mit Möbeln und Aufwand zusammen mit deren Hinweis", () => {
    expect(kaufpreisHinweis(ergebnis, "de")).toMatch(/^Der Kaufpreis ist all-inclusive/);
    expect(kaufpreisHinweis(ergebnis, "de")).toContain(DOKUMENT_TEXTE_DE.kaufpreis.hinweisBeides);
    const schlicht = { ...eingabe, furniturePrice: 0, rehabExpense: 0 };
    expect(kaufpreisHinweis(berechneInvestment(schlicht), "en")).toBe(dokumentTexteFuer("en").kaufpreis.hinweisAllInclusive);
    expect(kaufpreisHinweis(berechneInvestment({ ...schlicht, allInclusive: false }), "de")).toBeNull();
  });

  it("teilt in der Bruttorendite durch den Kaufpreis all-inclusive", () => {
    const text = (sprache: "de" | "en") =>
      rechenwege(eingabe, ergebnis, kennzahlTexteFuer(sprache), sprache).bruttorendite?.text ?? "";
    expect(text("de")).toContain("Kaufpreis all-inclusive");
    expect(text("en")).toContain("Purchase price all-inclusive");
  });

  it("schreibt die neuen Texte ohne Gedankenstriche", () => {
    for (const sprache of ["de", "en"] as const) {
      const t = dokumentTexteFuer(sprache).kaufpreis;
      const texte = [
        t.gesamtAllInclusive,
        t.nebenkostenEnthalten,
        t.hinweisAllInclusive,
        kennzahlTexteFuer(sprache).glieder.kaufpreisAllInclusive,
        ...kaufpreiszeilen(mitAufwand, sprache).map((z) => `${z.label} ${z.wert}`),
      ];
      for (const text of texte) expect(text).not.toMatch(/[–—]/);
    }
  });
});
