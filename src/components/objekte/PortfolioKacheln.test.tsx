import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PortfolioKacheln } from "./PortfolioKacheln";

/**
 * Die Anordnung der Portfolio-Kacheln (Christians Wunsch vom 23.09.2026).
 *
 * Auf breiten Bildschirmen (ab xl) vier Spalten: vorn die vier kleinen
 * Kacheln als 2 mal 2, dahinter Anlageklassen und Bauzustand ueber die volle
 * Hoehe. Ab sm zwei Spalten, auf dem Handy eine. Das Aussehen selbst laesst
 * sich in jsdom nicht messen, geprueft werden deshalb die Rasterklassen und
 * die Reihenfolge im DOM. Die Zahlen prueft `objektKlassen.test.ts`.
 */

const obj = (o: Record<string, unknown>) => ({ wohnungen: [], ...o }) as never;
const we = (id: string, vkGesamt: number) => ({ id, vkGesamt });

const BESTAND = [
  obj({
    id: "a", meta: { anlageklasse: "WG-Wohnung" }, globalDaten: { zustand: "Neubau" },
    wohnungen: [we("a1", 250000), we("a2", 300000)],
  }),
  obj({
    id: "b", meta: { anlageklasse: "Kapitalanlage" }, globalDaten: { zustand: "Kernsanierung" },
    wohnungen: [we("b1", 400000)],
  }),
  // Ohne Anlageklasse: Die Kachel muss das ausweisen, nicht verschweigen.
  obj({ id: "c", globalDaten: { zustand: "Neubau" }, wohnungen: [we("c1", 200000)] }),
];

const KLEINE = ["Einheiten gesamt", "Portfoliowert", "Kaufpreis je Einheit", "Vermarktungsart"];

const klassen = (el: Element) => el.className.split(/\s+/);

/** Die Kachel mit diesem Titel. */
const kachel = (titel: string) => screen.getByText(titel).closest("[data-ui='card']") as HTMLElement;

/** Der Titel einer Kachel, also ihre erste Zeile. */
const titelVon = (el: Element) => el.querySelector("p")?.textContent;

function zeige(objekte: never[]) {
  const { container } = render(<PortfolioKacheln objekte={objekte} />);
  return container.firstElementChild as HTMLElement;
}

describe("Portfolio-Kacheln: Anordnung", () => {
  it("stellt die vier kleinen als 2 mal 2 vorn und die beiden grossen dahinter", () => {
    const raster = zeige(BESTAND);
    expect(klassen(raster)).toEqual(expect.arrayContaining(["grid", "grid-cols-1", "sm:grid-cols-2", "xl:grid-cols-4"]));

    const [gruppe, anlage, bau, ...rest] = [...raster.children];
    expect(rest).toHaveLength(0);

    // Die Gruppe der kleinen belegt ab sm zwei Spalten und fuellt sich
    // spaltenweise: links Einheiten und Portfoliowert, rechts Kaufpreis und
    // Vermarktungsart. Auf dem Handy bleibt es bei einer Spalte.
    expect(klassen(gruppe)).toEqual(expect.arrayContaining([
      "grid", "grid-cols-1", "sm:col-span-2", "sm:grid-cols-2", "sm:grid-rows-2", "sm:grid-flow-col",
    ]));
    expect([...gruppe.children].map(titelVon)).toEqual(KLEINE);

    // Die grossen stehen direkt im aeusseren Raster, je eine Spalte breit.
    expect(anlage).toBe(kachel("Anlageklassen"));
    expect(bau).toBe(kachel("Bauzustand"));
    expect(anlage.className).not.toMatch(/col-span/);
    expect(bau.className).not.toMatch(/col-span/);
  });

  it("laesst die Inhalte der Kacheln unveraendert, samt Hinweis ohne Angabe", () => {
    zeige(BESTAND);
    expect(kachel("Einheiten gesamt").textContent).toContain("in 3 Objekten");
    expect(kachel("Portfoliowert").textContent).toContain("Summe aller Einheiten");
    expect(kachel("Kaufpreis je Einheit").textContent).toContain("günstigste bis teuerste");
    const anlage = kachel("Anlageklassen");
    expect(anlage.textContent).toContain("WG-Wohnung");
    expect(anlage.textContent).toContain("Kapitalanlage");
    expect(anlage.textContent).toContain("1 ohne Angabe");
    const bau = kachel("Bauzustand");
    expect(bau.textContent).toContain("Neubau");
    expect(bau.textContent).toContain("Kernsanierung");
  });

  it("nimmt ohne Bauzustand drei Spalten, damit rechts keine leer bleibt", () => {
    const ohneBau = BESTAND.map((o) => ({ ...(o as object), globalDaten: {} }) as never);
    const raster = zeige(ohneBau);
    expect(klassen(raster)).toContain("xl:grid-cols-3");
    expect(klassen(raster)).not.toContain("xl:grid-cols-4");
    expect(screen.queryByText("Bauzustand")).toBeNull();

    const [gruppe, anlage, ...rest] = [...raster.children];
    expect(rest).toHaveLength(0);
    expect([...gruppe.children].map(titelVon)).toEqual(KLEINE);
    // Ab sm allein in ihrer Zeile, deshalb volle Breite; ab xl die dritte Spalte.
    expect(klassen(anlage)).toEqual(expect.arrayContaining(["sm:col-span-2", "xl:col-span-1"]));
  });

  it("zeigt ohne Objekte gar nichts", () => {
    const { container } = render(<PortfolioKacheln objekte={[]} />);
    expect(container.firstElementChild).toBeNull();
  });
});
