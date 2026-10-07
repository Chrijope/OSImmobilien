import { describe, expect, it } from "vitest";
import { berechneInvestment, standardEingabe, type InvestmentEingabe } from "./rechenkern";
import {
  GEMEINSAME_FELDER,
  einordnung,
  jahreAkkusativ,
  jahreDativ,
  vergleicheObjekte,
  type Vergleichsobjekt,
  type Vergleichszeile,
} from "./objektvergleich";

/*
 * Geprüft wird die Vergleichslogik, nicht der Rechenkern. Die Objekte werden
 * deshalb aus der Standardeingabe abgeleitet und nur dort verändert, wo der
 * jeweilige Fall es braucht.
 */

function objekt(aenderung: Partial<InvestmentEingabe>): Vergleichsobjekt {
  const eingabe: InvestmentEingabe = { ...standardEingabe, ...aenderung };
  return { eingabe, ergebnis: berechneInvestment(eingabe) };
}

/** Kaufbereites Beispielobjekt, damit die Prognose echte Zahlen liefert. */
const basis: Partial<InvestmentEingabe> = {
  taxableIncomeCustomer: 62000,
  purchasePrice: 300000,
  monthlyColdRent: 1000,
  monthlyOperatingCosts: 120,
  forecastYears: 10,
};

function zeile(zeilen: Vergleichszeile[], bezeichnung: string): Vergleichszeile {
  const treffer = zeilen.find((eintrag) => eintrag.bezeichnung === bezeichnung);
  if (!treffer) throw Error(`Zeile „${bezeichnung}" fehlt im Vergleich`);
  return treffer;
}

describe("GEMEINSAME_FELDER", () => {
  it("enthält den gesamten Bereich Kunde sowie Startjahr und Prognosedauer", () => {
    expect(GEMEINSAME_FELDER).toContain("clientName");
    expect(GEMEINSAME_FELDER).toContain("taxableIncomeCustomer");
    expect(GEMEINSAME_FELDER).toContain("marginalTaxRate");
    expect(GEMEINSAME_FELDER).toContain("startYear");
    expect(GEMEINSAME_FELDER).toContain("forecastYears");
  });

  it("enthält kein objektbezogenes Feld", () => {
    expect(GEMEINSAME_FELDER).not.toContain("purchasePrice");
    expect(GEMEINSAME_FELDER).not.toContain("equity");
    expect(GEMEINSAME_FELDER).not.toContain("monthlyColdRent");
    expect(GEMEINSAME_FELDER).not.toContain("propertyTitle");
  });
});

