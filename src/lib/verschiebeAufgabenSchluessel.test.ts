import { describe, it, expect } from "vitest";
import {
  verschiebeAufgabenPraefix,
  verschiebeAufgabenSchluessel,
} from "@/lib/terminErgebnis";

/**
 * Wird ein Termin verschoben, entsteht eine Folgeaufgabe: „Bitte den Kunden
 * vorher erinnern". Wird der Termin danach gelöscht, muss sie mit verschwinden.
 *
 * Die Aufgabe ZUM TERMIN räumt die Datenbank selbst ab, über einen
 * Fremdschlüssel. Die Folgeaufgabe kann dort nicht mithängen, weil je Termin
 * nur eine Aufgabe verknüpft sein darf. Sie wird deshalb über ihren
 * Auslöser-Schlüssel gefunden, und das ist eine Verbindung über Zeichenketten.
 *
 * Genau solche Verbindungen reißen still: Wer den Schlüssel an einer Stelle
 * ändert, bemerkt nichts, die Aufgabe bleibt einfach liegen. Dieser Test hält
 * beide Seiten zusammen.
 */
describe("Schlüssel der Verschiebe-Folgeaufgabe", () => {
  const key = "ak-6f1b2c3d-0000-4000-8000-000000000001";

  it("beginnt mit dem Präfix, nach dem später gesucht wird", () => {
    const schluessel = verschiebeAufgabenSchluessel(key, "2026-09-25", "11:00");
    expect(schluessel.startsWith(verschiebeAufgabenPraefix(key))).toBe(true);
  });

  it("unterscheidet zwei Verschiebungen desselben Termins", () => {
    // Sonst verhindert der eindeutige Index die zweite Aufgabe, und wer zweimal
    // verschiebt, bekommt nur für die erste Verschiebung eine Erinnerung.
    const a = verschiebeAufgabenSchluessel(key, "2026-09-25", "11:00");
    const b = verschiebeAufgabenSchluessel(key, "2026-09-26", "11:00");
    expect(a).not.toBe(b);
  });

  it("trifft mit dem Präfix keinen fremden Termin", () => {
    const fremd = "ak-6f1b2c3d-0000-4000-8000-000000000002";
    const schluessel = verschiebeAufgabenSchluessel(fremd, "2026-09-25", "11:00");
    expect(schluessel.startsWith(verschiebeAufgabenPraefix(key))).toBe(false);
  });

  it("endet auf einen Trenner, damit kein längerer Schlüssel mitgefangen wird", () => {
    // Ohne den Trenner träfe das Präfix eines Termins "ak-1" auch "ak-12".
    expect(verschiebeAufgabenPraefix(key).endsWith("_")).toBe(true);
  });
});
