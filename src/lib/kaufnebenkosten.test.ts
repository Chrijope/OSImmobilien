import { describe, expect, it } from "vitest";
import { nebenkostenBasis } from "./kaufnebenkosten";

/* Die gemeinsame Regel seit dem 30.09.2026: Kaufnebenkosten ohne Erhaltungsaufwand und ohne Möbel. */
describe("nebenkostenBasis", () => {
  it("zieht den Erhaltungsaufwand vom Gesamtkaufpreis ab", () => {
    expect(nebenkostenBasis(300000, 40000, 0)).toBe(260000);
  });

  it("lässt den Gesamtkaufpreis ohne Aufwand unverändert", () => {
    expect(nebenkostenBasis(300000, 0, 0)).toBe(300000);
  });

  it("deckelt einen Aufwand über dem Gesamtkaufpreis auf null statt negativ", () => {
    expect(nebenkostenBasis(300000, 400000, 0)).toBe(0);
  });

  it("behandelt negative und ungültige Werte als null", () => {
    expect(nebenkostenBasis(300000, -5000, 0)).toBe(300000);
    expect(nebenkostenBasis(-1000, 500, 0)).toBe(0);
    expect(nebenkostenBasis(Number.NaN, 500, 0)).toBe(0);
    expect(nebenkostenBasis(300000, Number.NaN, 0)).toBe(300000);
    expect(nebenkostenBasis(0, 0, 0)).toBe(0);
  });

  it("zieht auch die Möbel ab: Christians Beispiel vom 30.09.2026", () => {
    // 300.000 inkl. 20.000 Erhaltungsaufwand und 15.000 Möbel.
    const basis = nebenkostenBasis(300000, 20000, 15000);
    expect(basis).toBe(265000);
    // 3,5 % Grunderwerbsteuer, 1,0 % Notar, 0,5 % Grundbuch.
    expect((basis * 5) / 100).toBe(13250);
  });

  it("deckelt Aufwand und Möbel zusammen auf den Gesamtkaufpreis", () => {
    expect(nebenkostenBasis(300000, 200000, 150000)).toBe(0);
    expect(nebenkostenBasis(300000, 0, -15000)).toBe(300000);
    expect(nebenkostenBasis(300000, 0, Number.NaN)).toBe(300000);
  });
});
