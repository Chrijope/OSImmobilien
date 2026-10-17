import { describe, expect, it } from "vitest";
import {
  aufWand, flaeche, gesamtFlaeche, massstabAusStrecke, planAusMeta, planOhneHintergrund, planSkalieren, plaeneAusEinheiten, wirksamerTyp, wohnflaeche,
  type Grundriss3dPlan,
} from "./plan";
import { WE03_PLAN, beispielHaus } from "./beispielWe03";
import { oeffentlicherGrundriss3d } from "../../../supabase/functions/_shared/expose-oeffentlich";

const rechteck = (b: number, t: number, x = 0, y = 0) => [{ x, y }, { x: x + b, y }, { x: x + b, y: y + t }, { x, y: y + t }];

describe("Planmodell", () => {
  it("liest einen gültigen Plan und wirft Unbrauchbares weg", () => {
    const plan = planAusMeta({
      version: 1,
      nordWinkel: 30,
      hintergrund: { url: "https://x/plan.jpg", pxProMeter: 80 },
      waende: [
        { id: "w1", a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, dicke: 0.24 },
        { id: "kaputt", a: { x: 0, y: 0 }, b: { x: 0, y: 0 }, dicke: 0.24 },
        { id: "w2", a: { x: "1", y: 0 }, b: { x: 4, y: 0 }, dicke: 0.24 },
      ],
      oeffnungen: [
        { id: "o1", wandId: "w1", art: "tuer", position: 1, breite: 0.9 },
        { id: "o2", wandId: "gibt-es-nicht", art: "fenster", position: 1, breite: 1 },
        { id: "o3", wandId: "w1", art: "tor", position: 1, breite: 1 },
      ],
      raeume: [
        { id: "r1", name: "Bad", typ: "bad", punkte: rechteck(2, 2) },
        { id: "r2", name: "Zu klein", typ: "bad", punkte: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      ],
    });
    expect(plan?.waende.map((w) => w.id)).toEqual(["w1"]);
    expect(plan?.oeffnungen.map((o) => o.id)).toEqual(["o1"]);
    expect(plan?.raeume.map((r) => r.id)).toEqual(["r1"]);
    expect(plan?.nordWinkel).toBe(30);
    expect(plan?.hintergrund?.pxProMeter).toBe(80);
  });

  it("gilt ohne Wand als nicht vorhanden", () => {
    expect(planAusMeta(undefined)).toBeNull();
    expect(planAusMeta("text")).toBeNull();
    expect(planAusMeta({ waende: [] })).toBeNull();
  });

  it("übersteht einen Umweg über JSON (so liegt er in meta)", () => {
    expect(planAusMeta(JSON.parse(JSON.stringify(WE03_PLAN)))).toEqual(WE03_PLAN);
  });

  it("nimmt den Hintergrund für den Kundenlink heraus, in der App wie im Server", () => {
    const mit: Grundriss3dPlan = { ...WE03_PLAN, hintergrund: { url: "https://intern/plan.jpg", pxProMeter: 87.5 } };
    expect(planOhneHintergrund(mit).hintergrund).toBeUndefined();
    const oeffentlich = oeffentlicherGrundriss3d({ ...mit, geaendertAm: "2026-10-16" });
    expect(oeffentlich).not.toHaveProperty("hintergrund");
    expect(oeffentlich).not.toHaveProperty("geaendertAm");
    expect(planAusMeta(oeffentlich)?.raeume.length).toBe(WE03_PLAN.raeume.length);
    expect(oeffentlicherGrundriss3d({ hintergrund: { url: "x" } })).toBeUndefined();
  });
});

describe("Flächen", () => {
  it("rechnet Rechteck und L-Form", () => {
    expect(flaeche(rechteck(4, 3))).toBeCloseTo(12);
    const l = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 4 }, { x: 0, y: 4 }];
    expect(flaeche(l)).toBeCloseTo(12);
    // Richtung egal
    expect(flaeche([...l].reverse())).toBeCloseTo(12);
  });

  it("zählt Balkon und Loggia zur Hälfte zur Wohnfläche", () => {
    const plan: Grundriss3dPlan = {
      version: 1, nordWinkel: 0, waende: [], oeffnungen: [],
      raeume: [
        { id: "a", name: "Wohnen", typ: "wohnen", punkte: rechteck(5, 4) },
        { id: "b", name: "Balkon", typ: "balkon", punkte: rechteck(2, 2) },
      ],
    };
    expect(gesamtFlaeche(plan)).toBeCloseTo(24);
    expect(wohnflaeche(plan)).toBeCloseTo(22);
  });

  it("trifft bei der nachgezeichneten WE 03 die Exposé-Angabe auf etwa 2 m²", () => {
    // Laut Exposé 72,32 m²; nachgezeichnet an den Innenkanten.
    expect(Math.abs(wohnflaeche(WE03_PLAN) - 72.32)).toBeLessThan(2);
  });

  it("macht aus dem größten Zimmer Wohnen, aus den übrigen Schlafen", () => {
    const [z1, z2] = WE03_PLAN.raeume;
    expect(wirksamerTyp(WE03_PLAN, z1)).toBe("wohnen");
    expect(wirksamerTyp(WE03_PLAN, z2)).toBe("schlafen");
    const bad = WE03_PLAN.raeume.find((r) => r.typ === "bad")!;
    expect(wirksamerTyp(WE03_PLAN, bad)).toBe("bad");
  });
});

