import { describe, expect, it } from "vitest";
import { gespraechFandStatt, wiedervorlageVorschlag, zusammenfassungIstPflicht } from "./anrufProtokoll";

describe("Zusammenfassung im Anruf-Protokoll", () => {
  it("ist Pflicht, sobald ein Gespräch stattfand", () => {
    for (const ergebnis of ["erreicht", "erstgespraech_vereinbart", "beratungsgespraech_vereinbart", "kein_interesse"]) {
      expect(zusammenfassungIstPflicht(ergebnis)).toBe(true);
    }
  });

  it("bleibt freiwillig, wenn niemand erreicht wurde oder die Nummer falsch ist", () => {
    for (const ergebnis of ["nicht_erreicht", "mailbox", "daten_falsch"]) {
      expect(zusammenfassungIstPflicht(ergebnis)).toBe(false);
    }
  });

  it("verlangt nichts, solange noch kein Ergebnis gewählt ist", () => {
    expect(gespraechFandStatt("")).toBe(false);
    expect(zusammenfassungIstPflicht("")).toBe(false);
  });
});

describe("Fälligkeit der Wiedervorlage nach einem Anruf", () => {
  // Freitag, 26.09.2026, 14:37 Ortszeit.
  const jetzt = new Date(2026, 8, 26, 14, 37, 0);

  it("schlägt nach einem Gespräch morgen 10:00 vor", () => {
    expect(wiedervorlageVorschlag("erreicht", 0, jetzt)).toEqual({ datum: "2026-09-27", uhrzeit: "10:00" });
    expect(wiedervorlageVorschlag("mailbox", 3, jetzt)).toEqual({ datum: "2026-09-27", uhrzeit: "10:00" });
  });

  it("folgt bei „Nicht erreicht“ der Staffel und rundet auf die Viertelstunde auf", () => {
    // Erster Versuch: vier Stunden Pause, 18:37 wird zu 18:45.
    expect(wiedervorlageVorschlag("nicht_erreicht", 0, jetzt)).toEqual({ datum: "2026-09-26", uhrzeit: "18:45" });
    // Zweiter Versuch: nächster Tag 09:00.
    expect(wiedervorlageVorschlag("nicht_erreicht", 1, jetzt)).toEqual({ datum: "2026-09-27", uhrzeit: "09:00" });
    // Fünfter Versuch: 48 Stunden.
    expect(wiedervorlageVorschlag("nicht_erreicht", 4, jetzt)).toEqual({ datum: "2026-09-28", uhrzeit: "14:45" });
  });

  it("fällt nach dem letzten Versuch der Staffel auf morgen 10:00 zurück", () => {
    expect(wiedervorlageVorschlag("nicht_erreicht", 14, jetzt)).toEqual({ datum: "2026-09-27", uhrzeit: "10:00" });
  });
});
