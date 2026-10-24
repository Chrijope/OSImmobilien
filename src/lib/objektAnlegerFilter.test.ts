import { describe, expect, it } from "vitest";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";
import { afaArtAus, objektErfuelltAnlegerFilter, sofortReservierbar, type AfaArt } from "./objektAnlegerFilter";

const JETZT = new Date("2026-10-24T10:00:00Z");

describe("afaArtAus", () => {
  it("ordnet wie der Rechner zu", () => {
    expect(afaArtAus(null, undefined)).toBeNull();
    expect(afaArtAus({ depreciationMethod: "linear", specialDepreciationRate: 5 } as never, undefined)).toBe("7b");
    expect(afaArtAus({ depreciationMethod: "declining", specialDepreciationRate: 0 } as never, undefined)).toBe("degressiv");
    expect(afaArtAus({ depreciationMethod: "linear", specialDepreciationRate: 0 } as never, "gutachten")).toBe("gutachten");
    expect(afaArtAus({ depreciationMethod: "linear", specialDepreciationRate: 0 } as never, "linear")).toBe("linear");
  });
});

describe("sofortReservierbar", () => {
  it("nur frei und nicht vorgemerkt", () => {
    expect(sofortReservierbar({ status: "frei" }, JETZT)).toBe(true);
    expect(sofortReservierbar({ status: "reserviert" }, JETZT)).toBe(false);
    expect(sofortReservierbar({ status: "frei", vorgemerktBis: "2026-10-24T11:00:00Z" }, JETZT)).toBe(false);
    expect(sofortReservierbar({ status: "frei", vorgemerktBis: "2026-10-24T09:00:00Z" }, JETZT)).toBe(true);
  });
});

describe("objektErfuelltAnlegerFilter", () => {
  const w = (id: string, status = "frei") => ({ id, status }) as ObjektWohnung;
  const objekt = { id: "o", wohnungen: [w("a"), w("b", "reserviert")] } as ObjektData;
  const aufwand: Record<string, number | null> = { a: 180, b: 90 };
  const art: Record<string, AfaArt> = { a: "linear", b: "degressiv" };
  const rechne = { aufwand: (_: ObjektData, x: ObjektWohnung) => aufwand[x.id], afaArt: (_: ObjektData, x: ObjektWohnung) => art[x.id] };
  const filter = (teile: Partial<{ aufwandBis: number | null; afaArten: Set<AfaArt>; nurReservierbar: boolean }>) =>
    ({ aufwandBis: null, afaArten: new Set<AfaArt>(), nurReservierbar: false, ...teile });

  it("ohne Filter bleibt jedes Objekt", () => {
    expect(objektErfuelltAnlegerFilter(objekt, filter({}), rechne, JETZT)).toBe(true);
  });
  it("alle Filter müssen an derselben Einheit greifen", () => {
    // b hat wenig Aufwand und ist degressiv, ist aber reserviert.
    expect(objektErfuelltAnlegerFilter(objekt, filter({ aufwandBis: 100, nurReservierbar: true }), rechne, JETZT)).toBe(false);
    expect(objektErfuelltAnlegerFilter(objekt, filter({ aufwandBis: 100 }), rechne, JETZT)).toBe(true);
    expect(objektErfuelltAnlegerFilter(objekt, filter({ afaArten: new Set<AfaArt>(["degressiv"]), nurReservierbar: true }), rechne, JETZT)).toBe(false);
    expect(objektErfuelltAnlegerFilter(objekt, filter({ aufwandBis: 200, afaArten: new Set<AfaArt>(["linear"]), nurReservierbar: true }), rechne, JETZT)).toBe(true);
  });
});
