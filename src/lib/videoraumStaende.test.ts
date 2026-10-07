import { describe, it, expect } from "vitest";
import { STAND_AN, entferneAbwesende, uebernehmeStand, type Staende } from "./videoraumStaende";

/**
 * Ton und Kamera der anderen. Stimmt das nicht, steht in der Kachel „Kamera
 * ist aus", waehrend der Kunde laengst zu sehen ist, oder umgekehrt.
 */
describe("videoraumStaende", () => {
  it("nimmt eine erste Meldung auf, ohne den anderen Wert zu verlieren", () => {
    const neu = uebernehmeStand({}, "gast-a", "tonstand", false);
    expect(neu["gast-a"]).toEqual({ tonAn: false, bildAn: true });
  });

  it("merkt beide Werte nacheinander", () => {
    let staende: Staende = {};
    staende = uebernehmeStand(staende, "gast-a", "tonstand", false);
    staende = uebernehmeStand(staende, "gast-a", "bildstand", false);
    expect(staende["gast-a"]).toEqual({ tonAn: false, bildAn: false });
  });

  it("gibt dieselbe Sammlung zurück, wenn sich nichts ändert", () => {
    // Sonst zeichnete React bei jeder eingehenden Meldung neu, auch wenn sie
    // nur bestätigt, was ohnehin schon gilt.
    const vorher: Staende = { "gast-a": { tonAn: false, bildAn: true } };
    expect(uebernehmeStand(vorher, "gast-a", "tonstand", false)).toBe(vorher);
  });

  it("legt für eine unbekannte Kennung einen Eintrag an, auch wenn er der Vorgabe entspricht", () => {
    // „Ton an" von jemandem, von dem noch nichts bekannt war, ist eine
    // Meldung und keine Wiederholung.
    const neu = uebernehmeStand({}, "gast-b", "tonstand", true);
    expect(neu["gast-b"]).toEqual(STAND_AN);
  });

  it("wirft die Stände derer weg, die den Raum verlassen haben", () => {
    const vorher: Staende = {
      "gast-a": { tonAn: false, bildAn: true },
      "gast-b": { tonAn: true, bildAn: false },
    };
    expect(entferneAbwesende(vorher, ["gast-b"])).toEqual({ "gast-b": { tonAn: true, bildAn: false } });
  });

  it("lässt die Sammlung unangetastet, solange alle da sind", () => {
    const vorher: Staende = { "gast-a": STAND_AN };
    expect(entferneAbwesende(vorher, ["gast-a", "gast-c"])).toBe(vorher);
  });

  it("räumt alles weg, wenn niemand mehr da ist", () => {
    expect(entferneAbwesende({ "gast-a": STAND_AN }, [])).toEqual({});
  });
});
