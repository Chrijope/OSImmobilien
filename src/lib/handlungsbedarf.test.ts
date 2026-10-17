import { describe, expect, it } from "vitest";
import { handlungsbedarf, potenzialMonat, type HandlungsEingabe } from "./handlungsbedarf";
import { sortiere } from "@/lib/sortierung";

const basis: HandlungsEingabe = {
  verkauft: false, istMiete: 325, mieterGekuendigt: false, sollMiete: 650, mieteVertrieb: 325, befristetBis: "",
  naechsteErhoehungAb: "", naechsteErhoehungMiete: null, eigentuemerlast: 77.8, garageFrei: false, garantieMonat: null, fehlendeUnterlagen: 0,
};

describe("Handlungsbedarf je Einheit", () => {
  it("Brück WE 1: Miete 325 € unter Soll 650 € ergibt 325 € Potenzial", () => {
    const h = handlungsbedarf(basis, "2026-10-17");
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ art: "potenzial", betragMonat: 325 });
  });

  it("meldet Leerstand, baldige Erhöhung, Befristung und fehlende Unterlagen", () => {
    expect(handlungsbedarf({ ...basis, istMiete: null }, "2026-10-17")[0].text).toMatch(/Kein Mieter.*650/);
    const h = handlungsbedarf({ ...basis, sollMiete: null, naechsteErhoehungAb: "2027-01-01", naechsteErhoehungMiete: 390, befristetBis: "2027-03-31", fehlendeUnterlagen: 3 }, "2026-10-17");
    expect(h.map((x) => x.art)).toEqual(["termin", "termin", "unterlagen"]);
    expect(potenzialMonat(h)).toBe(65);
    // Termine nach sechs Monaten sind noch nicht „bald“.
    expect(handlungsbedarf({ ...basis, sollMiete: null, naechsteErhoehungAb: "2028-09-01" }, "2026-10-17")).toEqual([]);
  });

  it("warnt, wenn die Eigentümerlast die Miete nicht deckt, und schweigt bei verkauften Einheiten", () => {
    expect(handlungsbedarf({ ...basis, sollMiete: null, istMiete: 60, eigentuemerlast: 77.8 }, "2026-10-17")[0].art).toBe("risiko");
    expect(handlungsbedarf({ ...basis, verkauft: true, istMiete: null }, "2026-10-17")).toEqual([]);
  });
});

describe("Sortieren der Listen", () => {
  const zeilen = [{ we: "WE 10", wert: 5 }, { we: "WE 2", wert: null }, { we: "WE 1", wert: 7 }];
  it("sortiert WE-Nummern natürlich und lässt leere Werte unten", () => {
    expect(sortiere(zeilen, (z) => z.we, "auf").map((z) => z.we)).toEqual(["WE 1", "WE 2", "WE 10"]);
    expect(sortiere(zeilen, (z) => z.wert, "ab").map((z) => z.we)).toEqual(["WE 1", "WE 10", "WE 2"]);
    expect(sortiere(zeilen, (z) => z.wert, "auf").map((z) => z.we)).toEqual(["WE 10", "WE 1", "WE 2"]);
  });
});
