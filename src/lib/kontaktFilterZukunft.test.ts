import { describe, it, expect } from "vitest";
import { hatGeplantenTermin, type KontaktEingabe } from "@/lib/naechsterKontakt";

/**
 * Die Chip-Filter in "Alle Kontakte" haengen daran.
 *
 * Vorher pruefte die Seite nur zwei Felder, den Settertermin und das
 * Beratungsgespraech. Wer eine Aufgabe naechste Woche hatte, stand unter
 * "Jetzt anrufbar" und fehlte unter "Termin geplant".
 */

const morgen = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };
const gestern = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); };

describe("Zukunftstermin fuer die Chip-Filter", () => {
  it("erkennt eine Aufgabe in der Zukunft", () => {
    const e: KontaktEingabe = { aufgaben: [{ titel: "Rueckruf", faelligAm: morgen() }] };
    expect(hatGeplantenTermin(e)).toBe(true);
  });

  it("erkennt ein Follow-Up in der Zukunft", () => {
    expect(hatGeplantenTermin({ followUps: [{ titel: "Nachfassen", faelligAm: morgen() }] })).toBe(true);
  });

  it("erkennt einen Termin mit Uhrzeit in der Zukunft", () => {
    const e: KontaktEingabe = { termine: [{ datum: morgen(), uhrzeit: "09:00", bezeichnung: "Beratung" }] };
    expect(hatGeplantenTermin(e)).toBe(true);
  });

  it("zaehlt Vergangenes nicht", () => {
    const e: KontaktEingabe = {
      aufgaben: [{ titel: "alt", faelligAm: gestern() }],
      termine: [{ datum: gestern(), uhrzeit: "10:00", bezeichnung: "Erstgespräch" }],
    };
    expect(hatGeplantenTermin(e)).toBe(false);
  });

  it("zaehlt die Wartephase nicht als Termin", () => {
    // Wer in Wartezeit ist, hat keinen Termin, sondern eine Sperre. Sonst
    // stuende jeder nicht Erreichte unter "Termin geplant".
    expect(hatGeplantenTermin({ verstecktBis: morgen() })).toBe(false);
  });

  it("zaehlt eine Wiedervorlage nach nicht erreicht nicht als Termin", () => {
    const e: KontaktEingabe = {
      aufgaben: [{ titel: "Erneut anrufen", faelligAm: morgen(), wiedervorlage: true }],
    };
    expect(hatGeplantenTermin(e)).toBe(false);
  });

  it("bleibt bei leerer Eingabe ruhig", () => {
    expect(hatGeplantenTermin({})).toBe(false);
  });
});
