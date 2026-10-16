import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/dataCache", () => ({ cacheGet: () => [] }));

import * as helper from "@/lib/provisionssatz";

/*
 * Karrierestufen sind seit dem 15.10.2026 entfernt (Christian: im Vertrieb
 * gibt es nur Vertriebspartner, ohne Stufen). Der Helfer kennt nur noch die
 * Sätze aus der Nutzerverwaltung.
 */
describe("provisionssatz ohne Karrierestufen", () => {
  it("exportiert keine Stufen-Definition und keine Stufen-Auflösung mehr", () => {
    for (const name of ["KARRIERE_STUFEN", "NEUVERGABE_KARRIERE_STUFEN", "getKarriereStufe", "getKarriereStufeById",
      "findKarriereStufe", "getKarriereOverrideForUser", "formatStufenProvision", "istProvisionFestgeschrieben"]) {
      expect(helper, name).not.toHaveProperty(name);
    }
  });

  it("formatSatzProzent schreibt deutsch", () => {
    expect(helper.formatSatzProzent(4.5)).toBe("4,5 %");
    expect(helper.formatSatzProzent(10)).toBe("10 %");
  });
});
