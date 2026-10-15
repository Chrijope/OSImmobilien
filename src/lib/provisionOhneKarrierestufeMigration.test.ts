import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Migration provision_ohne_karrierestufe (15.10.2026). Ausfuehren laesst sie
 * sich hier nicht; der Quelltext haelt fest, was nicht passieren darf.
 */
const SQL = readFileSync("supabase/migrations/20261015120000_provision_ohne_karrierestufe.sql", "utf8");
const FUNKTION = SQL.slice(
  SQL.indexOf("CREATE OR REPLACE FUNCTION public.provisionssatz_fuer_partner"),
  SQL.indexOf("\n$$;", SQL.indexOf("CREATE OR REPLACE FUNCTION public.provisionssatz_fuer_partner")),
);

describe("Migration provision_ohne_karrierestufe", () => {
  it("sichert vor jeder Aenderung an user_settings", () => {
    const sicherung = SQL.indexOf("INSERT INTO public.user_settings_sicherung_20261015");
    expect(sicherung).toBeGreaterThan(0);
    expect(sicherung).toBeLessThan(SQL.indexOf("UPDATE public.user_settings u\n"));
    expect(sicherung).toBeLessThan(SQL.indexOf("INSERT INTO public.user_settings (user_id"));
  });

  it("fasst festgeschriebene Saetze und Bescheide nicht an", () => {
    expect(SQL).not.toMatch(/UPDATE public\.investments/);
    expect(SQL).not.toMatch(/UPDATE public\.provisionsabrechnungen/);
  });

  it("traegt nur bei Partnern ganz ohne Satz etwas ein", () => {
    for (const k of ["custom_provision_rate", "custom_provision_rate_setter", "custom_provision_rate_eigen"]) {
      expect(SQL).toContain(`'${k}') IS NULL`);
    }
  });

  it("die Satzermittlung kennt keine Karrierestufe mehr", () => {
    expect(FUNKTION).not.toContain("karriere_stufe_rate");
    expect(FUNKTION).not.toContain("karriere_stufen");
    expect(FUNKTION).toContain("custom_provision_rate_eigen");
    expect(FUNKTION).toContain("custom_provision_rate_setter");
  });
});
