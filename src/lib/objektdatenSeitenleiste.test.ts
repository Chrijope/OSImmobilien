import { describe, expect, it, vi } from "vitest";

/**
 * Die Gruppe „Objektdaten“ in der Seitenleiste (Christian, 17.10.2026): nur
 * Admin, Inhaber, Backoffice und Objektpartner sehen sie und dürfen die
 * Seiten öffnen, auch Rollen mit Vollzugriff nicht.
 */

// Ohne Datenbank gilt die Rueckfallliste im Code.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
  },
}));

const { isUrlAllowedForRole } = await import("@/lib/sidebarPermissions");
const { navigationsGruppen } = await import("@/lib/sidebarNavigation");

const hatGruppe = (rolle: string) => navigationsGruppen({ rolle }).some((g) => g.label === "Objektdaten");

describe("Objektdaten in der Seitenleiste", () => {
  it("zeigt die Gruppe den vier Rollen, direkt nach Immobilien", () => {
    for (const r of ["admin", "inhaber", "backoffice", "objektpartner"]) expect(hatGruppe(r)).toBe(true);
    const labels = navigationsGruppen({ rolle: "admin" }).map((g) => g.label);
    expect(labels.indexOf("Objektdaten")).toBe(labels.indexOf("Immobilien") + 1);
  });

  it("verbirgt die Gruppe und sperrt die Seiten für alle anderen", () => {
    for (const r of ["vertriebspartner", "vertriebsleiter", "individuell", "testaccount", "setterin"]) {
      expect(hatGruppe(r)).toBe(false);
      expect(isUrlAllowedForRole("/objektdaten/einheiten", r as never)).toBe(false);
    }
    expect(isUrlAllowedForRole("/objektdaten/vollstaendigkeit", "backoffice")).toBe(true);
    expect(isUrlAllowedForRole("/objektdaten", "objektpartner")).toBe(true);
  });

  it("lässt die drei Rechner in Tools", () => {
    const tools = navigationsGruppen({ rolle: "admin" }).find((g) => g.label === "Tools")!;
    expect(tools.items.map((i) => i.title)).toEqual(expect.arrayContaining(["Ankaufstool", "Mietsubvention", "Kaufpreisliste"]));
  });
});
