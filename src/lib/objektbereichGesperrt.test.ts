/**
 * Der Objektbereich folgt dem Eintrag „Objekte" der Seitenleiste
 * (Christian, 29.09.2026). Maßstab ist `siehtObjekteMenue`, keine eigene
 * Rollenliste. Seit 18.10.2026 sehen Vertriebsleitung, Vertriebspartner,
 * Backoffice und Finanzierungspartner den Eintrag; pflegen (Anlegen,
 * Bearbeiten, Verwaltungsansichten, Einheitenspiegel) bleibt bei Admin,
 * Inhaber und Objektpartner.
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
const ANSEHEN = ["/objekte", "/objekte/o1", "/objekte/o1/einheiten/w1", "/objekte/o1/investment?x=1"];
const PFLEGE = ["/objekte/neu", "/objekte/o1/bearbeiten", "/objekte/o1/verwaltung", "/objekte/o1/wohnung/w1", "/einheitenspiegel"];
const SEHEN_JETZT = ["vertriebsleiter", "vertriebspartner", "backoffice", "finanzierungspartner"];

describe("objektbereichGesperrt", () => {
  it("öffnet Liste, Objekt- und Einheitenseite für die freigeschalteten Rollen", () => {
    expect(isUrlAllowedForRole("/objekte", "vertriebspartner")).toBe(true);
    for (const rolle of SEHEN_JETZT) {
      expect(siehtObjekteMenue({ rolle })).toBe(true);
      for (const p of ANSEHEN) expect(objektbereichGesperrt(p, { rolle })).toBe(false);
    }
  });

  it("lässt die Pflege für diese Rollen zu", () => {
    for (const rolle of SEHEN_JETZT) for (const p of PFLEGE) expect(objektbereichGesperrt(p, { rolle })).toBe(true);
  });

  it("andere Rollen sehen den Bereich weiter nicht", () => {
    for (const rolle of ["setterin", "tippgeber", "marketing"]) expect(objektbereichGesperrt("/objekte", { rolle })).toBe(true);
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
    for (const rolle of [...SEHEN_JETZT, "hausverwaltung"]) {
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
    expect(frisch.objektbereichGesperrt("/objekte/o1", { rolle: "vertriebsleiter" })).toBe(false);
    expect(frisch.objektbereichGesperrt("/objekte", { rolle: "setterin" })).toBe(true);
    vi.doUnmock("@/lib/sidebarPermissions");
  });

  it("stimmt mit der Seitenleiste überein", () => {
    for (const rolle of ["admin", "inhaber", "vertriebspartner", "backoffice", "hausverwaltung", "setterin"]) {
      expect(objektbereichGesperrt("/objekte", { rolle })).toBe(!siehtObjekteMenue({ rolle }));
    }
  });
});

describe("Glocken in den Objektbereich", () => {
  // So ruft die Glocke in `HeaderBar.tsx` das Ziel ab.
  const ziel = (link: string, rolle: string) =>
    benachrichtigungZiel(link, "osimmobilien.netlify.app", (pfad) => objektbereichGesperrt(pfad, { rolle }));

  it("„Wohnung exklusiv zugewiesen“ verlinkt für Vertriebspartner wieder auf das Objekt, nicht in die Pflege", () => {
    expect(ziel("/objekte/o1", "vertriebspartner")).toEqual({ art: "intern", pfad: "/objekte/o1" });
    expect(ziel("/einheitenspiegel", "vertriebspartner")).toEqual({ art: "keins" });
    expect(ziel("/objekte/o1", "setterin")).toEqual({ art: "keins" });
  });

  it("der Admin kommt weiter zum Objekt", () => {
    expect(ziel("/objekte/o1", "admin")).toEqual({ art: "intern", pfad: "/objekte/o1" });
  });

  it("andere Glocken des Vertriebspartners bleiben verlinkt", () => {
    expect(ziel("/kunden/k1?tab=investments", "vertriebspartner")).toEqual({ art: "intern", pfad: "/kunden/k1?tab=investments" });
    expect(ziel("", "vertriebspartner")).toEqual({ art: "intern", pfad: "/inbox" });
  });
});
