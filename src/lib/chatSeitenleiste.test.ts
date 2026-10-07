import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

/**
 * Der Chat in der Seitenleiste, Stand 25.09.2026.
 *
 * Christian: Der Chat soll fuer alle Rollen ganz oben stehen, direkt unter der
 * Inbox, und auch der Vertriebspartner soll ihn sehen. Vorher lag er unter
 * Support mit `adminOnly` und war nur fuer Admin, Inhaber und hr sichtbar.
 *
 * Geprueft wird der Wortlaut von `AppSidebar.tsx`, wie in
 * `stellenanzeigeFreigabe.test.ts`, und die Routenfreigabe.
 */

// Ohne Datenbank gilt die Rueckfallliste im Code, dieselbe Lage wie beim
// ersten Laden der App.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
  },
}));

const { isUrlAllowedForRole, greiftAdminRiegel } = await import("@/lib/sidebarPermissions");

const SIDEBAR = readFileSync(resolve(__dirname, "../components/AppSidebar.tsx"), "utf8");
// Die Menuelisten stehen seit dem 28.09.2026 in `sidebarNavigation.ts`, die
// Seitenleiste und die globale Suche lesen beide daraus.
const NAVIGATION = readFileSync(resolve(__dirname, "./sidebarNavigation.ts"), "utf8");

/** Der Quelltext einer Liste `const <name> = [ ... ];`. */
function liste(name: string): string {
  const start = NAVIGATION.indexOf(`const ${name} = [`);
  if (start < 0) throw new Error(`Liste ${name} fehlt`);
  return NAVIGATION.slice(start, NAVIGATION.indexOf("\n];", start));
}

function titelIn(name: string): string[] {
  return [...liste(name).matchAll(/title: "([^"]+)"/g)].map((m) => m[1]);
}

const INTERNE_ROLLEN = [
  "inhaber", "admin", "individuell", "testaccount", "hr", "vertriebsleiter", "vertriebspartner",
  "backoffice", "buchhaltung", "setterin", "objektpartner", "finanzierungspartner",
  "hausverwaltung", "versicherungsexperte",
] as const;

describe("Chat in der Seitenleiste", () => {
  it("steht direkt unter der Inbox", () => {
    expect(titelIn("mainItems")).toEqual(["Dashboard", "Inbox", "Chat", "Kalender", "News & Updates"]);
  });

  it("steht nicht mehr unter Support", () => {
    expect(liste("helpdeskItems")).not.toContain('url: "/chat"');
  });

  it("traegt keinen Admin-Riegel mehr", () => {
    const zeile = liste("mainItems").split("\n").find((z) => z.includes('url: "/chat"'))!;
    expect(zeile).not.toContain("adminOnly");
    expect(zeile).not.toContain("auchFuer");
    // Der Eintrag, wie er jetzt steht: ohne adminOnly und ohne auchFuer.
    const eintrag: { adminOnly?: boolean; auchFuer?: string[] } = {};
    for (const rolle of INTERNE_ROLLEN) {
      expect(greiftAdminRiegel(eintrag, rolle), rolle).toBe(false);
    }
  });

  it("bekommt den Zaehler ungelesener Nachrichten am neuen Platz", () => {
    expect(SIDEBAR).toMatch(/item\.url === "\/chat"\) return \{ \.\.\.item, badgeCount: unreadChats \}/);
  });

  it("ist fuer jede interne Rolle als Seite freigegeben, nicht nur als Knopf", () => {
    for (const rolle of INTERNE_ROLLEN) {
      expect(isUrlAllowedForRole("/chat", rolle), rolle).toBe(true);
      expect(isUrlAllowedForRole("/chat?id=abc", rolle), rolle).toBe(true);
    }
  });

  it("gilt fuer den Vertriebspartner auf jeder Karrierestufe", () => {
    for (const stufe of ["tippgeber", "vertriebspartner", "manager", "vertriebsfirma", null]) {
      expect(isUrlAllowedForRole("/chat", "vertriebspartner", [], stufe), String(stufe)).toBe(true);
    }
  });

  it("Kunden und Tippgeber bleiben in ihrem eigenen Chat", () => {
    expect(isUrlAllowedForRole("/chat", "kunde")).toBe(false);
    expect(isUrlAllowedForRole("/chat", "tippgeber")).toBe(false);
    expect(isUrlAllowedForRole("/kunde/chat", "kunde")).toBe(true);
  });
});
