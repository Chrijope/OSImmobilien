import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PIPELINE_STUFEN } from "./pipelineStufen";
import { lokalesDatum } from "./terminErgebnis";

/**
 * Hermann Vogl meldete, dass sich nicht jede Pipeline-Stufe manuell setzen
 * lässt. Die Ursache lag in `normalizePipelineStufe`: Drei Stufen wurden dort
 * sofort auf andere umgeschrieben. Wer einen Kunden dorthin zog, sah ihn im
 * selben Moment in einer ganz anderen Spalte wieder.
 *
 * Besonders folgenreich war das bei "vermoegensaufbau": Der
 * Versicherungsexperte sieht in der Pipeline ausschliesslich diese eine
 * Spalte, und die blieb damit dauerhaft leer.
 */

const quelle = readFileSync(join(process.cwd(), "src/lib/kontaktPipeline.ts"), "utf8");

describe("Pipeline: jede Stufe lässt sich manuell setzen", () => {
  it("schreibt keine der drei Ablaufstufen mehr auf eine andere um", () => {
    for (const stufe of ["zugewiesen", "kontaktversuche", "vermoegensaufbau"]) {
      expect(
        quelle.includes(`normalized === "${stufe}"`),
        `Die Stufe "${stufe}" wird in normalizePipelineStufe wieder umgeschrieben. ` +
        `Sie ist Teil des Ablaufs und muss als eigene Stufe bestehen bleiben.`,
      ).toBe(false);
    }
  });

  it("führt die drei Stufen ohne den Zusatz legacy im Namen", () => {
    for (const key of ["zugewiesen", "kontaktversuche", "vermoegensaufbau"]) {
      const stufe = PIPELINE_STUFEN.find((s) => s.key === key);
      expect(stufe, `Stufe ${key} fehlt in PIPELINE_STUFEN`).toBeTruthy();
      expect(stufe!.label.toLowerCase()).not.toContain("legacy");
    }
  });

  it("behält die Umschreibung für echte Altwerte", () => {
    // Diese Stufen existieren nicht mehr als Spalte und müssen weiter auf
    // ihre Nachfolger zeigen, sonst fällt ein Kunde aus der Pipeline.
    expect(quelle).toContain('normalized === "after_sales"');
    expect(quelle).toContain('normalized === "closing"');
    expect(quelle).toContain('normalized === "notar_mit_gs"');
  });
});

describe("Pipeline: die Automatik behält Vorrang", () => {
  const pipelineSeite = readFileSync(join(process.cwd(), "src/pages/Pipeline.tsx"), "utf8");

  it("prüft nach dem manuellen Setzen, ob die Automatik widerspricht", () => {
    expect(pipelineSeite).toContain("calculateLogicalPipelineStufe");
  });

  it("sagt dem Nutzer, dass die Automatik schwerer wiegt", () => {
    expect(pipelineSeite).toContain("die Automatik hat aber Vorrang");
    expect(pipelineSeite).toContain("Die Automatik wiegt schwerer als das manuelle Verschieben");
  });
});

/**
 * BG NoShow heilt sich selbst, sobald wieder ein Beratungstermin in der
 * Zukunft steht (gemeldet am Beispiel Thomas Popp: Termin nach dem No-Show
 * neu vereinbart, Pipeline zeigte ihn trotzdem weiter in "BG NoShow",
 * weil nur der Termin, nicht die Kontakt-Stufe geschrieben wurde).
 */
vi.mock("./investmentsStore", () => ({
  getInvestmentsByKontakt: () => [],
  getSaSigned: () => false,
  getRvSigned: () => false,
  getSaSignaturePending: () => false,
}));

