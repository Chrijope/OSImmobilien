/**
 * Das Glossar für englische Kundentexte (Plan Kundensprache, Abschnitt 5).
 */
import { describe, expect, it } from "vitest";
import { KUNDENSPRACHE_GLOSSAR, glossarEnglisch } from "./kundenspracheGlossar";

describe("Kundensprache-Glossar", () => {
  it("jeder deutsche Begriff steht nur einmal und hat eine Übersetzung", () => {
    const begriffe = KUNDENSPRACHE_GLOSSAR.map((e) => e.de.toLowerCase());
    expect(new Set(begriffe).size).toBe(begriffe.length);
    for (const e of KUNDENSPRACHE_GLOSSAR) {
      expect(e.en.trim()).not.toBe("");
      if (e.ersterAuftritt) expect(e.ersterAuftritt.length).toBeGreaterThanOrEqual(e.en.length);
    }
  });

  it("liefert die laufende Form und die Form beim ersten Auftreten", () => {
    expect(glossarEnglisch("Hausgeld")).toBe("service charge");
    expect(glossarEnglisch("hausgeld", true)).toBe("service charge (Hausgeld)");
    expect(glossarEnglisch("Kaufpreis", true)).toBe("purchase price");
    expect(glossarEnglisch("gibt es nicht")).toBeUndefined();
  });

  it("der Berater heißt nie „advisor“ (Entscheidung 16)", () => {
    for (const e of KUNDENSPRACHE_GLOSSAR) {
      expect(`${e.en} ${e.ersterAuftritt ?? ""}`.toLowerCase()).not.toContain("advisor");
    }
    expect(glossarEnglisch("Ansprechpartner", true)).toBe("your contact person at MOREImmo");
  });
});
