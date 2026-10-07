import { describe, it, expect } from "vitest";
import { saVollansicht, stufeAbSelbstauskunft } from "./investmentFreischaltung";

describe("stufeAbSelbstauskunft", () => {
  it("bleibt vor der Selbstauskunft falsch, die Karte 'Kunde nicht finanzierungsfaehig' bleibt sichtbar", () => {
    for (const stufe of ["neuer_lead", "nicht_erreicht", "follow_up", "erstgespraech", "beratungsgespraech", "bg_noshow"]) {
      expect(stufeAbSelbstauskunft(stufe), stufe).toBe(false);
    }
  });

  it("wird wahr ab Stufe Selbstauskunft und fuer alle spaeteren Stufen", () => {
    for (const stufe of ["selbstauskunft", "objektauswahl", "bonitaetsunterlagen", "notar", "abgeschlossen"]) {
      expect(stufeAbSelbstauskunft(stufe), stufe).toBe(true);
    }
  });

  it("behandelt fehlende oder unbekannte Stufe als ganz vorne", () => {
    expect(stufeAbSelbstauskunft(undefined)).toBe(false);
    expect(stufeAbSelbstauskunft(null)).toBe(false);
    expect(stufeAbSelbstauskunft("")).toBe(false);
    expect(stufeAbSelbstauskunft("gibt_es_nicht")).toBe(false);
  });
});

describe("saVollansicht", () => {
  it("oeffnet bei fertiger Selbstauskunft (PDF, Unterschrift, Freigabe)", () => {
    expect(saVollansicht({ saPdfFilename: "sa.pdf" })).toBe(true);
    expect(saVollansicht({ saSigned: true })).toBe(true);
    expect(saVollansicht({ saStatus: "uploaded" })).toBe(true);
    expect(saVollansicht({ saStatus: "approved" })).toBe(true);
  });

  it("bleibt bei nur verschicktem Link zu, auch wenn der Kunde schon tippt", () => {
    expect(saVollansicht({ saInvitationSentAt: "2026-08-18", saDataVorhanden: true })).toBe(false);
    expect(saVollansicht({ saInvitationSentAt: "2026-08-18" })).toBe(false);
  });

  it("oeffnet nach Unterschrift trotz vorherigem Versand", () => {
    expect(saVollansicht({ saInvitationSentAt: "2026-08-18", saSigned: true })).toBe(true);
  });

  it("gemeinsam im Gespraech ausgefuellt (Daten ohne Versand) oeffnet wie bisher", () => {
    expect(saVollansicht({ saDataVorhanden: true })).toBe(true);
  });

  it("ohne jede Selbstauskunft bleibt die Vollansicht zu", () => {
    expect(saVollansicht({})).toBe(false);
  });

  it("fortgeschrittene Stufe (ab Bonitaetsunterlagen) oeffnet weiterhin", () => {
    expect(saVollansicht({ fortgeschritteneStufe: true })).toBe(true);
  });
});
