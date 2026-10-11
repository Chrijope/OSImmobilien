import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { berechneInvestment, standardEingabe, type InvestmentEingabe } from "@/lib/investmentrechner/rechenkern";
import { leereUnterlagenDaten } from "@/lib/investmentrechner/unterlagenAuslesen";
import {
  deckblattWerte,
  gemerkteDeckblattVariante,
  merkeDeckblattVariante,
  type DeckblattVariante,
} from "@/lib/investmentrechner/deckblattWerte";
import { formatEuro } from "@/lib/investmentrechner/formatierer";
import type { FormatSprache } from "@/lib/sprachFormat";
import { ExposeDokument } from "./ExposeDokument";
import { InvestmentrechnerInhalt } from "./InvestmentrechnerInhalt";

/*
 * Die beiden Deckblätter der Berechnung, seit dem 07.10.2026.
 *
 * Geprüft wird: Die Kernwerte kommen aus der Jahrestabelle, die Seitenfolge
 * ist Deckblatt, Kennzahlen-Seite, dann ab „Objektunterlagen“ wie bisher, und
 * beide Deckblätter stehen in beiden Sprachen ohne Gedankenstriche da.
 */

/** Ein Fall wie in Christians Entwurf: Erhaltungsaufwand im ersten Jahr, danach Zuzahlung. */
const ZAHLT_ZU: InvestmentEingabe = {
  ...standardEingabe,
  clientName: "Familie Muster",
  propertyTitle: "Musterhaus, WE 3",
  address: "Beispielweg 1, 90000 Musterstadt",
  propertyType: "WG-Konzept",
  area: 69.29,
  rooms: 4,
  constructionYear: 1900,
  purchasePrice: 405000,
  rehabExpense: 42500,
  rehabMode: "expense",
  rehabDistributionYears: 1,
  monthlyColdRent: 1750,
  monthlyOperatingCosts: 120,
  monthlyReserveContribution: 47,
  taxableIncomeCustomer: 67900,
  equity: 18850,
  forecastYears: 10,
};

/** Hohe Miete: Ab Jahr 2 bleibt jeden Monat etwas übrig. */
const TRAEGT_SICH: InvestmentEingabe = { ...ZAHLT_ZU, monthlyColdRent: 3200 };

const glatt = (text: string | null | undefined) => (text ?? "").replace(/\u00a0|\u202f/g, " ");
const GEDANKENSTRICH = /[–—]/;

function seiten(eingabe: InvestmentEingabe, deckblatt: DeckblattVariante, sprache: FormatSprache = "de") {
  const { container } = render(
    <ExposeDokument
      input={eingabe}
      result={berechneInvestment(eingabe)}
      photos={[]}
      documents={[]}
      documentData={{ ...leereUnterlagenDaten, energyClass: "B" }}
      sprache={sprache}
      deckblatt={deckblatt}
    />,
  );
  return [...container.querySelectorAll<HTMLElement>(".expose-page")];
}

