import { describe, it, expect, vi, beforeEach } from "vitest";

// Der Schalterstand liegt in den Nutzereinstellungen. Für den Test wird nur
// dieser eine Zugriff ersetzt, damit weder Datenbank noch Cache nötig sind.
const einstellungen = vi.hoisted(() => ({ kalender: null as unknown }));

vi.mock("@/lib/userSettingsCache", () => ({
  getUserSetting: (schluessel: string, standard: unknown) =>
    schluessel === "kalender" && einstellungen.kalender !== null ? einstellungen.kalender : standard,
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  terminZeitpunkt,
  dauerInMinuten,
  abgleichAktiv,
  terminAbgleichAktiv,
  followUpTerminDaten,
} from "@/lib/kalenderSync";

/**
 * Die beiden Umrechnungen entscheiden, wann ein Termin im Kalender des
 * Mitarbeiters steht. Rutscht hier etwas, sitzt jemand zur falschen Zeit im
 * Warteraum, und das merkt man erst beim Kunden.
 */

describe("terminZeitpunkt", () => {
  it("setzt Datum und Uhrzeit zusammen", () => {
    const iso = terminZeitpunkt("2026-08-14", "14:30");
    expect(iso).not.toBeNull();
    const d = new Date(iso!);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(14);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(30);
  });

  it("nimmt neun Uhr, wenn keine Uhrzeit gesetzt ist", () => {
    // Ohne diese Regel landete der Termin um Mitternacht und damit
    // im Kalender oft am Vortag.
    const d = new Date(terminZeitpunkt("2026-08-14")!);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(0);
  });

  it("verträgt einen vollen Zeitstempel als Datum", () => {
    const d = new Date(terminZeitpunkt("2026-08-14T00:00:00.000Z", "08:15")!);
    expect(d.getDate()).toBe(14);
    expect(d.getHours()).toBe(8);
  });

  it("gibt null zurück, wenn nichts Brauchbares kommt", () => {
    expect(terminZeitpunkt(undefined, "10:00")).toBeNull();
    expect(terminZeitpunkt("kein Datum", "10:00")).toBeNull();
  });

  it("ignoriert eine unsinnige Uhrzeit und nimmt neun Uhr", () => {
    const d = new Date(terminZeitpunkt("2026-08-14", "später")!);
    expect(d.getHours()).toBe(9);
  });
});

describe("dauerInMinuten", () => {
  it("liest Minutenangaben", () => {
    expect(dauerInMinuten("45")).toBe(45);
    expect(dauerInMinuten("45 Minuten")).toBe(45);
    expect(dauerInMinuten("90 Min.")).toBe(90);
  });

  it("rechnet Stundenangaben um", () => {
    expect(dauerInMinuten("1 Std")).toBe(60);
    expect(dauerInMinuten("1,5 Stunden")).toBe(90);
    expect(dauerInMinuten("2h")).toBe(120);
  });

  it("fällt auf 60 Minuten zurück", () => {
    // Beratungsgespräche dauern in der Regel eine Stunde.
    expect(dauerInMinuten(undefined)).toBe(60);
    expect(dauerInMinuten("")).toBe(60);
    expect(dauerInMinuten("nach Bedarf")).toBe(60);
    expect(dauerInMinuten("0")).toBe(60);
  });
});

describe("abgleichAktiv", () => {
  beforeEach(() => {
    einstellungen.kalender = null;
  });

  it("ist an, solange niemand abgeschaltet hat", () => {
    // Wer einen Kalender verbindet, will seine Einträge dort sehen. Ohne
    // gespeicherte Einstellung darf der Abgleich deshalb nicht stillstehen.
    expect(abgleichAktiv("termine")).toBe(true);
    expect(abgleichAktiv("followUp")).toBe(true);
    expect(terminAbgleichAktiv()).toBe(true);
  });

  it("schaltet nur den abgewählten Schalter ab", () => {
    einstellungen.kalender = { syncOptionen: { termine: true, followUp: false } };
    expect(abgleichAktiv("termine")).toBe(true);
    expect(abgleichAktiv("followUp")).toBe(false);
  });

  it("bleibt an, wenn nur der andere Schalter gespeichert ist", () => {
    einstellungen.kalender = { syncOptionen: { termine: false } };
    expect(abgleichAktiv("termine")).toBe(false);
    expect(abgleichAktiv("followUp")).toBe(true);
  });

  it("ignoriert die alten Schlüssel aus der Datenbank", () => {
    // Ältere Zeilen tragen noch "powerdialer" und "bidi". Die Schalter gibt es
    // nicht mehr, sie dürfen die verbliebenen beiden nicht beeinflussen.
    einstellungen.kalender = {
      syncOptionen: { termine: true, followUp: true, powerdialer: false, bidi: true },
    };
    expect(abgleichAktiv("termine")).toBe(true);
    expect(abgleichAktiv("followUp")).toBe(true);
  });
});

describe("followUpTerminDaten", () => {
  it("baut Titel mit Kundenname und eine halbe Stunde Dauer", () => {
    const daten = followUpTerminDaten({
      titel: "Nachfass-Anruf",
      beschreibung: "Rückfragen klären",
      kundeName: "Monika Lehmann",
      faelligAm: "2026-08-14",
    });
    expect(daten).not.toBeNull();
    expect(daten!.titel).toBe("Follow-up: Nachfass-Anruf (Monika Lehmann)");
    expect(daten!.beschreibung).toBe("Rückfragen klären");
    expect(daten!.dauerMinuten).toBe(30);
    // Ohne Uhrzeit gilt die Neun-Uhr-Regel aus terminZeitpunkt.
    expect(new Date(daten!.start).getHours()).toBe(9);
  });

  it("lässt den Kundennamen weg, wenn keiner dransteht", () => {
    const daten = followUpTerminDaten({ titel: "Erinnerung Unterlagen", faelligAm: "2026-08-14" });
    expect(daten!.titel).toBe("Follow-up: Erinnerung Unterlagen");
    expect(daten!.beschreibung).toBeUndefined();
  });

  it("nimmt eine gesetzte Uhrzeit", () => {
    const daten = followUpTerminDaten({ titel: "Anruf", faelligAm: "2026-08-14", uhrzeit: "16:45" });
    const d = new Date(daten!.start);
    expect(d.getHours()).toBe(16);
    expect(d.getMinutes()).toBe(45);
  });

  it("fällt auf einen sprechenden Titel zurück", () => {
    const daten = followUpTerminDaten({ titel: "   ", faelligAm: "2026-08-14" });
    expect(daten!.titel).toBe("Follow-up");
  });

  it("gibt null zurück, wenn kein Fälligkeitsdatum dransteht", () => {
    // Ohne Datum gibt es nichts einzutragen, und ein Termin um Mitternacht
    // des Jahres null hilft niemandem.
    expect(followUpTerminDaten({ titel: "Anruf" })).toBeNull();
    expect(followUpTerminDaten({ titel: "Anruf", faelligAm: "irgendwann" })).toBeNull();
  });
});
