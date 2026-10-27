import { describe, expect, it } from "vitest";
import {
  finanzierungSpaetestensBis,
  finanzierungsFrist,
  fruehesterNotartermin,
  kveVersandAm,
  notarterminPruefen,
} from "./notarFristen";

const JETZT = new Date("2026-10-27T10:00:00Z");

describe("notarFristen", () => {
  it("rechnet 14 Kalendertage ab dem Berliner Versandtag", () => {
    expect(fruehesterNotartermin("2026-10-01T09:00:00Z")).toBe("2026-10-15");
    // 23:30 UTC ist in Berlin schon der naechste Tag.
    expect(fruehesterNotartermin("2026-10-01T23:30:00Z")).toBe("2026-10-16");
    // Ueber den Monatswechsel.
    expect(fruehesterNotartermin("2026-10-20T10:00:00Z")).toBe("2026-11-03");
  });

  it("Finanzierung 14 Tage vor dem Notartermin", () => {
    expect(finanzierungSpaetestensBis("2026-11-10")).toBe("2026-10-27");
  });

  it("nimmt den neuesten freigegebenen Entwurf, Freigabe vor Hochladen", () => {
    expect(kveVersandAm([
      { kategorie: "Kaufvertragsentwurf", freigegeben: false, uploadedAt: "2026-10-20T10:00:00Z" },
      { kategorie: "Kaufvertrag", freigegeben: true, uploadedAt: "2026-10-21T10:00:00Z" },
    ])).toBeNull();
    expect(kveVersandAm([
      { kategorie: "Kaufvertragsentwurf", freigegeben: true, uploadedAt: "2026-10-01T10:00:00Z" },
      { kategorie: "Kaufvertragsentwurf", freigegeben: true, uploadedAt: "2026-10-02T10:00:00Z", freigegebenAm: "2026-10-05T10:00:00Z" },
    ])).toBe("2026-10-05T10:00:00Z");
  });

  it("sperrt ohne Entwurf und vor Ablauf der Frist", () => {
    expect(notarterminPruefen("2026-11-20", null, JETZT)).toMatch(/noch nicht beim Kunden/);
    expect(notarterminPruefen("2026-11-01", "2026-10-25T10:00:00Z", JETZT))
      .toBe("Frühestmöglicher Notartermin: 08.11.2026 (14 Tage nach Versand des Kaufvertragsentwurfs am 25.10.2026).");
    expect(notarterminPruefen("08.11.2026", "2026-10-25T10:00:00Z", JETZT)).toBeNull();
  });

  it("laesst Leeren und Nachtraege in der Vergangenheit durch", () => {
    expect(notarterminPruefen("", null, JETZT)).toBeNull();
    expect(notarterminPruefen("2026-09-01", null, JETZT)).toBeNull();
  });

  it("Finanzierungsfrist wird rot, wenn erreicht und nicht bestaetigt", () => {
    expect(finanzierungsFrist("2026-11-10", "offen", JETZT)).toEqual({ bis: "2026-10-27", text: "Finanzierung muss bis 27.10.2026 stehen", ueberfaellig: true });
    expect(finanzierungsFrist("2026-11-10", "bestaetigt", JETZT)?.ueberfaellig).toBe(false);
    expect(finanzierungsFrist("2026-11-11", "offen", JETZT)?.ueberfaellig).toBe(false);
    expect(finanzierungsFrist("", "offen", JETZT)).toBeNull();
  });
});
