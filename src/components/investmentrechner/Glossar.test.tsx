import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { berechneInvestment, standardEingabe, type InvestmentEingabe } from "@/lib/investmentrechner/rechenkern";
import { leereUnterlagenDaten } from "@/lib/investmentrechner/unterlagenAuslesen";
import { glossar, rechenwege } from "@/lib/investmentrechner/kennzahlErklaerungen";
import { KENNZAHL_TEXTE_DE, KENNZAHL_TEXTE_EN } from "@/lib/investmentrechner/kennzahlTexte";
import { vergleicheObjekte } from "@/lib/investmentrechner/objektvergleich";
import { Analyse } from "./Analyse";
import { ExposeDokument } from "./ExposeDokument";

/*
 * Das Glossar „So entstehen die Zahlen“.
 *
 * Es steht einklappbar in der Analyse und als letzte Seite der Berechnung.
 * Geprüft wird, dass beide Stellen dieselben Einträge in derselben
 * Reihenfolge zeigen, dass jeder Rechenweg an den Kacheln auf einen davon
 * verweist, und dass die Texte die Hausregeln einhalten.
 */

const EINGABE: InvestmentEingabe = {
  ...standardEingabe,
  clientName: "Familie Muster",
  taxableIncomeCustomer: 62000,
  purchasePrice: 250000,
  furniturePrice: 8000,
  monthlyColdRent: 900,
  monthlyOperatingCosts: 50,
  equity: 12500,
};

/** Die Einträge eines gerenderten Glossars als Schlüssel, Titel und Formel. */
function eintraege(wurzel: Element | null) {
  return [...(wurzel?.querySelectorAll(".glossar-eintrag") ?? [])].map((eintrag) => ({
    schluessel: eintrag.getAttribute("data-glossar"),
    titel: eintrag.querySelector("dt")?.textContent,
    formel: eintrag.querySelector(".glossar-formel")?.textContent,
  }));
}

function analyse() {
  const result = berechneInvestment(EINGABE);
  return render(
    <TooltipProvider>
      <Analyse input={EINGABE} result={result} documents={[]} documentData={leereUnterlagenDaten} onOpenDocuments={() => undefined} />
    </TooltipProvider>,
  ).container;
}

function glossarseite() {
  const result = berechneInvestment(EINGABE);
  const { container } = render(
    <ExposeDokument input={EINGABE} result={result} photos={[]} documents={[]} documentData={leereUnterlagenDaten} />,
  );
  return container.querySelector(".glossary-page");
}

/** Alle Zeichenketten eines verschachtelten Objekts, auch die aus Textfunktionen. */
function alleTexte(wert: unknown): string[] {
  if (typeof wert === "string") return [wert];
  if (typeof wert === "function") return [String((wert as (n: number) => string)(10))];
  if (wert && typeof wert === "object") return Object.values(wert).flatMap(alleTexte);
  return [];
}