describe("BG NoShow springt bei künftigem Beratungstermin zurück", () => {
  // Lokaler Kalendertag. toISOString wäre das UTC-Datum und zwischen 0 und
  // 2 Uhr MESZ noch gestern.
  const tag = (offsetTage: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetTage);
    return lokalesDatum(d);
  };
  const baue = (teil: Record<string, unknown>) =>
    ({ id: "k1", vorname: "Thomas", nachname: "Popp", pipelineStufe: "bg_noshow", ...teil }) as never;

  it("künftiger Termin in setterTerminDatum → Beratungsgespräch", async () => {
    const { getEffectivePipelineStufe } = await import("./kontaktPipeline");
    const k = baue({ setterTerminDatum: tag(3), setterTerminUhrzeit: "14:00" });
    expect(getEffectivePipelineStufe(k)).toBe("beratungsgespraech");
  });

  it("künftiger Termin in meta.beratungsgespraechAm zählt ebenso", async () => {
    const { getEffectivePipelineStufe } = await import("./kontaktPipeline");
    const k = baue({ meta: { beratungsgespraechAm: tag(5), beratungsgespraechUhrzeit: "10:00" } });
    expect(getEffectivePipelineStufe(k)).toBe("beratungsgespraech");
  });

  it("ohne Termin bleibt es bei BG NoShow", async () => {
    const { getEffectivePipelineStufe } = await import("./kontaktPipeline");
    expect(getEffectivePipelineStufe(baue({}))).toBe("bg_noshow");
  });

  it("ein vergangener Termin hebt nicht an", async () => {
    const { getEffectivePipelineStufe } = await import("./kontaktPipeline");
    const k = baue({ setterTerminDatum: tag(-2), setterTerminUhrzeit: "14:00" });
    expect(getEffectivePipelineStufe(k)).toBe("bg_noshow");
  });

  it("versteht auch das alte Datumsformat DD.MM.YYYY", async () => {
    const { istTerminInZukunft } = await import("./kontaktPipeline");
    const [y, m, d] = tag(7).split("-");
    expect(istTerminInZukunft(`${d}.${m}.${y}`, "09:00")).toBe(true);
    expect(istTerminInZukunft("01.01.2020", "09:00")).toBe(false);
  });

  it("heutiger Termin ohne Uhrzeit zählt bis Tagesende als bevorstehend", async () => {
    const { istTerminInZukunft } = await import("./kontaktPipeline");
    expect(istTerminInZukunft(tag(0), null)).toBe(true);
  });
});

/**
 * Kurz nach Mitternacht ist das UTC-Datum noch gestern. Wer den heutigen Tag
 * per toISOString().slice(0, 10) vorbelegt, bekommt zwischen 0 und 2 Uhr MESZ
 * den Vortag und damit „Der Termin muss in der Zukunft liegen“. Feste Uhrzeit
 * und feste Zone, damit der Test nicht von der Tageszeit des Laufs abhängt.
 */
describe("Heutiger Termin rund um Mitternacht (Europe/Berlin)", () => {
  const alteZone = process.env.TZ;
  beforeAll(() => { process.env.TZ = "Europe/Berlin"; });
  afterAll(() => { process.env.TZ = alteZone; });
  afterEach(() => { vi.useRealTimers(); });

  const um = (utc: string) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(utc));
  };

  it("00:30 MESZ: heute ohne Uhrzeit zählt als bevorstehend, das UTC-Datum wäre gestern", async () => {
    const { istTerminInZukunft, heuteIso } = await import("./kontaktPipeline");
    um("2026-09-26T22:30:00Z"); // 27.09.2026, 00:30 MESZ
    expect(heuteIso()).toBe("2026-09-27");
    expect(istTerminInZukunft(heuteIso(), null)).toBe(true);
    expect(istTerminInZukunft(heuteIso(), "10:00")).toBe(true);
    // Gegenprobe: die alte Vorbelegung liefert den Vortag und fällt durch.
    const utcDatum = new Date().toISOString().slice(0, 10);
    expect(utcDatum).toBe("2026-09-26");
    expect(istTerminInZukunft(utcDatum, "10:00")).toBe(false);
  });

  it("23:30 MESZ: heute ohne Uhrzeit zählt noch, 23:00 ist vorbei", async () => {
    const { istTerminInZukunft, heuteIso } = await import("./kontaktPipeline");
    um("2026-09-27T21:30:00Z"); // 27.09.2026, 23:30 MESZ
    expect(heuteIso()).toBe("2026-09-27");
    expect(istTerminInZukunft(heuteIso(), null)).toBe(true);
    expect(istTerminInZukunft(heuteIso(), "23:00")).toBe(false);
    expect(istTerminInZukunft("2026-09-26", null)).toBe(false);
  });

  it("lokalesDatum zählt Tage im Kalender, nicht in 24-Stunden-Schritten", () => {
    um("2026-09-26T22:30:00Z"); // 27.09.2026, 00:30 MESZ
    const d = new Date();
    d.setDate(d.getDate() + 2);
    expect(lokalesDatum(d)).toBe("2026-09-29");
  });
});
