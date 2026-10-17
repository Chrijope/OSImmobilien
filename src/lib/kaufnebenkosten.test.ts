import { describe, expect, it } from "vitest";
import { BUNDESLAND_NK as AFA_NK, bundeslandFromPlz as afaBundeslandFromPlz } from "./afaRechnung";
import { DEFAULT_GREST_P } from "./bundeslandGrEst";
import { kaufnebenkostenProzent, KAUFNEBENKOSTEN_HOECHSTSATZ, NOTAR_GRUNDBUCH_PROZENT } from "./grunderwerbsteuer";
import { BUNDESLAND_NK, GRUNDBUCH_PROZENT, kaufnebenkostenPct, nebenkostenBasis, NOTAR_PROZENT } from "./kaufnebenkosten";
import { standardEingabe } from "./investmentrechner/rechenkern";

/*
 * Die verbindlichen Sätze vom 16.10.2026, finanzierter Kauf ohne Makler:
 * Berlin 6,0 + 1,5 + 0,5 = 8,0 Prozent, Brandenburg 6,5 + 1,5 + 0,5 = 8,5 Prozent.
 * Alle Quellen im CRM müssen dasselbe liefern.
 */
describe("Kaufnebenkosten Berlin und Brandenburg", () => {
  it("Notar 1,5 und Grundbuch 0,5 Prozent, in beiden zentralen Dateien gleich", () => {
    expect(NOTAR_PROZENT).toBe(1.5);
    expect(GRUNDBUCH_PROZENT).toBe(0.5);
    expect(NOTAR_PROZENT + GRUNDBUCH_PROZENT).toBe(NOTAR_GRUNDBUCH_PROZENT);
  });

  it("Berlin 8,0 und Brandenburg 8,5 Prozent in jeder Quelle", () => {
    const satz = (liste: { value: string; pct: number }[], wert: string) => liste.find((b) => b.value === wert)?.pct;
    expect(satz(BUNDESLAND_NK, "berlin")).toBe(8);
    expect(satz(BUNDESLAND_NK, "brandenburg")).toBe(8.5);
    expect(satz(AFA_NK, "berlin")).toBe(8);
    expect(satz(AFA_NK, "brandenburg")).toBe(8.5);
    expect(kaufnebenkostenProzent("be")).toBe(8);
    expect(kaufnebenkostenProzent("bb")).toBe(8.5);
    expect(kaufnebenkostenPct({ plz: "10115" })).toBe(8);
    expect(kaufnebenkostenPct({ plz: "14199" })).toBe(8);
    // Potsdam und Schwielowsee liegen im Postleitzahlbereich 14, aber in Brandenburg.
    expect(kaufnebenkostenPct({ plz: "14467" })).toBe(8.5);
    expect(kaufnebenkostenPct({ plz: "14548" })).toBe(8.5);
    expect(afaBundeslandFromPlz("14548")).toBe("brandenburg");
    expect(afaBundeslandFromPlz("14050")).toBe("berlin");
  });

  it("ohne bekanntes Bundesland gilt Brandenburg", () => {
    expect(kaufnebenkostenProzent(null)).toBe(8.5);
    expect(DEFAULT_GREST_P).toBe(6.5);
    expect(KAUFNEBENKOSTEN_HOECHSTSATZ).toBe(8.5);
    const r = standardEingabe;
    expect(r.transferTaxRate + r.notaryRate + r.landRegisterRate).toBe(8.5);
  });
});

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
    // Brandenburg: 6,5 % Grunderwerbsteuer, 1,5 % Notar, 0,5 % Grundbuch.
    expect((basis * 8.5) / 100).toBe(22525);
  });

  it("deckelt Aufwand und Möbel zusammen auf den Gesamtkaufpreis", () => {
    expect(nebenkostenBasis(300000, 200000, 150000)).toBe(0);
    expect(nebenkostenBasis(300000, 0, -15000)).toBe(300000);
    expect(nebenkostenBasis(300000, 0, Number.NaN)).toBe(300000);
  });
});
