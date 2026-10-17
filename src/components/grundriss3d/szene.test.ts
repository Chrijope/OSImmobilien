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
