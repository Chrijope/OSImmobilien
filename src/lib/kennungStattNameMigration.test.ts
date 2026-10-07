import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Migration kennung_statt_name (28.09.2026).
 *
 * Ausfuehren laesst sie sich hier nicht. Der Quelltext haelt fest, dass die
 * drei Funktionen nicht mehr ueber den ersten Namenstreffer zuordnen und dass
 * die uebrigen Rumpfteile wortgleich zu ihren Vorlagen bleiben.
 */

const DATEI = "20260928180000_kennung_statt_name.sql";
const SQL = readFileSync(`supabase/migrations/${DATEI}`, "utf8");
const KORB_PFAD = `supabase/migrations-inbox/${DATEI}`;

function funktion(sql: string, kopf: string): string {
  const a = sql.indexOf(kopf);
  expect(a).toBeGreaterThanOrEqual(0);
  return sql.slice(a, sql.indexOf("\n$$;", a) + 4);
}

/** Entfernt die neuen Zeilen, damit der Rest mit der Vorlage vergleichbar wird. */
const ohneKommentare = (s: string) => s.split("\n").filter((z) => !z.trim().startsWith("--")).join("\n");

describe("Migration kennung_statt_name", () => {
  it("sucht den Partner nie mehr ueber den neuesten Namenstreffer", () => {
    expect(SQL).not.toContain("ORDER BY p.created_at DESC NULLS LAST");
    expect(SQL.match(/CASE WHEN count\(\*\) = 1 THEN \(array_agg\(p\.id\)\)\[1\] END INTO _vp_id/g)).toHaveLength(2);
  });

  it("wertet eigen/zugewiesen nur bei eindeutigem Namen des Partners als eigen", () => {
    expect(SQL).toContain("SELECT count(*) = 1 AND bool_and(p.id = _partner) INTO _eigen");
  });

  it("laesst die uebrigen Rumpfteile wortgleich", () => {
    const vorlagen: Array<[string, string]> = [
      ["20260818160000_empfehlungen_kontakt_id.sql", "CREATE OR REPLACE FUNCTION public.create_empfehlung_kontakt("],
      ["20260927020000_tippgeber_einverstaendnis.sql", "CREATE OR REPLACE FUNCTION public.create_tippgeber_lead("],
      ["20260909120000_provisionssatz_trigger_reparatur.sql", "CREATE OR REPLACE FUNCTION public.investments_provisionssatz_festschreiben()"],
    ];
    for (const [datei, kopf] of vorlagen) {
      const alt = ohneKommentare(funktion(readFileSync(`supabase/migrations/${datei}`, "utf8"), kopf)).split("\n");
      const neu = ohneKommentare(funktion(SQL, kopf)).split("\n");
      // Jede Zeile der Vorlage ausser der alten Namenssuche steht unveraendert da.
      const entfallen = alt.filter((z) => !neu.includes(z)).map((z) => z.trim());
      expect(entfallen.every((z) =>
        z.startsWith("SELECT p.id INTO _vp_id")
        || z.startsWith("WHERE lower(trim(p.name))")
        || z.startsWith("ORDER BY p.created_at")
        || z === "LIMIT 1;",
      )).toBe(true);
    }
  });

  it("liegt, solange sie offen ist, gleichlautend im Eingangskorb und in der Sammeldatei", () => {
    if (!existsSync(KORB_PFAD)) return;
    expect(readFileSync(KORB_PFAD, "utf8")).toBe(SQL);
    expect(readFileSync("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql", "utf8")).toContain(SQL.trim());
  });
});
