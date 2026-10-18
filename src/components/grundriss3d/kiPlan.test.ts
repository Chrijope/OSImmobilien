import { describe, expect, it } from "vitest";
import { gesamtFlaeche } from "./plan";
import { geschossAusSchluessel, nebeneinander, planAusKi, raumTypAus } from "./kiPlan";

// Bild 1000 × 500 Bildpunkte: ein Rechteck 10 m × 5 m bei 0,01 m je Bildpunkt.
const BILD = { breite: 1000, hoehe: 500 };
const huelle = [
  { x1: 0, y1: 0, x2: 1000, y2: 0, aussen: true },
  { x1: 1000, y1: 0, x2: 1000, y2: 1000, aussen: true },
  { x1: 1000, y1: 1000, x2: 0, y2: 1000, aussen: true },
  // Ende leicht daneben: muss auf die Ecke einrasten.
  { x1: 0, y1: 1000, x2: 5, y2: 4, aussen: true },
  { x1: 500, y1: 0, x2: 500, y2: 1000, aussen: false },
];
const raeume = [
  { name: "Wohnen", typ: "wohnen", flaecheQm: 25, punkte: [[0, 0], [500, 0], [500, 1000], [0, 1000]] },
  { name: "Bad", typ: "quatsch", flaecheQm: 25, punkte: [[500, 0], [1000, 0], [1000, 1000], [500, 1000]] },
];

describe("planAusKi", () => {
  it("nimmt den Maßstab aus den Maßketten", () => {
    const e = planAusKi({ waende: huelle, raeume, massketten: [{ x1: 0, y1: 0, x2: 1000, y2: 0, meter: 10 }] }, BILD);
    expect(e?.quelle).toBe("massketten");
    expect(e?.meterProPx).toBeCloseTo(0.01);
    expect(gesamtFlaeche(e!.plan)).toBeCloseTo(50, 0);
    // Die schiefe Wand endet in der Ecke oben links.
    const letzte = e!.plan.waende[3];
    expect(letzte.b).toEqual({ x: 0, y: 0 });
    expect(e!.plan.waende[0].dicke).toBe(0.3);
    expect(e!.plan.waende[4].dicke).toBe(0.12);
  });

  it("nimmt ohne Maßkette die beschrifteten Raumflächen, sonst die Wohnfläche", () => {
    expect(planAusKi({ waende: huelle, raeume }, BILD)?.quelle).toBe("raumflaechen");
    const ohneQm = raeume.map((r) => ({ ...r, flaecheQm: null }));
    const e = planAusKi({ waende: huelle, raeume: ohneQm }, BILD, 50);
    expect(e?.quelle).toBe("wohnflaeche");
    expect(e?.meterProPx).toBeCloseTo(0.01);
  });

  it("gibt ohne Maßstab, ohne Wände oder bei keinGrundriss nichts zurück", () => {
    expect(planAusKi({ waende: huelle, raeume: raeume.map((r) => ({ ...r, flaecheQm: null })) }, BILD)).toBeNull();
    expect(planAusKi({ waende: [], raeume }, BILD)).toBeNull();
    expect(planAusKi({ keinGrundriss: true }, BILD)).toBeNull();
    expect(planAusKi("Unsinn", BILD)).toBeNull();
    // 1 m je Bildpunkt wäre ein Haus von einem Kilometer: Lesefehler.
    expect(planAusKi({ waende: huelle, raeume, massketten: [{ x1: 0, y1: 0, x2: 10, y2: 0, meter: 10 }] }, BILD)).toBeNull();
  });

  it("hängt Türen und Fenster an die nächste Wand und verwirft fremde", () => {
    const e = planAusKi({
      waende: huelle, raeume,
      oeffnungen: [
        { art: "fenster", x1: 200, y1: 0, x2: 350, y2: 0 },
        { art: "tuer", x1: 500, y1: 400, x2: 500, y2: 580 },
        { art: "tuer", x1: 250, y1: 500, x2: 300, y2: 500 }, // mitten im Raum, keine Wand nah
        { art: "tor", x1: 0, y1: 0, x2: 100, y2: 0 },
      ],
    }, BILD)!;
    expect(e.plan.oeffnungen).toHaveLength(2);
    const [fenster, tuer] = e.plan.oeffnungen;
    expect(fenster.wandId).toBe(e.plan.waende[0].id);
    expect(fenster.position).toBeCloseTo(2.75);
    expect(fenster.breite).toBeCloseTo(1.5);
    expect(tuer.wandId).toBe(e.plan.waende[4].id);
  });

  it("verwirft unbekannte Raumtypen über den Namen", () => {
    const e = planAusKi({ waende: huelle, raeume }, BILD)!;
    expect(e.plan.raeume.map((r) => r.typ)).toEqual(["wohnen", "bad"]);
  });
});

describe("raumTypAus und geschossAusSchluessel", () => {
  it("erkennt Räume am Namen", () => {
    expect(raumTypAus(undefined, "Küche")).toBe("kueche");
    expect(raumTypAus(undefined, "Diele")).toBe("flur");
    expect(raumTypAus(undefined, "Kind 1")).toBe("zimmer");
    expect(raumTypAus("treppenhaus", "Wohnen")).toBe("wohnen");
  });
  it("liest Geschosse", () => {
    expect(geschossAusSchluessel("eg")).toBe(0);
    expect(geschossAusSchluessel("og2")).toBe(2);
    expect(geschossAusSchluessel("ug")).toBe(-1);
    expect(geschossAusSchluessel("dg")).toBeUndefined();
    expect(geschossAusSchluessel(undefined)).toBeUndefined();
  });
});

describe("nebeneinander", () => {
  it("legt Pläne je Geschoss nebeneinander und beginnt jedes Geschoss links", () => {
    const e = planAusKi({ waende: huelle, raeume }, BILD)!.plan; // 10 m × 5 m
    const [a, b, c] = nebeneinander([{ plan: e }, { plan: e }, { plan: { ...e, geschoss: 1 } }]);
    expect(a.plan.versatz).toEqual({ x: 0, y: 0 });
    expect(b.plan.versatz).toEqual({ x: 11, y: 0 });
    expect(c.plan.versatz).toEqual({ x: 0, y: 0 });
  });
});
