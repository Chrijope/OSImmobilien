import { describe, it, expect } from "vitest";
import {
  berechneSubvention, berechneZeile, cent, leseZahl, neueZeile, SUBVENTION_STANDARD, type SubventionsZeile,
} from "./mietsubvention";

const zeile = (z: Partial<SubventionsZeile>): SubventionsZeile => ({ ...neueZeile(), ...z });

describe("berechneZeile", () => {
  it("hebt Wohnung und Garage um die globale Steigerung an", () => {
    const r = berechneZeile(zeile({ istWohnung: 500, istGarage: 50 }), 0.2);
    expect(r).toMatchObject({ sollWohnung: 600, sollGarage: 60, istGesamt: 550, sollGesamt: 660, differenz: 110 });
  });

  it("nimmt die eigene Steigerung der Zeile vor der globalen, auch 0 %", () => {
    expect(berechneZeile(zeile({ istWohnung: 500, steigerung: 0.15 }), 0.2).sollWohnung).toBe(575);
    expect(berechneZeile(zeile({ istWohnung: 500, steigerung: 0 }), 0.2).differenz).toBe(0);
  });

  it("übernimmt eine direkt eingetragene Soll-Miete", () => {
    const r = berechneZeile(zeile({ istWohnung: 500, istGarage: 40, sollWohnung: 580, sollGarage: 40 }), 0.2);
    expect(r).toMatchObject({ sollGesamt: 620, differenz: 80 });
  });

  it("rundet auf Cent", () => {
    expect(berechneZeile(zeile({ istWohnung: 433.33 }), 0.2).sollWohnung).toBe(520);
    expect(berechneZeile(zeile({ istWohnung: 412.37 }), 0.15).sollWohnung).toBe(474.23);
    expect(cent(1.005)).toBe(1.01);
  });

  it("zählt leere Werte als 0", () => {
    const r = berechneZeile(zeile({ istWohnung: NaN, istGarage: undefined as unknown as number }), 0.2);
    expect(r).toMatchObject({ istGesamt: 0, sollGesamt: 0, differenz: 0 });
  });
});

describe("berechneSubvention", () => {
  it("summiert und rechnet die Subvention über die Laufzeit", () => {
    const r = berechneSubvention({
      ...SUBVENTION_STANDARD(),
      steigerung: 0.2,
      monate: 24,
      zeilen: [zeile({ istWohnung: 500, istGarage: 50 }), zeile({ istWohnung: 420.5, sollWohnung: 480 })],
    });
    expect(r.summeIst).toBe(970.5);
    expect(r.summeSoll).toBe(1140);
    expect(r.differenzMonat).toBe(169.5);
    expect(r.differenzJahr).toBe(2034);
    expect(r.subventionGesamt).toBe(4068);
  });

  it("ohne Zeilen und mit negativer Laufzeit ergibt 0", () => {
    const r = berechneSubvention({ ...SUBVENTION_STANDARD(), monate: -3, zeilen: [zeile({ istWohnung: 100 })] });
    expect(r.subventionGesamt).toBe(0);
    expect(berechneSubvention({ ...SUBVENTION_STANDARD(), zeilen: [] }).summeSoll).toBe(0);
  });
});

describe("leseZahl", () => {
  it.each([
    ["1.234,56", 1234.56], ["12,5", 12.5], ["612.5", 612.5], ["1.200", 1200], ["650 €", 650], ["0", 0],
  ])("%s → %s", (text, erwartet) => expect(leseZahl(text)).toBe(erwartet));

  it("leer ergibt null", () => {
    expect(leseZahl("")).toBeNull();
    expect(leseZahl(" € ")).toBeNull();
  });
});
