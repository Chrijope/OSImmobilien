import { describe, it, expect, vi } from "vitest";
import { INVESTMENTRECHNER_ROLLEN, canAccessInvestmentrechner } from "@/lib/investmentrechnerAccess";

// Der Supabase-Client wird beim Import von sidebarPermissions angezogen und
// wuerde im Test einen Realtime-Kanal oeffnen. Fuer die reine Regellogik
// reicht eine Attrappe, genau wie in sidebarPermissions.test.ts.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
  },
}));

const { isUrlAllowedForRole } = await import("@/lib/sidebarPermissions");

describe("Investmentrechner, Rollenfreigabe", () => {
  it("ist fuer die Vertriebsrollen offen, ohne Identitaet und ohne Datenbank", () => {
    for (const rolle of ["admin", "inhaber", "vertriebsleiter", "vertriebspartner", "objektpartner", "finanzierungspartner"]) {
      expect(canAccessInvestmentrechner(rolle), rolle).toBe(true);
      expect(isUrlAllowedForRole("/investmentrechner", rolle as never), rolle).toBe(true);
    }
  });

  it("nennt genau diese Rollen in der Liste", () => {
    expect([...INVESTMENTRECHNER_ROLLEN].sort()).toEqual(
      ["admin", "finanzierungspartner", "inhaber", "objektpartner", "vertriebsleiter", "vertriebspartner"],
    );
  });

  it("bleibt fuer alle anderen Rollen ohne Einzelfreigabe zu", () => {
    for (const rolle of [
      "backoffice", "hr", "buchhaltung", "hausverwaltung", "setterin",
      "versicherungsexperte", "marketing", "kunde", "tippgeber", "bewerber",
    ]) {
      expect(canAccessInvestmentrechner(rolle), rolle).toBe(false);
      expect(isUrlAllowedForRole("/investmentrechner", rolle as never), rolle).toBe(false);
    }
  });

  it("haengt beim Vertriebspartner nicht an der Karrierestufe", () => {
    // Die Rollenfreigabe steht vor der Stufenpruefung, und die Route hat
    // ohnehin keinen Mindestrang. Auch die unterste Stufe sieht den Rechner.
    expect(isUrlAllowedForRole("/investmentrechner", "vertriebspartner", undefined, "tippgeber")).toBe(true);
  });
});

describe("Investmentrechner, aktive Rolle statt Person", () => {
  // Bis zum 27.09.2026 oeffnete eine persoenliche Ausnahme den Rechner fuer
  // eine bestimmte Person in jeder Rolle. Jetzt zaehlt nur die aktive Rolle.
  const PERSON = { email: "h.vogl@vundp24.de", userId: "7a0e03f6-6614-4f47-830a-5ed454e4979d" };

  it("ist fuer dieselbe Person in der Rolle Vertriebspartner offen", () => {
    expect(isUrlAllowedForRole("/investmentrechner", "vertriebspartner", undefined, null, PERSON)).toBe(true);
  });

  it("bleibt fuer dieselbe Person in einer Rolle ohne Freigabe zu", () => {
    expect(isUrlAllowedForRole("/investmentrechner", "backoffice", undefined, null, PERSON)).toBe(false);
    expect(isUrlAllowedForRole("/investmentrechner", "kunde", undefined, null, PERSON)).toBe(false);
  });
});