describe("Kernwerte aus der Jahrestabelle", () => {
  const result = berechneInvestment(ZAHLT_ZU);
  const w = deckblattWerte(ZAHLT_ZU, result);
  const jahre = result.years;

  it("nimmt den Cashflow nach Steuer im ersten Jahr direkt aus der Tabelle", () => {
    expect(w.monat.nachSteuer).toBeCloseTo(jahre[0].cashflowAfterTax / 12, 10);
    expect(w.monat.vorSteuer).toBeCloseTo(jahre[0].cashflowBeforeTax / 12, 10);
    expect(w.monat.steuer).toBeCloseTo(jahre[0].taxEffect / 12, 10);
    // Die Zeilen des Monats gehen auf: Miete minus Rate minus Kosten ist vor Steuer.
    expect(w.monat.miete + w.monat.rate + w.monat.kosten).toBeCloseTo(w.monat.vorSteuer, 8);
    expect(w.monat.vorSteuer + w.monat.steuer).toBeCloseTo(w.monat.nachSteuer, 8);
  });

  it("mittelt die Zuzahlung über die Jahre 2 bis 10", () => {
    const schnitt = jahre.slice(1, 10).reduce((summe, j) => summe + j.cashflowAfterTax, 0) / 9 / 12;
    expect(w.nachSteuerAbJahr2).toBeCloseTo(schnitt, 10);
    expect(schnitt).toBeLessThan(0);
    expect(w.zuzahlungMonat).toBeCloseTo(-schnitt, 10);
    // Im ersten Jahr wirkt der Erhaltungsaufwand, dort bleibt etwas übrig.
    expect(w.monat.nachSteuer).toBeGreaterThan(0);
  });

  it("rechnet das Vermögen wie der Rechenkern", () => {
    expect(w.vermoegensaufbauMonat).toBeCloseTo(result.vermoegensaufbauMonat, 8);
    expect(w.fuerDichBleibt).toBe(jahre[9].totalWealth);
    expect(w.selbstEingezahlt).toBe(jahre[9].cumulativeEigenanteil);
    // Anteil minus Zuzahlungen plus Überschüsse ergibt genau, was bleibt.
    expect(jahre[9].propertyEquity - w.selbstEingezahlt + w.ueberschuesse).toBeCloseTo(w.fuerDichBleibt, 6);
    expect(w.ueberschuesse).toBeCloseTo(Math.max(0, jahre[0].cashflowAfterTax), 6);
    expect(w.jeEingezahltemEuro).toBeCloseTo(jahre[9].propertyEquity / jahre[9].cumulativeEigenanteil, 10);
    expect(w.steuerSumme).toBeCloseTo(result.cumulativeTaxEffect, 6);
  });

  it("zeigt bei längerer Prognose nur die ersten zehn Jahre", () => {
    const lang = { ...ZAHLT_ZU, forecastYears: 25 };
    const langErgebnis = berechneInvestment(lang);
    const werte = deckblattWerte(lang, langErgebnis);
    expect(werte.jahre).toHaveLength(10);
    expect(werte.letztes.year).toBe(lang.startYear + 9);
    expect(werte.fuerDichBleibt).toBe(langErgebnis.years[9].totalWealth);
  });

  it("erkennt, wenn sich die Immobilie ab Jahr 2 selbst trägt", () => {
    const werte = deckblattWerte(TRAEGT_SICH, berechneInvestment(TRAEGT_SICH));
    expect(werte.nachSteuerAbJahr2).toBeGreaterThan(0);
    expect(werte.zuzahlungMonat).toBeNull();
  });
});

describe("Seitenreihenfolge", () => {
  for (const [variante, klasse] of [
    ["blick", "deckblatt-blick"],
    ["jahre", "deckblatt-jahre"],
  ] as const) {
    it(`${variante}: Deckblatt, Kennzahlen-Seite, dann ab den Unterlagen wie bisher`, () => {
      const blatt = seiten(ZAHLT_ZU, variante);
      expect(blatt.map((seite) => [...seite.classList].find((k) => k !== "expose-page" && k !== "deckblatt-page"))).toEqual([
        klasse,
        "kennzahlen-page",
        "documents-page",
        "tax-profile-page",
        "forecast-page",
        "table-page",
        "photos-page",
        "glossary-page",
      ]);
    });
  }

  it("verliert nichts von der alten ersten Seite: Kaufpreis, Finanzierung, Erhaltungsaufwand, Nettorendite, Annahmen", () => {
    const kennzahlen = seiten(ZAHLT_ZU, "blick")[1];
    const text = glatt(kennzahlen.textContent);
    for (const teil of [
      "Kaufpreisdetails",
      "Finanzierung & Steuerannahmen",
      "Erhaltungsaufwand · Modellannahme",
      "Nettorendite",
      "Eingesetztes Eigenkapital",
      "Worauf die Rechnung beruht",
      "Wertsteigerung der Immobilie",
      "dein Steuerberater",
      "Zinsbindung",
      "Unverbindliche Beispielrechnung",
      "Keine Steuerberatung",
      "Gesamtvermögen nach 10 Jahren",
    ]) {
      expect(text, teil).toContain(teil);
    }
    // Die Nettorendite trägt weiter ihren Rechenweg.
    expect(kennzahlen.querySelectorAll(".metric-card .rechenweg")).toHaveLength(4);
  });
});

