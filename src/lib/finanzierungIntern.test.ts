import { describe, it, expect } from "vitest";
import { finanzierungIntern, FREIGESCHALTET_AB_RESERVIERUNG } from "./investmentFreischaltung";

/**
 * Die eine Regel für die Finanzierung im Kundenprofil (Christian, 25.09.2026):
 * offen ab der Reservierung, sobald sie unterschrieben ist und ein Objekt am
 * Investment steht, auch während der Bonitätsunterlagen.
 */

const OFFEN = { pipelineStufe: "bonitaetsunterlagen", rvSigned: true, objektGesetzt: true };

describe("finanzierungIntern", () => {
  it("ist vor der Reservierung zu und nennt die Stufe", () => {
    const stand = finanzierungIntern({ ...OFFEN, pipelineStufe: "objektauswahl" });

    expect(stand.offen).toBe(false);
    expect(stand.sperrgrund).toContain("ab der Stufe Reservierung");
    expect(stand.sperrgrund).toContain("Objektauswahl");
  });

  it("ist bei offener Reservierung ohne Unterschrift zu und sagt das", () => {
    const stand = finanzierungIntern({ ...OFFEN, pipelineStufe: "reservierung", rvSigned: false });

    expect(stand.offen).toBe(false);
    expect(stand.sperrgrund).toBe("Die Finanzierung öffnet sich, sobald die Reservierung unterschrieben ist.");
  });

  it("ist mit unterschriebener Reservierung auf der Stufe Bonitätsunterlagen offen", () => {
    // Genau der Fall, den die Karte vorher ein zweites Mal sperrte.
    expect(finanzierungIntern(OFFEN)).toEqual({ offen: true, sperrgrund: null });
  });

  it.each(FREIGESCHALTET_AB_RESERVIERUNG.map((s) => [s]))("ist auf der Stufe %s offen", (stufe) => {
    expect(finanzierungIntern({ ...OFFEN, pipelineStufe: stufe }).offen).toBe(true);
  });

  it("ist ohne Objekt zu, auch mit Unterschrift", () => {
    const stand = finanzierungIntern({ ...OFFEN, objektGesetzt: false });

    expect(stand.offen).toBe(false);
    expect(stand.sperrgrund).toContain("sobald ein Objekt eingetragen");
  });

  it("zählt einen Investagon-Vorgang als gesetztes Objekt", () => {
    // Die Objektdaten liegen dort, nicht bei uns. Dieselbe Ausnahme wie bei der Reservierung.
    expect(finanzierungIntern({ ...OFFEN, objektGesetzt: false, istInvestagon: true }).offen).toBe(true);
  });

  it("Selbstfinanzierer: nach der Unterschrift direkt auf Finanzierung, offen ohne Bonität", () => {
    // Der Vermerk „Kunde finanziert selbst" lässt die Bonitätsunterlagen
    // entfallen, der Vorgang springt von der Reservierung auf Finanzierung.
    // Die Regel fragt die Bonität nicht ab und lässt ihn durch.
    expect(finanzierungIntern({ ...OFFEN, pipelineStufe: "finanzierung" }).offen).toBe(true);
    expect(finanzierungIntern({ ...OFFEN, pipelineStufe: "reservierung" }).offen).toBe(true);
  });

  it("Selbstfinanzierer ohne unterschriebene Reservierung bleibt zu", () => {
    // Der Vermerk öffnet nichts an der Reservierung vorbei.
    expect(finanzierungIntern({ ...OFFEN, pipelineStufe: "reservierung", rvSigned: false }).offen).toBe(false);
  });

  it("sperrt Altbestand mit vorhandenen Finanzierungsdaten nie weg", () => {
    const stand = finanzierungIntern({ pipelineStufe: "objektauswahl", rvSigned: false, hatFinanzierungsdaten: true });

    expect(stand.offen).toBe(true);
  });

  it("verliert und archiviert sind zu", () => {
    expect(finanzierungIntern({ ...OFFEN, pipelineStufe: "verloren" }).offen).toBe(false);
    expect(finanzierungIntern({ ...OFFEN, pipelineStufe: "archiviert" }).offen).toBe(false);
  });

  it("kommt ohne Angaben zurecht", () => {
    const stand = finanzierungIntern({});

    expect(stand.offen).toBe(false);
    expect(stand.sperrgrund).toBeTruthy();
  });

  it("schreibt keine Gedankenstriche in die Sperrtexte", () => {
    const texte = [
      finanzierungIntern({ ...OFFEN, objektGesetzt: false }).sperrgrund,
      finanzierungIntern({ ...OFFEN, rvSigned: false }).sperrgrund,
      finanzierungIntern({ ...OFFEN, pipelineStufe: "objektauswahl" }).sperrgrund,
    ];
    for (const t of texte) expect(t).not.toMatch(/[–—]/);
  });
});
