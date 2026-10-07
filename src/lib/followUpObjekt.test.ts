import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { PIPELINE_STUFEN, FORTSCHRITT_STUFEN, stufenFilterLabel, PipelineStufeZodEnum } from "@/lib/pipelineStufen";

/**
 * Die neue Pipelinestufe "follow_up_objekt" (Anzeigename "Follow-Up",
 * zwischen Objektauswahl und Reservierung) wird AUSSCHLIESSLICH manuell von
 * Partnern gesetzt. Diese Tests wachen ueber drei Dinge:
 *
 *   1. Die Reihenfolge: Objektauswahl < Follow-Up (Objekt) < Reservierung.
 *   2. Die Zuordnungen: Bereich, Empfehlungsstatus, Ablaufplan-Station.
 *   3. Die Nur-manuell-Garantie: Keine Automatik im Code setzt die Stufe.
 */

const pos = (key: string) => PIPELINE_STUFEN.findIndex((s) => s.key === key);

describe("Reihenfolge der neuen Stufe follow_up_objekt", () => {
  it("liegt zwischen Objektauswahl und Reservierung", () => {
    expect(pos("objektauswahl")).toBeLessThan(pos("follow_up_objekt"));
    expect(pos("follow_up_objekt")).toBeLessThan(pos("reservierung"));
  });

  it("hat ein eigenes Kaestchen in der Fortschrittsleiste, an derselben Stelle", () => {
    const leiste = FORTSCHRITT_STUFEN.map((s) => s.key);
    const i = leiste.indexOf("follow_up_objekt");
    expect(i).toBeGreaterThan(leiste.indexOf("objektauswahl"));
    expect(i).toBeLessThan(leiste.indexOf("reservierung"));
  });

  it("ist im Zod-Enum enthalten und damit als Kontakt-Stufe speicherbar", () => {
    expect(PipelineStufeZodEnum.options).toContain("follow_up_objekt");
  });
});

describe("Anzeigename", () => {
  it("heisst in Pipeline-Leisten schlicht Follow-Up", () => {
    expect(PIPELINE_STUFEN.find((s) => s.key === "follow_up_objekt")?.label).toBe("Follow-Up");
  });

  it("traegt in Auswahllisten den unterscheidenden Zusatz", () => {
    expect(stufenFilterLabel("follow_up_objekt")).toBe("Follow-Up (nach Objektauswahl)");
    // Die fruehe Wiedervorlage-Stufe bleibt ohne Zusatz.
    expect(stufenFilterLabel("follow_up")).toBe("Follow-Up");
  });
});

describe("Zuordnungen der neuen Stufe", () => {
  it("gehoert zum Bereich Neukunden, wie die Objektauswahl", async () => {
    const { getProzessBereichForStufe, normalizePipelineStufe } = await import("@/lib/kontaktPipeline");
    expect(getProzessBereichForStufe("follow_up_objekt")).toBe("neukunden");
    expect(normalizePipelineStufe("follow_up_objekt")).toBe("follow_up_objekt");
  });

  it("mappt auf den Empfehlungsstatus in_beratung", async () => {
    const { pipelineToEmpfehlungStatus, tippgeberGruppeFuerStufe } = await import("@/lib/empfehlungenStore");
    expect(pipelineToEmpfehlungStatus("follow_up_objekt")).toBe("in_beratung");
    expect(tippgeberGruppeFuerStufe("follow_up_objekt")).toBe("in_beratung");
  });

  it("gehoert im Ablaufplan zur Station Objektvorstellung und Objektauswahl", async () => {
    const { ABLAUF_STATIONEN } = await import("@/lib/ablaufplan");
    const station = ABLAUF_STATIONEN.find((s) => s.stufen.includes("follow_up_objekt"));
    expect(station?.id).toBe("objektauswahl");
  });

  it("hat Erklaerung, Leitfaden und Abschlusswahrscheinlichkeit", async () => {
    const { stufenErklaerung } = await import("@/lib/stufenErklaerung");
    const { getNextSteps } = await import("@/lib/nextStepsGuide");
    const { STUFEN_WAHRSCHEINLICHKEIT } = await import("@/lib/pipelineStufen");
    expect(stufenErklaerung("follow_up_objekt")).toBeTruthy();
    expect(getNextSteps("follow_up_objekt", false)).not.toBeNull();
    const w = STUFEN_WAHRSCHEINLICHKEIT.follow_up_objekt;
    expect(w).toBeGreaterThanOrEqual(STUFEN_WAHRSCHEINLICHKEIT.objektauswahl);
    expect(w).toBeLessThanOrEqual(STUFEN_WAHRSCHEINLICHKEIT.reservierung);
  });
});

