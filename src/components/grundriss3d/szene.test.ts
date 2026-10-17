import { describe, expect, it } from "vitest";
import { sonnenRichtung } from "./szene";

// Plan: x nach rechts, y (in 3D z) nach unten. Nordwinkel 0 heißt Norden oben.
describe("Sonnenstand nach Uhrzeit und Nordpfeil", () => {
  it("steht morgens im Osten, mittags im Süden und am höchsten, abends im Westen", () => {
    const morgen = sonnenRichtung(6, 0), mittag = sonnenRichtung(12, 0), abend = sonnenRichtung(18, 0);
    expect(morgen.x).toBeGreaterThan(0.9);
    expect(mittag.z).toBeGreaterThan(0.5);
    expect(abend.x).toBeLessThan(-0.9);
    expect(mittag.y).toBeGreaterThan(morgen.y);
    expect(morgen.y).toBeGreaterThan(0);
  });

  it("dreht mit dem Nordpfeil: zeigt Norden nach rechts, steht die Mittagssonne links", () => {
    expect(sonnenRichtung(12, 90).x).toBeLessThan(-0.5);
  });
});

describe("Gebäudehülle (Barfusstraße 9)", () => {
  it("lässt die Hüllenwand dort weg, wo eine Einheit liegt, und verschiebt die Fenster mit", async () => {
    const { huelleAusschneiden } = await import("./szene");
    const huelle = {
      version: 1, nordWinkel: 0, raeume: [],
      waende: [{ id: "w", a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, dicke: 0.4 }],
      oeffnungen: [
        { id: "f1", wandId: "w", art: "fenster" as const, position: 1, breite: 1 },
        { id: "f2", wandId: "w", art: "fenster" as const, position: 8, breite: 1 },
      ],
    };
    const neu = huelleAusschneiden(huelle, [{ minX: 3, minY: -1, maxX: 6, maxY: 1 }]);
    expect(neu.waende.map((w) => [w.a.x, w.b.x])).toEqual([[0, 3], [6, 10]]);
    expect(neu.oeffnungen.map((o) => [o.wandId, o.position])).toEqual([["w~0", 1], ["w~1", 2]]);
  });

  it("liest die Hülle, und die Einheiten des Vorderhauses liegen innerhalb des Hauses", async () => {
    const { BARFUSS9_HAUS, BARFUSS9_EINHEITEN } = await import("./beispielBarfuss9");
    const { hausAusMeta, planRahmen } = await import("./plan");
    const haus = hausAusMeta(JSON.parse(JSON.stringify(BARFUSS9_HAUS)));
    expect(haus?.geschosse).toBe(5);
    expect(haus?.aufzuege).toHaveLength(3);
    expect(haus?.huelle.raeume.filter((r) => r.typ === "treppenhaus")).toHaveLength(4);
    const aussen = planRahmen(BARFUSS9_HAUS.huelle);
    for (const { we, plan } of BARFUSS9_EINHEITEN) {
      const r = planRahmen(plan);
      const v = plan.versatz!;
      // Balkone ragen bis gut 1,5 m über die Straßenfassade hinaus.
      expect(r.minX + v.x, `WE ${we}`).toBeGreaterThan(aussen.minX - 0.1);
      expect(r.maxX + v.x, `WE ${we}`).toBeLessThan(aussen.maxX + 1.6);
      expect(r.minY + v.y, `WE ${we}`).toBeGreaterThan(aussen.minY - 0.3);
      expect(r.maxY + v.y, `WE ${we}`).toBeLessThan(aussen.maxY + 0.3);
    }
    // Vorderhaus links und rechts liegen spiegelbildlich ums Treppenhaus.
    const we3 = planRahmen(BARFUSS9_EINHEITEN.find((e) => e.we === 3)!.plan);
    const we6 = planRahmen(BARFUSS9_EINHEITEN.find((e) => e.we === 6)!.plan);
    expect(we3.minY + we6.maxY).toBeCloseTo(2 * 13.79 - 2 * 1.12, 1);
  });
});

describe("Möbel in schräg liegenden Räumen", () => {
  it("erkennt die Hauptrichtung eines gedrehten Rechtecks, unabhängig von der Kante", async () => {
    const { hauptrichtung } = await import("./szene");
    const w = (20 * Math.PI) / 180, c = Math.cos(w), s = Math.sin(w);
    const rechteck = [[0, 0], [4, 0], [4, 3], [0, 3]].map(([x, y]) => ({ x: x * c - y * s, y: x * s + y * c }));
    expect(hauptrichtung(rechteck)).toBeCloseTo(w, 3);
    expect(hauptrichtung([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }])).toBe(0);
  });
});

