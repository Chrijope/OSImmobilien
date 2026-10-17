import { describe, expect, it } from "vitest";
import { bruttoRendite, nettoRendite } from "./renditeBruttoNetto";

describe("Brutto- und Nettorendite", () => {
  it("Brück WE 1: 325 € Miete, 153.500 € Kaufpreis ergibt brutto 2,54 %", () => {
    expect(bruttoRendite(325, 153500)).toBeCloseTo(0.025407, 6);
  });

  it("Netto zieht nicht umlagefähiges Hausgeld und Rücklage ab und rechnet Kaufnebenkosten dazu", () => {
    // (650 − 49,35 − 28,45) × 12 / (153.500 × 1,085)
    const r = nettoRendite({ kaltmieteMonat: 650, kaufpreis: 153500, nichtUmlagefaehigMonat: 49.35, ruecklageMonat: 28.45, kaufnebenkostenProzent: 8.5 });
    expect(r).toBeCloseTo((572.2 * 12) / 166547.5, 8);
  });

  it("bleibt leer ohne Miete oder Kaufpreis", () => {
    expect(bruttoRendite(0, 100000)).toBeNull();
    expect(nettoRendite({ kaltmieteMonat: 500, kaufpreis: 0, nichtUmlagefaehigMonat: 0, ruecklageMonat: 0, kaufnebenkostenProzent: 8 })).toBeNull();
  });
});
