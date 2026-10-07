import { describe, it, expect } from "vitest";
import {
  berechneZeitfenster,
  alsZeitpunkt,
  minutenAusUhrzeit,
  wochentagVon,
  type ZeitfensterEingabe,
} from "@/lib/buchungZeitfenster";

/**
 * Die Zeitfensterrechnung ist das Herzstück des eigenen Buchungssystems. Wenn
 * sie falsch rechnet, bietet die Seite einem Kunden eine Zeit an, die der
 * Berater gar nicht hat, oder verschweigt eine, die er hätte. Beides merkt
 * niemand sofort, deshalb hängt hier alles an Tests.
 *
 * Alle Tests rechnen ausdrücklich in "Europe/Berlin" und mit einem
 * übergebenen "jetzt". Sie sind damit unabhängig davon, in welcher Zeitzone
 * der Rechner steht, auf dem sie laufen.
 */

const ZONE = "Europe/Berlin";

/** Kurzschreibweise: "2026-08-05 09:00" Ortszeit als ISO-Zeitpunkt. */
function ortszeit(tag: string, uhrzeit: string): string {
  return alsZeitpunkt(tag, minutenAusUhrzeit(uhrzeit)!, ZONE).toISOString();
}

/** Ein Mittwoch. 05.08.2026 ist ein Mittwoch, Wochentag 3. */
const MITTWOCH = "2026-08-05";

function grundfall(aenderung: Partial<ZeitfensterEingabe> = {}): ZeitfensterEingabe {
  return {
    tag: MITTWOCH,
    // Weit genug vorher, damit die Vorlaufzeit nichts abschneidet.
    jetzt: ortszeit("2026-08-01", "09:00"),
    zeitzone: ZONE,
    verfuegbarkeiten: [{ wochentag: 3, von: "09:00", bis: "12:00" }],
    terminart: {
      dauerMinuten: 60,
      pufferVorMinuten: 0,
      pufferNachMinuten: 0,
      vorlaufMinuten: 0,
      vorausschauTage: 60,
      rasterMinuten: 60,
    },
    belegt: [],
    ...aenderung,
  };
}

describe("Hilfsfunktionen", () => {
  it("liest Uhrzeiten und weist Unsinn zurück", () => {
    expect(minutenAusUhrzeit("09:30")).toBe(570);
    expect(minutenAusUhrzeit("9:05")).toBe(545);
    expect(minutenAusUhrzeit("00:00")).toBe(0);
    expect(minutenAusUhrzeit("")).toBeNull();
    expect(minutenAusUhrzeit(undefined)).toBeNull();
    expect(minutenAusUhrzeit("25:00")).toBeNull();
    expect(minutenAusUhrzeit("neun Uhr")).toBeNull();
  });

  it("bestimmt den Wochentag unabhängig von der Zeitzone des Rechners", () => {
    expect(wochentagVon("2026-08-05")).toBe(3); // Mittwoch
    expect(wochentagVon("2026-08-09")).toBe(0); // Sonntag
  });

  it("rechnet Ortszeit in Sommer und Winter richtig um", () => {
    // Im August gilt in Berlin Sommerzeit, also UTC+2.
    expect(alsZeitpunkt("2026-08-05", 9 * 60, ZONE).toISOString()).toBe("2026-08-05T07:00:00.000Z");
    // Im Januar Winterzeit, also UTC+1.
    expect(alsZeitpunkt("2026-01-05", 9 * 60, ZONE).toISOString()).toBe("2026-01-05T08:00:00.000Z");
  });
});

describe("Zeitfenster: der normale Fall", () => {
  it("bietet die Startzeiten eines Vormittags an", () => {
    const zeiten = berechneZeitfenster(grundfall());
    expect(zeiten).toEqual([
      ortszeit(MITTWOCH, "09:00"),
      ortszeit(MITTWOCH, "10:00"),
      ortszeit(MITTWOCH, "11:00"),
    ]);
  });

  it("hält sich an das Raster", () => {
    const zeiten = berechneZeitfenster(grundfall({
      terminart: { ...grundfall().terminart, rasterMinuten: 30 },
    }));
    expect(zeiten).toEqual([
      ortszeit(MITTWOCH, "09:00"),
      ortszeit(MITTWOCH, "09:30"),
      ortszeit(MITTWOCH, "10:00"),
      ortszeit(MITTWOCH, "10:30"),
      ortszeit(MITTWOCH, "11:00"),
    ]);
  });

  it("bedient mehrere Fenster am selben Tag und liefert keine Zeit doppelt", () => {
    const zeiten = berechneZeitfenster(grundfall({
      verfuegbarkeiten: [
        { wochentag: 3, von: "09:00", bis: "11:00" },
        { wochentag: 3, von: "10:00", bis: "12:00" },
      ],
    }));
    expect(zeiten).toEqual([
      ortszeit(MITTWOCH, "09:00"),
      ortszeit(MITTWOCH, "10:00"),
      ortszeit(MITTWOCH, "11:00"),
    ]);
  });

  it("gibt die Zeiten in aufsteigender Reihenfolge zurück", () => {
    const zeiten = berechneZeitfenster(grundfall({
      verfuegbarkeiten: [
        { wochentag: 3, von: "14:00", bis: "16:00" },
        { wochentag: 3, von: "09:00", bis: "11:00" },
      ],
    }));
    expect(zeiten).toEqual([...zeiten].sort());
    expect(zeiten[0]).toBe(ortszeit(MITTWOCH, "09:00"));
  });
});