describe("Maßstab", () => {
  it("setzt den Maßstab aus einer bekannten Strecke", () => {
    // Bisher 50 px/m; die Strecke misst 2 m, also 100 Bildpunkte. Wirklich 4 m lang.
    const { pxProMeter, faktor } = massstabAusStrecke(50, 2, 4);
    expect(pxProMeter).toBeCloseTo(25);
    expect(faktor).toBeCloseTo(2);
  });

  it("skaliert Gezeichnetes mit, damit es auf dem Bild liegen bleibt", () => {
    const plan: Grundriss3dPlan = {
      version: 1, nordWinkel: 0,
      waende: [{ id: "w", a: { x: 1, y: 1 }, b: { x: 3, y: 1 }, dicke: 0.24 }],
      oeffnungen: [{ id: "o", wandId: "w", art: "tuer", position: 1, breite: 0.5 }],
      raeume: [{ id: "r", name: "R", typ: "zimmer", punkte: rechteck(2, 2, 1, 1) }],
    };
    const neu = planSkalieren(plan, 2);
    expect(neu.waende[0].b).toEqual({ x: 6, y: 2 });
    expect(neu.oeffnungen[0].position).toBe(2);
    expect(flaeche(neu.raeume[0].punkte)).toBeCloseTo(16);
    // Dieselbe Bildstelle: alter Punkt × alter Maßstab = neuer Punkt × neuer Maßstab.
    expect(plan.waende[0].b.x * 50).toBeCloseTo(neu.waende[0].b.x * 25);
  });

  it("lehnt Null und negative Längen ab", () => {
    expect(() => massstabAusStrecke(50, 0, 3)).toThrow();
    expect(() => massstabAusStrecke(50, 2, -1)).toThrow();
  });
});

describe("Hilfen", () => {
  it("findet die Lage eines Klicks auf der Wand", () => {
    const w = { id: "w", a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, dicke: 0.2 };
    expect(aufWand({ x: 1.5, y: 0.1 }, w)).toEqual({ abstand: 0.1, position: 1.5 });
    expect(aufWand({ x: -1, y: 0 }, w).position).toBe(0);
  });

  it("sammelt die Pläne eines Hauses, Einheiten ohne Plan fallen weg", () => {
    const liste = plaeneAusEinheiten([{ weNr: "3", grundriss3d: WE03_PLAN }, { weNr: "4" }, { weNr: "5", grundriss3d: { waende: [] } }]);
    expect(liste.map((x) => x.titel)).toEqual(["WE 3"]);
    expect(beispielHaus().map((x) => x.plan.geschoss)).toEqual([0, 0, 1, 1, 2, 2]);
  });
});

describe("Bibliothek nachgezeichneter Häuser", () => {
  it("erkennt die Barfusstraße 9 in jeder Schreibweise, aber nicht die 91", async () => {
    const { bekanntesHausFinden, weNummer } = await import("./planBibliothek");
    for (const adresse of ["Barfußstraße 9", "Barfusstraße 9", "Barfußstr. 9", "Barfusstr 9", "BARFUSSSTRASSE 9, 13349 Berlin"]) {
      expect(bekanntesHausFinden({ adresse }), adresse).toBeTruthy();
    }
    expect(bekanntesHausFinden({ adresse: "Gartenweg 1", titel: "Barfusstraße 9 – Wedding" })).toBeTruthy();
    expect(bekanntesHausFinden({ adresse: "Barfusstraße 91" })).toBeUndefined();
    expect(bekanntesHausFinden({ adresse: "Gartenweg 38" })).toBeUndefined();
    expect([weNummer("WE 03"), weNummer("3"), weNummer("WE11 (Vorderhaus)"), weNummer("")]).toEqual([3, 3, 11, null]);
  });
});

describe("Hauffstraße 38 aus den Werkplänen", () => {
  it("wird erkannt und liefert acht Etagenpläne und alle 46 Einheiten mit gültigen Wandflächen", async () => {
    const { bekanntesHausFinden } = await import("./planBibliothek");
    const eintrag = bekanntesHausFinden({ adresse: "Hauffstraße 38", titel: "Hauffstr. 38, 14548 Schwielowsee" });
    expect(eintrag).toBeTruthy();
    const haus = await eintrag!.laden();
    expect(haus.etagen).toHaveLength(8);
    expect(haus.einheiten.map((e) => e.we)).toEqual(Array.from({ length: 46 }, (_, i) => i + 1));
    for (const e of haus.etagen!) {
      const plan = planAusMeta(JSON.parse(JSON.stringify(e.plan)));
      expect(plan?.flaechen?.waende.length, e.titel).toBeGreaterThan(5);
    }
    // Jede Einheit hat Räume und Wände, die Fläche liegt in einer plausiblen Größe.
    for (const { we, plan } of haus.einheiten) {
      const p = planAusMeta(plan);
      expect(p, `WE ${we}`).not.toBeNull();
      expect(gesamtFlaeche(p!), `WE ${we}`).toBeGreaterThan(15);
    }
  });
});