describe("Glossar in Analyse und Berechnung", () => {
  it("steht in der Analyse als einklappbares Feld mit Link darauf", () => {
    const wurzel = analyse();
    const feld = wurzel.querySelector("details#rechner-glossar");
    expect(feld?.querySelector("summary")?.textContent).toBe("So entstehen die Zahlen");
    expect(wurzel.querySelector('a.glossar-link[href="#rechner-glossar"]')).not.toBeNull();
    // Die alte „Berechnungslogik“ ist ersetzt.
    expect(wurzel.textContent).not.toContain("Berechnungslogik anzeigen");
  });

  it("steht in der Berechnung als eigene Seite mit Überschrift", () => {
    const seite = glossarseite();
    expect(seite?.querySelector("h2")?.textContent).toBe("Glossar: So entstehen die Zahlen");
  });

  it("zeigt an beiden Stellen dieselben Einträge in derselben Reihenfolge", () => {
    const inAnalyse = eintraege(analyse().querySelector("#rechner-glossar"));
    const inBerechnung = eintraege(glossarseite());
    const ausQuelle = glossar().gruppen.flatMap((gruppe) =>
      gruppe.eintraege.map((eintrag) => ({ schluessel: eintrag.schluessel, titel: eintrag.titel, formel: eintrag.formel })),
    );
    expect(inAnalyse).toEqual(ausQuelle);
    expect(inBerechnung).toEqual(ausQuelle);
  });

  it("enthält jeden Eintrag der Textdatei genau einmal", () => {
    const schluessel = glossar().gruppen.flatMap((gruppe) => gruppe.eintraege.map((eintrag) => eintrag.schluessel));
    expect(new Set(schluessel).size).toBe(schluessel.length);
    expect([...schluessel].sort()).toEqual(Object.keys(KENNZAHL_TEXTE_DE.glossar.eintraege).sort());
  });

  it("erklärt jede Zahl, unter der ein Rechenweg steht", () => {
    const schluessel = new Set(glossar().gruppen.flatMap((gruppe) => gruppe.eintraege.map((eintrag) => eintrag.schluessel)));
    for (const weg of Object.values(rechenwege(EINGABE, berechneInvestment(EINGABE)))) {
      if (weg) expect(schluessel.has(weg.glossar), weg.glossar).toBe(true);
    }
  });

  it("erklärt die Kalkulationsbasis", () => {
    const titel = glossar().gruppen.find((gruppe) => gruppe.schluessel === "basis")?.eintraege.map((e) => e.titel);
    expect(titel).toEqual(
      expect.arrayContaining([
        "Kaufpreis gesamt",
        "davon Möbel/Inventar",
        "Grundstücks- und Gebäudeanteil",
        "Kaufnebenkosten, anteilig verteilt",
        "AfA-Basis und Gebäude-AfA",
        "Möbel-AfA",
        "davon Instandhaltungsrücklage",
      ]),
    );
  });

  it("sagt an beiden Stellen, dass es keine Steuerberatung ist", () => {
    expect(analyse().querySelector("#rechner-glossar")?.textContent).toContain("Keine Steuerberatung");
    expect(glossarseite()?.textContent).toContain("Keine Steuerberatung");
  });
});

describe("Interner Zinsfuß", () => {
  it("steht nicht mehr in den Kacheln der Analyse", () => {
    const wurzel = analyse();
    const kacheln = [...wurzel.querySelectorAll(".metrics-grid, .cashflow-band")].map((k) => k.textContent).join(" ");
    expect(kacheln).not.toMatch(/Zinsfu|Rendite auf dein eingesetztes Geld/);
  });

  it("bleibt im Glossar, weil der Objektvergleich ihn weiter zeigt", () => {
    const objekt = { eingabe: EINGABE, ergebnis: berechneInvestment(EINGABE) };
    const zeile = vergleicheObjekte(objekt, objekt).find((z) => z.bezeichnung === "Interner Zinsfuß (IRR) p. a.");
    expect(zeile?.wertA).toBe(objekt.ergebnis.irr);
    expect(KENNZAHL_TEXTE_DE.glossar.eintraege.irr.bedeutung).toContain("Objektvergleich");
  });
});

describe("Eigenkapitalrendite", () => {
  it("steht im Glossar direkt nach dem Gesamtvermögen, mit Christians Formel", () => {
    const vermoegen = glossar().gruppen.find((gruppe) => gruppe.schluessel === "vermoegen")?.eintraege.map((e) => e.schluessel);
    expect(vermoegen?.[(vermoegen?.indexOf("gesamtvermoegen") ?? -2) + 1]).toBe("eigenkapitalrendite");
    const eintrag = KENNZAHL_TEXTE_DE.glossar.eintraege.eigenkapitalrendite;
    expect(eintrag.formel).toContain("(Vermögensaufbau im Betrachtungszeitraum ÷ Jahre) ÷ (Eigenkapital + Zuzahlung vor Steuer je Monat × 12)");
    expect(eintrag.formel).toContain("negativer Cashflow vor Steuer pro Monat");
    expect(KENNZAHL_TEXTE_EN.glossar.eintraege.eigenkapitalrendite.titel).toBe("Return on equity p.a.");
  });

  it("zeigt die Analyse mit dem kurzen Pflichthinweis unter den Kacheln", () => {
    expect(analyse().textContent).toContain("Unverbindliche Beispielrechnung, kein Angebot.");
  });
});

describe("Texte der Textdatei", () => {
  it("enthalten keine Gedankenstriche", () => {
    for (const text of alleTexte(KENNZAHL_TEXTE_DE)) expect(text).not.toMatch(/[–—]/);
  });

  it("schreiben Minus in Formeln als Rechenzeichen und nicht als Bindestrich zwischen Leerzeichen", () => {
    for (const text of alleTexte(KENNZAHL_TEXTE_DE)) expect(text).not.toMatch(/ - /);
  });
});