describe("Zeitfenster: Tag ohne Verfügbarkeit", () => {
  it("gibt nichts zurück, wenn für den Wochentag keine Regel besteht", () => {
    // Der Wochenplan kennt nur den Montag, gefragt ist ein Mittwoch.
    expect(berechneZeitfenster(grundfall({
      verfuegbarkeiten: [{ wochentag: 1, von: "09:00", bis: "17:00" }],
    }))).toEqual([]);
  });

  it("gibt nichts zurück, wenn der Wochenplan leer ist", () => {
    expect(berechneZeitfenster(grundfall({ verfuegbarkeiten: [] }))).toEqual([]);
  });

  it("schließt einen Urlaubstag, obwohl die Wochenregel greifen würde", () => {
    expect(berechneZeitfenster(grundfall({
      ausnahmen: [{ datum: MITTWOCH, geschlossen: true }],
    }))).toEqual([]);
  });

  it("lässt eine Ausnahme die Wochenregel ersetzen, nicht ergänzen", () => {
    const zeiten = berechneZeitfenster(grundfall({
      ausnahmen: [{ datum: MITTWOCH, von: "14:00", bis: "16:00" }],
    }));
    expect(zeiten).toEqual([
      ortszeit(MITTWOCH, "14:00"),
      ortszeit(MITTWOCH, "15:00"),
    ]);
  });

  it("beachtet eine Ausnahme für einen anderen Tag nicht", () => {
    const zeiten = berechneZeitfenster(grundfall({
      ausnahmen: [{ datum: "2026-08-06", geschlossen: true }],
    }));
    expect(zeiten).toHaveLength(3);
  });
});

describe("Zeitfenster: belegte Zeiten", () => {
  it("lässt einen gebuchten Termin weg", () => {
    const zeiten = berechneZeitfenster(grundfall({
      belegt: [{ start: ortszeit(MITTWOCH, "10:00"), ende: ortszeit(MITTWOCH, "11:00") }],
    }));
    expect(zeiten).toEqual([
      ortszeit(MITTWOCH, "09:00"),
      ortszeit(MITTWOCH, "11:00"),
    ]);
  });

  it("lässt eine nur teilweise überlappende Buchung ebenfalls sperren", () => {
    // 10:30 bis 10:45 liegt mitten im Vorschlag 10:00.
    const zeiten = berechneZeitfenster(grundfall({
      belegt: [{ start: ortszeit(MITTWOCH, "10:30"), ende: ortszeit(MITTWOCH, "10:45") }],
    }));
    expect(zeiten).toEqual([
      ortszeit(MITTWOCH, "09:00"),
      ortszeit(MITTWOCH, "11:00"),
    ]);
  });

  it("lässt einen unmittelbar anschliessenden Termin zu", () => {
    // 09:00 bis 10:00 belegt, 10:00 muss trotzdem buchbar bleiben. Zwei
    // Zeiträume, die sich nur berühren, überschneiden sich nicht.
    const zeiten = berechneZeitfenster(grundfall({
      belegt: [{ start: ortszeit(MITTWOCH, "09:00"), ende: ortszeit(MITTWOCH, "10:00") }],
    }));
    expect(zeiten).toEqual([
      ortszeit(MITTWOCH, "10:00"),
      ortszeit(MITTWOCH, "11:00"),
    ]);
  });

  it("beachtet eine Buchung an einem anderen Tag nicht", () => {
    const zeiten = berechneZeitfenster(grundfall({
      belegt: [{ start: ortszeit("2026-08-06", "10:00"), ende: ortszeit("2026-08-06", "11:00") }],
    }));
    expect(zeiten).toHaveLength(3);
  });
});