describe("Dach und Fassade", () => {
  it("Satteldach: Unter der Dachfläche bleibt das Dachgeschoss stehen, darüber wird gekappt", async () => {
    const THREE = await import("three");
    const { steildach } = await import("./aussen");
    const r = { minX: 0, minY: 0, maxX: 10, maxY: 6 };
    const d = steildach({ art: "sattel", first: "x", neigung: 45, kniestock: 1, farbe: "#b5614a" }, r, 1, 2.65, new THREE.MeshStandardMaterial());
    const bleibt = (x: number, y: number, z: number) => d.ebenen.every((e) => e.distanceToPoint(new THREE.Vector3(x, y, z)) >= 0);
    // First in der Mitte (z 3) auf 1 + 3 = 4 m, Traufe bei z 0 auf 1 m.
    expect(bleibt(5, 3.9, 3)).toBe(true);
    expect(bleibt(5, 4.1, 3)).toBe(false);
    expect(bleibt(5, 0.9, 0.05)).toBe(true);
    expect(bleibt(5, 1.5, 0.2)).toBe(false);
  });

  it("findet die Brück-Pläne über die Adresse und die Barfuß-Einheiten auf allen Obergeschossen", async () => {
    const { bekanntesHausFinden } = await import("./planBibliothek");
    const brueck = await bekanntesHausFinden({ adresse: "Marktstraße 6, 14822 Brück" })!.laden();
    expect(brueck.etagen?.map((e) => e.geschoss)).toEqual([0, 1, 2]);
    expect(brueck.aussehen?.dach?.art).toBe("sattel");
    const barfuss = await bekanntesHausFinden({ adresse: "Barfußstr. 9" })!.laden();
    const geschosse = new Set(barfuss.einheiten.map((e) => e.plan.geschoss));
    for (const g of [0, 1, 2, 3, 4]) expect(geschosse.has(g), `Geschoss ${g}`).toBe(true);
    // Straßenfassade: je Obergeschoss zwei Loggien und zwei Kragbalkone (WE 03 bis 06).
    expect([3, 4, 5, 6].every((we) => barfuss.einheiten.some((e) => e.we === we))).toBe(true);
    expect(new Set(barfuss.einheiten.map((e) => e.we)).size).toBe(barfuss.einheiten.length);
  });
});

describe("Dach aus einzelnen Flächen", () => {
  it("baut jede Fläche und merkt sich die Dachhöhe je Rasterzelle, die höhere Fläche gewinnt", async () => {
    const THREE = await import("three");
    const { flaechenDach } = await import("./aussen");
    const flaechen = [
      // Pultfläche über 4 × 4 m: Traufe bei y 0 auf 1 m, oben bei y 4 auf 3 m (Geschoss 1 liegt auf Welthöhe 3).
      { geschoss: 1, material: "ziegel" as const, punkte: [[0, 0, 1], [4, 0, 1], [4, 4, 3], [0, 4, 3]] as Array<[number, number, number]> },
      // Gaube darüber, höher als die Hauptfläche.
      { geschoss: 1, material: "blech" as const, punkte: [[1, 1, 2.8], [2, 1, 2.8], [2, 2, 2.8], [1, 2, 2.8]] as Array<[number, number, number]> },
      // Giebel senkrecht: wird gebaut, zählt aber nicht für die Höhe.
      { geschoss: 1, material: "fassade" as const, punkte: [[0, 0, 0], [0, 4, 0], [0, 4, 3]] as Array<[number, number, number]> },
      // Geschoss nicht gezeigt: fällt weg.
      { geschoss: 5, material: "ziegel" as const, punkte: [[0, 0, 0], [1, 0, 0], [1, 1, 0]] as Array<[number, number, number]> },
    ];
    const d = flaechenDach(flaechen, (g) => (g === 1 ? 3 : undefined), new THREE.MeshStandardMaterial(), 2.65);
    expect(d.gruppe.children).toHaveLength(3);
    const k = d.karte!;
    const hoehe = (x: number, z: number) => {
      const b = k.textur.image.width;
      const i = Math.floor((x - k.rahmen.x) / 0.1), j = Math.floor((z - k.rahmen.y) / 0.1);
      return (k.textur.image.data as unknown as Float32Array)[j * b + i];
    };
    // Welthöhe = 3 + 1 + z/4 · 2
    expect(hoehe(3.05, 3.05)).toBeCloseTo(3 + 1 + (3.05 / 4) * 2, 1);
    expect(hoehe(1.55, 1.55)).toBeCloseTo(5.8, 2);
  });
});
