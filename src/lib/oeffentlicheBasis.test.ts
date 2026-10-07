import { describe, expect, it } from "vitest";
import { OEFFENTLICHE_BASIS, oeffentlicheAdresse, terminToken } from "./oeffentlicheBasis";

describe("oeffentlicheAdresse", () => {
  it("zeigt immer auf die veröffentlichte Adresse, nie auf die Vorschau", () => {
    expect(oeffentlicheAdresse("/raum/abc")).toBe(`${OEFFENTLICHE_BASIS}/raum/abc`);
    expect(oeffentlicheAdresse("termin/xyz")).toBe(`${OEFFENTLICHE_BASIS}/termin/xyz`);
  });
});

describe("terminToken", () => {
  it("baut einen lesbaren Schlüssel aus Ereignis und Zufallsteil", () => {
    const token = terminToken("Beratungsgespräch");
    expect(token).toMatch(/^beratungsgespraech-[0-9a-f]{16}$/);
  });

  it("bereinigt Sonderzeichen und Umlaute", () => {
    expect(terminToken("Finanzierungsgespräch (60 Min.)")).toMatch(/^finanzierungsgespraech-60-min-[0-9a-f]{16}$/);
    expect(terminToken("Straßen-Termin")).toMatch(/^strassen-termin-[0-9a-f]{16}$/);
  });

  it("bleibt ohne brauchbares Ereignis ein reiner Zufallsschlüssel", () => {
    expect(terminToken("???")).toMatch(/^[0-9a-f]{16}$/);
  });

  it("erzeugt jedes Mal einen anderen Schlüssel", () => {
    expect(terminToken("beratung")).not.toBe(terminToken("beratung"));
  });
});
