import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { kontaktGanzVerloren } from "./pipelineStufen";

/*
 * Pipeline, Spalte „Verloren“ (H10, 04.10.2026): Ein Investment dorthin zu
 * ziehen setzte bisher immer den ganzen Kontakt auf verloren.
 */

describe("kontaktGanzVerloren", () => {
  it("ja, wenn kein anderes Investment mehr läuft", () => {
    expect(kontaktGanzVerloren([{ id: "a", pipelineStufe: "verloren" }, { id: "b", pipelineStufe: "archiviert" }], "a")).toBe(true);
  });

  it("nein, solange ein zweites Investment in Arbeit ist", () => {
    expect(kontaktGanzVerloren([{ id: "a", pipelineStufe: "verloren" }, { id: "b", pipelineStufe: "finanzierung" }], "a")).toBe(false);
  });

  it("nein, wenn schon ein Kauf abgeschlossen ist", () => {
    expect(kontaktGanzVerloren([{ id: "a", pipelineStufe: "verloren" }, { id: "b", pipelineStufe: "abgeschlossen" }], "a")).toBe(false);
  });

  it("ja für die Kachel eines Kontakts ohne Investment", () => {
    expect(kontaktGanzVerloren([], undefined)).toBe(true);
  });
});

describe("Pipeline: applyVerlust", () => {
  const quelle = readFileSync(resolve(__dirname, "../pages/Pipeline.tsx"), "utf-8");
  const rumpf = quelle.slice(quelle.indexOf("const applyVerlust = async"), quelle.indexOf("const applyVerlust = async") + 2500);

  it("setzt den Kontakt nur über kontaktGanzVerloren auf verloren und wartet auf das Investment", () => {
    expect(rumpf).toContain('if (!(await updateInvestment(investmentId, { pipelineStufe: "verloren" } as any))) return;');
    const pruefung = rumpf.indexOf("const ganz = kontaktGanzVerloren(getInvestmentsByKontakt(kundeId), investmentId);");
    expect(pruefung).toBeGreaterThan(-1);
    expect(rumpf.indexOf('status: "verloren" as any')).toBeGreaterThan(pruefung);
    expect(rumpf).toContain("if (ganz) {");
  });

  it("meldet einen Stufenwechsel erst nach der Antwort der Datenbank", () => {
    const stufe = quelle.slice(quelle.indexOf("const setStufeOnly = async"), quelle.indexOf("const setStufeOnly = async") + 1500);
    expect(stufe).toContain("if (investmentId && !(await updateInvestment(investmentId, { pipelineStufe: to } as any))) return;");
    expect(stufe).toContain("await updateKontakt(kundeId, { pipelineStufe: to } as any);");
  });
});
