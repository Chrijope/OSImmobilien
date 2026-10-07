import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { darfAbschlussStufeWechseln } from "./abwicklungStore";

/**
 * Stufe "abrechnung" wie "abgeschlossen" nur Admin, Inhaber, Backoffice
 * und Buchhaltung
 * (Christians Entscheidung vom 01.10.2026). Die Oberfläche sperrt, die
 * Datenbank (20261001120000) hält den gespeicherten Wert fest.
 */

const DATEI = "20261001120000_abrechnung_nur_backoffice.sql";
const SQL = readFileSync(`supabase/migrations/${DATEI}`, "utf8");
const KORB_PFAD = `supabase/migrations-inbox/${DATEI}`;

describe("darfAbschlussStufeWechseln: Abrechnung", () => {
  it("Partner setzt und verlässt Abrechnung nicht", () => {
    for (const rolle of ["vertriebspartner", "vertriebsleiter", "teamleiter"]) {
      expect(darfAbschlussStufeWechseln(rolle, "faelligkeit", "abrechnung")).toBe(false);
      expect(darfAbschlussStufeWechseln(rolle, "abrechnung", "faelligkeit")).toBe(false);
      expect(darfAbschlussStufeWechseln(rolle, undefined, "abrechnung")).toBe(false);
    }
  });

  it("Admin, Inhaber, Backoffice und Buchhaltung dürfen", () => {
    for (const rolle of ["admin", "inhaber", "backoffice", "buchhaltung"]) {
      expect(darfAbschlussStufeWechseln(rolle, "faelligkeit", "abrechnung")).toBe(true);
      expect(darfAbschlussStufeWechseln(rolle, "abrechnung", "faelligkeit")).toBe(true);
    }
  });

  it("gleiche Stufe bleibt frei", () => {
    expect(darfAbschlussStufeWechseln("vertriebspartner", "abrechnung", "abrechnung")).toBe(true);
  });
});

describe("Abwicklungskarte setzt Abrechnung nur mit Geldrechten", () => {
  it("Provisionsrechnung schaltet nur bei darfGeldfelder auf Abrechnung", () => {
    const kundenDetail = readFileSync("src/pages/KundenDetail.tsx", "utf8");
    // Seit M19 (04.10.2026) als Zielstufe, gesetzt erst nach gespeicherter Abwicklung.
    expect(kundenDetail).toContain(
      ': updated.provisionsRechnungGestellt && darfGeldfelder && ["notar", "faelligkeit"].includes(inv.pipelineStufe)',
    );
  });
});

describe("Migration abrechnung_nur_backoffice", () => {
  const waechter = SQL.slice(
    SQL.indexOf("CREATE OR REPLACE FUNCTION public.pipeline_abschluss_schuetzen()"),
    SQL.indexOf("\n$$;") + 4,
  );

  it("Wächter prüft beide Stufen, hinein und heraus", () => {
    expect(waechter).toContain(
      "IF coalesce(_alt, '') NOT IN ('abrechnung', 'abgeschlossen')\n     AND coalesce(_neu, '') NOT IN ('abrechnung', 'abgeschlossen') THEN",
    );
  });

  it("Admin, Inhaber, Backoffice, Buchhaltung und Server dürfen, keine current_user-Ausnahme", () => {
    expect(waechter).toContain(
      "IF auth.uid() IS NULL\n     OR public.is_admin_role(auth.uid())\n     OR public.has_role(auth.uid(), 'backoffice'::public.app_role)\n     OR public.has_role(auth.uid(), 'buchhaltung'::public.app_role) THEN",
    );
    expect(waechter).not.toContain("current_user");
    expect(waechter).not.toContain("RAISE EXCEPTION");
    expect(waechter).toContain("NEW.meta := _neu_meta || jsonb_build_object('pipelineStufe', _alt_wert);");
  });

  it("Trigger auf investments und kontakte, nicht direkt aufrufbar", () => {
    for (const tabelle of ["investments", "kontakte"]) {
      expect(SQL).toContain(
        `CREATE TRIGGER trg_absicherung_pipeline_abschluss\nBEFORE INSERT OR UPDATE OF meta ON public.${tabelle}`,
      );
    }
    expect(SQL).toContain("REVOKE ALL ON FUNCTION public.pipeline_abschluss_schuetzen() FROM PUBLIC, anon, authenticated;");
  });

  it("hat Prüfzeile 56.1", () => {
    const pruefung = readFileSync("supabase/migrations-inbox/99_PRUEFUNG.sql", "utf8");
    expect(pruefung).toContain("SELECT '56.1 ");
    expect(pruefung.trimEnd().endsWith(";")).toBe(true);
  });

  it("liegt, solange sie offen ist, im Eingangskorb und in der Sammeldatei", () => {
    if (!existsSync(KORB_PFAD)) return;
    expect(readFileSync(KORB_PFAD, "utf8")).toBe(SQL);
    expect(readFileSync("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql", "utf8")).toContain(SQL.trim());
  });
});
