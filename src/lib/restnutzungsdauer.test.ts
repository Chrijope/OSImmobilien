import { describe, it, expect } from "vitest";
import {
  MAX_MOD_PUNKTE,
  MOD_ELEMENTE,
  OBJEKTART_GND,
  RND_DECKEL,
  RND_DECKEL_KERNSANIERT,
  RND_PARAMETER,
  ZEITRAUM_OPTIONEN,
  berechneRestnutzungsdauer,
  gndFuerObjektart,
  modernisierungsPunkte,
  rndParameter,
} from "@/lib/restnutzungsdauer";

describe("Parametertabelle nach Anlage 2 ImmoWertV", () => {
  it("deckt alle Punktwerte von 0 bis 20 ab", () => {
    expect(RND_PARAMETER).toHaveLength(21);
    RND_PARAMETER.forEach((r, i) => expect(r.punkte).toBe(i));
  });

  it("trägt die amtlichen Eckwerte", () => {
    expect(RND_PARAMETER[0]).toMatchObject({ a: 1.25, b: 2.625, c: 1.525, abRelativemAlter: 60 });
    expect(RND_PARAMETER[8]).toMatchObject({ a: 0.5, b: 1.1, c: 1.0, abRelativemAlter: 20 });
    expect(RND_PARAMETER[20]).toMatchObject({ a: 0.2, b: 0.44, c: 0.942, abRelativemAlter: 10 });
  });

  it("führt bei 2 und 3 Punkten dieselbe Schwelle von 55 Prozent", () => {
    expect(RND_PARAMETER[2].abRelativemAlter).toBe(55);
    expect(RND_PARAMETER[3].abRelativemAlter).toBe(55);
  });

  it("greift bei zu großen oder negativen Punktwerten auf den Rand zurück", () => {
    expect(rndParameter(99).punkte).toBe(20);
    expect(rndParameter(-5).punkte).toBe(0);
  });
});

describe("Modernisierungspunkte", () => {
  it("ergibt in Summe höchstens zwanzig Punkte", () => {
    expect(MOD_ELEMENTE.reduce((s, e) => s + e.maxPunkte, 0)).toBe(MAX_MOD_PUNKTE);
  });

  it("vergibt bei frischer Modernisierung aller Elemente die volle Punktzahl", () => {
    const alle = Object.fromEntries(MOD_ELEMENTE.map((e) => [e.key, "unter5"]));
    expect(modernisierungsPunkte(alle)).toBe(20);
  });

  it("vergibt ohne Modernisierung keine Punkte", () => {
    const keine = Object.fromEntries(MOD_ELEMENTE.map((e) => [e.key, "keine"]));
    expect(modernisierungsPunkte(keine)).toBe(0);
  });

  it("staffelt zurückliegende Maßnahmen absteigend", () => {
    const faktoren = ZEITRAUM_OPTIONEN.map((o) => o.faktor);
    for (let i = 1; i < faktoren.length; i++) {
      expect(faktoren[i]).toBeLessThanOrEqual(faktoren[i - 1]);
    }
  });
});

describe("Gesamtnutzungsdauern nach Anlage 1", () => {
  it("führt Wohngebäude mit 80 Jahren, auch bei Mischnutzung", () => {
    expect(gndFuerObjektart("Eigentumswohnung (ETW)")).toBe(80);
    expect(gndFuerObjektart("Mehrfamilienhaus")).toBe(80);
    expect(gndFuerObjektart("Wohn-/Geschäftshaus (gemischt)")).toBe(80);
  });

  it("führt Gewerbeobjekte mit 60 Jahren", () => {
    expect(gndFuerObjektart("Gewerbeobjekt")).toBe(60);
  });

  it("fällt bei Unbekanntem auf 80 Jahre zurück", () => {
    expect(gndFuerObjektart("gibt es nicht")).toBe(80);
    expect(OBJEKTART_GND.every((o) => o.gnd > 0)).toBe(true);
  });
});

