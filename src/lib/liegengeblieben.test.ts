import { describe, expect, it } from "vitest";
import type { KundeData } from "./kundenStore";
import { istNieKontaktiert, istOhneNaechstenSchritt, type LiegengebliebenPruefung } from "./liegengeblieben";

const k = (teile: Record<string, unknown>) => ({ id: "x", ...teile }) as unknown as KundeData;
const pruefung = (teile: Partial<{ termin: boolean; warte: boolean; stufe: string }> = {}): LiegengebliebenPruefung => ({
  hatTermin: () => !!teile.termin,
  inWartezeit: () => !!teile.warte,
  stufe: () => teile.stufe ?? "neuer_lead",
});

describe("istOhneNaechstenSchritt", () => {
  it("ohne Termin und ohne Wartezeit", () => {
    expect(istOhneNaechstenSchritt(k({}), pruefung({ stufe: "objektauswahl" }))).toBe(true);
  });
  it("nicht mit geplantem Schritt oder in der Wartezeit", () => {
    expect(istOhneNaechstenSchritt(k({}), pruefung({ termin: true }))).toBe(false);
    expect(istOhneNaechstenSchritt(k({}), pruefung({ warte: true }))).toBe(false);
  });
  it("abgelegte zählen nicht", () => {
    expect(istOhneNaechstenSchritt(k({ archiviert: true }), pruefung())).toBe(false);
    expect(istOhneNaechstenSchritt(k({}), pruefung({ stufe: "verloren" }))).toBe(false);
  });
});

describe("istNieKontaktiert", () => {
  it("neuer Lead ohne Versuch", () => {
    expect(istNieKontaktiert(k({}), pruefung())).toBe(true);
  });
  it("nicht nach einem Versuch, mit Termin oder in anderer Stufe", () => {
    expect(istNieKontaktiert(k({ meta: { nichtErreichtCount: 1 } }), pruefung())).toBe(false);
    expect(istNieKontaktiert(k({}), pruefung({ termin: true }))).toBe(false);
    expect(istNieKontaktiert(k({}), pruefung({ stufe: "erreicht" }))).toBe(false);
  });
});
