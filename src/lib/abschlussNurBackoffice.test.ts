import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ABSCHLUSS_HINWEIS, darfAbschlussStufeWechseln } from "./abwicklungStore";

/**
 * Stufe "abgeschlossen" nur Admin, Inhaber, Backoffice (Christians
 * Entscheidung vom 29.09.2026). Die Oberfläche sperrt, die Datenbank
 * (20260930150000) hält den gespeicherten Wert fest.
 */

const DATEI = "20260930150000_abschluss_nur_backoffice.sql";
const SQL = readFileSync(`supabase/migrations/${DATEI}`, "utf8");
const KORB_PFAD = `supabase/migrations-inbox/${DATEI}`;
const PRUEFUNG = readFileSync("supabase/migrations-inbox/99_PRUEFUNG.sql", "utf8");
const WAECHTER = SQL.slice(
  SQL.indexOf("CREATE OR REPLACE FUNCTION public.pipeline_abschluss_schuetzen()"),
  SQL.indexOf("\n$$;") + 4,
);

describe("darfAbschlussStufeWechseln", () => {
  it("Admin, Inhaber und Backoffice setzen und verlassen den Abschluss", () => {
    for (const rolle of ["admin", "inhaber", "backoffice"]) {
      expect(darfAbschlussStufeWechseln(rolle, "abrechnung", "abgeschlossen")).toBe(true);
      expect(darfAbschlussStufeWechseln(rolle, "abgeschlossen", "notar")).toBe(true);
    }
  });

  it("alle anderen weder hinein noch heraus", () => {
    for (const rolle of ["vertriebspartner", "vertriebsleiter", "teamleiter", "setter"]) {
      expect(darfAbschlussStufeWechseln(rolle, "abrechnung", "abgeschlossen")).toBe(false);
      expect(darfAbschlussStufeWechseln(rolle, "abgeschlossen", "faelligkeit")).toBe(false);
      expect(darfAbschlussStufeWechseln(rolle, undefined, "abgeschlossen")).toBe(false);
    }
  });

  it("andere Stufen bleiben frei (Abrechnung siehe abrechnungNurBackoffice.test.ts)", () => {
    expect(darfAbschlussStufeWechseln("vertriebspartner", "notar", "faelligkeit")).toBe(true);
    expect(darfAbschlussStufeWechseln("vertriebspartner", "abgeschlossen", "abgeschlossen")).toBe(true);
  });

  it("der Hinweis nennt das Backoffice, ohne Gedankenstrich", () => {
    expect(ABSCHLUSS_HINWEIS).toContain("Backoffice");
    expect(ABSCHLUSS_HINWEIS).not.toMatch(/[–—]/);
  });
});

describe("Oberfläche sperrt den Abschluss", () => {
  const pipeline = readFileSync("src/pages/Pipeline.tsx", "utf8");
  const kundenDetail = readFileSync("src/pages/KundenDetail.tsx", "utf8");

  it("Pipeline: Ziehen prüft die echte Stufe, auch aus der Spalte Bestandskunden", () => {
    const ablage = pipeline.slice(pipeline.indexOf("const handleDropOnStufe"), pipeline.indexOf("const setStufeOnly"));
    expect(ablage).toContain("getInvestmentById(dragEntry.investmentId)?.pipelineStufe");
    expect(ablage).toContain("darfAbschlussStufeWechseln(user.role, echteVon, toKey)");
    expect(ablage.indexOf("darfAbschlussStufeWechseln")).toBeLessThan(ablage.indexOf("setMoveConfirm("));
  });

  it("Fortschrittsleiste: gesperrte Stufe setzt nichts", () => {
    expect(kundenDetail).toContain("!darfAbschlussStufeWechseln(user.role, inv.pipelineStufe, s.key)");
    const klick = kundenDetail.indexOf("if (abschlussGesperrt && !e.altKey) {");
    expect(klick).toBeGreaterThan(0);
    expect(klick).toBeLessThan(kundenDetail.indexOf("updateInvestment(inv.id, { pipelineStufe: s.key });"));
  });

  it("Abwicklungskarte: Abschluss nur, wer die Auszahlung bestätigen darf", () => {
    // Seit M19 (04.10.2026) als Zielstufe, gesetzt erst nach gespeicherter Abwicklung.
    expect(kundenDetail).toContain('updated.auszahlungBestaetigt && darfGeldfelder && inv.pipelineStufe !== "abgeschlossen"');
  });
});

describe("Migration abschluss_nur_backoffice", () => {
  it("Wächter auf investments und kontakte, vor dem Finanzierungs- und Provisionswächter", () => {
    for (const tabelle of ["investments", "kontakte"]) {
      expect(SQL).toContain(
        `CREATE TRIGGER trg_absicherung_pipeline_abschluss\nBEFORE INSERT OR UPDATE OF meta ON public.${tabelle}`,
      );
    }
    // Postgres ruft BEFORE-Trigger nach Namen sortiert auf.
    const namen = ["trg_absicherung_investments", "trg_absicherung_pipeline_abschluss",
      "trg_finanzierungsstand_intern_frei", "trg_investments_provisionssatz_festschreiben"];
    expect([...namen].sort()).toEqual(namen);
  });

  it("lässt nur Admin, Inhaber, Backoffice und Server durch, DEFINER-Funktionen nicht pauschal", () => {
    expect(WAECHTER).toContain("IF auth.uid() IS NULL\n     OR public.is_admin_role(auth.uid())\n     OR public.has_role(auth.uid(), 'backoffice'::public.app_role) THEN");
    // merge_investment_meta ist DEFINER; eine current_user-Ausnahme ließe den Weg offen.
    expect(WAECHTER).not.toContain("current_user");
  });

  it("prüft hinein und heraus und behält den alten Wert, ohne Abbruch", () => {
    expect(WAECHTER).toContain("IF coalesce(_alt, '') <> 'abgeschlossen' AND coalesce(_neu, '') <> 'abgeschlossen' THEN");
    expect(WAECHTER).toContain("NEW.meta := _neu_meta || jsonb_build_object('pipelineStufe', _alt_wert);");
    expect(WAECHTER).not.toContain("RAISE EXCEPTION");
    expect(SQL).toContain("REVOKE ALL ON FUNCTION public.pipeline_abschluss_schuetzen() FROM PUBLIC, anon, authenticated;");
  });

  it("hat Prüfzeilen 55.x", () => {
    for (const zeile of ["55.1", "55.2", "55.3"]) expect(PRUEFUNG).toContain(`SELECT '${zeile} `);
    expect(PRUEFUNG.trimEnd().endsWith(";")).toBe(true);
  });

  it("liegt, solange sie offen ist, im Eingangskorb und in der Sammeldatei", () => {
    // Am 30.09.2026 ausgefuehrt, die Kopie ist aus dem Korb entfernt.
    if (!existsSync(KORB_PFAD)) return;
    expect(readFileSync(KORB_PFAD, "utf8")).toBe(SQL);
    expect(readFileSync("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql", "utf8")).toContain(SQL.trim());
  });
});
