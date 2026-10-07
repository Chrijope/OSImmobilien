/**
 * Sperre im Profil nur über die Verwaltung (Migration 20260927010000).
 *
 * Vorher konnte ein gesperrter Nutzer mit noch gültiger Sitzung
 * `profiles.gesperrt` über die Schnittstelle selbst zurücksetzen. Geprüft wird
 * hier der Text der Migration, wie bei den übrigen Migrationen im Projekt,
 * und dass der Browser die Sperre nur dort schreibt, wo Admin und Inhaber
 * arbeiten.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const lies = (pfad: string) => readFileSync(join(process.cwd(), pfad), "utf8");
const MIGRATION = "supabase/migrations/20260927010000_profil_sperre_absichern.sql";
const sql = lies(MIGRATION);
const start = sql.indexOf("CREATE OR REPLACE FUNCTION public.profil_verwaltungsfelder_schutz_pruefen()");
const schutz = sql.slice(start, sql.indexOf("$$;", sql.indexOf("$$", start) + 2));

const GESCHUETZT = ["gesperrt", "gesperrt_grund", "unterlagen_frist_bis", "rollen_variante"];

describe("Sperre und Verwaltungsfelder im Profil", () => {
  it("lässt Dienstschlüssel, Admin und Inhaber durch, sonst Fehler mit 42501", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(schutz).toContain("auth.uid() IS NULL");
    expect(schutz).toContain("public.has_role(auth.uid(), 'admin'::public.app_role)");
    expect(schutz).toContain("public.has_role(auth.uid(), 'inhaber'::public.app_role)");
    expect(schutz).toContain("RAISE EXCEPTION");
    // Derselbe Code, den die Nutzerverwaltung schon als „Nur Admin und Inhaber“ übersetzt.
    expect(schutz).toContain("ERRCODE = '42501'");
  });

  it("greift nur bei geänderten Schutzfeldern, jedes wird verglichen", () => {
    for (const feld of GESCHUETZT) {
      expect(schutz, feld).toContain(`NEW.${feld} IS NOT DISTINCT FROM OLD.${feld}`);
    }
    expect(sql).toContain(
      "BEFORE INSERT OR UPDATE OF gesperrt, gesperrt_grund, unterlagen_frist_bis, rollen_variante",
    );
    expect(sql).toContain("DROP TRIGGER IF EXISTS trg_profil_verwaltungsfelder_schutz ON public.profiles;");
  });

  it("ein neues Profil mit Grundwerten geht immer durch", () => {
    expect(schutz).toMatch(/IF TG_OP = 'INSERT' THEN\s+[\s\S]*NEW\.gesperrt IS NOT TRUE/);
  });

  /*
   * Die beiden Stellen, die heute sperren, liegen hinter Admin und Inhaber.
   * Kommt eine dritte dazu, soll sie hier auffallen.
   */
  it("der Browser schreibt die Sperre nur in Nutzerverwaltung und Moderation", async () => {
    const { execSync } = await import("node:child_process");
    const treffer = execSync("grep -rlnE '\\bgesperrt(_grund)?\\s*:\\s*(true|false|null|grund|data\\.)' src || true", {
      encoding: "utf8",
    })
      .split("\n")
      .filter((z) => z && !z.includes(".test.") && !z.endsWith("integrations/supabase/types.ts"))
      .filter((z) => lies(z).includes('from("profiles")'))
      .sort();
    expect(treffer).toEqual(["src/lib/moderationStore.ts", "src/pages/Nutzerverwaltung.tsx"]);
  });

  it("liegt, solange sie offen ist, im Korb und in der Sammeldatei, Prüfzeilen bleiben", () => {
    const korb = "supabase/migrations-inbox/20260927010000_profil_sperre_absichern.sql";
    const sammel = lies("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql");
    expect(sammel).not.toMatch(/^(=======|<<<<<<<|>>>>>>>)/m);
    if (existsSync(korb)) {
      expect(lies(korb)).toBe(sql);
      expect(sammel).toContain(sql.trim());
    }
    const pruefung = lies("supabase/migrations-inbox/99_PRUEFUNG.sql");
    for (const nr of ["22.1", "22.2"]) expect(pruefung).toContain(`'${nr} `);
  });
});
