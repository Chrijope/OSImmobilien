import { describe, expect, it } from "vitest";
import {
  anlassAm,
  ersterAdvent,
  offeneTuerchen,
  osterJahr,
  ostersonntag,
  rolleSiehtFiguren,
  TUERCHEN,
  versteckeImJahr,
  zeitraum,
} from "./saison";

/** Saisonfiguren im CRM (30.10.2026): Zeiträume, Rollen, Inhalte. */

const d = (jahr: number, monat: number, tag: number) => new Date(jahr, monat - 1, tag, 12);
const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;

describe("Kalender", () => {
  it("rechnet Ostern und den ersten Advent richtig", () => {
    expect(iso(ostersonntag(2026))).toBe("2026-04-05");
    expect(iso(ostersonntag(2027))).toBe("2027-03-28");
    expect(iso(ostersonntag(2028))).toBe("2028-04-16");
    expect(iso(ersterAdvent(2026))).toBe("2026-11-29");
    expect(iso(ersterAdvent(2027))).toBe("2027-11-28");
    // 24.12.2028 ist ein Sonntag, dann ist er selbst der vierte Advent.
    expect(iso(ersterAdvent(2028))).toBe("2028-12-03");
  });

  it("zeigt Halloween schon 2026", () => {
    expect(anlassAm(d(2026, 10, 30))).toBe("halloween");
    expect(anlassAm(d(2026, 11, 28))).toBeNull();
  });

  it("kennt die Zeiträume samt Rändern", () => {
    expect(anlassAm(d(2027, 10, 23))).toBeNull();
    expect(anlassAm(d(2027, 10, 24))).toBe("halloween");
    expect(anlassAm(d(2027, 10, 31))).toBe("halloween");
    expect(anlassAm(d(2027, 11, 1))).toBeNull();
    expect(anlassAm(d(2026, 11, 29))).toBe("weihnachten");
    expect(anlassAm(d(2026, 12, 26))).toBe("weihnachten");
    expect(anlassAm(d(2026, 12, 27))).toBeNull();
    expect(anlassAm(d(2027, 3, 24))).toBeNull();
    expect(anlassAm(d(2027, 3, 25))).toBe("ostern");
    expect(anlassAm(d(2027, 3, 29))).toBe("ostern");
    expect(anlassAm(d(2027, 3, 30))).toBeNull();
    expect(iso(zeitraum("ostern", 2027).von)).toBe("2027-03-25");
  });

  it("zählt im Herbst schon für das nächste Ostern", () => {
    expect(osterJahr(d(2026, 10, 30))).toBe(2027);
    expect(osterJahr(d(2027, 3, 29))).toBe(2027);
    expect(osterJahr(d(2027, 3, 30))).toBe(2028);
  });
});

describe("Wer Figuren sieht", () => {
  it("alle internen Rollen, nie Kunde, Tippgeber, Bewerber", () => {
    for (const r of ["admin", "inhaber", "vertriebspartner", "vertriebsleiter", "backoffice", "finanzierungspartner"]) {
      expect(rolleSiehtFiguren(r), r).toBe(true);
    }
    for (const r of ["kunde", "tippgeber", "bewerber", undefined]) expect(rolleSiehtFiguren(r), String(r)).toBe(false);
  });
});

describe("Inhalte", () => {
  it("hat 24 Türchen, das letzte ist der Jahresrückblick, ohne Gedankenstriche", () => {
    expect(TUERCHEN).toHaveLength(24);
    expect(TUERCHEN[23]).toEqual({ art: "jahr" });
    expect(JSON.stringify(TUERCHEN)).not.toMatch(/[–—]/);
  });

  it("öffnet im Dezember je Tag ein Türchen", () => {
    expect(offeneTuerchen(d(2026, 11, 30))).toBe(0);
    expect(offeneTuerchen(d(2026, 12, 1))).toBe(1);
    expect(offeneTuerchen(d(2026, 12, 14))).toBe(14);
    expect(offeneTuerchen(d(2026, 12, 26))).toBe(24);
  });

  it("versteckt 2027 die Eier in Pipeline, Kalender und Unterlagen, danach reihum", () => {
    expect(versteckeImJahr(2027)).toEqual(["pipeline", "kalender", "unterlagen"]);
    expect(versteckeImJahr(2028)).toEqual(["kalender", "unterlagen", "kontakte"]);
    expect(new Set(versteckeImJahr(2031)).size).toBe(3);
  });
});