describe("Zeitfenster: Puffer", () => {
  it("sperrt mit dem Puffer nach dem Termin auch den Anschluss", () => {
    // 15 Minuten Nachbereitung: der Vorschlag 09:00 endet in Wahrheit erst um
    // 10:15 und stösst damit in die Buchung um 10:00.
    const zeiten = berechneZeitfenster(grundfall({
      terminart: { ...grundfall().terminart, pufferNachMinuten: 15 },
      belegt: [{ start: ortszeit(MITTWOCH, "10:00"), ende: ortszeit(MITTWOCH, "10:30") }],
    }));
    expect(zeiten).toEqual([ortszeit(MITTWOCH, "11:00")]);
  });

  it("sperrt mit dem Puffer vor dem Termin auch den Vorlauf", () => {
    // 15 Minuten Vorbereitung: der Vorschlag 11:00 beginnt in Wahrheit um
    // 10:45 und stösst damit in die Buchung, die bis 10:50 läuft.
    const zeiten = berechneZeitfenster(grundfall({
      terminart: { ...grundfall().terminart, pufferVorMinuten: 15 },
      belegt: [{ start: ortszeit(MITTWOCH, "10:20"), ende: ortszeit(MITTWOCH, "10:50") }],
    }));
    expect(zeiten).toEqual([ortszeit(MITTWOCH, "09:00")]);
  });

  it("beachtet auch den Puffer der bereits gebuchten Termine", () => {
    // Die bestehende Buchung endet um 10:00, zieht aber 30 Minuten
    // Nachbereitung hinter sich her. 10:00 ist damit nicht frei.
    const zeiten = berechneZeitfenster(grundfall({
      belegt: [{
        start: ortszeit(MITTWOCH, "09:00"),
        ende: ortszeit(MITTWOCH, "10:00"),
        pufferNachMinuten: 30,
      }],
    }));
    expect(zeiten).toEqual([ortszeit(MITTWOCH, "11:00")]);
  });

  it("beachtet den Puffer vor einer bestehenden Buchung", () => {
    const zeiten = berechneZeitfenster(grundfall({
      belegt: [{
        start: ortszeit(MITTWOCH, "11:00"),
        ende: ortszeit(MITTWOCH, "11:30"),
        pufferVorMinuten: 30,
      }],
    }));
    // 10:00 bis 11:00 stösst in den Vorlauf ab 10:30.
    expect(zeiten).toEqual([ortszeit(MITTWOCH, "09:00")]);
  });

  it("verschiebt das Fensterende nicht: der Puffer darf darüber hinausragen", () => {
    // Bewusste Festlegung: Das Fenster begrenzt den Termin, nicht seine
    // Nachbereitung. Sonst verlöre ein Berater mit Puffer bei jedem Fenster
    // den letzten Termin, ohne zu verstehen warum.
    const zeiten = berechneZeitfenster(grundfall({
      terminart: { ...grundfall().terminart, pufferNachMinuten: 30 },
    }));
    expect(zeiten).toContain(ortszeit(MITTWOCH, "11:00"));
  });
});

describe("Zeitfenster: Vorlaufzeit und Vorausschau", () => {
  it("schneidet den heutigen Tag an", () => {
    // Es ist 09:10 an genau diesem Mittwoch, die Vorlaufzeit beträgt zwei
    // Stunden. Buchbar ist damit frühestens 11:10, also von den vollen
    // Stunden nur noch gar keine im Vormittagsfenster.
    const zeiten = berechneZeitfenster(grundfall({
      jetzt: ortszeit(MITTWOCH, "09:10"),
      terminart: { ...grundfall().terminart, vorlaufMinuten: 120 },
    }));
    expect(zeiten).toEqual([]);
  });

  it("lässt genau die Zeiten ab der Vorlaufgrenze übrig", () => {
    // Es ist 08:00, Vorlauf zwei Stunden. Ab 10:00 ist buchbar.
    const zeiten = berechneZeitfenster(grundfall({
      jetzt: ortszeit(MITTWOCH, "08:00"),
      terminart: { ...grundfall().terminart, vorlaufMinuten: 120 },
    }));
    expect(zeiten).toEqual([
      ortszeit(MITTWOCH, "10:00"),
      ortszeit(MITTWOCH, "11:00"),
    ]);
  });

  it("gibt für einen vergangenen Tag nichts zurück", () => {
    expect(berechneZeitfenster(grundfall({
      jetzt: ortszeit("2026-08-10", "09:00"),
    }))).toEqual([]);
  });

  it("gibt nichts zurück, was jenseits der Vorausschau liegt", () => {
    // Der Mittwoch liegt vier Tage entfernt, die Vorausschau reicht drei.
    expect(berechneZeitfenster(grundfall({
      jetzt: ortszeit("2026-08-01", "09:00"),
      terminart: { ...grundfall().terminart, vorausschauTage: 3 },
    }))).toEqual([]);
  });

  it("lässt einen Tag innerhalb der Vorausschau zu", () => {
    expect(berechneZeitfenster(grundfall({
      jetzt: ortszeit("2026-08-01", "09:00"),
      terminart: { ...grundfall().terminart, vorausschauTage: 5 },
    }))).toHaveLength(3);
  });
});

