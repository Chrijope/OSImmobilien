import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

/**
 * Rechteprüfung der Objektseite: Nur die Rollen, die den Reiter „Objekte"
 * in der Seitenleiste sehen, dürfen die Seite öffnen. Alle anderen landen
 * ohne Umweg auf der Verwaltungsansicht, die sie schon kannten.
 */

const rolle = vi.hoisted(() => ({ wert: "vertriebspartner", userId: null as string | null, configGeladen: true }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
  },
}));
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { role: rolle.wert, name: "Test" }, authUser: rolle.userId ? { id: rolle.userId } : null }),
}));
// Testfreischaltung `objekte_test_vertriebspartner` für genau eine Kennung.
vi.mock("@/lib/appConfigStore", () => ({
  getAppConfig: (key: string, fallback: unknown) => (key === "objekte_test_vertriebspartner" ? ["u-test"] : fallback),
}));

vi.mock("@/lib/dataCache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dataCache")>()),
  isTableLoaded: (t: string) => (t === "app_config" ? rolle.configGeladen : true),
}));
vi.mock("@/components/LoadingFallback", () => ({ LoadingFallback: () => <p>Lädt</p> }));

const { ObjektseiteZugang } = await import("./ObjektseiteZugang");
const { willVerwaltungsansicht } = await import("@/lib/objektseiteDaten");
const { siehtAdminOnlyNavigation } = await import("@/lib/sidebarPermissions");

function renderMit(pfad: string, mitVertriebsleitung = false) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <Routes>
        <Route
          path="/objekte/:id"
          element={
            <ObjektseiteZugang verwaltungPfad="/objekte/o1/verwaltung" mitVertriebsleitung={mitVertriebsleitung}>
              <p>Objektseite sichtbar</p>
            </ObjektseiteZugang>
          }
        />
        <Route path="/objekte/:id/verwaltung" element={<p>Verwaltungsansicht</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Zugang zur Objektseite", () => {
  it("sieht dieselben Rollen wie der Reiter Objekte in der Seitenleiste", () => {
    expect(siehtAdminOnlyNavigation("admin")).toBe(true);
    expect(siehtAdminOnlyNavigation("inhaber")).toBe(true);
    for (const r of ["vertriebspartner", "vertriebsleiter", "objektpartner", "backoffice", "testaccount", "individuell", "kunde", undefined]) {
      expect(siehtAdminOnlyNavigation(r), String(r)).toBe(false);
    }
  });

  it("zeigt Admin und Inhaber die Objektseite", () => {
    rolle.wert = "admin";
    renderMit("/objekte/o1");
    expect(screen.getByText("Objektseite sichtbar")).toBeInTheDocument();
  });

  it("leitet einen Vertriebspartner auf die Verwaltungsansicht weiter", () => {
    rolle.wert = "vertriebspartner";
    renderMit("/objekte/o1");
    expect(screen.queryByText("Objektseite sichtbar")).not.toBeInTheDocument();
    expect(screen.getByText("Verwaltungsansicht")).toBeInTheDocument();
  });

  // Seit dem 04.10.2026 sieht die Vertriebsleitung Objekt- und Einheitenseite, seit dem 05.10.2026 auch Kundenansicht und Exposé (beide mit `mitVertriebsleitung`).
  it("lässt die Vertriebsleitung nur mit `mitVertriebsleitung` herein", () => {
    rolle.wert = "vertriebsleiter";
    const { unmount } = renderMit("/objekte/o1", true);
    expect(screen.getByText("Objektseite sichtbar")).toBeInTheDocument();
    unmount();
    renderMit("/objekte/o1");
    expect(screen.getByText("Verwaltungsansicht")).toBeInTheDocument();
  });

  it("leitet den Vertriebspartner auch mit `mitVertriebsleitung` weiter", () => {
    rolle.wert = "vertriebspartner";
    renderMit("/objekte/o1", true);
    expect(screen.getByText("Verwaltungsansicht")).toBeInTheDocument();
  });

  it("lässt ein freigeschaltetes Vertriebspartner-Konto nur mit `mitVertriebsleitung` herein", () => {
    rolle.wert = "vertriebspartner";
    rolle.userId = "u-test";
    const { unmount } = renderMit("/objekte/o1", true);
    expect(screen.getByText("Objektseite sichtbar")).toBeInTheDocument();
    unmount();
    // Ohne `mitVertriebsleitung` (Admin-Seiten) bleibt es zu.
    const zweiter = renderMit("/objekte/o1");
    expect(screen.getByText("Verwaltungsansicht")).toBeInTheDocument();
    zweiter.unmount();
    // Andere Kennung: wie jeder Vertriebspartner.
    rolle.userId = "u-anders";
    renderMit("/objekte/o1", true);
    expect(screen.getByText("Verwaltungsansicht")).toBeInTheDocument();
    rolle.userId = null;
  });

  /*
   * Exposé und Kundenansicht öffnen in einem neuen Tab, dort ist app_config
   * anfangs noch nicht geladen. Dann warten statt wegleiten.
   */
  it("wartet beim Vertriebspartner auf app_config, statt ihn wegzuleiten", () => {
    rolle.wert = "vertriebspartner";
    // Solange app_config fehlt, ist offen, ob das Konto freigeschaltet ist.
    rolle.userId = "u-anders";
    rolle.configGeladen = false;
    renderMit("/objekte/o1", true);
    expect(screen.getByText("Lädt")).toBeInTheDocument();
    expect(screen.queryByText("Verwaltungsansicht")).not.toBeInTheDocument();
    rolle.configGeladen = true;
    rolle.userId = null;
  });

  it("erkennt Aufrufe mit Kundenkontext, die die Verwaltungsansicht wollen", () => {
    expect(willVerwaltungsansicht("?kundeId=k1&kundeName=Meier")).toBe(true);
    // Die Musterkalkulation ist entfernt, ihr Parameter öffnet nichts mehr.
    expect(willVerwaltungsansicht("?musterkalk=1")).toBe(false);
    expect(willVerwaltungsansicht("?editWohnung=w1&action=zuweisen")).toBe(true);
    expect(willVerwaltungsansicht("")).toBe(false);
    expect(willVerwaltungsansicht("?tab=finanzen")).toBe(false);
  });
});
