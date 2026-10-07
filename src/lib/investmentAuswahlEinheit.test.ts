import { describe, it, expect } from "vitest";
import { einheitHinweisText, investmentBezugZurEinheit, vorwahlFuerEinheit } from "@/lib/investmentAuswahl";

/**
 * Investmentwahl im Rechner der Einheitenseite (24.09.2026).
 *
 * Vorher war dort nur ein Investment dieser Wohnung wählbar. Ein Vorgang in
 * der Objektauswahl hat aber noch keine Wohnung, und so kam die
 * Selbstauskunft nie in den Rechner.
 */
const einheit = { objektId: "o1", wohnungId: "w1" };

describe("investmentBezugZurEinheit", () => {
  it("erkennt das Investment dieser Wohnung", () => {
    expect(investmentBezugZurEinheit({ objektId: "o1", wohnungId: "w1" }, einheit)).toBe("passend");
  });
  it("lässt ein Investment ohne Objekt zu", () => {
    expect(investmentBezugZurEinheit({}, einheit)).toBe("ohneObjekt");
    expect(investmentBezugZurEinheit({ objektId: null, wohnungId: null }, einheit)).toBe("ohneObjekt");
  });
  it("sperrt andere Wohnungen, andere Objekte und das ganze Haus", () => {
    expect(investmentBezugZurEinheit({ objektId: "o1", wohnungId: "w2" }, einheit)).toBe("andereEinheit");
    expect(investmentBezugZurEinheit({ objektId: "o2", wohnungId: "w9" }, einheit)).toBe("andereEinheit");
    expect(investmentBezugZurEinheit({ objektId: "o1" }, einheit)).toBe("andereEinheit");
  });
  it("ohne Einheit ist alles passend", () => {
    expect(investmentBezugZurEinheit({ objektId: "o2", wohnungId: "w9" }, null)).toBe("passend");
  });
});

describe("vorwahlFuerEinheit", () => {
  it("nimmt das eine passende, auch wenn es eines ohne Objekt gibt", () => {
    expect(vorwahlFuerEinheit([{ id: "a", objektId: "o1", wohnungId: "w1" }, { id: "b" }], einheit)).toBe("a");
  });
  it("nimmt das eine Investment ohne Objekt, wenn es kein passendes gibt", () => {
    expect(vorwahlFuerEinheit([{ id: "x", objektId: "o2", wohnungId: "w2" }, { id: "b" }], einheit)).toBe("b");
  });
  it("wählt nicht von sich aus, wenn es mehrere gibt oder nur fremde", () => {
    expect(vorwahlFuerEinheit([{ id: "b" }, { id: "c" }], einheit)).toBeNull();
    expect(vorwahlFuerEinheit([{ id: "x", objektId: "o2", wohnungId: "w2" }], einheit)).toBeNull();
  });
});

describe("einheitHinweisText", () => {
  it("sagt beim gewählten Investment ohne Objekt, dass die Selbstauskunft zählt und nichts zugeordnet wird", () => {
    const text = einheitHinweisText("Otto Hans", [{ bezug: "ohneObjekt", gewaehlt: true }]);
    expect(text).toContain("Otto hat noch kein Investment für diese Wohnung");
    expect(text).toContain("Selbstauskunft");
    expect(text).toContain("nicht zugeordnet");
  });
  it("erklärt gesperrte Investments", () => {
    expect(einheitHinweisText("Otto Hans", [{ bezug: "andereEinheit", gewaehlt: false }])).toContain("gesperrt");
  });
  it("schweigt, wenn ein passendes Investment da ist und nichts gesperrt ist", () => {
    expect(einheitHinweisText("Otto Hans", [{ bezug: "passend", gewaehlt: true }])).toBe("");
  });
  it("enthält keinen Gedankenstrich", () => {
    const text = einheitHinweisText("Otto Hans", [{ bezug: "andereEinheit", gewaehlt: false }]);
    expect(text).not.toMatch(/[–—]/);
  });
});
