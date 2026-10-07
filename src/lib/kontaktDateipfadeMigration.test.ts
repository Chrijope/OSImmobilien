import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Migration 20260927000000: Verweise auf Dateien des aufgelösten Kontakts
 * umschreiben. Sie lässt sich hier nicht ausführen; der Quelltext hält die
 * Sicherungen fest, auf die sich die Edge Function verlässt.
 */

const DATEI = "20260927000000_kontakt_dateipfade_umschreiben.sql";
const SQL = readFileSync(`supabase/migrations/${DATEI}`, "utf8");
const KORB_PFAD = `supabase/migrations-inbox/${DATEI}`;
const CODE = SQL.split("\n").filter((z) => !z.trim().startsWith("--")).join("\n");

describe("Migration kontakt_dateipfade_umschreiben", () => {
  it("liegt, solange sie offen ist, gleichlautend im Eingangskorb, in der Sammeldatei und im README", () => {
    if (!existsSync(KORB_PFAD)) return;
    expect(readFileSync(KORB_PFAD, "utf8")).toBe(SQL);
    expect(readFileSync("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql", "utf8")).toContain(SQL.trim());
    expect(readFileSync("supabase/migrations-inbox/README.md", "utf8")).toContain(DATEI);
    expect(readFileSync("supabase/migrations-inbox/99_PRUEFUNG.sql", "utf8")).toContain("21.1 Duplikate zusammenfuehren");
  });

  it("ist nur für die Service-Rolle aufrufbar", () => {
    expect(CODE).toContain("SECURITY DEFINER");
    expect(CODE).toMatch(/REVOKE ALL ON FUNCTION public\.kontakt_dateipfade_umschreiben\([^)]*\) FROM public, anon, authenticated;/);
    expect(CODE).toMatch(/REVOKE ALL ON FUNCTION public\.kontakt_pfade_ersetzen\([^)]*\) FROM public, anon, authenticated;/);
    expect(CODE).not.toMatch(/GRANT EXECUTE[^;]*TO (anon|authenticated)/);
  });

  it("prüft Zusammenführung und Rechte des Aufrufers wie beim Zusammenführen", () => {
    expect(CODE).toContain("(_neu.meta->>'zusammengefuehrtIn') IS DISTINCT FROM _alt.id::text");
    expect(CODE).toContain("NOT coalesce(_neu.geloescht, false)");
    expect(CODE).toContain("public.darf_alle_kunden_sehen(_aufrufer)");
    expect(CODE).toContain("public.is_vp_owner_of_kontakt(_aufrufer, _alt.zustaendig_id, _alt.meta)");
    // Die Rechteprüfung steht vor jedem Schreibzugriff.
    expect(CODE.indexOf("darf_alle_kunden_sehen(_aufrufer)")).toBeLessThan(CODE.indexOf("UPDATE public."));
  });

  it("lässt nur Pfade zu, die vom aufgelösten zum behaltenen Kontakt führen", () => {
    expect(CODE).toContain("position(_neu.id::text IN _p.key) = 0");
    expect(CODE).toContain("position(_alt.id::text IN (_p.value #>> '{}')) = 0");
  });

  it("ersetzt längste Pfade zuerst, in JSON in maskierter Form, und lässt Protokolle unberührt", () => {
    expect(CODE).toContain("ORDER BY length(key) DESC");
    expect(CODE).toContain("to_jsonb(_p.key)::text");
    for (const log of ["audit_log", "dsgvo_deletion_log", "activity_log"]) expect(CODE).toContain(`'${log}'`);
  });
});
