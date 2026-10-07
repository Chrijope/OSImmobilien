import { describe, it, expect } from "vitest";
import {
  PIPELINE_STUFEN,
  STUFEN_WAHRSCHEINLICHKEIT,
  wahrscheinlichkeitFuerStufe,
  FORTSCHRITT_STUFEN,
  fortschrittsRang,
  fortschrittsStufe,
  istNoShowStufe,
} from "@/lib/pipelineStufen";

/** Die Stufen in Prozessreihenfolge, ohne Endzustände und Legacy-Aliase. */
const REIHENFOLGE = [
  "neuer_lead",
  "erreicht",
  "follow_up",
  "erstgespraech_geplant",
  "erstgespraech",
  "beratungsgespraech",
  "selbstauskunft",
  // Seit 06.08.2026: Objektauswahl und Reservierung stehen vor der Bonitaet.
  "objektauswahl",
  // Seit 19.08.2026: manuelle Follow-Up-Stufe nach der Objektvorstellung.
  "follow_up_objekt",
  "reservierung",
  "bonitaetsunterlagen",
  "finanzierung",
  "notar",
  "faelligkeit",
];

describe("Abschlusswahrscheinlichkeit je Pipelinestufe", () => {
  it("kennt jede Stufe der Pipeline", () => {
    for (const s of PIPELINE_STUFEN) {
      expect(
        Object.prototype.hasOwnProperty.call(STUFEN_WAHRSCHEINLICHKEIT, s.key),
        `Stufe ohne Wahrscheinlichkeit: ${s.key}`,
      ).toBe(true);
    }
  });

  it("liegt überall zwischen 0 und 1", () => {
    for (const [key, wert] of Object.entries(STUFEN_WAHRSCHEINLICHKEIT)) {
      expect(wert, key).toBeGreaterThanOrEqual(0);
      expect(wert, key).toBeLessThanOrEqual(1);
    }
  });

  it("steigt entlang des Prozesses, nie rückwärts", () => {
    for (let i = 1; i < REIHENFOLGE.length; i++) {
      const vorher = STUFEN_WAHRSCHEINLICHKEIT[REIHENFOLGE[i - 1]];
      const jetzt = STUFEN_WAHRSCHEINLICHKEIT[REIHENFOLGE[i]];
      expect(jetzt, `${REIHENFOLGE[i - 1]} → ${REIHENFOLGE[i]}`).toBeGreaterThanOrEqual(vorher);
    }
  });

  it("gibt Endzuständen ohne Abschlusserwartung eine Null", () => {
    for (const key of ["verloren", "archiviert", "bestandsimport"]) {
      expect(STUFEN_WAHRSCHEINLICHKEIT[key], key).toBe(0);
    }
  });

  it("erreicht am Ende die volle Wahrscheinlichkeit", () => {
    for (const key of ["faelligkeit", "abrechnung", "abgeschlossen"]) {
      expect(STUFEN_WAHRSCHEINLICHKEIT[key], key).toBe(1);
    }
  });

  it("kennt auch die Altbestände aus der früheren Pipeline", () => {
    for (const key of ["zugewiesen", "kontaktversuche", "vermoegensaufbau", "closing"]) {
      expect(wahrscheinlichkeitFuerStufe(key), key).toBeGreaterThan(0);
    }
  });

  it("fällt bei Unbekanntem auf einen festen Wert zurück", () => {
    expect(wahrscheinlichkeitFuerStufe("gibt_es_nicht")).toBe(0.1);
    expect(wahrscheinlichkeitFuerStufe(undefined)).toBe(0.05);
    expect(wahrscheinlichkeitFuerStufe(null)).toBe(0.05);
  });

  it("die No-Show-Stufen liegen unter ihrer jeweiligen Termin-Stufe", () => {
    expect(STUFEN_WAHRSCHEINLICHKEIT.eg_noshow).toBeLessThan(
      STUFEN_WAHRSCHEINLICHKEIT.erstgespraech,
    );
    expect(STUFEN_WAHRSCHEINLICHKEIT.bg_noshow).toBeLessThan(
      STUFEN_WAHRSCHEINLICHKEIT.beratungsgespraech,
    );
  });
});

