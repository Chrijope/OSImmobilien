import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * M10 (04.10.2026): Notartermin-Glocke und die Anfrage-Glocken an Admin und
 * Inhaber laufen über einen Helfer mit Fehlerprüfung. Vorher hieß es
 * „gesendet“, auch wenn nichts angekommen war.
 */

const profil = readFileSync(resolve(__dirname, "../pages/KundenDetail.tsx"), "utf-8");

describe("glockeAnAdmins im Kundenprofil", () => {
  const helfer = profil.slice(profil.indexOf("async function glockeAnAdmins("), profil.indexOf("export default function KundenDetail()"));

  it("liest Admin und Inhaber, jede Person einmal, und legt über benachrichtigungAnlegen an", () => {
    expect(helfer).toContain('.in("role", ["admin", "inhaber"])');
    expect(helfer).toContain("new Set(");
    expect(helfer).toContain("benachrichtigungAnlegen({ benutzer_id, titel, nachricht, link })");
    expect(helfer).toContain("return angekommen.some(Boolean);");
  });

  it("keine Glocke mehr direkt in benachrichtigungen an Admins aus Reservierung und Notar", () => {
    expect(profil).not.toMatch(/for \(const ar of adminRoles\)/);
    expect((profil.match(/await glockeAnAdmins\(/g) ?? []).length).toBe(4);
  });

  it("meldet „gesendet“ erst nach der Prüfung", () => {
    let start = 0;
    for (let i = 0; i < 3; i++) {
      const aufruf = profil.indexOf("const angekommen = await glockeAnAdmins(", start);
      const pruefung = profil.indexOf("if (!angekommen) {", aufruf);
      const erfolg = profil.indexOf('toast({ title: "Anfrage gesendet"', aufruf) >= 0
        ? Math.min(
          ...[profil.indexOf('toast({ title: "Anfrage gesendet"', aufruf), profil.indexOf('toast({ title: "Löschanfrage gesendet"', aufruf)].filter((x) => x >= 0),
        )
        : -1;
      expect(aufruf).toBeGreaterThan(-1);
      expect(pruefung).toBeGreaterThan(aufruf);
      expect(erfolg).toBeGreaterThan(pruefung);
      start = aufruf + 1;
    }
  });

  it("kein Gedankenstrich als Platzhalter für den Absender", () => {
    expect(profil).not.toContain('VP ${kunde.berater || "–"}');
  });
});
