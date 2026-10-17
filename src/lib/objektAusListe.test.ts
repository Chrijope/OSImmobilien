import { describe, expect, it } from "vitest";
import { einheitenAusBlatt, objektAusListe } from "./objektAusListe";
import type { Blatt } from "./excelLesen";

// Auszug im Aufbau von „Kaufpreisliste intern.xlsx“ (Brück), Werte 1:1, ohne Mieter.
const BLATT: Blatt = { name: "Intern", zeilen: [
  ["WE", "Status", "Fläche m²", "Ist-Miete mtl.", "Sollmiete mtl.", "Verkaufspreis", "Lage im Haus (Mieterliste 01/2026)", "Zimmer (Aufteilungsplan)"],
  ["WE 1", "vermietet", 65, 325, 650, 153500, "EG links", "2 + Terrasse"],
  ["WE 4", "Leerstand", 25, 0, 250, 65500, "1. OG mitte", "1"],
  ["WE 4", "", null, null, null, null, "(2. Garage)", ""],
  ["GESAMT", "", 90, 325, 900, 219000, "", ""],
] };

describe("Objekt aus Excel-Liste", () => {
  it("legt je WE eine Einheit an, ohne Summen- und Doppelzeilen", () => {
    const e = einheitenAusBlatt(BLATT, "ist");
    expect(e.map((w) => w.weNr)).toEqual(["WE 1", "WE 4"]);
    expect(e[0]).toMatchObject({ groesse: 65, vkGesamt: 153500, mieteGesamt: 325, zimmer: 2, lage: "EG links", vermietet: true, status: "frei" });
    expect(e[0].rendite).toBeCloseTo(2.54, 2);
    expect(e[1]).toMatchObject({ vermietet: false, vermietungsStatus: "leerstand", mieteGesamt: 0 });
    expect(e[0].dokumente).toHaveLength(8);
  });

  it("nimmt auf Wunsch die Sollmiete als Miete für den Vertrieb", () => {
    expect(einheitenAusBlatt(BLATT, "soll").map((w) => w.mieteGesamt)).toEqual([650, 250]);
  });

  it("legt das Objekt als unsichtbaren Entwurf mit Spannen an", () => {
    const o = objektAusListe({ titel: " Marktstraße 6 ", adresse: "Marktstraße 6", plz: "14822", ort: "Brück", mieteAus: "ist" }, einheitenAusBlatt(BLATT, "ist"), "u1");
    expect(o).toMatchObject({ titel: "Marktstraße 6", status: "entwurf", sichtbar: false, erstellt_von: "u1", preisVon: 65500, preisBis: 153500, groesseVon: 25, groesseBis: 65 });
    expect(o.dokumente.length).toBeGreaterThan(5);
  });
});
