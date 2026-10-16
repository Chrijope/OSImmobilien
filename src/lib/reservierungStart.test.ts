import { describe, expect, it, vi } from "vitest";

/*
 * Wann darf eine Reservierung beginnen, und wie steht ein Investment in der
 * Ampel des Dialogs „Für Kunden reservieren“?
 *
 * Bis zum 23.09.2026 galten zwei Regeln nebeneinander: Objekt- und
 * Wohnungsseite verlangten eine unterschriebene Selbstauskunft, das
 * Kundenprofil ließ auch den Vermerk „Kunde finanziert selbst“ gelten. Jetzt
 * gilt überall dieselbe.
 */

const meta: Record<string, Record<string, unknown>> = {};
const stufen: Record<string, string> = {};
const entfaellt = new Set<string>();

vi.mock("@/lib/investmentsStore", () => ({
  getInvestmentById: (id: string) => (stufen[id] !== undefined ? { id, pipelineStufe: stufen[id], meta: meta[id] || {} } : undefined),
  getInvestmentMetaField: (id: string, key: string, fallback: unknown) => meta[id]?.[key] ?? fallback,
}));
vi.mock("@/lib/selbstauskunftEntfaellt", () => ({
  getSelbstauskunftEntfaellt: (id: string) => ({ aktiv: entfaellt.has(id) }),
}));

const { ampelAus, darfReservierungStarten, fehlendeUnterlagenFuerReservierung, investmentAmpel, rvWirksamAusMeta } = await import("@/lib/reservierungStart");

/** Ausweis und letzte Gehaltsabrechnung hochgeladen (seit 16.10.2026 Pflicht). */
const UNTERLAGEN_DA = { docStatuses: { Personalausweis: "uploaded", "Letzter Gehaltsnachweis": "approved" } };

describe("Einheitliche Freigabe: Selbstauskunft unterschrieben oder finanziert selbst", () => {
  it("lässt eine unterschriebene Selbstauskunft durch", () => {
    stufen["inv-sa"] = "objektauswahl";
    meta["inv-sa"] = { saSigned: true, ...UNTERLAGEN_DA };
    expect(darfReservierungStarten("inv-sa")).toBe(true);
  });

  it("lässt den Vermerk „Kunde finanziert selbst“ durch", () => {
    stufen["inv-selbst"] = "beratungsgespraech";
    // Beim Selbstfinanzierer reicht der Ausweis.
    meta["inv-selbst"] = { docStatuses: { Personalausweis: "uploaded" } };
    entfaellt.add("inv-selbst");
    expect(darfReservierungStarten("inv-selbst")).toBe(true);
  });

  it("sperrt ohne Ausweis oder letzte Gehaltsabrechnung (neuer Ablauf)", () => {
    stufen["inv-ohne"] = "objektauswahl";
    meta["inv-ohne"] = { saSigned: true };
    expect(darfReservierungStarten("inv-ohne")).toBe(false);
    expect(fehlendeUnterlagenFuerReservierung("inv-ohne")).toEqual(["Personalausweis", "Letzter Gehaltsnachweis"]);

    meta["inv-ohne"] = { saSigned: true, docStatuses: { Personalausweis: "uploaded", "Letzter Gehaltsnachweis": "rejected" } };
    expect(darfReservierungStarten("inv-ohne")).toBe(false);
    expect(fehlendeUnterlagenFuerReservierung("inv-ohne")).toEqual(["Letzter Gehaltsnachweis"]);

    // Selbststaendige haben keine Gehaltsabrechnung.
    meta["inv-ohne"] = { saSigned: true, saData: { beschaeftigungsart: "selbstaendig" }, docStatuses: { Personalausweis: "approved" } };
    expect(darfReservierungStarten("inv-ohne")).toBe(true);
  });

  it("sperrt ohne beides und ohne Investment", () => {
    stufen["inv-nichts"] = "beratungsgespraech";
    meta["inv-nichts"] = { saData: { vorname: "Halb ausgefüllt" } };
    expect(darfReservierungStarten("inv-nichts")).toBe(false);
    expect(darfReservierungStarten(undefined)).toBe(false);
  });
});

