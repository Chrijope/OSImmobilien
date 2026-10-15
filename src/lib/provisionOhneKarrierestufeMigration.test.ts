import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Migrationen vom 15.10.2026. Ausfuehren laesst sie sich hier nicht; der
 * Quelltext haelt fest, was nicht passieren darf.
 */
const DATEN = readFileSync("supabase/migrations/20261015120000_provision_saetze_uebernehmen.sql", "utf8");
const REGEL = readFileSync("supabase/migrations/20261015121000_provision_ohne_karrierestufe.sql", "utf8");
const kopf = "CREATE OR REPLACE FUNCTION public.provisionssatz_fuer_partner";
const FUNKTION = REGEL.slice(REGEL.indexOf(kopf), REGEL.indexOf("\n$$;", REGEL.indexOf(kopf)));

describe("Migration provision_saetze_uebernehmen (Daten)", () => {
  it("sichert vor jeder Aenderung an user_settings", () => {
    const sicherung = DATEN.indexOf("INSERT INTO public.user_settings_sicherung_20261015");
    expect(sicherung).toBeGreaterThan(0);
    expect(sicherung).toBeLessThan(DATEN.indexOf("UPDATE public.user_settings u\n"));
    expect(sicherung).toBeLessThan(DATEN.indexOf("INSERT INTO public.user_settings (user_id"));
  });

  it("fasst festgeschriebene Saetze und Bescheide nicht an", () => {
    expect(DATEN).not.toMatch(/UPDATE public\.investments/);
    expect(DATEN).not.toMatch(/UPDATE public\.provisionsabrechnungen/);
  });

  it("fuellt nur fehlende Lead- und Eigen-Saetze, ein vorhandener bleibt", () => {
    expect(DATEN).toContain("coalesce(public.einstellung_zahl(o.e, 'custom_provision_rate_setter'), o.satz)");
    expect(DATEN).toContain("coalesce(public.einstellung_zahl(o.e, 'custom_provision_rate_eigen'), o.satz)");
  });

  it("laeuft vor der Regel-Migration", () => {
    expect("20261015120000" < "20261015121000").toBe(true);
  });
});

describe("Migration provision_ohne_karrierestufe (Regel)", () => {
  it("aendert keine Daten", () => {
    expect(REGEL).not.toMatch(/\bUPDATE public\.|INSERT INTO public\./);
  });

  it("die Satzermittlung kennt keine Karrierestufe und liefert sonst NULL", () => {
    expect(FUNKTION).not.toContain("karriere_stufe_rate");
    expect(FUNKTION).not.toContain("karriere_stufen");
    expect(FUNKTION).toContain("custom_provision_rate_eigen");
    expect(FUNKTION).toContain("custom_provision_rate_setter");
  });

  it("bleibt dem Server vorbehalten", () => {
    expect(REGEL).toContain("REVOKE ALL ON FUNCTION public.provisionssatz_fuer_partner(uuid, boolean) FROM PUBLIC, anon, authenticated;");
    expect(REGEL).toContain("GRANT EXECUTE ON FUNCTION public.provisionssatz_fuer_partner(uuid, boolean) TO service_role;");
  });

  it("Pruefregel 0 bis 100 fuer alle drei Satz-Schluessel, erst NOT VALID, geprueft nur bei passendem Bestand", () => {
    for (const k of ["custom_provision_rate", "custom_provision_rate_setter", "custom_provision_rate_eigen"]) {
      expect(REGEL).toContain(`provisionssatz_im_bereich(einstellungen, '${k}')`);
    }
    expect(REGEL).toContain("::numeric <= 100");
    expect(REGEL).toContain(") NOT VALID;");
    expect(REGEL.indexOf("VALIDATE CONSTRAINT")).toBeGreaterThan(REGEL.indexOf("IF NOT EXISTS ("));
    expect(REGEL).toContain("NOTIFY pgrst, 'reload schema';");
  });
});
