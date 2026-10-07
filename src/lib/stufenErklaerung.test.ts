import { describe, it, expect } from "vitest";
import { STUFEN_ERKLAERUNG, stufenErklaerung } from "@/lib/stufenErklaerung";
import { PIPELINE_STUFEN, FORTSCHRITT_STUFEN } from "@/lib/pipelineStufen";
import { MAX_KONTAKTVERSUCHE } from "@/lib/kontaktversuchSchedule";

/**
 * Die Erklärungen standen zweimal im Code, in der Pipeline und im
 * Kundenprofil, und beide Fassungen beschrieben die alte Reihenfolge mit der
 * Bonität vor der Objektauswahl. Ein Kästchen ohne Erklärung fällt niemandem
 * auf, eine falsche Erklärung schickt Vertriebspartner in die Irre. Dagegen
 * sind diese Tests da.
 */

describe("Erklärungen zu den Pipelinestufen", () => {
  it("hat für jede Stufe der Fortschrittsleiste eine Erklärung", () => {
    for (const stufe of FORTSCHRITT_STUFEN) {
      const text = stufenErklaerung(stufe.key);
      expect(text, `Stufe "${stufe.key}" (${stufe.label}) hat keine Erklärung`).toBeTruthy();
    }
  });

  it("hat für jede Stufe der Pipeline eine Erklärung, auch für die abgeschafften", () => {
    // Das Pipeline-Brett zeichnet alle Stufen aus PIPELINE_STUFEN, die
    // Legacy-Spalten eingeschlossen.
    for (const stufe of PIPELINE_STUFEN) {
      expect(stufenErklaerung(stufe.key), `Stufe "${stufe.key}" hat keine Erklärung`).toBeTruthy();
    }
  });

  it("kennt die virtuelle Spalte Bestandskunden", () => {
    expect(stufenErklaerung("bestandskunden")).toBeTruthy();
  });

  it("führt die tote Stufe „closing\" nicht mehr", () => {
    // Sie steht weder in PIPELINE_STUFEN noch in der Leiste, wurde aber an
    // beiden alten Stellen weiter beschrieben.
    expect(stufenErklaerung("closing")).toBeUndefined();
  });

  it("nennt die Kontaktversuch-Grenze aus der zentralen Konstante", () => {
    // Einmal stand hier 4 und einmal 5, tatsächlich sind es 15.
    expect(STUFEN_ERKLAERUNG.nicht_erreicht).toContain(String(MAX_KONTAKTVERSUCHE));
    expect(STUFEN_ERKLAERUNG.verloren).toContain(String(MAX_KONTAKTVERSUCHE));
  });

  it("beschreibt die Reihenfolge, die das System wirklich läuft", () => {
    // Beratungsgespräch führt auf die Selbstauskunft, diese auf die
    // Objektauswahl, die Reservierung auf die Bonität und die Bonität auf die
    // Finanzierung. Vorher stand hier durchgehend die alte Reihenfolge.
    expect(STUFEN_ERKLAERUNG.beratungsgespraech).toContain("Selbstauskunft");
    expect(STUFEN_ERKLAERUNG.beratungsgespraech).not.toContain("Bonitätsunterlagen");
    expect(STUFEN_ERKLAERUNG.selbstauskunft).toContain("Objektauswahl");
    expect(STUFEN_ERKLAERUNG.objektauswahl).toContain("Reservierung");
    expect(STUFEN_ERKLAERUNG.reservierung).toContain("Bonitätsunterlagen");
    expect(STUFEN_ERKLAERUNG.bonitaetsunterlagen).toContain("Finanzierung");
  });

  it("behauptet in der Objektauswahl nicht, es sei schon reserviert", () => {
    // Der alte Text beschrieb dort die Reservierung selbst.
    expect(STUFEN_ERKLAERUNG.objektauswahl).toContain("Selbstauskunft ist unterschrieben");
  });

  it("gibt bei Unbekanntem nichts zurück, statt zu raten", () => {
    expect(stufenErklaerung("gibt_es_nicht")).toBeUndefined();
    expect(stufenErklaerung(undefined)).toBeUndefined();
    expect(stufenErklaerung(null)).toBeUndefined();
    expect(stufenErklaerung("")).toBeUndefined();
  });

  it("enthält keine Gedankenstriche in den Texten, die Nutzer sehen", () => {
    for (const [key, text] of Object.entries(STUFEN_ERKLAERUNG)) {
      expect(text, `Gedankenstrich in "${key}": ${text}`).not.toMatch(/[—–]/);
    }
  });
});