describe("Deckblatt „Ergebnis auf einen Blick“", () => {
  it("nennt im Kernsatz die Ø Zuzahlung der Jahre 2 bis 10 und zeigt Jahr 1 groß", () => {
    const w = deckblattWerte(ZAHLT_ZU, berechneInvestment(ZAHLT_ZU));
    const blatt = seiten(ZAHLT_ZU, "blick")[0];
    const satz = glatt(blatt.querySelector(".db-kernsatz")?.textContent);
    expect(satz).toBe(
      glatt(`Mit Ø ${formatEuro(w.zuzahlungMonat ?? 0)} im Monat baust du Ø ${formatEuro(w.vermoegensaufbauMonat)} Vermögen im Monat auf.`),
    );
    const kacheln = [...blatt.querySelectorAll(".db-kacheln > div")].map((k) => glatt(k.textContent));
    expect(kacheln).toHaveLength(3);
    expect(kacheln[0]).toContain("Cashflow nach Steuer, Jahr 1");
    expect(kacheln[0]).toContain("ab Jahr 2 Ø −");
    expect(kacheln[1]).toContain("Vermögensaufbau pro Monat");
    expect(kacheln[2]).toContain("Eigenkapitalrendite p. a.");
    // Vor Steuer steht klein in der Liste, nicht als große Zahl.
    expect(blatt.querySelector(".db-zeile-leise")?.textContent).toContain("Cashflow vor Steuer");
    expect(glatt(blatt.querySelector(".db-bleibt strong")?.textContent)).toBe(glatt(formatEuro(w.fuerDichBleibt)));
  });

  it("formuliert den Kernsatz um, wenn sich die Immobilie selbst trägt", () => {
    expect(seiten(TRAEGT_SICH, "blick")[0].querySelector(".db-kernsatz")?.textContent).toMatch(
      /^Deine Immobilie trägt sich selbst und baut Ø .* Vermögen im Monat auf\.$/,
    );
    expect(seiten(TRAEGT_SICH, "blick", "en")[0].querySelector(".db-kernsatz")?.textContent).toMatch(
      /^Your property pays for itself and builds up an average of €[\d,]+ in wealth a month\.$/,
    );
  });
});

describe("Deckblatt „Jahr für Jahr“", () => {
  it("zeigt zehn Jahreszeilen aus der Tabelle, Jahr 1 hervorgehoben", () => {
    const result = berechneInvestment(ZAHLT_ZU);
    const blatt = seiten(ZAHLT_ZU, "jahre")[0];
    const zeilen = [...blatt.querySelectorAll(".db-tabelle tbody tr")];
    expect(zeilen).toHaveLength(10);
    expect(zeilen[0].classList.contains("db-jahr-eins")).toBe(true);
    expect(blatt.querySelectorAll(".db-tabelle thead th")).toHaveLength(11);
    const letzte = [...zeilen[9].querySelectorAll("td")].map((zelle) => glatt(zelle.textContent));
    expect(letzte[0]).toBe(String(result.years[9].year));
    expect(letzte[8]).toBe(glatt(formatEuro(result.years[9].remainingDebt)));
    expect(letzte[10]).toBe(glatt(formatEuro(result.years[9].propertyEquity)));
    expect(glatt(blatt.textContent)).toContain("Pro eingezahltem Euro");
  });

  it("zeigt ohne eigenen Beitrag den Ø Cashflow statt „pro eingezahltem Euro“", () => {
    const text = glatt(seiten({ ...TRAEGT_SICH, monthlyColdRent: 6000 }, "jahre")[0].textContent);
    expect(text).not.toContain("Pro eingezahltem Euro");
    expect(text).toContain("Cashflow nach Steuer Ø");
  });
});

describe("Beide Sprachen, keine Gedankenstriche", () => {
  for (const variante of ["blick", "jahre"] as const) {
    it(`${variante}: Deutsch und Englisch ohne Gedankenstrich, Englisch ohne deutsche Wörter`, () => {
      for (const sprache of ["de", "en"] as const) {
        const [deckblatt, kennzahlen] = seiten(ZAHLT_ZU, variante, sprache);
        for (const seite of [deckblatt, kennzahlen]) {
          expect(GEDANKENSTRICH.test(seite.textContent ?? ""), `${variante} ${sprache}`).toBe(false);
        }
      }
      const [deckblatt, kennzahlen] = seiten(ZAHLT_ZU, variante, "en");
      const text = glatt(`${deckblatt.textContent} ${kennzahlen.textContent}`);
      expect(text).toContain("For: Familie Muster");
      expect(text).toContain("Personal investment calculation");
      expect(text).toContain("Key figures, purchase price, financing and assumptions");
      expect(text).toContain("What the calculation is based on");
      expect(text).toContain("€405,000");
      expect(text).toContain(variante === "blick" ? "How your month adds up" : "Your figures year by year, per month");
      for (const deutsch of ["Kaltmiete", "Vermögen", "Restschuld", "Steuer ", "Jahr ", "Für:", "Seite"]) {
        expect(text, deutsch).not.toContain(deutsch);
      }
    });
  }
});

