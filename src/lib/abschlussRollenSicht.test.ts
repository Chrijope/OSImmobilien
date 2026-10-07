import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ABSCHLUSS_NUR_ROLLEN, ABSCHLUSS_STUFEN, darfAbschlussStufeWechseln } from "./abwicklungStore";

/*
 * H9 (04.10.2026): Backoffice und Buchhaltung setzen „Abrechnung“ und
 * „Abgeschlossen“ im Kundenprofil und in der Pipeline. Die Rechte in der
 * Datenbank liefen schon (pipeline_abschluss_schuetzen).
 */

const lies = (pfad: string) => readFileSync(resolve(__dirname, "../..", pfad), "utf-8");

describe("Abschlussrollen", () => {
  it("sind Backoffice und Buchhaltung, beide dürfen die zwei Stufen setzen", () => {
    expect([...ABSCHLUSS_NUR_ROLLEN]).toEqual(["backoffice", "buchhaltung"]);
    expect([...ABSCHLUSS_STUFEN]).toEqual(["abrechnung", "abgeschlossen"]);
    for (const rolle of ABSCHLUSS_NUR_ROLLEN) {
      expect(darfAbschlussStufeWechseln(rolle, "faelligkeit", "abrechnung")).toBe(true);
      expect(darfAbschlussStufeWechseln(rolle, "abrechnung", "abgeschlossen")).toBe(true);
    }
  });

  it("Kundenprofil: Klick auf die Station setzt für diese Rollen nur die beiden Stufen", () => {
    const profil = lies("src/pages/KundenDetail.tsx");
    expect(profil).toContain("const darfSetzen = (key: string) => isAdminOverride || (istAbschlussRolle && ABSCHLUSS_STUFEN.includes(key));");
    expect(profil).toContain("if (!isAdminOverride && istAbschlussRolle && darfSetzen(s.key) && !e.altKey && !isCurrent) {");
    expect(profil).toContain("if (!(await updateInvestment(inv.id, { pipelineStufe: s.key }))) return;");
  });

  it("Pipeline: ganzes Haus sichtbar, Ziehen nur nach Abrechnung und Abgeschlossen", () => {
    const pipeline = lies("src/pages/Pipeline.tsx");
    expect(pipeline).toContain('const siehtGanzesHaus = umfang === "haus" || ABSCHLUSS_NUR_ROLLEN.includes(user.role);');
    expect(pipeline).toContain("const nurAbschluss = ABSCHLUSS_NUR_ROLLEN.includes(user.role) && !ABSCHLUSS_STUFEN.includes(toKey);");
  });

  it("Buchhaltung bekommt Kundenprofil und Pipeline, im Rückfall und in der Datenbank", () => {
    const fallback = lies("src/lib/sidebarPermissions.ts");
    const block = fallback.slice(fallback.indexOf("  buchhaltung: ["), fallback.indexOf("  setterin: ["));
    expect(block).toContain('"/kunden", "/pipeline"');
    const DATEI = "20261004171000_buchhaltung_kundenprofil_pipeline.sql";
    const sql = lies(`supabase/migrations/${DATEI}`);
    expect(sql).toContain("('buchhaltung', '/kunden')");
    expect(sql).toContain("('buchhaltung', '/pipeline')");
    expect(sql).toContain("ON CONFLICT DO NOTHING;");
    const korb = `supabase/migrations-inbox/${DATEI}`;
    if (existsSync(resolve(__dirname, "../..", korb))) {
      expect(lies(korb)).toBe(sql);
      expect(lies("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql")).toContain(sql.trim());
    }
  });
});
