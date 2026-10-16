import { beforeEach, describe, expect, it, vi } from "vitest";
import { WE03_PLAN } from "./beispielWe03";
import { setzeSpeicherAttrappe } from "@/test/speicherAttrappe";

const db = vi.hoisted(() => ({
  meta: {} as Record<string, unknown> | null,
  geschrieben: null as Record<string, unknown> | null,
  zeilen: 1,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: db.meta === null ? null : { meta: db.meta }, error: null }) }) }),
      update: (werte: Record<string, unknown>) => {
        db.geschrieben = werte;
        return { eq: () => ({ select: async () => ({ data: Array.from({ length: db.zeilen }, () => ({ id: "w1" })), error: null }) }) };
      },
    }),
  },
}));
vi.mock("@/lib/dataCache", () => ({ cacheReload: vi.fn(async () => undefined) }));

const { speichereEinheitPlan, zumSpeichern, entwurfSichern, entwurfLaden, entwurfLoeschen } = await import("./speichern");

describe("Plan speichern", () => {
  beforeEach(() => {
    db.meta = { dokumente: [{ id: "d1" }], moebelPreis: 5000 };
    db.geschrieben = null;
    db.zeilen = 1;
    setzeSpeicherAttrappe();
  });

  it("ersetzt nur meta.grundriss3d, alles andere in meta bleibt", async () => {
    await speichereEinheitPlan("w1", WE03_PLAN);
    const meta = db.geschrieben?.meta as Record<string, unknown>;
    expect(meta.dokumente).toEqual([{ id: "d1" }]);
    expect(meta.moebelPreis).toBe(5000);
    expect((meta.grundriss3d as { waende: unknown[] }).waende).toHaveLength(WE03_PLAN.waende.length);
    expect(Object.keys(db.geschrieben!)).toEqual(["meta"]);
  });

  it("meldet eine Ablehnung der Zeilensicherheit statt still „gespeichert“", async () => {
    db.zeilen = 0;
    await expect(speichereEinheitPlan("w1", WE03_PLAN)).rejects.toThrow(/darfst du nicht/);
  });

  it("meldet eine fehlende Einheit", async () => {
    db.meta = null;
    await expect(speichereEinheitPlan("w1", WE03_PLAN)).rejects.toThrow(/nicht gefunden/);
  });

  it("speichert Version, Zeitpunkt und keine Bildadressen, die nur im Browser gelten", () => {
    const jetzt = new Date("2026-10-16T10:00:00Z");
    const lokal = zumSpeichern({ ...WE03_PLAN, hintergrund: { url: "blob:http://localhost/123", pxProMeter: 87.5 } }, jetzt);
    expect(lokal.hintergrund).toEqual({ url: "", pxProMeter: 87.5 });
    expect(lokal.version).toBe(1);
    expect(lokal.geaendertAm).toBe("2026-10-16T10:00:00.000Z");
    const dauerhaft = zumSpeichern({ ...WE03_PLAN, hintergrund: { url: "https://x/plan.jpg", pxProMeter: 80 } }, jetzt);
    expect(dauerhaft.hintergrund?.url).toBe("https://x/plan.jpg");
  });

  it("sichert den Entwurf im Browser und räumt ihn nach dem Speichern weg", async () => {
    entwurfSichern("w1", WE03_PLAN);
    expect(entwurfLaden("w1")?.plan.waende).toHaveLength(WE03_PLAN.waende.length);
    await speichereEinheitPlan("w1", WE03_PLAN);
    expect(entwurfLaden("w1")).toBeNull();
    entwurfSichern("w2", WE03_PLAN);
    entwurfLoeschen("w2");
    expect(entwurfLaden("w2")).toBeNull();
  });
});
