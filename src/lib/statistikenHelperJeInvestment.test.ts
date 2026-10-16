import { describe, expect, it } from "vitest";
import { computeFinanzKPIs, vorgaengeJeInvestment } from "./statistikenHelper";

/** Pipeline-Volumen je Investment (11.10.2026), nicht je Kunde. */
describe("vorgaengeJeInvestment", () => {
  const kontakte = [
    { id: "k1", kaufpreis: 999, meta: { pipelineStufe: "notar" } },
    { id: "k2", kaufpreis: 50000, meta: { pipelineStufe: "erreicht" } },
  ];
  const investments = [
    { id: "i1", kunde_id: "k1", kaufpreis: 200000, meta: { pipelineStufe: "notar" } },
    { id: "i2", kunde_id: "k1", kaufpreis: 100000, meta: { pipelineStufe: "objektauswahl" } },
    { id: "i3", kunde_id: "k1", kaufpreis: 300000, meta: { pipelineStufe: "abgeschlossen" } },
  ];

  it("liefert je Investment Stufe und Kaufpreis, einen Kontakt ohne Investment selbst", () => {
    expect(vorgaengeJeInvestment(kontakte, investments).map((v) => [v.kontakt.id, v.stufe, v.wert])).toEqual([
      ["k1", "notar", 200000],
      ["k1", "objektauswahl", 100000],
      ["k1", "abgeschlossen", 300000],
      ["k2", "erreicht", 50000],
    ]);
  });

  it("das Pipeline-Volumen zaehlt jedes offene Investment mit seinem Kaufpreis", () => {
    const r = computeFinanzKPIs(kontakte, investments, new Date("2026-01-01"), new Date("2027-01-01"));
    expect(r.pipelineVolumen).toBe(200000 + 100000 + 50000);
  });
});