describe("Zeitfenster: Dauer passt nicht mehr in das Fenster", () => {
  it("bietet keine Zeit an, wenn das Fenster kürzer ist als der Termin", () => {
    expect(berechneZeitfenster(grundfall({
      verfuegbarkeiten: [{ wochentag: 3, von: "09:00", bis: "09:45" }],
    }))).toEqual([]);
  });

  it("schneidet das Fensterende sauber ab", () => {
    // 09:00 bis 12:00, Termin 90 Minuten, Raster 30. Der letzte Start, der
    // noch vollständig hineinpasst, ist 10:30.
    const zeiten = berechneZeitfenster(grundfall({
      verfuegbarkeiten: [{ wochentag: 3, von: "09:00", bis: "12:00" }],
      terminart: { ...grundfall().terminart, dauerMinuten: 90, rasterMinuten: 30 },
    }));
    expect(zeiten[zeiten.length - 1]).toBe(ortszeit(MITTWOCH, "10:30"));
  });

  it("lässt einen Termin zu, der das Fenster genau ausfüllt", () => {
    const zeiten = berechneZeitfenster(grundfall({
      verfuegbarkeiten: [{ wochentag: 3, von: "09:00", bis: "10:00" }],
    }));
    expect(zeiten).toEqual([ortszeit(MITTWOCH, "09:00")]);
  });

  it("weist eine unsinnige Dauer zurück", () => {
    expect(berechneZeitfenster(grundfall({
      terminart: { ...grundfall().terminart, dauerMinuten: 0 },
    }))).toEqual([]);
    expect(berechneZeitfenster(grundfall({
      terminart: { ...grundfall().terminart, dauerMinuten: -30 },
    }))).toEqual([]);
  });
});

describe("Zeitfenster: Zeitumstellung und Tageswechsel", () => {
  it("hält an der Umstellung zur Sommerzeit die Ortszeit ein", () => {
    // 29.03.2026, ein Sonntag: Um 02:00 wird auf 03:00 vorgestellt. Das
    // Vormittagsfenster ist danach in echten Minuten eine Stunde kürzer.
    // Entscheidend ist, dass "09:00 Ortszeit" auch 09:00 Ortszeit bleibt.
    const zeiten = berechneZeitfenster({
      tag: "2026-03-29",
      jetzt: "2026-03-20T08:00:00.000Z",
      zeitzone: ZONE,
      verfuegbarkeiten: [{ wochentag: 0, von: "09:00", bis: "12:00" }],
      terminart: { dauerMinuten: 60, vorlaufMinuten: 0, vorausschauTage: 60, rasterMinuten: 60 },
    });
    expect(zeiten).toEqual([
      "2026-03-29T07:00:00.000Z", // 09:00 Ortszeit, jetzt UTC+2
      "2026-03-29T08:00:00.000Z",
      "2026-03-29T09:00:00.000Z",
    ]);
  });

  it("hält an der Umstellung zur Winterzeit die Ortszeit ein", () => {
    // 25.10.2026, ein Sonntag: Um 03:00 wird auf 02:00 zurückgestellt.
    const zeiten = berechneZeitfenster({
      tag: "2026-10-25",
      jetzt: "2026-10-20T08:00:00.000Z",
      zeitzone: ZONE,
      verfuegbarkeiten: [{ wochentag: 0, von: "09:00", bis: "12:00" }],
      terminart: { dauerMinuten: 60, vorlaufMinuten: 0, vorausschauTage: 60, rasterMinuten: 60 },
    });
    expect(zeiten).toEqual([
      "2026-10-25T08:00:00.000Z", // 09:00 Ortszeit, jetzt wieder UTC+1
      "2026-10-25T09:00:00.000Z",
      "2026-10-25T10:00:00.000Z",
    ]);
  });

  it("überschreitet an einem späten Fenster nicht den Tageswechsel", () => {
    const zeiten = berechneZeitfenster(grundfall({
      verfuegbarkeiten: [{ wochentag: 3, von: "22:00", bis: "23:59" }],
      terminart: { ...grundfall().terminart, dauerMinuten: 60, rasterMinuten: 30 },
    }));
    expect(zeiten).toEqual([
      ortszeit(MITTWOCH, "22:00"),
      ortszeit(MITTWOCH, "22:30"),
    ]);
    // Nichts davon darf schon zum nächsten Tag gehören.
    for (const zeit of zeiten) {
      expect(new Date(zeit).getTime()).toBeLessThan(alsZeitpunkt("2026-08-06", 0, ZONE).getTime());
    }
  });

  it("rechnet in einer anderen Zeitzone entsprechend anders", () => {
    const eingabe = grundfall({ zeitzone: "UTC" });
    const zeiten = berechneZeitfenster(eingabe);
    expect(zeiten[0]).toBe("2026-08-05T09:00:00.000Z");
  });
});
