/**
 * Testfreischaltung „Objekte" für einzelne Vertriebspartner-Konten
 * (Wunsch des Inhabers, 05.10.2026). Greift nur mit Kennung in
 * `app_config.objekte_test_vertriebspartner` UND aktiver Rolle vertriebspartner.
 *
 * Seit dem 18.10.2026 sehen alle Vertriebspartner, die Vertriebsleitung und
 * das Backoffice „Objekte“ ohnehin (Ansehen ja, Pflege nur für
 * `OBJEKT_PFLEGE_ROLLEN`). Für das Menü ist die Testfreischaltung damit
 * ohne Wirkung; sie entscheidet nur noch die Linkführung im Kundenprofil.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
  },
}));

const config: Record<string, unknown> = { objekte_test_vertriebspartner: ["u-test"] };
vi.mock("@/lib/appConfigStore", () => ({
  getAppConfig: (key: string, fallback: unknown) => (key in config ? config[key] : fallback),
}));

const { objekteTestFreigabe } = await import("./sidebarPermissions");
const { navigationsGruppen, objektbereichGesperrt, siehtObjekteMenue } = await import("./sidebarNavigation");
const { einheitOeffnenLink, objektOeffnenLink } = await import("./empfehlungAuswahl");

const vp = (userId: string, rolle = "vertriebspartner") => ({ rolle, identitaet: { userId } });
const objekteEintrag = (ctx: ReturnType<typeof vp>) =>
  navigationsGruppen(ctx).flatMap((g) => g.items).find((i) => i.url === "/objekte");

describe("objekteTestFreigabe", () => {
  it("schaltet frei mit Kennung in der Liste und aktiver Rolle vertriebspartner", () => {
    expect(objekteTestFreigabe("vertriebspartner", "u-test")).toBe(true);
    expect(siehtObjekteMenue(vp("u-test"))).toBe(true);
    expect(objekteEintrag(vp("u-test"))?.adminBadge).toBe(false);
    for (const p of ["/objekte", "/objekte/o1", "/objekte/o1/einheiten/w1"]) {
      expect(objektbereichGesperrt(p, vp("u-test"))).toBe(false);
    }
    // Verwaltungsansichten sind seit dem 18.10.2026 Pflege.
    expect(objektbereichGesperrt("/objekte/o1/verwaltung", vp("u-test"))).toBe(true);
  });

  it("öffnet Anlegen und Bearbeiten nicht", () => {
    expect(objektbereichGesperrt("/objekte/neu", vp("u-test"))).toBe(true);
    expect(objektbereichGesperrt("/objekte/o1/bearbeiten", vp("u-test"))).toBe(true);
  });

  it("andere Vertriebspartner sind nicht freigeschaltet, sehen Objekte seit dem 18.10.2026 aber ebenfalls", () => {
    expect(objekteTestFreigabe("vertriebspartner", "u-anders")).toBe(false);
    expect(objekteTestFreigabe("vertriebspartner", undefined)).toBe(false);
    expect(siehtObjekteMenue(vp("u-anders"))).toBe(true);
    expect(objektbereichGesperrt("/objekte/o1", vp("u-anders"))).toBe(false);
    expect(objektbereichGesperrt("/objekte/o1/verwaltung", vp("u-anders"))).toBe(true);
  });

  it("greift nicht bei anderer aktiver Rolle derselben Person", () => {
    for (const rolle of ["vertriebsleiter", "backoffice", "kunde", "tippgeber"]) {
      expect(objekteTestFreigabe(rolle, "u-test")).toBe(false);
    }
    // Das Menü folgt seit dem 18.10.2026 der Rolle, nicht der Freischaltung.
    expect(siehtObjekteMenue(vp("u-test", "vertriebsleiter"))).toBe(true);
    expect(siehtObjekteMenue(vp("u-test", "backoffice"))).toBe(true);
    expect(siehtObjekteMenue(vp("u-test", "kunde"))).toBe(false);
    expect(siehtObjekteMenue(vp("u-test", "tippgeber"))).toBe(false);
  });

  // Befund vom 05.10.2026: Die Objektauswahl im Kundenprofil schickte auch
  // freigeschaltete Konten in die alte Verwaltungsansicht.
  it("führt aus der Objektauswahl im Kundenprofil auf die neue Objekt- und Einheitenseite", () => {
    const bezug = { rolle: "vertriebspartner", kundeId: "k-1", investmentId: "inv-1", benutzerId: "u-test" };
    const [pfad, suche] = einheitOeffnenLink("o1", "w1", bezug).split("?");
    expect(pfad).toBe("/objekte/o1/einheiten/w1");
    expect(new URLSearchParams(suche).get("zurueck")).toBe("/kunden/k-1?tab=investments&investment=inv-1#objektauswahl");
    expect(objektOeffnenLink({ id: "o1" }, bezug).split("?")[0]).toBe("/objekte/o1");
    // Andere Vertriebspartner bleiben auf dem bisherigen Weg.
    const fremd = { ...bezug, benutzerId: "u-anders" };
    expect(einheitOeffnenLink("o1", "w1", fremd)).toBe("/objekte/o1/wohnung/w1?kundeId=k-1&investmentId=inv-1");
    expect(objektOeffnenLink({ id: "o1" }, fremd)).toBe("/objekte/o1/verwaltung?kundeId=k-1&investmentId=inv-1");
  });

  it("niemand ist freigeschaltet, wenn der Schlüssel fehlt oder kein Feld ist", () => {
    delete config.objekte_test_vertriebspartner;
    expect(objekteTestFreigabe("vertriebspartner", "u-test")).toBe(false);
    expect(objekteTestFreigabe("vertriebspartner", "u-test", "u-test")).toBe(false);
    expect(objekteTestFreigabe("vertriebspartner", "u-test", { "u-test": true })).toBe(false);
  });
});
