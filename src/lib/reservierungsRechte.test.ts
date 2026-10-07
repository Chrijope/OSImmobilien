import { describe, it, expect } from "vitest";
import { darfReservieren, RESERVIEREN_ROLLEN } from "./reservierungsRechte";

describe("darfReservieren", () => {
  it("erlaubt genau die vier vom Haus bestimmten Rollen", () => {
    expect(RESERVIEREN_ROLLEN).toEqual(["admin", "inhaber", "vertriebsleiter", "vertriebspartner"]);
    for (const rolle of RESERVIEREN_ROLLEN) {
      expect(darfReservieren(rolle)).toBe(true);
    }
  });

  it("sperrt die uebrigen internen Rollen", () => {
    // Diese Rollen durften bis zum 11.09.2026 an den Wohnungen schreiben,
    // weil die Datenbankregel nur `is_internal_role` verlangte.
    for (const rolle of [
      "hausverwaltung", "backoffice", "buchhaltung", "marketing", "hr",
      "setterin", "objektpartner", "finanzierungspartner", "individuell",
    ]) {
      expect(darfReservieren(rolle)).toBe(false);
    }
  });

  it("sperrt Kunden, Bewerber und fehlende Angaben", () => {
    expect(darfReservieren("kunde")).toBe(false);
    expect(darfReservieren("bewerber")).toBe(false);
    expect(darfReservieren(undefined)).toBe(false);
    expect(darfReservieren(null)).toBe(false);
    expect(darfReservieren("")).toBe(false);
  });
});
