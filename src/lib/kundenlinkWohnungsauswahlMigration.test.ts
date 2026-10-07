/**
 * Wohnungsauswahl am Kundenlink (Christian, 05.10.2026): Migration
 * 20261005100000 und ihr Platz im Eingangskorb.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const lies = (pfad: string) => readFileSync(pfad, "utf8");

const DATEI = "20261005100000_kundenlink_wohnungsauswahl.sql";
const SQL = lies(`supabase/migrations/${DATEI}`);

describe(DATEI, () => {
  it("legt die Spalte leer an, ändert keine Daten und ist wiederholbar", () => {
    expect(SQL).toContain("ADD COLUMN IF NOT EXISTS wohnung_auswahl uuid[];");
    // Nur der Auslöser nennt UPDATE, als Ereignis; Daten ändert die Migration nicht.
    expect(SQL.replace("BEFORE INSERT OR UPDATE ON", "")).not.toMatch(/\bUPDATE\b|\bDELETE\b|\bDEFAULT\b/);
    expect(SQL).toContain("IF NOT EXISTS (\n    SELECT 1 FROM pg_constraint WHERE conname = 'objekt_exposes_wohnung_auswahl_check'");
  });

  it("lässt eine Liste nur bei der Objektübersicht zu und nie leer", () => {
    expect(SQL).toContain("CHECK (wohnung_auswahl IS NULL OR (art = 'objektuebersicht' AND cardinality(wohnung_auswahl) >= 1))");
  });

  it("lässt Art und Auswahl nur den Server ändern, Dienstrolle und SQL-Editor bleiben frei", () => {
    expect(SQL).toContain("NOT IN ('authenticated', 'anon') THEN\n    RETURN NEW;");
    expect(SQL).toContain("IF NEW.art IS DISTINCT FROM 'expose' OR NEW.wohnung_auswahl IS NOT NULL THEN");
    expect(SQL).toContain("ELSIF NEW.art IS DISTINCT FROM OLD.art OR NEW.wohnung_auswahl IS DISTINCT FROM OLD.wohnung_auswahl THEN");
    expect(SQL).toContain("BEFORE INSERT OR UPDATE ON public.objekt_exposes");
    expect(SQL).toContain("DROP TRIGGER IF EXISTS trg_objekt_exposes_kundenlink_nur_server");
  });

  it("der Browser schreibt Art und Auswahl nirgends selbst", () => {
    const store = lies("src/lib/objektExposeStore.ts");
    expect(store).not.toMatch(/wohnung_auswahl:/);
    expect(store).not.toMatch(/\bart: ["']objektuebersicht["']/);
  });

  it("bricht ohne die Spalte `art` ab, bevor sie etwas ändert", () => {
    expect(SQL.indexOf("RAISE EXCEPTION")).toBeLessThan(SQL.indexOf("ALTER TABLE"));
  });
});

describe("Eingangskorb", () => {
  it("hat die Prüfzeile 85.1, nur die letzte Zeile endet mit Semikolon", () => {
    const pruefung = lies("supabase/migrations-inbox/99_PRUEFUNG.sql");
    expect(pruefung).toContain("SELECT '85.1 ");
    expect(pruefung).toContain("SELECT '85.2 ");
    expect(pruefung).toContain("'fehlt (20261005100000 ausfuehren)'");
    const schluss = pruefung.split("\n").filter((z) => !z.trim().startsWith("--") && z.trimEnd().endsWith(";"));
    expect(schluss).toHaveLength(1);
  });

  it("liegt, solange offen, unverändert im Korb, in der Sammeldatei und im README", () => {
    const korb = `supabase/migrations-inbox/${DATEI}`;
    if (!existsSync(korb)) return;
    expect(lies(korb)).toBe(SQL);
    expect(lies("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql")).toContain(SQL.trim());
    expect(lies("supabase/migrations-inbox/README.md")).toContain(`\`${DATEI}\``);
  });
});
