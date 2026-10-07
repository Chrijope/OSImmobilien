import { describe, it, expect } from "vitest";
import { investagonErgaenzung } from "./exposeInvestagon";

/**
 * Welche Investagon-Merkmale und -Angaben wo erscheinen, seit dem 24.09.2026.
 *
 * Der Befund bei Espanstraße 5: Das Haus hatte beim Import die Merkmalsliste
 * von Wohnung 11 bekommen, samt deren Etage. Das Exposé einer Wohnung mischte
 * beide Listen, beim Kunden standen zwei Etagen für eine Wohnung.
 */

const roh = (investagonRaw: Record<string, unknown>) => ({ meta: { investagonRaw } });

const haus = roh({
  tags: ["1. Fahrradkeller: vorhanden", "2. 3.OG Links", "Viele Klicks"],
  object_floor: "3. OG",
  object_share_owner: 4.2,
  object_balcony: true,
  object_building_year: 1962,
  heating_type: "gas",
});
const wohnung = roh({
  tags: ["1. Einbauküche: inklusive", "Erdgeschoss Links", "Viele ♡", "3.5% Afa", "Zimmer: 2.5"],
  object_floor: "EG",
});

describe("Merkmale je Ebene", () => {
  it("zeigt im Exposé einer Wohnung nur deren Merkmale, bereinigt", () => {
    const e = investagonErgaenzung({ objekt: haus, einheit: wohnung, ebene: "einheit" });
    expect(e.merkmale.map((m) => [m.bezeichnung, m.wert])).toEqual([
      ["1. Einbauküche", "inklusive"],
      ["Zimmer", "2,5"],
    ]);
  });

  it("zeigt im Exposé des Hauses nur die Merkmale des Objekts, bereinigt", () => {
    const e = investagonErgaenzung({ objekt: haus, einheit: null });
    expect(e.merkmale.map((m) => m.bezeichnung)).toEqual(["1. Fahrradkeller"]);
  });

  it("nummeriert fortlaufend mit Leerzeichen, auch wenn Investagon keins setzt (Befund 05.10.2026)", () => {
    const einheit = roh({ tags: ["1.Hoher Erhaltungsaufwand:45.000–55.000 €", "2.Erhöhte AfA:4.17 %", "3.500m von neuer U5 entfernt", "4.Küche und Möbel inklusive"] });
    const e = investagonErgaenzung({ objekt: haus, einheit, ebene: "einheit" });
    expect(e.merkmale.map((m) => [m.bezeichnung, m.wert])).toEqual([
      ["1. Hoher Erhaltungsaufwand", "45.000–55.000 €"],
      ["2. 500m von neuer U5 entfernt", ""],
      ["3. Küche und Möbel inklusive", ""],
    ]);
  });

  it("holt ohne geladene Einheit nicht stillschweigend die Merkmale des Hauses", () => {
    const e = investagonErgaenzung({ objekt: haus, einheit: null, ebene: "einheit" });
    expect(e.merkmale).toEqual([]);
  });
});

describe("Angaben, die nur zu einer Wohnung gehören", () => {
  it("nimmt Etage, Balkon und Miteigentumsanteil nie aus dem Datensatz des Hauses", () => {
    const hausExpose = investagonErgaenzung({ objekt: haus, einheit: null });
    const labels = hausExpose.zeilen.map((z) => z.label);
    expect(labels).not.toContain("Etage");
    expect(labels).not.toContain("Balkon");
    expect(labels).not.toContain("Miteigentumsanteil");
    // Angaben zum Gebäude bleiben.
    expect(hausExpose.zeilen).toContainEqual({ label: "Baujahr", wert: "1962" });
    expect(hausExpose.zeilen).toContainEqual({ label: "Heizung", wert: "Gas" });
  });

  it("zeigt im Exposé der Wohnung deren eigene Etage, nicht die des Hauses", () => {
    const e = investagonErgaenzung({ objekt: haus, einheit: wohnung, ebene: "einheit" });
    expect(e.zeilen.filter((z) => z.label === "Etage")).toEqual([{ label: "Etage", wert: "EG" }]);
    expect(e.zeilen.some((z) => z.label === "Miteigentumsanteil")).toBe(false);
  });
});
