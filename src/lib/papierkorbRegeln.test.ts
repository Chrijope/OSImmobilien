import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sidebarPermissions", () => ({
  isUrlAllowedForRole: (url: string, role: string) => url === "/papierkorb" && role === "individuell",
}));

import { darfEndgueltigLoeschen, darfWiederherstellen, siehtAlleGeloeschten, startRegister, zuweisbare } from "./papierkorbRegeln";

describe("Papierkorb: wer den Menüpunkt sieht, darf wiederherstellen", () => {
  it("Vertriebspartner dürfen, aber nur eigene", () => {
    expect(darfWiederherstellen("vertriebspartner")).toBe(true);
    expect(siehtAlleGeloeschten("vertriebspartner")).toBe(false);
  });

  it("eine Rolle mit Menüeintrag darf auch ohne eigene Liste", () => {
    expect(darfWiederherstellen("individuell")).toBe(true);
  });

  it("wer nichts davon hat, darf nicht", () => {
    expect(darfWiederherstellen("bewerber")).toBe(false);
    expect(startRegister("bewerber")).toBe("verloren");
  });

  it("öffnet bei Berechtigten gleich das Register Gelöscht", () => {
    expect(startRegister("vertriebspartner")).toBe("geloescht");
    expect(startRegister("admin")).toBe("geloescht");
  });

  it("Vertriebsleitung sieht alle Gelöschten und darf deshalb Leads in den Papierkorb legen (Lead-Verwaltung)", () => {
    expect(siehtAlleGeloeschten("vertriebsleiter")).toBe(true);
    expect(darfWiederherstellen("vertriebsleiter")).toBe(true);
    expect(siehtAlleGeloeschten("setterin")).toBe(false);
  });

  it("Zuweisung: nur sich selbst, wenn man nur eigene sieht", () => {
    const leute = [{ id: "a" }, { id: "b" }];
    expect(zuweisbare("vertriebspartner", "b", leute)).toEqual([{ id: "b" }]);
    expect(zuweisbare("vertriebsleiter", "b", leute)).toEqual(leute);
    expect(zuweisbare("vertriebspartner", null, leute)).toEqual([]);
  });
});

describe("Endgültig löschen (Entscheidung vom 26.09.2026)", () => {
  it("dürfen Admin, Inhaber und Vertriebsleitung, sonst niemand", () => {
    expect(darfEndgueltigLoeschen("admin")).toBe(true);
    expect(darfEndgueltigLoeschen("inhaber")).toBe(true);
    expect(darfEndgueltigLoeschen("vertriebsleiter")).toBe(true);
    for (const rolle of ["vertriebspartner", "setterin", "backoffice", "individuell", "kunde", ""]) {
      expect(darfEndgueltigLoeschen(rolle)).toBe(false);
    }
  });

  it("prüfen die Functions mit derselben Liste wie der Knopf", () => {
    const hart = readFileSync("supabase/functions/dsgvo-hard-delete/index.ts", "utf8");
    expect(hart).toContain("darfEndgueltigLoeschen((roles || []).map((r: any) => r.role))");
    expect(hart).not.toMatch(/r\.role === "admin" \|\| r\.role === "inhaber"/);
    // Das Protokoll nennt den Löschenden.
    expect(hart).toContain("actor: callerId");

    const speicher = readFileSync("supabase/functions/dsgvo-storage-cleanup/index.ts", "utf8");
    expect(speicher).toContain('new Set([...ENDGUELTIG_LOESCHEN_ROLLEN, "individuell"])');
  });

  it("zeigt den Knopf im Papierkorb nur, wer löschen darf", () => {
    const seite = readFileSync("src/pages/Papierkorb.tsx", "utf8");
    expect(seite).toContain("const darfPurge = darfEndgueltigLoeschen(user.role);");
    expect(seite).toContain("{darfPurge && (");
    expect(seite).toContain("{confirmPurge && darfPurge && (");
  });
});
