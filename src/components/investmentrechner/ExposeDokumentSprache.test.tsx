import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { berechneInvestment, standardEingabe, type InvestmentEingabe } from "@/lib/investmentrechner/rechenkern";
import { leereUnterlagenDaten } from "@/lib/investmentrechner/unterlagenAuslesen";
import { rechenwege } from "@/lib/investmentrechner/kennzahlErklaerungen";
import {
  KENNZAHL_TEXTE_DE,
  KENNZAHL_TEXTE_EN,
  kennzahlTexteFuer,
} from "@/lib/investmentrechner/kennzahlTexte";
import { DOKUMENT_TEXTE_DE, DOKUMENT_TEXTE_EN } from "@/lib/investmentrechner/dokumentTexte";
import { ExposeDokument, ExposeVergleichsdokument } from "./ExposeDokument";

/*
 * Plan Kundensprache, Etappe 5 (D15): Der Druck der Investmentberechnung
 * erscheint in der Sprache des Kunden. Geprüft wird, dass beide Textsammlungen
 * vollständig und deckungsgleich sind und dass der Druck auf Englisch
 * wirklich englisch ist, ohne die deutsche Fassung zu verändern.
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

/** Alle Blätter eines Textobjekts mit Pfad; Funktionen werden mit Beispielwerten aufgerufen. */
function blaetter(wert: unknown, pfad = ""): Array<[string, string]> {
  if (typeof wert === "string") return [[pfad, wert]];
  if (typeof wert === "function") {
    const f = wert as (...a: unknown[]) => string;
    return [[pfad, String(f(10, 12))]];
  }
  if (wert && typeof wert === "object") {
    return Object.entries(wert).flatMap(([k, v]) => blaetter(v, pfad ? `${pfad}.${k}` : k));
  }
  return [];
}

/** Gedankenstriche sind in Nutzertexten verboten, auch im Englischen. */
const GEDANKENSTRICH = /[–—]/;

describe("kennzahlTexte in beiden Sprachen", () => {
  const de = blaetter(KENNZAHL_TEXTE_DE);
  const en = blaetter(KENNZAHL_TEXTE_EN);

  it("haben dieselben Schlüssel", () => {
    expect(en.map(([p]) => p)).toEqual(de.map(([p]) => p));
  });

  it("sind auf Englisch vollständig und nicht leer", () => {
    for (const [pfad, text] of en) expect(text.trim(), pfad).not.toBe("");
  });

  it("sind auf Englisch wirklich übersetzt", () => {
    // Nur das Durchschnittszeichen darf in beiden Sprachen gleich sein.
    const gleich = en.filter(([pfad, text]) => de.find(([p]) => p === pfad)?.[1] === text).map(([p]) => p);
    expect(gleich).toEqual(["glieder.durchschnitt"]);
  });

  it("enthalten keine Gedankenstriche", () => {
    for (const [pfad, text] of en) expect(GEDANKENSTRICH.test(text), pfad).toBe(false);
  });

  it("werden über kennzahlTexteFuer gewählt, Unbekanntes ist Deutsch", () => {
    expect(kennzahlTexteFuer("en")).toBe(KENNZAHL_TEXTE_EN);
    expect(kennzahlTexteFuer("de")).toBe(KENNZAHL_TEXTE_DE);
    expect(kennzahlTexteFuer(undefined)).toBe(KENNZAHL_TEXTE_DE);
    expect(kennzahlTexteFuer("fr")).toBe(KENNZAHL_TEXTE_DE);
  });
});

describe("dokumentTexte in beiden Sprachen", () => {
  const de = blaetter(DOKUMENT_TEXTE_DE);
  const en = blaetter(DOKUMENT_TEXTE_EN);

  it("haben dieselben Schlüssel und sind vollständig", () => {
    expect(en.map(([p]) => p)).toEqual(de.map(([p]) => p));
    for (const [pfad, text] of en) expect(text.trim(), pfad).not.toBe("");
    for (const [pfad, text] of en) expect(GEDANKENSTRICH.test(text), pfad).toBe(false);
  });
});

describe("Druck der Berechnung", () => {
  const result = berechneInvestment(EINGABE);

  it("bleibt ohne Sprache deutsch", () => {
    const { container } = render(
      <ExposeDokument input={EINGABE} result={result} photos={[]} documents={[]} documentData={leereUnterlagenDaten} />,
    );
    expect(container.textContent).toContain("Steuerbetrachtung vor Erwerb");
    expect(container.textContent).toContain("Seite 1");
    expect(container.textContent).not.toContain("Tax position before purchase");
  });

  it("zeigt auf Englisch die englischen Überschriften und Beträge", () => {
    const { container } = render(
      <ExposeDokument input={EINGABE} result={result} photos={[]} documents={[]} documentData={leereUnterlagenDaten} sprache="en" />,
    );
    const text = container.textContent ?? "";
    for (const ueberschrift of [
      "Personal investment calculation",
      "Energy, reserves & renovations",
      "Tax position before purchase",
      "Wealth development",
      "Cash flow & equity",
      "Glossary: how the figures are calculated",
      "Page 1",
    ]) {
      expect(text).toContain(ueberschrift);
    }
    // Beträge britisch, das Eurozeichen vorn.
    expect(text).toContain("€250,000");
    // Keine deutschen Überschriften mehr.
    for (const deutsch of ["Steuerbetrachtung", "Vermögensentwicklung", "Seite 1", "Kaufpreisdetails", "Jahresprognose"]) {
      expect(text).not.toContain(deutsch);
    }
    expect(container.querySelector(".expose-document")?.getAttribute("lang")).toBe("en");
  });

  it("schreibt auch Tabellenköpfe, Glossar und Rechenwege englisch", () => {
    const { container } = render(
      <ExposeDokument input={EINGABE} result={result} photos={[]} documents={[]} documentData={leereUnterlagenDaten} sprache="en" />,
    );
    const koepfe = [...container.querySelectorAll("th")].map((th) => th.textContent);
    expect(koepfe).toContain("Tax effect");
    expect(koepfe).not.toContain("Jahr");
    expect(container.querySelector(".glossary-page")?.textContent).toContain("No tax advice");
    const wege = rechenwege(EINGABE, result, KENNZAHL_TEXTE_EN, "en");
    expect(wege.cashflowVorSteuer?.text).toMatch(/^Rent €/);
    // Seit dem 07.10.2026 stehen die Rechenwege der hellen Kennzahlen auf der Seite hinter dem Deckblatt.
    expect(wege.nettorendite?.text).toBeTruthy();
    expect(container.querySelector(".kennzahlen-page")?.textContent).toContain(wege.nettorendite?.text ?? "fehlt");
  });

  it("übersetzt auch die Vergleichsseite", () => {
    const objekt = { input: EINGABE, result, photos: [], documents: [], documentData: leereUnterlagenDaten };
    const { container } = render(<ExposeVergleichsdokument a={objekt} b={objekt} sprache="en" />);
    const seite = container.querySelector(".compare-page");
    expect(seite?.textContent).toContain("Two properties, the same tax basis");
    expect(seite?.textContent).toContain("Total costs");
    expect(seite?.textContent).toContain("Both properties cost the same each month");
    expect(seite?.textContent).not.toContain("Objekt A");
  });
});
