import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { berechneInvestment, standardEingabe, type InvestmentEingabe } from "@/lib/investmentrechner/rechenkern";
import { leereUnterlagenDaten } from "@/lib/investmentrechner/unterlagenAuslesen";
import { ExposeDokument, type ExposeObjekt } from "./ExposeDokument";
import { Cashflowtabelle, Steuertabelle } from "./Tabellen";

/*
 * Die Jahrestabellen auf der Exposé-Seite „Jahresprognose" waren am rechten
 * Rand angeschnitten: Die letzte Spalte fehlte, die Überschrift brach mitten
 * im Wort ab. Ursache war, dass sich die Tabellenbreite nach dem Inhalt
 * richtete. Wurde der Text breiter als gedacht, wuchs die Tabelle über die
 * A4-Seite hinaus, und weil die Seite `overflow: hidden` hat, verschwand der
 * Überstand ohne Warnung.
 *
 * Am 22.09.2026 kam dasselbe in der Analyse ans Licht: Dort galt die feste
 * Breite noch nicht, und die Spalte „Eigenkapital" lag hinter der Kartenkante.
 * Seither hängt die Regel an `.table-scroll`, also an beiden Ansichten.
 *
 * Dieser Test prüft nicht das Aussehen, sondern die Rechnung dahinter: Die
 * Spalten teilen sich feste Anteile der Seitenbreite, und diese Anteile
 * ergeben zusammen genau die Seite, nie mehr. Er schlägt an, sobald jemand
 * `table-layout: fixed` entfernt, die Anteile verstellt oder eine Spalte
 * ergänzt, ohne die Breiten nachzuziehen.
 */

const CSS = readFileSync(resolve(process.cwd(), "src/styles/investmentrechner.css"), "utf8");

/** Maße der Exposé-Seite aus dem Stylesheet, in Millimetern. */
const SEITE_MM = 210;
const SEITENRAND_MM = 14;
const NUTZBAR_MM = SEITE_MM - 2 * SEITENRAND_MM;

/** Liest den in Prozent angegebenen Wert einer `width`-Regel aus dem Stylesheet. */
function breiteProzent(auswahl: string): number {
  const block = CSS.split("}")
    .map((teil) => teil.trim())
    .find((teil) => teil.includes(auswahl) && /width:\s*[\d.]+%/.test(teil));
  expect(block, `Keine Prozentbreite für ${auswahl} gefunden`).toBeTruthy();
  return Number(block!.match(/width:\s*([\d.]+)%/)![1]);
}

function exposeObjekt(): ExposeObjekt {
  const input: InvestmentEingabe = {
    ...standardEingabe,
    clientName: "Familie Muster",
    propertyTitle: "4 WG München",
    taxableIncomeCustomer: 320000,
    purchasePrice: 1850000,
    monthlyColdRent: 6400,
    monthlyOperatingCosts: 780,
    equity: 260000,
    furniturePrice: 45000,
    rehabExpense: 120000,
  };
  return { input, result: berechneInvestment(input), photos: [], documents: [], documentData: leereUnterlagenDaten };
}

/** Spaltenbreiten einer Tabelle in Millimetern, aus den Anteilen im Stylesheet. */
function spaltenbreiten(anzahlSpalten: number, festeAnteile: Record<number, number>): number[] {
  const festeSumme = Object.values(festeAnteile).reduce((summe, anteil) => summe + anteil, 0);
  const freieSpalten = anzahlSpalten - Object.keys(festeAnteile).length;
  const restAnteil = (100 - festeSumme) / freieSpalten;
  return Array.from({ length: anzahlSpalten }, (_, index) => {
    const anteil = festeAnteile[index + 1] ?? restAnteil;
    return (anteil / 100) * NUTZBAR_MM;
  });
}

/*
  Ohne eine `@page`-Regel entscheidet der Browser allein, auf welches Papier er
  druckt. Gemessen am 21.09.2026 mit Chrome: Das erzeugte PDF war
  215,9 x 279,4 mm, also US Letter, nicht A4. Unsere Seite ist 210 x 297 mm
  und passte damit nicht aufs Blatt. Rechts fehlte die letzte Spalte.

  Mit der Regel misst dasselbe PDF 209,9 x 297,0 mm, also genau A4.
*/
describe("Das Papier, auf dem gedruckt wird", () => {
  it("steht im Stylesheet und ist A4 im Hochformat, ohne zusätzlichen Rand", () => {
    const regel = /@page\s*\{([^}]*)\}/.exec(CSS);
    expect(regel, "@page-Regel fehlt").not.toBeNull();
    expect(regel![1]).toMatch(/size:\s*A4\s+portrait/);
    // margin: 0 heisst nicht randlos: Die Seite bringt ihre 14mm selbst mit.
    expect(regel![1]).toMatch(/margin:\s*0/);
  });
});

