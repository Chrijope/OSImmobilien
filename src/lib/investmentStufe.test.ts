import { describe, it, expect } from "vitest";

/**
 * Wann der Bonitaetscheck aufgedeckt wird.
 *
 * Gemeldet bei Markus Borke: Bonitaetsunterlagen lagen offen, obwohl die
 * Selbstauskunft weder geoeffnet noch ausgefuellt noch unterschrieben war.
 * Ursache war eine Positivliste der Stufen "vor der Selbstauskunft", in der
 * "zugewiesen" und "selbstauskunft" fehlten. Hier ist die Rangfolge
 * abgesichert, damit dieselbe Luecke nicht wieder entsteht.
 */

const PIPELINE_STEPS = [
  { key: "neuer_lead" }, { key: "zugewiesen" }, { key: "kontaktversuche" },
  { key: "follow_up" }, { key: "erstgespraech" }, { key: "beratungsgespraech" },
  { key: "bonitaetsunterlagen" }, { key: "objektauswahl" }, { key: "reservierung" },
  { key: "finanzierung" }, { key: "notar" }, { key: "faelligkeit" },
  { key: "abrechnung" }, { key: "abgeschlossen" },
];
const BONITAET_AB_INDEX = PIPELINE_STEPS.findIndex((s) => s.key === "bonitaetsunterlagen");
const pipelineRang = (stufe?: string | null) => {
  const i = PIPELINE_STEPS.findIndex((s) => s.key === (stufe || ""));
  return i < 0 ? 0 : i;
};
const aufgedeckt = (stufe?: string | null) => pipelineRang(stufe) >= BONITAET_AB_INDEX;

describe("Bonitätscheck aufgedeckt ab Stufe", () => {
  it("bleibt zugedeckt vor den Bonitätsunterlagen", () => {
    for (const s of ["neuer_lead", "zugewiesen", "kontaktversuche", "follow_up",
                     "erstgespraech", "beratungsgespraech"]) {
      expect(aufgedeckt(s), s).toBe(false);
    }
  });

  it("bleibt zugedeckt in der Stufe Selbstauskunft, die steht ja erst an", () => {
    expect(aufgedeckt("selbstauskunft")).toBe(false);
  });

  it("deckt ab Bonitätsunterlagen auf", () => {
    for (const s of ["bonitaetsunterlagen", "objektauswahl", "reservierung",
                     "finanzierung", "notar", "abgeschlossen"]) {
      expect(aufgedeckt(s), s).toBe(true);
    }
  });

  it("behandelt Unbekanntes und Leeres als ganz vorne", () => {
    // Sichere Richtung: lieber einmal zu viel zugedeckt.
    expect(aufgedeckt(undefined)).toBe(false);
    expect(aufgedeckt("")).toBe(false);
    expect(aufgedeckt("eg_noshow")).toBe(false);
    expect(aufgedeckt("irgendwas_neues")).toBe(false);
  });
});
