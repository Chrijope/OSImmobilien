import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Termine, Aufgaben und Follow-ups duerfen nur noch in der Zukunft geplant
 * werden. Alle Eingabestellen (QuickActionDialog, Verschieben-Dialoge,
 * Setter-Terminfelder, Follow-up-Dialoge) nutzen dafuer dieselbe Funktion
 * `istTerminInZukunft` aus kontaktPipeline. Diese Tests halten die Regeln
 * fest:
 *
 *   - Mit Uhrzeit zaehlt der genaue Zeitpunkt: Datum plus Uhrzeit nach jetzt.
 *   - Ohne Uhrzeit zaehlt das Tagesende: heute ist erlaubt, gestern nicht.
 */

// kontaktPipeline zieht den Investment-Store nach, der hier nicht gebraucht
// wird. Gleicher Mock wie in pipelineManuelleStufe.test.ts.
vi.mock("./investmentsStore", () => ({
  getInvestmentsByKontakt: () => [],
  getSaSigned: () => false,
  getRvSigned: () => false,
  getSaSignaturePending: () => false,
}));

describe("istTerminInZukunft", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Fester Bezugspunkt: 27.08.2026, 12:00 lokale Zeit.
    vi.setSystemTime(new Date(2026, 7, 27, 12, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("Datum plus Uhrzeit nach jetzt → Zukunft", async () => {
    const { istTerminInZukunft } = await import("./kontaktPipeline");
    expect(istTerminInZukunft("2026-08-27", "12:01")).toBe(true);
    expect(istTerminInZukunft("2026-08-28", "09:00")).toBe(true);
  });

  it("Datum plus Uhrzeit vor jetzt → keine Zukunft, auch heute", async () => {
    const { istTerminInZukunft } = await import("./kontaktPipeline");
    expect(istTerminInZukunft("2026-08-27", "11:59")).toBe(false);
    expect(istTerminInZukunft("2026-08-26", "18:00")).toBe(false);
  });

  it("ohne Uhrzeit: heute erlaubt, gestern nicht, morgen erlaubt", async () => {
    const { istTerminInZukunft } = await import("./kontaktPipeline");
    expect(istTerminInZukunft("2026-08-27")).toBe(true);
    expect(istTerminInZukunft("2026-08-26")).toBe(false);
    expect(istTerminInZukunft("2026-08-28")).toBe(true);
  });

  it("versteht auch das Format DD.MM.YYYY", async () => {
    const { istTerminInZukunft } = await import("./kontaktPipeline");
    expect(istTerminInZukunft("28.08.2026", "09:00")).toBe(true);
    expect(istTerminInZukunft("26.08.2026", "09:00")).toBe(false);
  });

  it("leeres oder kaputtes Datum ist keine Zukunft", async () => {
    const { istTerminInZukunft } = await import("./kontaktPipeline");
    expect(istTerminInZukunft("")).toBe(false);
    expect(istTerminInZukunft(null)).toBe(false);
    expect(istTerminInZukunft(undefined)).toBe(false);
    expect(istTerminInZukunft("kein-datum", "09:00")).toBe(false);
  });

  it("eine kaputte Uhrzeit faellt auf das Tagesende zurueck", async () => {
    const { istTerminInZukunft } = await import("./kontaktPipeline");
    // Heute mit unbrauchbarer Uhrzeit: bis Tagesende noch bevorstehend.
    expect(istTerminInZukunft("2026-08-27", "keine-zeit")).toBe(true);
    expect(istTerminInZukunft("2026-08-26", "keine-zeit")).toBe(false);
  });
});

describe("heuteIso", () => {
  it("liefert das lokale Datum als YYYY-MM-DD, auch kurz nach Mitternacht", async () => {
    vi.useFakeTimers();
    try {
      // 00:30 lokale Zeit: toISOString() waere hier je nach Zeitzone noch
      // der Vortag, das lokale Datum ist aber schon der 27.08.
      vi.setSystemTime(new Date(2026, 7, 27, 0, 30, 0));
      const { heuteIso } = await import("./kontaktPipeline");
      expect(heuteIso()).toBe("2026-08-27");
    } finally {
      vi.useRealTimers();
    }
  });
});
