import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Migration investment1_startstufe_vom_kontakt (11.10.2026).
 *
 * Ausfuehren laesst sie sich hier nicht. Der Quelltext haelt fest: Investment 1
 * uebernimmt die Startstufe des Kontakts, soweit sie zur fruehen Phase gehoert,
 * sonst 'neuer_lead'. Auch Bestandsimporte bekommen Investment 1, in ihrer
 * eigenen Stufe; nur ein Kontakt mit Investment bekommt keines dazu.
 */
const SQL = readFileSync("supabase/migrations/20261011150000_investment1_startstufe_vom_kontakt.sql", "utf8");
const ohneKommentare = SQL.split("\n").filter((z) => !z.trim().startsWith("--")).join("\n");

describe("Migration investment1_startstufe_vom_kontakt", () => {
  it("Investment 1 bekommt die Startstufe des Kontakts, ohne Stufe neuer_lead", () => {
    expect(ohneKommentare).toContain("_stufe text := COALESCE(NULLIF(NEW.meta->>'pipelineStufe', ''), 'neuer_lead');");
    expect(ohneKommentare).toContain("'pipelineStufe', _stufe");
  });

  it("uebernimmt nur fruehe Stufen, alles andere startet bei neuer_lead", () => {
    const liste = ohneKommentare.slice(ohneKommentare.indexOf("ELSIF _stufe NOT IN ("), ohneKommentare.indexOf(") THEN", ohneKommentare.indexOf("ELSIF _stufe NOT IN (")));
    for (const s of ["neuer_lead", "zugewiesen", "erreicht", "follow_up", "erstgespraech_geplant", "beratungsgespraech", "objektauswahl"]) {
      expect(liste).toContain(`'${s}'`);
    }
    // Ab der Reservierung haengen echte Daten am Investment, die ein Formular nicht setzen darf.
    for (const s of ["reservierung", "finanzierung", "notar", "abrechnung", "abgeschlossen"]) {
      expect(liste).not.toContain(`'${s}'`);
    }
    expect(ohneKommentare).toContain("_stufe := 'neuer_lead';");
  });

  it("Altschreibweise und Terminlead werden zu erstgespraech_geplant", () => {
    expect(ohneKommentare).toContain("IF _stufe IN ('erstgespraech', 'termin_gebucht') THEN\n    _stufe := 'erstgespraech_geplant';");
  });

  it("legt kein zweites Investment an", () => {
    expect(ohneKommentare).toContain("IF EXISTS (SELECT 1 FROM public.investments WHERE kunde_id = NEW.id) THEN");
  });

  it("Bestandsimport bekommt Investment 1 in der eigenen Stufe, keine Ausnahme mehr", () => {
    expect(ohneKommentare).toContain("'bg_noshow', 'objektauswahl', 'bestandsimport'");
    expect(ohneKommentare).not.toMatch(/= 'bestandsimport' THEN\s+RETURN NEW/);
  });

  it("aendert nur die Funktion, keine Daten", () => {
    expect(ohneKommentare).toContain("CREATE OR REPLACE FUNCTION public.auto_create_investment_for_kontakt()");
    expect(ohneKommentare).not.toMatch(/\b(UPDATE|DELETE)\b/);
  });
});
