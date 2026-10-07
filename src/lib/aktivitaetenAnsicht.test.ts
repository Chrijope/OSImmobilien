import { describe, it, expect } from "vitest";
import { ansichtFuerArt } from "@/lib/aktivitaetenAnsicht";

/**
 * Christians Meldung vom 16.09.2026: Eine frisch geschriebene Notiz erschien
 * nicht sofort bei den Aktivitaeten. Gespeichert war sie, sichtbar war sie
 * nicht, weil der Verlauf gerade eine andere Gruppe zeigte.
 */
describe("ansichtFuerArt", () => {
  it("schickt die Notiz in die Gruppe Notizen", () => {
    expect(ansichtFuerArt("notiz")).toBe("notizen");
  });
  it("schickt alles Uebrige in die Gruppe Aufgaben und Termine", () => {
    for (const art of ["aufgabe", "meeting", "anruf", "email", "anruf_protokoll", "meeting_protokoll"] as const) {
      expect(ansichtFuerArt(art)).toBe("manuell");
    }
  });
  it("laesst die Ansicht in Ruhe, wenn kein Vorgang angelegt wurde", () => {
    expect(ansichtFuerArt(null)).toBeNull();
    expect(ansichtFuerArt(undefined)).toBeNull();
  });
});
