import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizePipelineStufe } from "@/lib/kontaktPipeline";

/**
 * Migration pipeline_am_investment (Etappe 1, 11.10.2026).
 *
 * Ausfuehren laesst sie sich hier nicht. Der Quelltext haelt fest: erst
 * sichern, dann nachlegen und angleichen, erst danach den Nachfuehr-Trigger
 * anlegen (sonst laeutete die Glocke fuer jeden Kontakt), und die
 * Normalisierung in SQL folgt `normalizePipelineStufe`.
 */
const SQL = readFileSync("supabase/migrations/20261016201000_pipeline_am_investment.sql", "utf8");
const code = SQL.split("\n").filter((z) => !z.trim().startsWith("--")).join("\n");

describe("Migration pipeline_am_investment", () => {
  it("Reihenfolge: Sicherung, Nachlegen, Angleichen, dann erst der Trigger", () => {
    const sicherung = code.indexOf("CREATE TABLE IF NOT EXISTS public.investments_sicherung_20261011");
    const nachlegen = code.indexOf("INSERT INTO public.investments");
    const angleichen = code.indexOf("UPDATE public.investments i");
    const trigger = code.indexOf("CREATE TRIGGER trg_kontakt_stufe_nachfuehren");
    expect(sicherung).toBeGreaterThan(0);
    expect(nachlegen).toBeGreaterThan(sicherung);
    expect(angleichen).toBeGreaterThan(nachlegen);
    expect(trigger).toBeGreaterThan(angleichen);
  });

  it("die Sicherung ist ueber die API nicht lesbar", () => {
    expect(code).toContain("ALTER TABLE public.investments_sicherung_20261011 ENABLE ROW LEVEL SECURITY;");
    expect(code).toContain("REVOKE ALL ON public.investments_sicherung_20261011 FROM anon, authenticated;");
  });

  it("aendert nur Investments, die gesichert sind, und keine Kontaktstufe direkt", () => {
    const update = code.slice(code.indexOf("UPDATE public.investments i"), code.indexOf("CREATE OR REPLACE FUNCTION public.kontakt_stufe_aus_investments"));
    expect(update).toContain("WHERE s.id = i.id");
    // Die einzige Aenderung am Kontakt steckt im Trigger.
    expect(code.match(/UPDATE public\.kontakte/g)?.length).toBe(1);
  });

  it("legt nachgelegte Investments wiederfindbar an", () => {
    expect(code).toContain("'nachgelegt_am', '2026-10-11'");
    expect(code).toContain("WHERE NOT EXISTS (SELECT 1 FROM public.investments i WHERE i.kunde_id = k.id);");
  });

  it("der Trigger schreibt den Kontakt nur bei einer echten Aenderung", () => {
    expect(code).toContain("AND (meta->>'pipelineStufe') IS DISTINCT FROM _stufe;");
    expect(code).toContain("AND OLD.meta->>'pipelineStufe' IS NOT DISTINCT FROM NEW.meta->>'pipelineStufe'");
  });

  it("laesst beim Anlegen eines Kontakts (Investment 1) die Kontaktstufe in Ruhe", () => {
    expect(code).toContain("AND NOT EXISTS (SELECT 1 FROM public.investments WHERE kunde_id = _kontakt AND id <> NEW.id) THEN");
  });

  it("die SQL-Normalisierung bildet dieselben Altschreibweisen ab wie die Oberflaeche", () => {
    const zuordnung: Record<string, string> = {
      after_sales: "faelligkeit",
      aftersales: "faelligkeit",
      closing: "objektauswahl",
      erstgespraech: "erstgespraech_geplant",
      notar_mit_gs: "notar",
      notar_ohne_gs: "notar",
    };
    for (const [alt, neu] of Object.entries(zuordnung)) {
      expect(normalizePipelineStufe(alt)).toBe(neu);
      expect(code).toMatch(new RegExp(`WHEN s (=|IN \\()[^\\n]*'${alt}'[^\\n]*THEN '${neu}'`));
    }
  });
});
