/**
 * Der Objektbereich folgt dem Eintrag „Objekte" der Seitenleiste
 * (Christian, 29.09.2026). Maßstab ist `siehtObjekteMenue`, keine eigene
 * Rollenliste.
 */
import { describe, expect, it, vi } from "vitest";

// Ohne Datenbank gilt die Rückfallliste der Rollenfreigaben.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
  },
}));

const { objektbereichGesperrt, siehtObjekteMenue } = await import("./sidebarNavigation");
const { isUrlAllowedForRole } = await import("./sidebarPermissions");
const { benachrichtigungZiel } = await import("./benachrichtigungZiel");

const PFADE = ["/objekte", "/objekte/o1", "/objekte/o1/verwaltung", "/objekte/o1/wohnung/w1", "/objekte/o1/einheiten/w1", "/objekte/o1/investment?x=1"];

describe("objektbereichGesperrt", () => {
  it("sperrt den Objektbereich für Vertriebspartner, obwohl /objekte in den Rollenrechten steht", () => {
    expect(isUrlAllowedForRole("/objekte", "vertriebspartner")).toBe(true);
    for (const p of PFADE) expect(objektbereichGesperrt(p, { rolle: "vertriebspartner" })).toBe(true);
  });

  it("sperrt auch Vertriebsleitung, Backoffice und Finanzierungspartner", () => {
    for (const rolle of ["vertriebsleiter", "backoffice", "finanzierungspartner"]) {
      expect(objektbereichGesperrt("/objekte/o1/verwaltung", { rolle })).toBe(true);
    }
  });

  it("lässt Admin und Inhaber durch", () => {
    for (const rolle of ["admin", "inhaber"]) {
      for (const p of PFADE) expect(objektbereichGesperrt(p, { rolle })).toBe(false);
    }
  });

  it("betrifft weder Investagon (/objekte-neu) noch andere Seiten", () => {
    expect(objektbereichGesperrt("/objekte-neu", { rolle: "vertriebspartner" })).toBe(false);
    expect(objektbereichGesperrt("/pipeline", { rolle: "vertriebspartner" })).toBe(false);
  });

  it("sperrt den Anlage-Assistenten und den Einheitenspiegel ebenso", () => {
    for (const rolle of ["vertriebspartner", "vertriebsleiter", "backoffice", "hausverwaltung"]) {
      expect(objektbereichGesperrt("/objekte/neu", { rolle })).toBe(true);
      expect(objektbereichGesperrt("/einheitenspiegel", { rolle })).toBe(true);
    }
    for (const rolle of ["admin", "inhaber"]) {
      expect(objektbereichGesperrt("/objekte/neu", { rolle })).toBe(false);
      expect(objektbereichGesperrt("/einheitenspiegel", { rolle })).toBe(false);
    }
  });

  it("lässt den Objektpartner in seinen Bereich (Christian: so lassen)", () => {
    expect(objektbereichGesperrt("/objekte/o1/verwaltung", { rolle: "objektpartner" })).toBe(false);
    expect(objektbereichGesperrt("/objekte/neu", { rolle: "objektpartner" })).toBe(false);
  });

  it("folgt der Freischaltung des Menüeintrags ohne eigene Rollenliste", async () => {
    vi.resetModules();
    vi.doMock("@/lib/sidebarPermissions", async (original) => {
      const echt = await original<typeof import("./sidebarPermissions")>();
      // Als wäre „Objekte" für die Vertriebsleitung freigeschaltet (`auchFuer`).
      return { ...echt, greiftAdminRiegel: (e: { adminOnly?: boolean }, r: string) => !!e.adminOnly && !["admin", "inhaber", "vertriebsleiter"].includes(r) };
    });
    const frisch = await import("./sidebarNavigation");
    expect(frisch.siehtObjekteMenue({ rolle: "vertriebsleiter" })).toBe(true);
    expect(frisch.objektbereichGesperrt("/objekte/o1/verwaltung", { rolle: "vertriebsleiter" })).toBe(false);
    expect(frisch.objektbereichGesperrt("/objekte", { rolle: "vertriebspartner" })).toBe(true);
    vi.doUnmock("@/lib/sidebarPermissions");
  });

  it("stimmt mit der Seitenleiste überein", () => {
    for (const rolle of ["admin", "inhaber", "vertriebspartner", "backoffice"]) {
      expect(objektbereichGesperrt("/objekte", { rolle })).toBe(!siehtObjekteMenue({ rolle }));
    }
  });
});

describe("Glocken in den Objektbereich", () => {
  // So ruft die Glocke in `HeaderBar.tsx` das Ziel ab.
  const ziel = (link: string, rolle: string) =>
    benachrichtigungZiel(link, "osimmobilien.netlify.app", (pfad) => objektbereichGesperrt(pfad, { rolle }));

  it("„Wohnung exklusiv zugewiesen“ verlinkt für Vertriebspartner nicht mehr auf das Objekt", () => {
    expect(ziel("/objekte/o1", "vertriebspartner")).toEqual({ art: "keins" });
    expect(ziel("https://osimmobilien.netlify.app/objekte/o1", "vertriebspartner")).toEqual({ art: "keins" });
    expect(ziel("/einheitenspiegel", "vertriebspartner")).toEqual({ art: "keins" });
  });

  it("der Admin kommt weiter zum Objekt", () => {
    expect(ziel("/objekte/o1", "admin")).toEqual({ art: "intern", pfad: "/objekte/o1" });
  });

  it("andere Glocken des Vertriebspartners bleiben verlinkt", () => {
    expect(ziel("/kunden/k1?tab=investments", "vertriebspartner")).toEqual({ art: "intern", pfad: "/kunden/k1?tab=investments" });
    expect(ziel("", "vertriebspartner")).toEqual({ art: "intern", pfad: "/inbox" });
  });
});
