import { describe, expect, it } from "vitest";
import { SPALTEN, spaltenName } from "./objektdatenSpalten";

describe("Spaltennamen der Einheitenliste", () => {
  it("nimmt den Anzeigenamen, sonst den Schlüssel", () => {
    expect(spaltenName("Brutto Ist")).toBe("Rendite brutto Ist");
    expect(spaltenName("WE")).toBe("WE");
  });

  it("vergibt keinen Anzeigenamen doppelt", () => {
    const namen = Object.keys(SPALTEN).map(spaltenName);
    expect(new Set(namen).size).toBe(namen.length);
  });
});