describe("vergleicheObjekte, Richtung der Kennzahlen", () => {
  it("wertet bei Gesamtkosten und Rate weniger als besser", () => {
    const a = objekt({ ...basis, purchasePrice: 400000 });
    const b = objekt({ ...basis, purchasePrice: 300000 });
    const zeilen = vergleicheObjekte(a, b);

    const kosten = zeile(zeilen, "Gesamtkosten");
    expect(kosten.richtung).toBe("wenigerIstBesser");
    expect(kosten.wertB).toBeLessThan(kosten.wertA ?? 0);
    expect(kosten.unterschied).toBeLessThan(0);
    expect(kosten.besser).toBe("b");

    const rate = zeile(zeilen, "Monatliche Rate");
    expect(rate.besser).toBe("b");

    // Umgekehrt herum muss dieselbe Kennzahl auf das andere Objekt zeigen.
    const gedreht = vergleicheObjekte(b, a);
    expect(zeile(gedreht, "Gesamtkosten").besser).toBe("a");
    expect(zeile(gedreht, "Gesamtkosten").unterschied).toBeGreaterThan(0);
  });

  it("wertet bei Rendite, Cashflow und Vermögen mehr als besser", () => {
    const a = objekt({ ...basis, monthlyColdRent: 900 });
    const b = objekt({ ...basis, monthlyColdRent: 1300 });
    const zeilen = vergleicheObjekte(a, b);

    const rendite = zeile(zeilen, "Bruttorendite");
    expect(rendite.richtung).toBe("mehrIstBesser");
    expect(rendite.unterschied).toBeGreaterThan(0);
    expect(rendite.besser).toBe("b");

    expect(zeile(zeilen, "Cashflow nach Steuern p. M.").besser).toBe("b");
    expect(zeile(zeilen, "Gesamtvermögen").besser).toBe("b");

    const gedreht = vergleicheObjekte(b, a);
    expect(zeile(gedreht, "Bruttorendite").besser).toBe("a");
  });

  it("wertet die Restschuld als weniger ist besser", () => {
    const a = objekt({ ...basis, seniorRepaymentRate: 1 });
    const b = objekt({ ...basis, seniorRepaymentRate: 3 });
    const restschuld = zeile(vergleicheObjekte(a, b), "Restschuld");
    expect(restschuld.richtung).toBe("wenigerIstBesser");
    expect(restschuld.wertB).toBeLessThan(restschuld.wertA ?? 0);
    expect(restschuld.besser).toBe("b");
  });

  it("lässt das eingesetzte Eigenkapital ohne Wertung", () => {
    const a = objekt({ ...basis, equity: 0 });
    const b = objekt({ ...basis, equity: 40000 });
    const eigenkapital = zeile(vergleicheObjekte(a, b), "Eingesetztes Eigenkapital");
    expect(eigenkapital.richtung).toBe("ohneWertung");
    expect(eigenkapital.besser).toBe("gleich");
    expect(eigenkapital.unterschied).toBe(40000);
  });

  it("meldet Gleichstand, wenn beide Objekte identisch sind", () => {
    const a = objekt(basis);
    const b = objekt(basis);
    const zeilen = vergleicheObjekte(a, b);
    expect(zeilen.every((eintrag) => eintrag.besser === "gleich")).toBe(true);
    expect(zeilen.every((eintrag) => eintrag.unterschied === 0 || eintrag.unterschied === null)).toBe(true);
  });

  it("verträgt negative Werte, etwa einen negativen Cashflow", () => {
    const a = objekt({ ...basis, purchasePrice: 600000 });
    const b = objekt({ ...basis, purchasePrice: 300000 });
    const cashflow = zeile(vergleicheObjekte(a, b), "Cashflow nach Steuern p. M.");
    expect(cashflow.wertA).toBeLessThan(0);
    expect(cashflow.wertB).toBeLessThan(0);
    // Weniger negativ ist mehr, also liegt B vorn.
    expect(cashflow.unterschied).toBeGreaterThan(0);
    expect(cashflow.besser).toBe("b");
  });

  it("vergleicht die IRR auch, wenn ein Objekt ohne Eigenkapital gerechnet wird", () => {
    /*
      Bis zum 21.09.2026 gab es hier keinen Sieger, weil die IRR ein gefülltes
      Feld Eigenkapital verlangte und sonst null lieferte. Genau das stand auch
      in der Kachel: ein Strich, ohne Begründung.

      Seither wird gerechnet, sobald es überhaupt eine Zahlungsreihe gibt. Zahlt
      der Kunde monatlich zu, ist das sein Einsatz, und die Rendite darauf ist
      eine sinnvolle Zahl. Wer weniger einsetzt und dasselbe herausbekommt,
      steht besser da, deshalb liegt A vorn.
    */
    const a = objekt({ ...basis, equity: 0 });
    const b = objekt({ ...basis, equity: 40000 });
    const irr = zeile(vergleicheObjekte(a, b), "Interner Zinsfuß (IRR) p. a.");
    expect(irr.wertA).not.toBeNull();
    expect(irr.wertB).not.toBeNull();
    expect(irr.wertA!).toBeGreaterThan(irr.wertB!);
    expect(irr.besser).toBe("a");
  });

  it("lässt die IRR ohne Sieger, wenn sie sich nicht rechnen lässt", () => {
    // Eine Zahlungsreihe ohne Rückfluss ergibt keine Rendite. Dann bleibt es
    // beim Strich, und das ist richtig so.
    const ohneMiete = objekt({ ...basis, equity: 0, monthlyColdRent: 0, purchasePrice: 0 });
    const irr = zeile(vergleicheObjekte(ohneMiete, ohneMiete), "Interner Zinsfuß (IRR) p. a.");
    expect(irr.besser).toBe("gleich");
  });

  it("benennt die Endgruppe nach der Laufzeit", () => {
    const zehn = vergleicheObjekte(objekt(basis), objekt(basis));
    expect(zeile(zehn, "Gesamtvermögen").gruppe).toBe("Nach zehn Jahren");
    const einJahr = { ...basis, forecastYears: 1 };
    const kurz = vergleicheObjekte(objekt(einJahr), objekt(einJahr));
    expect(zeile(kurz, "Gesamtvermögen").gruppe).toBe("Nach einem Jahr");
  });
});

