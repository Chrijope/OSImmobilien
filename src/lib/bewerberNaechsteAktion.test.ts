import { describe, it, expect } from "vitest";
import { baueBewerberEreignisse } from "./bewerberEreignisse";
import { letzteAktivitaet, naechsteAktionText, naechsterTermin } from "./bewerberNaechsteAktion";

const jetzt = new Date(2026, 8, 17, 12, 0, 0); // 17.09.2026, Ortszeit

describe("naechsteAktionText", () => {
  it("nennt je Stufe den nächsten Schritt", () => {
    expect(naechsteAktionText({ status: "Eingang" })).toBe("Kennenlernbogen versenden oder anrufen");
    expect(naechsteAktionText({ status: "Closing" })).toBe("Videocall führen und Paket besprechen");
    expect(naechsteAktionText({ status: "Abgelehnt" })).toBe("Nichts offen, abgelehnt");
  });

  it("bleibt bei unbekannter oder fehlender Stufe allgemein, statt leer zu sein", () => {
    expect(naechsteAktionText({})).toBe("Nächsten Schritt festlegen");
    expect(naechsteAktionText({ status: "Unbekannt" as never })).toBe("Nächsten Schritt festlegen");
  });
});

describe("naechsterTermin", () => {
  it("nimmt den zeitlich nächsten, nicht den zuerst eingetragenen", () => {
    const ereignisse = baueBewerberEreignisse({
      bewerber: {
        erstgespraechDatum: "30.09.2026",
        erstgespraechUhrzeit: "09:00",
        followUpDatum: "20.09.2026",
        followUpUhrzeit: "10:00",
      },
    });
    expect(naechsterTermin(ereignisse, jetzt)?.titel).toBe("Follow-up");
  });

  it("übergeht vergangene Termine", () => {
    const ereignisse = baueBewerberEreignisse({
      bewerber: { erstgespraechDatum: "02.09.2026", erstgespraechUhrzeit: "09:00" },
    });
    expect(naechsterTermin(ereignisse, jetzt)).toBeNull();
  });

  it("zählt Mails und Schritte nicht als Termin", () => {
    const ereignisse = baueBewerberEreignisse({
      bewerber: { vertragErstVersandAt: "2026-09-25T10:00:00.000Z" },
    });
    expect(naechsterTermin(ereignisse, jetzt)).toBeNull();
  });
});

describe("letzteAktivitaet", () => {
  it("nimmt das jüngste Ereignis, das schon vorbei ist", () => {
    const ereignisse = baueBewerberEreignisse({
      bewerber: {
        aktivAm: "2026-09-16T10:00:00.000Z",
        vertragSignedAt: "2026-09-10T10:00:00.000Z",
        followUpDatum: "20.09.2026",
      },
    });
    expect(letzteAktivitaet(ereignisse, jetzt)?.titel).toBe("Als Partner aktiviert");
  });

  it("gibt ohne vergangenes Ereignis nichts zurück", () => {
    const ereignisse = baueBewerberEreignisse({ bewerber: { followUpDatum: "20.09.2026" } });
    expect(letzteAktivitaet(ereignisse, jetzt)).toBeNull();
  });
});

/**
 * Das Kennenlerngespräch im Kästchen „Nächste Aktion".
 *
 * Seit dem 21.09.2026 wird der Termin über den Kalender der HR-Managerin
 * vereinbart und danach von Hand im CRM eingetragen. Christian hat verlangt,
 * dass dann oben im Profil „Kennenlerngespräch steht an" erscheint und daneben
 * Datum und Uhrzeit.
 *
 * Die Stufe allein reicht dafür nicht: Sie sagt nur, wo der Bewerber steht,
 * nicht, ob schon ein Termin im Kalender liegt.
 */
describe("Kennenlerngespräch in der nächsten Aktion", () => {
  const PROZESS_NEU = "neu";

  function ereignisseMitTermin(datum: string, uhrzeit: string) {
    return baueBewerberEreignisse({
      bewerber: { erstgespraechDatum: datum, erstgespraechUhrzeit: uhrzeit, prozess: PROZESS_NEU } as never,
    });
  }

  it("meldet den Termin, sobald er eingetragen ist und noch bevorsteht", () => {
    const b = { status: "Eingang", prozess: PROZESS_NEU } as never;
    const e = ereignisseMitTermin("30.09.2026", "10:00");

    expect(naechsteAktionText(b, e, jetzt)).toBe("Kennenlerngespräch steht an");
  });

  it("schlägt die Stufe, denn der Termin ist das Konkretere", () => {
    // Ohne Termin stünde hier der allgemeine Satz der Stufe.
    const b = { status: "Eingang", prozess: PROZESS_NEU } as never;

    expect(naechsteAktionText(b, [], jetzt)).toBe("Kennenlernbogen versenden oder anrufen");
  });

  it("fällt nach dem Termin auf die Stufe zurück", () => {
    /*
      Ein Termin von gestern ist keine nächste Aktion. Stünde der Satz weiter
      da, würde er die Akte als erledigt aussehen lassen, obwohl der nächste
      Schritt offen ist.
    */
    const b = { status: "Eingang", prozess: PROZESS_NEU } as never;
    const e = ereignisseMitTermin("01.09.2026", "10:00");

    expect(naechsteAktionText(b, e, jetzt)).toBe("Kennenlernbogen versenden oder anrufen");
  });

  it("gilt nur im neuen Bewerberprozess", () => {
    /*
      Im alten Bewerbungsmanagement stehen dieselben zwei Felder für ein
      Telefonat. Dort wäre „Kennenlerngespräch steht an" schlicht falsch.
    */
    const alt = { status: "Eingang" } as never;
    const e = baueBewerberEreignisse({
      bewerber: { erstgespraechDatum: "30.09.2026", erstgespraechUhrzeit: "10:00" } as never,
    });

    expect(naechsteAktionText(alt, e, jetzt)).toBe("Kennenlernbogen versenden oder anrufen");
  });

  it("bleibt ohne Ereignisse rückwärtskompatibel", () => {
    // Der alte Aufruf mit nur einem Argument muss weiter funktionieren.
    expect(naechsteAktionText({ status: "Closing" })).toBe("Videocall führen und Paket besprechen");
  });
});

describe("Die Beschriftung des Termins", () => {
  it("heißt im neuen Prozess Kennenlerngespräch", () => {
    const e = baueBewerberEreignisse({
      bewerber: { erstgespraechDatum: "30.09.2026", erstgespraechUhrzeit: "10:00", prozess: "neu" } as never,
    });

    expect(naechsterTermin(e, jetzt)?.titel).toBe("Kennenlerngespräch");
  });

  it("heißt im alten Prozess weiter Erstgesprächstermin", () => {
    const e = baueBewerberEreignisse({
      bewerber: { erstgespraechDatum: "30.09.2026", erstgespraechUhrzeit: "10:00" } as never,
    });

    expect(naechsterTermin(e, jetzt)?.titel).toBe("Erstgesprächstermin");
  });
});