describe("Fortschrittsleiste im Kundenprofil", () => {
  it("zeigt genau die sechzehn Schritte in Prozessreihenfolge", () => {
    expect(FORTSCHRITT_STUFEN.map((s) => s.key)).toEqual([
      "neuer_lead",
      "nicht_erreicht",
      "erreicht",
      "follow_up",
      "erstgespraech_geplant",
      "beratungsgespraech",
      "selbstauskunft",
      "objektauswahl",
      "follow_up_objekt",
      "reservierung",
      "bonitaetsunterlagen",
      "finanzierung",
      "notar",
      "faelligkeit",
      "abrechnung",
      "abgeschlossen",
    ]);
  });

  it("kennt die fuenf Stufen, die der Leiste frueher fehlten", () => {
    /*
     * Sie standen in PIPELINE_STUFEN, aber nicht in der handgepflegten Liste
     * des Kundenprofils. Jeder Kunde in einer dieser Stufen fiel deshalb auf
     * Rang null und wurde als frischer Lead angezeigt.
     */
    for (const stufe of ["nicht_erreicht", "erreicht", "erstgespraech_geplant"]) {
      expect(fortschrittsRang(stufe), stufe).toBeGreaterThan(0);
    }
    for (const stufe of ["eg_noshow", "bg_noshow"]) {
      expect(fortschrittsRang(stufe), stufe).toBeGreaterThan(0);
    }
  });

  it("laesst NoShow beim zugehoerigen Gespraech stehen", () => {
    // Ein geplatzter Termin ist ein Rueckschlag, kein Fortschritt. Deshalb
    // kein eigenes Kaestchen, sondern derselbe Rang wie das Gespraech.
    expect(fortschrittsRang("eg_noshow")).toBe(fortschrittsRang("erstgespraech_geplant"));
    expect(fortschrittsRang("bg_noshow")).toBe(fortschrittsRang("beratungsgespraech"));
    expect(fortschrittsStufe("eg_noshow")).toBe("erstgespraech_geplant");
    expect(fortschrittsStufe("bg_noshow")).toBe("beratungsgespraech");
    expect(istNoShowStufe("eg_noshow")).toBe(true);
    expect(istNoShowStufe("bg_noshow")).toBe(true);
    expect(istNoShowStufe("erstgespraech_geplant")).toBe(false);
  });

  it("gibt NoShow und den Sonderzustaenden kein eigenes Kaestchen", () => {
    const sichtbar = new Set<string>(FORTSCHRITT_STUFEN.map((s) => s.key));
    for (const stufe of [
      "eg_noshow",
      "bg_noshow",
      "bestandsimport",
      "archiviert",
      "verloren",
      "zugewiesen",
      "kontaktversuche",
      "vermoegensaufbau",
    ]) {
      expect(sichtbar.has(stufe), stufe).toBe(false);
    }
  });

  it("ordnet die Altbestaende ein, statt sie auf null fallen zu lassen", () => {
    expect(fortschrittsRang("zugewiesen")).toBe(fortschrittsRang("neuer_lead"));
    expect(fortschrittsRang("kontaktversuche")).toBe(fortschrittsRang("nicht_erreicht"));
    // 0,12 liegt zwischen follow_up (0,10) und erstgespraech_geplant (0,15),
    // gewaehlt ist die niedrigere der beiden.
    expect(fortschrittsRang("vermoegensaufbau")).toBe(fortschrittsRang("follow_up"));
  });

  it("behandelt Unbekanntes als ganz vorne", () => {
    // Sichere Richtung: lieber zu wenig Fortschritt anzeigen als zu viel.
    expect(fortschrittsRang("gibt_es_nicht")).toBe(0);
    expect(fortschrittsRang(undefined)).toBe(0);
    expect(fortschrittsRang(null)).toBe(0);
    expect(fortschrittsRang("archiviert")).toBe(0);
  });
});
