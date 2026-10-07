import { describe, it, expect, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/*
 * Die Seite "Anrufe" ist am 25.09.2026 entfallen. Jeder Klick auf eine
 * Kundennummer steht seitdem im Verlauf des Kundenprofils. Diese Tests halten
 * fest, dass kein toter Weg dorthin übrig bleibt und alte Lesezeichen auf dem
 * Dashboard landen.
 */

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
  },
}));

const lies = (pfad: string) => readFileSync(resolve(__dirname, "..", pfad), "utf8");

describe("Seite Anrufe entfernt", () => {
  it("leitet /anrufe auf das Dashboard weiter und lädt keine Seite mehr", () => {
    const app = lies("App.tsx");
    expect(app).toMatch(/<Route path="\/anrufe" element=\{<Navigate to="\/" replace \/>\} \/>/);
    expect(app).not.toMatch(/pages\/Anrufe/);
    expect(existsSync(resolve(__dirname, "..", "pages", "Anrufe.tsx"))).toBe(false);
  });

  it("hat keinen Menüpunkt Anrufe mehr", () => {
    for (const datei of ["components/AppSidebar.tsx", "lib/sidebarNavigation.ts"]) {
      expect(lies(datei), datei).not.toMatch(/url: "\/anrufe"/);
      expect(lies(datei), datei).not.toMatch(/title: "Anrufe"/);
    }
    for (const datei of ["components/nutzerverwaltung/NutzerProfilDialog.tsx", "pages/TeampartnerProfil.tsx"]) {
      expect(lies(datei), datei).not.toMatch(/"\/anrufe"/);
    }
  });

  it("führt die Seite weder in Suche, Tutorial noch Entwurfsliste", async () => {
    const { seitenFuerSuche } = await import("./sucheZiele");
    const { CRM_TUTORIAL_CONTENT } = await import("./crmTutorialContent");
    const { DRAFT_ROUTES } = await import("./draftRoutes");
    expect(seitenFuerSuche({ rolle: "admin", handbuchFrei: true }).map((z) => z.url)).not.toContain("/anrufe");
    expect(Object.keys(CRM_TUTORIAL_CONTENT)).not.toContain("/anrufe");
    expect(DRAFT_ROUTES).not.toContain("/anrufe");
    expect(lies("lib/routePrefetch.ts")).not.toMatch(/"\/anrufe"/);
  });

  it("gibt /anrufe in den eingebauten Rollenlisten nicht mehr frei", async () => {
    const { isUrlAllowedForRole } = await import("./sidebarPermissions");
    for (const rolle of ["vertriebspartner", "vertriebsleiter", "setterin", "backoffice", "buchhaltung", "hausverwaltung"] as const) {
      expect(isUrlAllowedForRole("/inbox", rolle), rolle).toBe(true);
      expect(isUrlAllowedForRole("/anrufe", rolle), rolle).toBe(false);
    }
  });
});