describe("jahreAkkusativ und jahreDativ", () => {
  it("schreibt die Zahl aus und beugt den Singular", () => {
    expect(jahreAkkusativ(1)).toBe("ein Jahr");
    expect(jahreAkkusativ(10)).toBe("zehn Jahre");
    expect(jahreAkkusativ(30)).toBe("dreißig Jahre");
    expect(jahreDativ(1)).toBe("einem Jahr");
    expect(jahreDativ(10)).toBe("zehn Jahren");
  });
});

/**
 * Objekt mit vorgegebener Monatsbelastung und vorgegebenem Endvermögen.
 *
 * Der Satz der Einordnung hängt nur an diesen beiden Größen. Sie über echte
 * Eingaben punktgenau zu treffen ist unmöglich, weil der kumulierte Cashflow
 * ins Vermögen einfließt. Deshalb wird ein echtes Ergebnis gerechnet und nur
 * das erste und das letzte Prognosejahr auf die gewünschten Werte gesetzt.
 */
function mitEckwerten(monatlich: number, endvermoegen: number): Vergleichsobjekt {
  const grund = objekt(basis);
  const jahre = grund.ergebnis.years;
  const erstes = { ...jahre[0], cashflowAfterTax: monatlich * 12 };
  const letztes = { ...jahre[jahre.length - 1], totalWealth: endvermoegen };
  return {
    eingabe: grund.eingabe,
    ergebnis: { ...grund.ergebnis, years: [erstes, ...jahre.slice(1, -1), letztes] },
  };
}

describe("einordnung", () => {
  it("nennt beide Objekte, wenn jedes in einem Punkt vorn liegt", () => {
    const a = mitEckwerten(-965.78, 141737);
    const b = mitEckwerten(-212.4, 118940);
    expect(einordnung(a, b)).toBe(
      "Objekt B belastet monatlich 753 Euro weniger, Objekt A baut über zehn Jahre 22.797 Euro mehr Vermögen auf.",
    );
  });

  it("fasst zusammen, wenn ein Objekt in beiden Punkten vorn liegt", () => {
    const a = mitEckwerten(-965.78, 118940);
    const b = mitEckwerten(-212.4, 141737);
    expect(einordnung(a, b)).toBe(
      "Objekt B belastet monatlich 753 Euro weniger und baut über zehn Jahre 22.797 Euro mehr Vermögen auf.",
    );
  });

  it("spricht von Einnahmen, wenn beide Objekte monatlich im Plus sind", () => {
    const a = mitEckwerten(120, 141737);
    const b = mitEckwerten(400, 118940);
    expect(einordnung(a, b)).toBe(
      "Objekt B bringt monatlich 280 Euro mehr ein, Objekt A baut über zehn Jahre 22.797 Euro mehr Vermögen auf.",
    );
  });

  it("meldet den vollständigen Gleichstand ohne Zahlen", () => {
    expect(einordnung(mitEckwerten(-500, 100000), mitEckwerten(-500, 100000))).toBe(
      "Beide Objekte belasten monatlich gleich viel und bauen über zehn Jahre dasselbe Vermögen auf.",
    );
  });

  it("meldet gleiche Belastung bei unterschiedlichem Vermögen", () => {
    expect(einordnung(mitEckwerten(-500, 100000), mitEckwerten(-500, 122797))).toBe(
      "Beide Objekte belasten monatlich gleich viel, Objekt B baut über zehn Jahre 22.797 Euro mehr Vermögen auf.",
    );
  });

  it("meldet gleiches Vermögen bei unterschiedlicher Belastung", () => {
    expect(einordnung(mitEckwerten(-965.78, 100000), mitEckwerten(-212.4, 100000))).toBe(
      "Objekt B belastet monatlich 753 Euro weniger, beim Vermögen nach zehn Jahren liegen beide gleich.",
    );
  });

  it("dreht die Aussage mit, wenn die Objekte getauscht werden", () => {
    const teuer = mitEckwerten(-965.78, 118940);
    const guenstig = mitEckwerten(-212.4, 141737);
    expect(einordnung(teuer, guenstig)).toContain("Objekt B belastet monatlich");
    expect(einordnung(guenstig, teuer)).toContain("Objekt A belastet monatlich");
  });

  it("liefert auch aus echten Rechenergebnissen einen vollständigen Satz", () => {
    const a = objekt({ ...basis, purchasePrice: 600000 });
    const b = objekt({ ...basis, purchasePrice: 300000 });
    expect(einordnung(a, b)).toMatch(
      /^Objekt B belastet monatlich [\d.]+ Euro weniger und baut über zehn Jahre [\d.]+ Euro mehr Vermögen auf\.$/,
    );
  });
});