describe("Restnutzungsdauer", () => {
  it("überschreitet nie die Gesamtnutzungsdauer", () => {
    for (const gnd of [60, 70, 80]) {
      for (let alter = 0; alter <= 120; alter++) {
        for (const punkte of [0, 4, 8, 12, 18, 20]) {
          const r = berechneRestnutzungsdauer({ alter, gnd, modPunkte: punkte });
          expect(r.rnd, `gnd ${gnd}, alter ${alter}, punkte ${punkte}`).toBeLessThanOrEqual(gnd);
        }
      }
    }
  });

  it("hält den Deckel von 70 Prozent der Gesamtnutzungsdauer ein", () => {
    for (let alter = 0; alter <= 120; alter += 3) {
      const r = berechneRestnutzungsdauer({ alter, gnd: 80, modPunkte: 20 });
      expect(r.rnd).toBeLessThanOrEqual(Math.round(80 * RND_DECKEL));
    }
  });

  it("erlaubt bei Kernsanierung bis zu 90 Prozent", () => {
    const normal = berechneRestnutzungsdauer({ alter: 60, gnd: 80, modPunkte: 20 });
    const kern = berechneRestnutzungsdauer({ alter: 60, gnd: 80, modPunkte: 20, kernsaniert: true });
    expect(normal.rnd).toBe(Math.round(80 * RND_DECKEL));
    expect(kern.rnd).toBeGreaterThan(normal.rnd);
    expect(kern.rnd).toBeLessThanOrEqual(Math.round(80 * RND_DECKEL_KERNSANIERT));
  });

  it("nimmt unterhalb der Schwelle Gesamtnutzungsdauer minus Alter", () => {
    // Neubau von vor vier Jahren: relatives Alter 5 Prozent, Schwelle 60 Prozent.
    const r = berechneRestnutzungsdauer({ alter: 4, gnd: 80, modPunkte: 0 });
    expect(r.unterSchwelle).toBe(true);
    expect(r.rnd).toBe(56); // 80 minus 4 ist 76, gedeckelt auf 70 Prozent von 80
    expect(r.gedeckelt).toBe(true);
  });

  it("wendet die Formel oberhalb der Schwelle an", () => {
    const r = berechneRestnutzungsdauer({ alter: 57, gnd: 80, modPunkte: 0 });
    expect(r.unterSchwelle).toBe(false);
    expect(r.rnd).toBe(23);
  });

  it("verlängert die Restnutzungsdauer mit steigender Modernisierung", () => {
    const ohne = berechneRestnutzungsdauer({ alter: 57, gnd: 80, modPunkte: 0 }).rnd;
    const mittel = berechneRestnutzungsdauer({ alter: 57, gnd: 80, modPunkte: 8 }).rnd;
    const voll = berechneRestnutzungsdauer({ alter: 57, gnd: 80, modPunkte: 20 }).rnd;
    expect(mittel).toBeGreaterThan(ohne);
    expect(voll).toBeGreaterThan(mittel);
  });

  it("bleibt bei sehr alten Gebäuden bei mindestens einem Jahr", () => {
    const r = berechneRestnutzungsdauer({ alter: 200, gnd: 80, modPunkte: 0 });
    expect(r.rnd).toBeGreaterThanOrEqual(1);
  });

  it("meldet Schwelle und relatives Alter für den Rechenweg", () => {
    const r = berechneRestnutzungsdauer({ alter: 40, gnd: 80, modPunkte: 8 });
    expect(r.relativesAlter).toBeCloseTo(50, 6);
    expect(r.schwelle).toBe(20);
    expect(r.unterSchwelle).toBe(false);
  });
});

describe("Unvollständige Eingaben", () => {
  it("liefert ohne Alter die volle Gesamtnutzungsdauer, gedeckelt", () => {
    // Der Rechner ruft die Funktion mit alter 0 auf, wenn das Baujahr fehlt.
    // Die Anzeige unterdrückt das Ergebnis dann, hier wird nur geprüft, dass
    // kein unsinniger Wert entsteht.
    const r = berechneRestnutzungsdauer({ alter: 0, gnd: 80, modPunkte: 0 });
    expect(r.rnd).toBe(56);
    expect(r.relativesAlter).toBe(0);
  });

  it("bleibt bei negativem Alter bei null", () => {
    const r = berechneRestnutzungsdauer({ alter: -5, gnd: 80, modPunkte: 0 });
    expect(r.relativesAlter).toBe(0);
  });
});
