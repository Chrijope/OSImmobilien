import { describe, it, expect } from "vitest";
import { istInWartezeit, wartezeitEndeText } from "./kontaktversuchSchedule";

/**
 * Die Wartezeit nach „Nicht erreicht“. Sie sperrt das Anrufen, nicht die
 * Auswahl und nicht die Rückgabe an die Zentrale.
 */
describe("istInWartezeit", () => {
  const jetzt = new Date("2026-09-28T10:00:00.000Z");

  it("läuft, solange das Ende in der Zukunft liegt", () => {
    expect(istInWartezeit("2026-09-29T07:00:00.000Z", jetzt)).toBe(true);
  });

  it("ist vorbei, sobald das Ende erreicht ist", () => {
    expect(istInWartezeit("2026-09-28T10:00:00.000Z", jetzt)).toBe(false);
    expect(istInWartezeit("2026-09-27T07:00:00.000Z", jetzt)).toBe(false);
  });

  it("hält einen Lead ohne oder mit kaputtem Datum nicht fest", () => {
    expect(istInWartezeit(undefined, jetzt)).toBe(false);
    expect(istInWartezeit(null, jetzt)).toBe(false);
    expect(istInWartezeit("", jetzt)).toBe(false);
    expect(istInWartezeit("kein Datum", jetzt)).toBe(false);
    expect(istInWartezeit(12345, jetzt)).toBe(false);
  });

  it("rechnet über den Zeitpunkt, nicht über den Text", () => {
    // Derselbe Zeitpunkt wie 09:00 Z, nur anders geschrieben. Ein
    // Textvergleich hielte „+02:00“ für später als „Z“.
    expect(istInWartezeit("2026-09-28T11:00:00+02:00", jetzt)).toBe(false);
    expect(istInWartezeit("2026-09-28T13:00:00+02:00", jetzt)).toBe(true);
  });
});

describe("wartezeitEndeText", () => {
  it("nennt Tag und Uhrzeit", () => {
    expect(wartezeitEndeText("2026-09-29T07:00:00.000Z")).toMatch(/^29\.09\.2026, \d{2}:00$/);
  });
});
