import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Wer sieht den Eintrag „Stellenanzeige" in der Seitenleiste, und wer kommt an
 * die Seite?
 *
 * Christians Vorgabe: dieselben Rollen wie der Eintrag der Landingpage direkt
 * darüber. Die Seite selbst ist öffentlich, Bewerber haben kein Konto.
 *
 * Geprüft wird der Wortlaut von `AppSidebar.tsx` und `App.tsx`, nicht ein
 * nachgebauter Router, wie in `ExpatsCalculatorZugang.test.tsx`.
 */

// `sidebarPermissions` zieht den Supabase-Client mit; ohne Datenbank gilt die
// Rückfallliste im Code, dieselbe Lage wie beim ersten Laden der App.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
  },
}));

const { isUrlAllowedForRole, istRouteGesperrt, greiftAdminRiegel } = await import("@/lib/sidebarPermissions");

// Die Eintraege der Seitenleiste stehen seit dem 28.09.2026 in `sidebarNavigation.ts`.
const SIDEBAR = readFileSync(resolve(__dirname, "./sidebarNavigation.ts"), "utf8");
const APP = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");

const LANDING_URL = "/karriere/vertriebspartner-immobilien";
const STELLEN_URL = "/karriere/stellenanzeige";

const ROLLEN = [
  "inhaber", "admin", "individuell", "testaccount", "hr", "vertriebsleiter", "vertriebspartner",
  "backoffice", "buchhaltung", "setterin", "objektpartner", "finanzierungspartner",
  "hausverwaltung", "versicherungsexperte", "kunde", "tippgeber",
] as const;

/** Die Zeile eines Eintrags in der Seitenleiste, als Objekt ohne Titel, Adresse und Symbol. */
function eintrag(url: string): { zeile: string; merkmale: string } {
  const zeile = SIDEBAR.split("\n").find((z) => z.includes(`url: "${url}"`) && z.includes("title:"));
  if (!zeile) throw new Error(`Kein Eintrag für ${url}`);
  const merkmale = zeile
    .replace(/title: "[^"]*",\s*/, "")
    .replace(/url: "[^"]*",\s*/, "")
    .replace(/icon: \w+,?\s*/, "")
    .trim();
  return { zeile, merkmale };
}

describe("Der Eintrag in der Seitenleiste", () => {
  it("heißt Stellenanzeige und ist Admin und Inhaber vorbehalten", () => {
    expect(eintrag(STELLEN_URL).zeile).toContain('title: "Stellenanzeige"');
    expect(eintrag(STELLEN_URL).merkmale).toContain("adminOnly: true");
  });

  it("die Landingpage steht nicht mehr in der Seitenleiste (Christian, 24.09.2026)", () => {
    expect(SIDEBAR.split("\n").some((z) => z.includes(`url: "${LANDING_URL}"`) && z.includes("title:"))).toBe(false);
  });

  it("ist für jede Rolle genau dann sichtbar, wenn es die Landingpage ist", () => {
    const riegel = { adminOnly: true };
    for (const rolle of ROLLEN) {
      const landing = !greiftAdminRiegel(riegel, rolle) && isUrlAllowedForRole(LANDING_URL, rolle);
      const stellen = !greiftAdminRiegel(riegel, rolle) && isUrlAllowedForRole(STELLEN_URL, rolle);
      expect(stellen, rolle).toBe(landing);
    }
  });

  it("zeigt sich Admin und Inhaber, dem Vertrieb und HR nicht", () => {
    const sichtbar = (rolle: (typeof ROLLEN)[number]) =>
      !greiftAdminRiegel({ adminOnly: true }, rolle) && isUrlAllowedForRole(STELLEN_URL, rolle);
    expect(sichtbar("admin")).toBe(true);
    expect(sichtbar("inhaber")).toBe(true);
    expect(sichtbar("vertriebspartner")).toBe(false);
    expect(sichtbar("hr")).toBe(false);
    expect(sichtbar("kunde")).toBe(false);
  });

  it("braucht keine eigene Freigabe in role_permissions, weil sie unter /karriere liegt", () => {
    // Wer /karriere freigegeben hat, hat damit auch die Stellenanzeige.
    for (const rolle of ["hr", "vertriebsleiter"] as const) {
      expect(isUrlAllowedForRole("/karriere", rolle), rolle).toBe(true);
      expect(isUrlAllowedForRole(STELLEN_URL, rolle), rolle).toBe(true);
    }
  });
});

describe("Die Seite ist öffentlich", () => {
  const OEFFENTLICH = APP.split("<Route element={<AppShell />}>")[0];

  it("steht vor dem Anmeldeschutz", () => {
    expect(APP).toContain("<Route element={<AppShell />}>");
    expect(OEFFENTLICH).toContain(`<Route path="${STELLEN_URL}" element={<StellenanzeigePage />} />`);
  });

  it("steht vor /karriere/:stelleId", () => {
    expect(APP.indexOf(`path="${STELLEN_URL}"`)).toBeLessThan(APP.indexOf('path="/karriere/:stelleId"'));
  });

  it("ist für keine Rolle gesperrt", () => {
    for (const rolle of ROLLEN) expect(istRouteGesperrt(STELLEN_URL, rolle), rolle).toBe(false);
  });
});
