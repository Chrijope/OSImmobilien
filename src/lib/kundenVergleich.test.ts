import { describe, expect, it } from "vitest";
import { istVergleichbar } from "./kundenVergleich";

const JETZT = Date.parse("2026-10-25T10:00:00Z");
const e = (teile: Record<string, unknown>) =>
  ({ art: "expose", wohnung_id: "w1", gueltig_bis: "2026-12-01T00:00:00Z", zurueckgezogen_am: null, ...teile }) as Parameters<typeof istVergleichbar>[0];

describe("istVergleichbar", () => {
  it("nur aktive Exposés einzelner Einheiten", () => {
    expect(istVergleichbar(e({}), JETZT)).toBe(true);
    expect(istVergleichbar(e({ art: "objektuebersicht" }), JETZT)).toBe(false);
    expect(istVergleichbar(e({ wohnung_id: null }), JETZT)).toBe(false);
    expect(istVergleichbar(e({ zurueckgezogen_am: "2026-10-20T00:00:00Z" }), JETZT)).toBe(false);
    expect(istVergleichbar(e({ gueltig_bis: "2026-10-01T00:00:00Z" }), JETZT)).toBe(false);
  });
});
