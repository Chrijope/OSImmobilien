import { describe, it, expect } from "vitest";
import { investmentAuswahlStand, investmentBeschriftung } from "@/lib/investmentAuswahl";

/**
 * Die Auswahl des Investments vor jeder kundenbezogenen Berechnung.
 *
 * Geprüft werden genau die drei Fälle, die der Nutzer erlebt: Der Kunde hat
 * kein Investment, er hat genau eines, er hat mehrere.
 */

const inv = (id: string, nummer: number, rest: Record<string, unknown> = {}) =>
  ({ id, nummer, ...rest }) as Parameters<typeof investmentAuswahlStand>[1][number];

describe("investmentAuswahlStand", () => {
  it("bleibt ohne Kunden im allgemeinen Modus", () => {
    expect(investmentAuswahlStand(null, [], null)).toEqual({ art: "ohneKunde" });
    expect(investmentAuswahlStand("", [inv("i1", 1)], "i1")).toEqual({ art: "ohneKunde" });
  });

  it("meldet, wenn der Kunde noch kein Investment hat", () => {
    expect(investmentAuswahlStand("k1", [], null)).toEqual({ art: "keineInvestments" });
    expect(investmentAuswahlStand("k1", null, null)).toEqual({ art: "keineInvestments" });
  });

  it("setzt ein einziges Investment ohne Rückfrage, benennt es aber", () => {
    const stand = investmentAuswahlStand("k1", [inv("i1", 1, { objektTitel: "Alexanderstr. 30" })], null);
    expect(stand).toMatchObject({
      art: "gewaehlt",
      investmentId: "i1",
      bezeichnung: "Investment 1, Alexanderstr. 30",
      einziges: true,
    });
  });

  it("verlangt bei mehreren Investments eine Wahl", () => {
    const stand = investmentAuswahlStand("k1", [inv("i1", 1), inv("i2", 2)], null);
    expect(stand.art).toBe("wahlNoetig");
    if (stand.art !== "wahlNoetig") throw new Error("falscher Stand");
    expect(stand.optionen.map((o) => o.id)).toEqual(["i1", "i2"]);
  });

  it("nimmt bei mehreren Investments die getroffene Wahl", () => {
    const stand = investmentAuswahlStand("k1", [inv("i1", 1), inv("i2", 2)], "i2");
    expect(stand).toMatchObject({ art: "gewaehlt", investmentId: "i2", einziges: false });
  });

  it("verwirft eine Wahl, die es beim Kunden gar nicht gibt", () => {
    // Etwa eine alte Investment-Nummer aus der Adresszeile. Sie darf nicht
    // stillschweigend mit den Zahlen eines anderen Vorgangs rechnen.
    const stand = investmentAuswahlStand("k1", [inv("i1", 1), inv("i2", 2)], "fremd");
    expect(stand.art).toBe("wahlNoetig");
  });
});

describe("investmentBeschriftung", () => {
  it("nennt Objekt und Wohnung, wenn sie bekannt sind", () => {
    expect(investmentBeschriftung({ id: "i1", nummer: 2, objektTitel: "Amadio", weNr: "6" }))
      .toBe("Investment 2, Amadio, WE 6");
  });

  it("nimmt einen eigenen Namen statt der Nummer", () => {
    expect(investmentBeschriftung({ id: "i1", nummer: 2, label: "Zweitkauf Nürnberg" }))
      .toBe("Zweitkauf Nürnberg");
  });
});
