import { describe, expect, it } from "vitest";
import { konzeptLesen, konzeptPasst, konzeptRang, nachKonzept, schwerpunktAusSkript, schwerpunktLesen } from "./objektKonzept";
import { dbRowToObjekt, objektToDbRow } from "./objekteStore";

describe("Konzept am Objekt", () => {
  it("liest nur die drei erlaubten Werte", () => {
    expect(konzeptLesen("steuer")).toBe("steuer");
    expect(konzeptLesen("Steuer")).toBeUndefined();
    expect(konzeptLesen(undefined)).toBeUndefined();
  });

  it("läuft ohne die Spalte und schreibt sie nie mit dem Objekt", () => {
    const ohne = dbRowToObjekt({ id: "o1", titel: "A" }, [], [], []);
    expect(ohne.konzept).toBeUndefined();
    const mit = dbRowToObjekt({ id: "o1", titel: "A", konzept: "zusatzrente" }, [], [], []);
    expect(mit.konzept).toBe("zusatzrente");
    expect("konzept" in objektToDbRow(mit)).toBe(false);
  });
});

describe("Schwerpunkt des Kunden", () => {
  it("liest den Schwerpunkt tolerant aus dem Skript", () => {
    expect(schwerpunktAusSkript({ antworten: { schwerpunkt: "steuer" } })).toBe("steuer");
    expect(schwerpunktAusSkript({ antworten: { schwerpunkt: "Zusätzliche Rente" } })).toBe("zusatzrente");
    expect(schwerpunktAusSkript({ antworten: { schwerpunkt: ["Rente", "Steuern sparen"] } })).toBe("beides");
    expect(schwerpunktAusSkript({ antworten: {} })).toBeUndefined();
    expect(schwerpunktAusSkript(null)).toBeUndefined();
    expect(schwerpunktLesen(42)).toBeUndefined();
  });
});

describe("Filter und Sortierung nach Konzept", () => {
  const liste = [
    { id: "zossen", konzept: "beides" as const },
    { id: "ohne", konzept: undefined },
    { id: "hauff", konzept: "zusatzrente" as const },
    { id: "barfus", konzept: "steuer" as const },
  ];
  const von = (e: (typeof liste)[number]) => e.konzept;

  it("ordnet passend, teilweise, ungepflegt, unpassend", () => {
    expect(nachKonzept(liste, von, "steuer", "zuerst").map((e) => e.id)).toEqual(["barfus", "zossen", "ohne", "hauff"]);
    expect(konzeptRang("beides", "zusatzrente")).toBe(1);
  });

  it("filtert auf genau und teilweise passende", () => {
    expect(nachKonzept(liste, von, "zusatzrente", "nur").map((e) => e.id)).toEqual(["zossen", "hauff"]);
    expect(konzeptPasst(undefined, "steuer")).toBe(false);
  });

  it("ändert ohne Schwerpunkt oder im Modus aus nichts", () => {
    expect(nachKonzept(liste, von, undefined, "nur")).toBe(liste);
    expect(nachKonzept(liste, von, "steuer", "aus")).toBe(liste);
  });
});
