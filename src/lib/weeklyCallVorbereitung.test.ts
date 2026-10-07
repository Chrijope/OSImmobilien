/**
 * Wann die Erinnerung an die Call-Punkte erscheint, und wann bewusst nicht.
 *
 * Der Banner ist eine Unterbrechung. Jeder Tag, an dem er zu Unrecht steht,
 * kostet Aufmerksamkeit, und nach zwei Wochen wird er reflexhaft weggeklickt.
 * Deshalb steht hier jeder einzelne Tag der Woche.
 */
import { describe, expect, it } from "vitest";

import {
  REDAKTIONSSCHLUSS_STUNDE,
  vorbereitungsStand,
  vorbereitungsTitel,
  vorbereitungsText,
} from "./weeklyCallVorbereitung";

/** Ein Zeitpunkt in Ortszeit. Der Call haengt am Kalendertag, nicht an UTC. */
function am(jahr: number, monat: number, tag: number, stunde = 12, minute = 0): Date {
  return new Date(jahr, monat - 1, tag, stunde, minute, 0, 0);
}

/*
 * Die Bezugswoche: Montag, 14. September 2026 ist ein Call-Tag.
 * Freitag davor ist der 11., Samstag der 12., Sonntag der 13.
 */

describe("Das Fenster am Freitag", () => {
  it("ist ab 9 Uhr offen", () => {
    expect(vorbereitungsStand(am(2026, 9, 11, 9, 0)).fenster).toBe("einladung");
    expect(vorbereitungsStand(am(2026, 9, 11, 18, 30)).fenster).toBe("einladung");
  });

  it("bleibt vor 9 Uhr zu", () => {
    // Frueh am Morgen liest das niemand, und der Banner stuende dann den
    // ganzen Tag, obwohl ein halber genuegt.
    expect(vorbereitungsStand(am(2026, 9, 11, 8, 59)).fenster).toBeNull();
  });

  it("zeigt auf den kommenden Montag", () => {
    const stand = vorbereitungsStand(am(2026, 9, 11, 10));
    expect(stand.callTag.getDate()).toBe(14);
    expect(stand.schluessel).toBe("2026-09-14:einladung");
  });
});

describe("Am Wochenende erscheint nichts", () => {
  it("schweigt am Samstag", () => {
    expect(vorbereitungsStand(am(2026, 9, 12, 10)).fenster).toBeNull();
    expect(vorbereitungsStand(am(2026, 9, 12, 20)).fenster).toBeNull();
  });

  it("schweigt am Sonntag", () => {
    expect(vorbereitungsStand(am(2026, 9, 13, 10)).fenster).toBeNull();
  });
});

describe("Das Fenster am Montag", () => {
  it("ist ab Mitternacht offen und schliesst um 17 Uhr", () => {
    expect(vorbereitungsStand(am(2026, 9, 14, 0, 1)).fenster).toBe("letzte");
    expect(vorbereitungsStand(am(2026, 9, 14, 16, 59)).fenster).toBe("letzte");
    expect(vorbereitungsStand(am(2026, 9, 14, REDAKTIONSSCHLUSS_STUNDE, 0)).fenster).toBeNull();
  });

  it("wirbt nach Redaktionsschluss nicht schon fuer die naechste Woche", () => {
    /*
     * Der heikelste Fall. Um 17:30 Uhr ist das Fenster zu, der Call an
     * diesem Abend steht aber noch bevor. Wuerde jetzt fuer den Montag der
     * Folgewoche geworben, staende der Hinweis sechs Tage zu frueh und
     * ausgerechnet in den Stunden vor dem eigentlichen Call.
     */
    const stand = vorbereitungsStand(am(2026, 9, 14, 17, 30));
    expect(stand.fenster).toBeNull();
    expect(stand.callTag.getDate()).toBe(14);
  });

  it("gibt dem Montag einen eigenen Schluessel", () => {
    // Sonst verschluckte ein Wegklicken am Freitag den Montagshinweis mit.
    const freitag = vorbereitungsStand(am(2026, 9, 11, 10)).schluessel;
    const montag = vorbereitungsStand(am(2026, 9, 14, 10)).schluessel;
    expect(freitag).not.toBe(montag);
  });
});

describe("Dienstag bis Donnerstag", () => {
  it("bleibt still", () => {
    for (const tag of [15, 16, 17]) {
      expect(vorbereitungsStand(am(2026, 9, tag, 10)).fenster, `am ${tag}.`).toBeNull();
    }
  });

  it("zeigt dabei schon auf den naechsten Montag", () => {
    // Nach dem Schnitt am Montagabend rueckt der Termin weiter.
    expect(vorbereitungsStand(am(2026, 9, 15, 10)).callTag.getDate()).toBe(21);
  });
});

describe("Der Wortlaut", () => {
  it("nennt am Freitag den Termin", () => {
    expect(vorbereitungsTitel("einladung", "19:00", 0)).toContain("Montag, 19:00 Uhr");
  });

  it("nennt am Montag die Zahl der Themen statt einer Bitte", () => {
    expect(vorbereitungsTitel("letzte", "19:00", 7)).toContain("7 Themen stehen schon");
    expect(vorbereitungsTitel("letzte", "19:00", 1)).toContain("1 Thema steht schon");
  });

  it("verschweigt die Null", () => {
    /*
     * "0 Themen stehen schon auf der Liste" waere eine Ohrfeige fuer die
     * Leitung und ein schlechtes Argument, selbst etwas einzutragen.
     */
    const titel = vorbereitungsTitel("letzte", "19:00", 0);
    expect(titel).not.toContain("0 Themen");
    expect(titel).toContain("19:00");
  });

  it("nennt den Redaktionsschluss im Text", () => {
    expect(vorbereitungsText("letzte")).toContain(`${REDAKTIONSSCHLUSS_STUNDE}:00`);
  });
});
