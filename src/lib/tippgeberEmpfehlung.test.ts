import { describe, expect, it, vi } from "vitest";
import {
  EINVERSTAENDNIS_FASSUNG,
  einverstaendnisBestaetigtAm,
  einverstaendnisWortlaut,
  empfehlungAnlegen,
  fehlendePflichtangabe,
} from "@/lib/tippgeberEmpfehlung";

const VOLL = { vorname: "Max", nachname: "Muster", email: "max@example.com", telefon: "0170 1234567" };

describe("Pflichtprüfung der Tippgeber-Empfehlung", () => {
  it("lässt die Empfehlung ohne jede Finanzangabe durch", () => {
    // Nur Name, E-Mail und Telefon sind Pflicht. Die Qualifizierungsfragen
    // kommen in der Prüfung gar nicht vor.
    expect(fehlendePflichtangabe(VOLL)).toBeNull();
  });

  it.each(["vorname", "nachname", "email", "telefon"] as const)("blockiert ohne %s", (feld) => {
    expect(fehlendePflichtangabe({ ...VOLL, [feld]: "   " })).toMatch(/Pflichtfelder/);
  });
});

describe("Wortlaut des Einverständnisses", () => {
  it("nennt den Vornamen, sonst die empfohlene Person", () => {
    expect(einverstaendnisWortlaut(" Max ")).toMatch(/^Ich bestätige, dass Max mit der Weitergabe/);
    expect(einverstaendnisWortlaut("")).toMatch(/^Ich bestätige, dass die empfohlene Person mit der Weitergabe/);
    expect(einverstaendnisWortlaut("Max")).toContain("an OS Immobilien");
  });

  it("enthält keinen Gedankenstrich", () => {
    expect(einverstaendnisWortlaut("Max")).not.toMatch(/[–—]/);
  });
});

describe("Speichern mit Einverständnis", () => {
  const FELDER = { _vorname: "Max", _nachname: "Muster" };

  it("schickt Haken, Fassung und Wortlaut an create_tippgeber_lead", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const erg = await empfehlungAnlegen(rpc, FELDER, "Ich bestätige …");
    expect(erg.error).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("create_tippgeber_lead", {
      ...FELDER,
      _einverstaendnis: true,
      _einverstaendnis_fassung: EINVERSTAENDNIS_FASSUNG,
      _einverstaendnis_wortlaut: "Ich bestätige …",
    });
  });

  it("geht ohne die Migration über den alten Aufruf", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ error: { code: "PGRST202", message: "Could not find the function" } })
      .mockResolvedValueOnce({ error: null });
    const erg = await empfehlungAnlegen(rpc, FELDER, "x");
    expect(erg.error).toBeNull();
    expect(rpc).toHaveBeenLastCalledWith("create_tippgeber_lead", FELDER);
  });

  it("wiederholt bei einer Ablehnung nicht ohne Einverständnis", async () => {
    const abgelehnt = { error: { code: "22023", message: "Bitte bestätige …" } };
    const rpc = vi.fn().mockResolvedValue(abgelehnt);
    expect(await empfehlungAnlegen(rpc, FELDER, "x")).toEqual(abgelehnt);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe("Anzeige im Kundenprofil", () => {
  it("zeigt Datum und Uhrzeit in deutscher Zeit", () => {
    const meta = { tippgeberEinverstaendnis: { bestaetigt: true, bestaetigtAm: "2026-09-27T12:03:00Z" } };
    expect(einverstaendnisBestaetigtAm(meta)).toBe("27.09.2026, 14:03");
  });

  it.each([
    ["kein Eintrag", {}],
    ["kein Meta", null],
    ["nicht bestätigt", { tippgeberEinverstaendnis: { bestaetigt: false, bestaetigtAm: "2026-09-27T12:03:00Z" } }],
    ["kaputtes Datum", { tippgeberEinverstaendnis: { bestaetigt: true, bestaetigtAm: "gestern" } }],
  ])("zeigt nichts bei %s", (_, meta) => {
    expect(einverstaendnisBestaetigtAm(meta)).toBeNull();
  });
});