describe("Jahrestabellen im Exposé", () => {
  it("bekommen eine feste Tabellenbreite, damit sie nie über die Seite hinauslaufen", () => {
    expect(CSS).toMatch(/\.table-scroll:not\(\.compare-table\) table \{\s*table-layout: fixed;/);
    // Die Vergleichstabelle bleibt bewusst inhaltsabhängig, ihre erste Spalte
    // trägt die Bezeichnungen.
    expect(CSS).not.toMatch(/\.compare-table table \{\s*table-layout: fixed/);
  });

  it("haben die Spaltenzahl, für die die Breiten im Stylesheet gerechnet sind", () => {
    const { container } = render(<ExposeDokument {...exposeObjekt()} />);
    const tabellen = Array.from(container.querySelectorAll<HTMLTableElement>(".table-page table"));
    expect(tabellen).toHaveLength(2);
    expect(tabellen[0].querySelectorAll("thead th")).toHaveLength(9);
    expect(tabellen[1].querySelectorAll("thead th")).toHaveLength(7);
    // Die Sonderbreite im Stylesheet hängt an der fünften Spalte der
    // AfA-Tabelle. Steht dort etwas anderes, greift sie an der falschen Stelle.
    const afaKopf = Array.from(tabellen[1].querySelectorAll("thead th")).map((zelle) => zelle.textContent);
    expect(afaKopf[4]).toBe("Erhaltungsaufwand");
  });

  it("füllen die Seitenbreite genau aus und lassen jeder Spalte genug Platz", () => {
    const jahresspalte = breiteProzent(".table-scroll:not(.compare-table) td:first-child");
    const erhaltungsspalte = breiteProzent(".tax-table td:nth-child(5)");

    const cashflow = spaltenbreiten(9, { 1: jahresspalte });
    const afa = spaltenbreiten(7, { 1: jahresspalte, 5: erhaltungsspalte });

    for (const [name, breiten] of [
      ["Cashflow & Eigenkapital", cashflow],
      ["AfA & steuerliche Auswirkung", afa],
    ] as const) {
      const summe = breiten.reduce((gesamt, breite) => gesamt + breite, 0);
      // Genau die nutzbare Seitenbreite: kein Überstand, der abgeschnitten
      // werden könnte, und kein verschenkter Rand.
      expect(summe, `${name}: Summe der Spaltenbreiten`).toBeCloseTo(NUTZBAR_MM, 6);
      /*
        Untergrenze für eine Geldspalte. 18 mm reichen bei 0,44 rem für einen
        Betrag wie „26.226 €" samt Innenabstand. Die Überschriften dürfen
        umbrechen, die Beträge nicht.
      */
      expect(Math.min(...breiten.slice(1)), `${name}: schmalste Geldspalte`).toBeGreaterThanOrEqual(18);
      expect(breiten[0], `${name}: Jahresspalte`).toBeGreaterThanOrEqual(10);
    }

    expect(afa[4], "Spalte Erhaltungsaufwand").toBeGreaterThanOrEqual(26);
  });
});

/*
  Die Analyse zeigt dieselben Jahre wie das Exposé, nur ohne `compact` und in
  einer Karte statt auf Papier. Christian am 22.09.2026: „Eigenkapital" stand
  dort halb hinter der Kartenkante. Sichtbar abgeschnitten war die Spalte
  nicht, `.table-scroll` schiebt sie seitlich weg, aber der Bildlauf dafür ist
  unter macOS unsichtbar, solange niemand scrollt.

  Geprüft wird deshalb beides: dass die Tabellen der Analyse unter dieselbe
  Regel fallen wie die des Exposés, und dass ihre Schrift eigene, kleinere
  Werte bekommt. Ohne die zweite Regel passen neun Spalten erst ab einer
  Kartenbreite von 700 Bildpunkten, mit ihr ab 620.
*/
describe("Die Jahrestabellen in der Analyse", () => {
  it("tragen denselben Rahmen wie die des Exposés, nur ohne `compact`", () => {
    const jahre = berechneInvestment(standardEingabe).years;
    for (const [name, element] of [
      ["Cashflow", <Cashflowtabelle years={jahre} />],
      ["Steuer", <Steuertabelle years={jahre} />],
    ] as const) {
      const { container } = render(element);
      const rahmen = container.querySelector(".table-scroll");
      expect(rahmen, `${name}: Rahmen fehlt`).toBeTruthy();
      // Greift die Regel nicht, richtet sich die Breite wieder nach dem Inhalt.
      expect(rahmen!.classList.contains("compare-table"), `${name}: darf nicht als Vergleich gelten`).toBe(false);
      expect(rahmen!.classList.contains("compact-table"), `${name}: ist die Bildschirmfassung`).toBe(false);
    }
  });

  it("bekommen am Bildschirm ihre eigene, kleinere Schrift", () => {
    const bildschirm = ".table-scroll:not(.compare-table):not(.compact-table)";
    expect(CSS).toContain(`${bildschirm} th,`);
    // Kleiner als die 0.7rem der übrigen Tabellen im Rechner, sonst reicht der
    // Platz in einer schmalen Karte nicht für den längsten Betrag.
    const block = CSS.split("}").find((teil) => teil.includes(`${bildschirm} th,`) && teil.includes("font-size"));
    expect(block, "Block mit der Bildschirmschrift fehlt").toBeTruthy();
    const groesse = Number(block!.match(/font-size:\s*([\d.]+)rem/)![1]);
    expect(groesse).toBeLessThan(0.7);
    expect(groesse).toBeGreaterThanOrEqual(0.6);
  });

  it("scrollen erst auf schmalen Geräten, statt die Spalten zu quetschen", () => {
    // Neun Spalten auf einem Handy ergeben 37 Bildpunkte je Spalte, da steht
    // keine Zahl mehr lesbar drin. Das Exposé behält seine feste Breite.
    expect(CSS).toMatch(
      /@media \(max-width: 880px\) \{\s*\.investmentrechner \.table-scroll:not\(\.compare-table\):not\(\.compact-table\) table \{\s*table-layout: auto;/
    );
  });
});