describe("Wahl des Deckblatts im Rechner", () => {
  // Diese Testumgebung hat weder `localStorage` noch `ResizeObserver`, deshalb schlichte Ersatzstücke.
  beforeEach(() => {
    const werte = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => werte.get(k) ?? null,
      setItem: (k: string, v: string) => void werte.set(k, String(v)),
      removeItem: (k: string) => void werte.delete(k),
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("ohne Speicher gilt still der Standard", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(gemerkteDeckblattVariante()).toBe("blick");
    expect(() => merkeDeckblattVariante("jahre")).not.toThrow();
  });

  it("merkt sich die Wahl je Browser, Standard ist „Ergebnis auf einen Blick“", () => {
    expect(gemerkteDeckblattVariante()).toBe("blick");
    merkeDeckblattVariante("jahre");
    expect(gemerkteDeckblattVariante()).toBe("jahre");
    window.localStorage.setItem("investmentrechner.deckblatt", "unsinn");
    expect(gemerkteDeckblattVariante()).toBe("blick");
  });

  it("zeigt oben in der Analyse den Ergebnisteil der gewählten Variante, die Leiste ist weg", () => {
    render(
      <TooltipProvider>
        <InvestmentrechnerInhalt />
      </TooltipProvider>,
    );
    const analyse = () => document.body.querySelector(".analysis-content")!;
    expect(analyse().querySelector(".cashflow-band")).toBeNull();
    expect(analyse().querySelector(".analyse-deckblatt-blick .db-kernsatz")).not.toBeNull();
    expect(analyse().querySelectorAll(".analyse-deckblatt .db-kacheln > div")).toHaveLength(3);
    expect(analyse().querySelector(".analyse-deckblatt .db-zeile-leise")?.textContent).toContain("Cashflow vor Steuer");
    // Der Schalter in der Analyse wechselt die Variante dort und im Druckstück.
    fireEvent.click(screen.getByRole("radio", { name: "Jahr für Jahr" }));
    expect(analyse().querySelector(".analyse-deckblatt-jahre .db-tabelle")).not.toBeNull();
    expect(analyse().querySelector(".analyse-deckblatt-jahre .db-diagramm")).not.toBeNull();
    expect(document.body.querySelector(".investmentrechner-print .expose-page")?.classList.contains("deckblatt-jahre")).toBe(true);
    // Unter „Berechnung“ steht dieselbe Wahl.
    fireEvent.click(screen.getByRole("button", { name: /Berechnung$/ }));
    expect(screen.getByRole("radio", { name: "Jahr für Jahr" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "Ergebnis auf einen Blick" }));
    fireEvent.click(screen.getByRole("button", { name: /Analyse$/ }));
    expect(screen.getByRole("radio", { name: "Ergebnis auf einen Blick" })).toHaveAttribute("aria-checked", "true");
    expect(analyse().querySelector(".analyse-deckblatt-blick")).not.toBeNull();
    // Darunter bleibt alles wie bisher.
    expect(analyse().textContent).toContain("Kaufpreisdetails");
    expect(analyse().textContent).toContain("Einkommens- und Steuerprofil");
  });

  it("schaltet unter „Berechnung“ das Deckblatt im Druckstück um", () => {
    render(
      <TooltipProvider>
        <InvestmentrechnerInhalt />
      </TooltipProvider>,
    );
    const erste = () => document.body.querySelector(".investmentrechner-print .expose-page");
    expect(erste()?.classList.contains("deckblatt-blick")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Berechnung$/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Jahr für Jahr" }));
    expect(erste()?.classList.contains("deckblatt-jahre")).toBe(true);
    expect(screen.getByRole("radio", { name: "Jahr für Jahr" })).toHaveAttribute("aria-checked", "true");
    expect(gemerkteDeckblattVariante()).toBe("jahre");
  });
});
