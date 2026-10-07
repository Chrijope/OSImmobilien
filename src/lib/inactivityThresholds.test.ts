import { describe, it, expect } from "vitest";
import { INACTIVITY_THRESHOLDS } from "@/lib/inactivityThresholds";
import { PIPELINE_STUFEN } from "@/lib/pipelineStufen";

/**
 * Stufen, die bewusst keine Ampel haben: Der Lead ist entweder fertig oder
 * weg, oder die Stufe hat eine eigene Logik.
 */
const OHNE_AMPEL = new Set([
  "follow_up",      // wird in Stunden ab dem nächsten geplanten Kontakt gemessen
  "abgeschlossen",
  "archiviert",
  "verloren",
  "bestandsimport",
  "kontaktversuche", // Legacy, eigene Zähllogik
]);

describe("Inaktivitäts-Ampel", () => {
  it("kennt jede Pipelinestufe, die eine Ampel haben soll", () => {
    // Genau das war der Fehler: Beratungsgespräch fehlte in der Tabelle der
    // Pipeline-Seite, die Kacheln blieben deshalb farblos.
    const fehlend = PIPELINE_STUFEN.map((s) => s.key)
      .filter((k) => !OHNE_AMPEL.has(k))
      .filter((k) => !INACTIVITY_THRESHOLDS[k as keyof typeof INACTIVITY_THRESHOLDS]);
    expect(fehlend, `Ohne Schwellen: ${fehlend.join(", ")}`).toEqual([]);
  });

  it("hat für Beratungsgespräch und die NoShow-Stufen Schwellen", () => {
    expect(INACTIVITY_THRESHOLDS.beratungsgespraech).toEqual([3, 7]);
    expect(INACTIVITY_THRESHOLDS.eg_noshow).toBeDefined();
    expect(INACTIVITY_THRESHOLDS.bg_noshow).toBeDefined();
    expect(INACTIVITY_THRESHOLDS.selbstauskunft).toBeDefined();
  });

  it("setzt orange immer vor rot", () => {
    for (const [stufe, werte] of Object.entries(INACTIVITY_THRESHOLDS)) {
      if (!werte) continue;
      const [orange, rot] = werte;
      expect(orange, `${stufe}: orange muss vor rot liegen`).toBeLessThan(rot);
      expect(orange, `${stufe}: Schwellen müssen positiv sein`).toBeGreaterThan(0);
    }
  });
});