describe("Die Ampel", () => {
  it("steht auf bereit mit Freigabe und ohne Reservierung", () => {
    expect(ampelAus({ stufe: "objektauswahl", saOk: true })).toBe("bereit");
  });

  it("meldet die fehlende Selbstauskunft", () => {
    expect(ampelAus({ stufe: "beratungsgespraech", saOk: false })).toBe("selbstauskunft_fehlt");
  });

  it("meldet eine schon laufende oder unterschriebene Reservierung", () => {
    expect(ampelAus({ stufe: "objektauswahl", saOk: true, rvSignaturePending: true })).toBe("hat_reservierung");
    expect(ampelAus({ stufe: "reservierung", saOk: true })).toBe("hat_reservierung");
    expect(ampelAus({ stufe: "objektauswahl", saOk: true, rvSigned: true })).toBe("hat_reservierung");
    expect(ampelAus({ stufe: "finanzierung", saOk: true })).toBe("hat_reservierung");
    expect(ampelAus({ stufe: "besichtigung", saOk: true, rvEntfallen: true })).toBe("hat_reservierung");
    // Die ausgeblendete Altstufe teilt den Rang der Reservierung.
    expect(ampelAus({ stufe: "bonitaetsunterlagen", saOk: true, rvEntfallen: true })).toBe("bereit");
  });

  it("gibt ein Investment nach einer entfallenen Reservierung wieder frei", () => {
    expect(ampelAus({ stufe: "reservierung", saOk: true, rvSigned: true, rvEntfallen: true })).toBe("bereit");
    // Hinter der Reservierung gibt es kein Zurück, auch nicht mit Vermerk.
    expect(ampelAus({ stufe: "notar", saOk: true, rvEntfallen: true })).toBe("hat_reservierung");
  });

  it("zeigt beendete Vorgänge als beendet", () => {
    expect(ampelAus({ stufe: "verloren", saOk: true })).toBe("beendet");
    expect(ampelAus({ stufe: "abgeschlossen", saOk: true })).toBe("beendet");
  });

  it("liest die Ampel aus dem Zwischenspeicher", () => {
    stufen["inv-a"] = "objektauswahl";
    meta["inv-a"] = { saSigned: true, rvSignaturePending: true };
    expect(investmentAmpel("inv-a")).toBe("hat_reservierung");
    meta["inv-a"] = { saSigned: true };
    expect(investmentAmpel("inv-a")).toBe("selbstauskunft_fehlt");
    meta["inv-a"] = { saSigned: true, ...UNTERLAGEN_DA };
    expect(investmentAmpel("inv-a")).toBe("bereit");
  });
});

describe("Wirksam ist eine Reservierung erst mit der Unterschrift", () => {
  it("ist ohne Unterschrift nicht wirksam, auch auf der Stufe Reservierung", () => {
    expect(rvWirksamAusMeta({ rvSignaturePending: true })).toBe(false);
  });

  it("ist mit Unterschrift und „sofort“ wirksam", () => {
    expect(rvWirksamAusMeta({ rvSigned: true, rvReservierungWirksamAm: "2026-09-23T10:00:00Z" })).toBe(true);
    expect(rvWirksamAusMeta({ rvSigned: true })).toBe(true);
  });

  it("wartet die Widerrufsfrist ab und zählt eine entfallene nie", () => {
    expect(rvWirksamAusMeta({ rvSigned: true, rvReservierungAb: "2026-10-07T10:00:00Z" })).toBe(false);
    expect(rvWirksamAusMeta({ rvSigned: true, rvReservierungEntfallenAm: "2026-09-23T10:00:00Z" })).toBe(false);
  });
});
