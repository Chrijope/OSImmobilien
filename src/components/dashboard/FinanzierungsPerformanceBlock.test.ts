import { describe, it, expect, vi } from "vitest";

/**
 * Die Kennzahlen der Karte werden aus den Investments abgeleitet, deshalb wird
 * nur der Investmentbestand ersetzt.
 */
const zustand = vi.hoisted(() => ({ investments: [] as unknown[] }));

vi.mock("@/lib/investmentsStore", () => ({
  getInvestments: () => zustand.investments,
}));

import { computeFinanzierungsPerformance } from "@/components/dashboard/FinanzierungsPerformanceBlock";

const investment = (
  id: string,
  pipelineStufe: string,
  meta: Record<string, string> = {},
) => ({
  id,
  kontaktId: `kontakt-${id}`,
  pipelineStufe,
  meta,
});

describe("Finanzierungs-Performance", () => {
  it("rechnet die Dauer Angebot bis Darlehensvertrag aus den Zeitstempeln des Investments", () => {
    zustand.investments = [
      investment("a", "finanzierung", {
        finanzierungAngebotGesendetAm: "2026-09-01T00:00:00",
        darlehensvertragUploadedAm: "2026-09-11T00:00:00",
      }),
    ];
    expect(computeFinanzierungsPerformance().avgTageAngebotVertrag).toBe(10);
  });

  /**
   * Frueher stand hier ein Rueckfall auf `finanzierungen.aktualisiert_am`. Er
   * hat nie gegriffen, weil `finanzierungen.kunde_id` die Investment-ID fuehrt
   * und mit der Kontakt-ID gesucht wurde. Er wurde entfernt und nicht
   * repariert: Das Datum der letzten beliebigen Aenderung an einer
   * Finanzierung ist kein Vertragsdatum. Ohne Vertragsdatum bleibt die Zahl
   * deshalb bewusst leer.
   */
  it("nennt keine Dauer, solange der Darlehensvertrag kein Datum hat", () => {
    zustand.investments = [
      investment("a", "finanzierung", {
        finanzierungAngebotGesendetAm: "2026-09-01T00:00:00",
      }),
    ];
    expect(computeFinanzierungsPerformance().avgTageAngebotVertrag).toBeNull();
  });

  it("kommt ohne jedes Investment ohne Absturz aus", () => {
    zustand.investments = [];
    const daten = computeFinanzierungsPerformance();
    expect(daten.quoteFinNotar).toBe(0);
    expect(daten.avgTageRvAngebot).toBeNull();
    expect(daten.volumenGenehmigt).toBe(0);
  });

  it("zaehlt zwei Investments desselben Kontakts getrennt", () => {
    zustand.investments = [
      { ...investment("a", "finanzierung"), kontaktId: "k" },
      { ...investment("b", "notar"), kontaktId: "k" },
    ];
    const daten = computeFinanzierungsPerformance();
    expect(daten.inFinanzierungCount).toBe(1);
    expect(daten.postFinanzierungCount).toBe(1);
    expect(daten.quoteFinNotar).toBe(50);
  });
});
