import { describe, it, expect } from "vitest";
import { einstiegTeilFuer, einstiegBegruendung, istTeil1Abgeschlossen } from "./erstgespraechStand";
import type { ErstgespraechSkript } from "./bewerbungStore";

const leeresSkript = (): ErstgespraechSkript => ({
  ausgangslage: "", ziele: "", motivation: "", vorErfahrung: "",
  einwand: "", budget: "", naechsterSchritt: "", durchgefuehrtAm: "", durchgefuehrtVon: "",
});

describe("istTeil1Abgeschlossen (nur der Abschluss-Zeitstempel zählt)", () => {
  it("leer, null oder ein leeres Vorgabe-Skript sind nicht abgeschlossen", () => {
    expect(istTeil1Abgeschlossen(undefined)).toBe(false);
    expect(istTeil1Abgeschlossen(null)).toBe(false);
    expect(istTeil1Abgeschlossen(leeresSkript())).toBe(false);
    expect(istTeil1Abgeschlossen({ ...leeresSkript(), durchgefuehrtAm: "   " })).toBe(false);
  });

  it("ein einzelnes gefülltes Gesprächsfeld reicht nicht (Fall Max Musterfrau)", () => {
    expect(istTeil1Abgeschlossen({ ...leeresSkript(), assessment: { ersteindruck: "offen" } })).toBe(false);
    expect(istTeil1Abgeschlossen({ ...leeresSkript(), assessment: { pfade: ["vertrieb"] } })).toBe(false);
    expect(istTeil1Abgeschlossen({ ...leeresSkript(), ziele: "Nebeneinkommen" })).toBe(false);
  });

  it("der Abschluss-Zeitstempel macht Teil 1 abgeschlossen, als ISO oder deutsches Datum", () => {
    expect(istTeil1Abgeschlossen({ ...leeresSkript(), durchgefuehrtAm: "2026-09-01T10:00:00Z" })).toBe(true);
    expect(istTeil1Abgeschlossen({ ...leeresSkript(), durchgefuehrtAm: "01.09.2026" })).toBe(true);
  });
});

describe("einstiegTeilFuer", () => {
  it("ohne Bewerber, mit leerem Skript oder nur gefüllten Feldern startet das ganze Deck ab Teil 1", () => {
    expect(einstiegTeilFuer(null)).toBe(1);
    expect(einstiegTeilFuer(undefined)).toBe(1);
    expect(einstiegTeilFuer({ erstgespraechSkript: leeresSkript() })).toBe(1);
    expect(einstiegTeilFuer({ erstgespraechSkript: { ...leeresSkript(), assessment: {} } })).toBe(1);
    // Genau der gemeldete Fehler: ein Feld ausgefüllt, Reiter nicht grün, trotzdem sprang der Einstieg auf Teil 2.
    expect(einstiegTeilFuer({ erstgespraechSkript: { ...leeresSkript(), assessment: { pfade: ["vertrieb"] } } })).toBe(1);
    expect(einstiegTeilFuer({ erstgespraechSkript: { ...leeresSkript(), ziele: "Nebeneinkommen" } })).toBe(1);
  });

  it("mit abgeschlossenem Teil 1 startet nur Teil 2", () => {
    expect(einstiegTeilFuer({ erstgespraechSkript: { ...leeresSkript(), durchgefuehrtAm: "2026-09-01T10:00:00Z" } })).toBe(2);
  });

  it("dieselbe Definition wie istTeil1Abgeschlossen", () => {
    const offen = { ...leeresSkript(), assessment: { ersteindruck: "offen" } };
    expect(istTeil1Abgeschlossen(offen)).toBe(false);
    expect(einstiegTeilFuer({ erstgespraechSkript: offen })).toBe(1);
    const fertig = { ...offen, durchgefuehrtAm: "2026-09-01T10:00:00Z" };
    expect(istTeil1Abgeschlossen(fertig)).toBe(true);
    expect(einstiegTeilFuer({ erstgespraechSkript: fertig })).toBe(2);
  });

  it("die Begründung nennt Automatik oder Übersteuerung", () => {
    expect(einstiegBegruendung(2, true)).toBe("Teil 1 bereits am Telefon geführt und abgeschlossen, Start bei Teil 2");
    expect(einstiegBegruendung(1, true)).toMatch(/noch nicht abgeschlossen/);
    expect(einstiegBegruendung(1, false)).toBe("Manuell gewählt: ab Teil 1");
    expect(einstiegBegruendung(2, false)).toBe("Manuell gewählt: nur Teil 2");
  });
});
