import { describe, it, expect } from "vitest";
import { ausInvestagon, darfGepflegtWerden } from "./investagonHerkunft";

describe("ausInvestagon", () => {
  it("erkennt den Rohdatensatz", () => {
    expect(ausInvestagon({ meta: { investagonRaw: { id: 174351 } } })).toBe(true);
  });

  it("erkennt die Kennung in meta", () => {
    expect(ausInvestagon({ meta: { investagonId: "8xgzk5a4" } })).toBe(true);
  });

  /*
   * Einheiten aus der Zeit vor dem vollen Abgleich tragen nur die Kennung,
   * ohne Rohdatensatz. Sie gehoeren trotzdem Investagon.
   */
  it("erkennt die ausgepackte Kennung am Datensatz", () => {
    expect(ausInvestagon({ investagonId: "8xgzk5a4" })).toBe(true);
  });

  it("erkennt die Abgleichsfassung am Objekt", () => {
    expect(ausInvestagon({ meta: { investagonVollSyncVersion: "a1b2c3" } })).toBe(true);
  });

  it("laesst ein selbst angelegtes Objekt in Ruhe", () => {
    expect(ausInvestagon({ meta: { beraterName: "Sarah Kaiser-Thom" } })).toBe(false);
    expect(ausInvestagon({ meta: {} })).toBe(false);
    expect(ausInvestagon({})).toBe(false);
  });

  /*
   * Im Zweifel nein: Ein falsches Ja blendet die Pflegeknoepfe bei einem
   * selbst angelegten Objekt aus, und dann kann niemand mehr etwas eintragen.
   */
  it("sagt bei fehlenden Daten nein", () => {
    expect(ausInvestagon(null)).toBe(false);
    expect(ausInvestagon(undefined)).toBe(false);
    expect(ausInvestagon({ meta: null })).toBe(false);
  });

  it("wertet eine leere Kennung nicht als Herkunft", () => {
    expect(ausInvestagon({ investagonId: "   " })).toBe(false);
    expect(ausInvestagon({ meta: { investagonId: "" } })).toBe(false);
  });
});

describe("darfGepflegtWerden", () => {
  it("ist die Umkehrung", () => {
    expect(darfGepflegtWerden({ meta: { investagonRaw: {} } })).toBe(false);
    expect(darfGepflegtWerden({ meta: {} })).toBe(true);
  });
});
