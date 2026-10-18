import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { nurLesendKundendaten } from "./nurLesend";

/*
 * Buchhaltung liest Kundendaten nur (Christian, 18.10.2026).
 *
 * Die Migration wurde in PGlite mit 12 Fällen ausgeführt (Name und Meta
 * bleiben, andere Stufe verworfen, Abrechnung und Abgeschlossen gehen durch,
 * kein Anlegen und Löschen, Finanzierungen gesperrt, Aufgaben frei,
 * Buchhaltung plus Backoffice und der Server dürfen ändern, wiederholbar).
 * Hier hält der Quelltext die Regeln fest.
 */

const SQL = readFileSync(
  resolve(__dirname, "../../supabase/migrations/20261018130000_buchhaltung_kundendaten_nur_lesend.sql"),
  "utf-8",
);
const CODE = SQL.split("\n").filter((z) => !z.trim().startsWith("--")).join("\n");

describe("nurLesendKundendaten", () => {
  it("gilt nur für die Buchhaltung", () => {
    expect(nurLesendKundendaten("buchhaltung")).toBe(true);
    for (const r of ["admin", "inhaber", "backoffice", "vertriebspartner", undefined, ""]) {
      expect(nurLesendKundendaten(r), String(r)).toBe(false);
    }
  });
});

describe("Migration buchhaltung_kundendaten_nur_lesend", () => {
  it("läuft in einem Zug und ändert keine Bestandsdaten", () => {
    expect(CODE.trim().startsWith("BEGIN;")).toBe(true);
    expect(CODE).toContain("COMMIT;");
    const ausserhalb = CODE.replace(/AS \$\$[\s\S]*?\$\$;/g, "").replace(/DO \$\$[\s\S]*?\$\$;/g, "");
    expect(ausserhalb).not.toMatch(/^\s*(UPDATE|DELETE|INSERT)\b/m);
  });

  it("trifft nur Konten, deren einzige kundenberechtigte Rolle die Buchhaltung ist", () => {
    expect(CODE).toContain("role = 'buchhaltung'");
    for (const r of ["admin", "inhaber", "vertriebsleiter", "backoffice", "finanzierungspartner", "setterin", "vertriebspartner"]) {
      expect(CODE).toContain(`'${r}'`);
    }
    expect(CODE).toContain("auth.uid() IS NULL OR NOT public.nur_lesend_kundendaten(auth.uid())");
  });

  it("lässt am Kontakt und Investment nur Abrechnung und Abgeschlossen durch", () => {
    expect(CODE).toContain("NEW := OLD;");
    expect(CODE).toContain("IN ('abrechnung', 'abgeschlossen')");
    expect(CODE).toMatch(/BEFORE UPDATE ON public\.kontakte/);
    expect(CODE).toMatch(/BEFORE UPDATE ON public\.investments/);
  });

  it("sperrt Anlegen und Löschen sowie die Nebentabellen, lässt Aufgaben frei", () => {
    expect(CODE).toContain("AS RESTRICTIVE FOR INSERT");
    expect(CODE).toContain("AS RESTRICTIVE FOR DELETE");
    expect(CODE).toContain("'finanzierungen', 'kunde_dokumente'");
    expect(CODE).not.toMatch(/'aufgaben'|'aktivitaeten'/);
  });
});