/**
 * Nur-manuell-Garantie, am Quelltext geprueft.
 *
 * Die Automatiken setzen Zielstufen immer als Literal ("pipelineStufe:
 * \"reservierung\"", "return \"objektauswahl\"" usw.). Wuerde irgendwo eine
 * Automatik "follow_up_objekt" als Ziel eintragen, muesste genau so ein
 * Literal entstehen. Deshalb reicht es, die bekannten Automatik-Quellen nach
 * dem Muster abzusuchen. Bewusst am Text statt an einer laufenden Anwendung,
 * dieselbe Technik wie in buchungPipelineRang.test.ts.
 */
describe("Nur manuell: keine Automatik setzt follow_up_objekt", () => {
  const wurzel = resolve(__dirname, "../..");
  const lese = (pfad: string) => readFileSync(resolve(wurzel, pfad), "utf8");

  it("calculateLogicalPipelineStufe kennt die Stufe nicht als Ergebnis", () => {
    const quelle = lese("src/lib/kontaktPipeline.ts");
    const rumpf = quelle.slice(
      quelle.indexOf("export function calculateLogicalPipelineStufe"),
      quelle.indexOf("export function getEffectivePipelineStufe"),
    );
    expect(rumpf.length).toBeGreaterThan(0);
    expect(rumpf).not.toContain('"follow_up_objekt"');
  });

  it("kein Client-Code weist die Stufe automatisch zu", () => {
    // Setz-Stellen schreiben immer `pipelineStufe: "<ziel>"`. Fuer die neue
    // Stufe darf es so eine Zuweisung nirgends geben; sie wird nur ueber
    // dynamische Werte aus der manuellen Auswahl gesetzt.
    const dateien = [
      "src/pages/KundenDetail.tsx",
      "src/pages/Pipeline.tsx",
      "src/lib/investmentsStore.ts",
      "src/lib/kundenStore.ts",
      "src/lib/kontaktPipeline.ts",
    ];
    for (const datei of dateien) {
      const quelle = lese(datei);
      expect(quelle, `${datei} setzt follow_up_objekt automatisch`).not.toMatch(
        /pipelineStufe:\s*["']follow_up_objekt["']/,
      );
      expect(quelle, `${datei} schaltet automatisch auf follow_up_objekt`).not.toMatch(
        /stufenwechsel\([^)]*["']follow_up_objekt["']/,
      );
    }
  });

  it("die naechtlichen Dienste setzen die Stufe nicht", () => {
    const dateien = [
      "supabase/functions/recompute-pipeline/index.ts",
      "supabase/migrations/20260807180000_bulk_recompute_ohne_verlustautomatik.sql",
      "supabase/migrations/20260819120000_follow_up_objekt_stufe.sql",
    ];
    for (const datei of dateien) {
      const quelle = lese(datei);
      // In den Diensten darf die Stufe nur in Reihenfolge- und
      // Mapping-Listen vorkommen, nie als Schreib-Ziel.
      expect(quelle, `${datei} schreibt follow_up_objekt`).not.toMatch(
        /jsonb_build_object\('pipelineStufe',\s*'follow_up_objekt'\)/,
      );
      expect(quelle, `${datei} schreibt follow_up_objekt`).not.toMatch(
        /pipelineStufe["']?\s*[:=]\s*["']follow_up_objekt["']/,
      );
    }
  });
});
