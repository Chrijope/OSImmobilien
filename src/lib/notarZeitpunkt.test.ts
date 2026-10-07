/**
 * Wachhund über der Zeitrechnung der Bewertungseinladung.
 *
 * Die Logik liegt in `supabase/functions/_shared/notar-zeitpunkt.ts`, weil die
 * Edge Function in Deno läuft und nichts aus `src/` importieren kann.
 * Getestet wird von hier, so wie bei `standort-messung`.
 *
 * Worum es geht: Der Notartermin steht an zwei Stellen im Datensatz, in zwei
 * Datumsschreibweisen, und die Uhrzeit ist kein Pflichtfeld. Dazu kommt, dass
 * die Function in UTC läuft und der Termin Berliner Wanduhrzeit ist. Jeder
 * dieser vier Punkte allein reicht, damit die Mail zur falschen Stunde oder
 * gar nicht hinausgeht, und beim Kunden fällt das niemandem auf.
 */
import { describe, it, expect } from "vitest";
import {
  berlinerZeitNachUtc,
  notarZeitpunkt,
  istEinladungFaellig,
  ERSATZ_UHRZEIT,
} from "../../supabase/functions/_shared/notar-zeitpunkt";

describe("berlinerZeitNachUtc", () => {
  it("rechnet Sommerzeit zurück: 14:00 Berlin sind 12:00 UTC", () => {
    expect(berlinerZeitNachUtc("2026-07-15", "14:00")?.toISOString())
      .toBe("2026-07-15T12:00:00.000Z");
  });

  it("rechnet Winterzeit zurück: 14:00 Berlin sind 13:00 UTC", () => {
    expect(berlinerZeitNachUtc("2026-01-15", "14:00")?.toISOString())
      .toBe("2026-01-15T13:00:00.000Z");
  });

  it("versteht die deutsche Schreibweise genauso", () => {
    expect(berlinerZeitNachUtc("15.07.2026", "14:00")?.toISOString())
      .toBe(berlinerZeitNachUtc("2026-07-15", "14:00")?.toISOString());
  });

  it("versteht die deutsche Schreibweise auch ohne führende Nullen", () => {
    expect(berlinerZeitNachUtc("5.7.2026", "09:30")?.toISOString())
      .toBe("2026-07-05T07:30:00.000Z");
  });

  it("nimmt die Ersatzuhrzeit, wenn keine da ist", () => {
    // Ohne diese Regel gälte 00:00, und die Bitte um eine Bewertung ginge
    // eine Stunde nach Mitternacht hinaus.
    const ohne = berlinerZeitNachUtc("2026-07-15", "");
    const mit = berlinerZeitNachUtc("2026-07-15", ERSATZ_UHRZEIT);
    expect(ohne?.toISOString()).toBe(mit?.toISOString());
    expect(ohne?.toISOString()).toBe("2026-07-15T10:00:00.000Z");
  });

  it("nimmt die Ersatzuhrzeit auch bei Unsinn im Feld", () => {
    expect(berlinerZeitNachUtc("2026-07-15", "nachmittags")?.toISOString())
      .toBe("2026-07-15T10:00:00.000Z");
  });

  it("trifft die Nacht der Zeitumstellung", () => {
    // Am 29.03.2026 wird um 02:00 auf 03:00 gestellt. Bei nur einmaliger
    // Messung des Zeitversatzes läge dieser Termin eine Stunde daneben.
    expect(berlinerZeitNachUtc("2026-03-29", "01:30")?.toISOString())
      .toBe("2026-03-29T00:30:00.000Z");
  });

  it("liefert null bei fehlendem oder unbrauchbarem Datum", () => {
    expect(berlinerZeitNachUtc("", "14:00")).toBeNull();
    expect(berlinerZeitNachUtc("demnächst", "14:00")).toBeNull();
    expect(berlinerZeitNachUtc("2026-13-45", "14:00")).toBeNull();
  });
});

describe("notarZeitpunkt", () => {
  it("nimmt die Terminauswahl aus dem Kundenportal, wenn beide gepflegt sind", () => {
    const zeit = notarZeitpunkt({
      notarTermin: "2026-07-10", notarUhrzeit: "09:00",
      notarData: { datum: "2026-07-15", uhrzeit: "14:00" },
    });
    expect(zeit?.toISOString()).toBe("2026-07-15T12:00:00.000Z");
  });

  it("fällt auf den Investment-Reiter zurück, wenn die Auswahl leer ist", () => {
    expect(notarZeitpunkt({ notarTermin: "15.07.2026", notarUhrzeit: "14:00" })?.toISOString())
      .toBe("2026-07-15T12:00:00.000Z");
  });

  it("fällt auch zurück, wenn in der Auswahl Unsinn steht", () => {
    const zeit = notarZeitpunkt({
      notarTermin: "2026-07-15", notarUhrzeit: "14:00",
      notarData: { datum: "unbekannt" },
    });
    expect(zeit?.toISOString()).toBe("2026-07-15T12:00:00.000Z");
  });

  it("liefert null ohne jeden Termin", () => {
    expect(notarZeitpunkt({})).toBeNull();
    expect(notarZeitpunkt(null)).toBeNull();
    expect(notarZeitpunkt({ notarTerminBestaetigt: true })).toBeNull();
  });
});

describe("istEinladungFaellig", () => {
  const termin = new Date("2026-07-15T12:00:00.000Z");
  const spaeter = (stunden: number) => new Date(termin.getTime() + stunden * 3_600_000);

  it("fragt nicht, solange der Kunde noch beim Notar sitzen könnte", () => {
    expect(istEinladungFaellig(termin, spaeter(0.5))).toBe(false);
  });

  it("fragt ab einer Stunde danach", () => {
    expect(istEinladungFaellig(termin, spaeter(1))).toBe(true);
    expect(istEinladungFaellig(termin, spaeter(3))).toBe(true);
  });

  it("deckt einen ausgefallenen Lauf noch ab", () => {
    expect(istEinladungFaellig(termin, spaeter(24))).toBe(true);
    expect(istEinladungFaellig(termin, spaeter(25))).toBe(true);
  });

  it("fragt nicht mehr bei lange vergangenen Terminen", () => {
    // Genau das schützt die Bestandskunden beim ersten Lauf vor einer
    // Sammelmail zu Terminen, die Monate zurückliegen.
    expect(istEinladungFaellig(termin, spaeter(26))).toBe(false);
    expect(istEinladungFaellig(termin, spaeter(24 * 90))).toBe(false);
  });

  it("fragt nicht vor dem Termin", () => {
    expect(istEinladungFaellig(termin, spaeter(-2))).toBe(false);
  });

  it("fragt nicht ohne Termin", () => {
    expect(istEinladungFaellig(null, new Date())).toBe(false);
  });
});
