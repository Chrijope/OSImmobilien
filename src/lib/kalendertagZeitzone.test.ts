/**
 * Datumsangaben ohne Zeitzone gelten als deutsche Zeit (04.10.2026). Läuft in
 * jeder Zeitzone gleich; geprüft mit TZ=Asia/Tokyo, Pacific/Auckland,
 * America/Los_Angeles und Europe/Berlin.
 */
import { describe, expect, it } from "vitest";
import { formatDatumFlexibel, formatDatumZeitFlexibel, heuteBerlinIso, monatBerlinIso, parseDatumFlexibel, tageSeit } from "./datumsformate";

describe("parseDatumFlexibel: Kalendertage", () => {
  it("TT.MM.JJJJ und JJJJ-MM-TT ergeben 12:00 Uhr deutscher Zeit", () => {
    // Sommerzeit: 12:00 Uhr = 10:00 UTC, Winterzeit: 11:00 UTC
    expect(parseDatumFlexibel("01.10.2026")?.toISOString()).toBe("2026-10-01T10:00:00.000Z");
    expect(parseDatumFlexibel("2026-10-01")?.toISOString()).toBe("2026-10-01T10:00:00.000Z");
    expect(parseDatumFlexibel("15.01.2026")?.toISOString()).toBe("2026-01-15T11:00:00.000Z");
  });
  it("Monatserster bleibt in deutscher Zeit im richtigen Monat", () => {
    expect(monatBerlinIso("01.10.2026")).toBe("2026-10");
    expect(monatBerlinIso("2026-10-01")).toBe("2026-10");
    expect(monatBerlinIso("31.12.2026")).toBe("2026-12");
    expect(monatBerlinIso("01.01.2027")).toBe("2027-01");
  });
  it("der Tag stimmt in deutscher Zeit", () => {
    expect(heuteBerlinIso(parseDatumFlexibel("07.08.2026")!)).toBe("2026-08-07");
    expect(heuteBerlinIso(parseDatumFlexibel("31.12.2025")!)).toBe("2025-12-31");
  });
  it("ungültige Tage und Uhrzeiten bleiben ungültig", () => {
    expect(parseDatumFlexibel("31.02.2026")).toBeNull();
    expect(parseDatumFlexibel("2026-02-31")).toBeNull();
    expect(parseDatumFlexibel("07.08.2026, 25:00")).toBeNull();
  });
});

describe("parseDatumFlexibel: Zeitstempel ohne Zone", () => {
  it("deutsches Datum mit Uhrzeit ist deutsche Zeit", () => {
    expect(parseDatumFlexibel("07.08.2026, 14:30")?.toISOString()).toBe("2026-08-07T12:30:00.000Z");
    expect(parseDatumFlexibel("07.01.2026 14:30")?.toISOString()).toBe("2026-01-07T13:30:00.000Z");
  });
  it("ISO ohne Zone ist deutsche Zeit, mit Zone bleibt wie angegeben", () => {
    expect(parseDatumFlexibel("2026-08-07T14:30")?.toISOString()).toBe("2026-08-07T12:30:00.000Z");
    expect(parseDatumFlexibel("2026-08-07 14:30:15")?.toISOString()).toBe("2026-08-07T12:30:15.000Z");
    expect(parseDatumFlexibel("2026-08-07T14:30:00Z")?.toISOString()).toBe("2026-08-07T14:30:00.000Z");
    expect(parseDatumFlexibel("2026-08-07T14:30:00+02:00")?.toISOString()).toBe("2026-08-07T12:30:00.000Z");
  });
  it("Zeitumstellung: 03:30 Uhr am 25.10.2026 ist Winterzeit", () => {
    expect(parseDatumFlexibel("25.10.2026, 03:30")?.toISOString()).toBe("2026-10-25T02:30:00.000Z");
    expect(parseDatumFlexibel("29.03.2026, 03:30")?.toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });
});

describe("formatDatumZeitFlexibel: Anzeige aus den Datumsteilen", () => {
  it("Kalendertag ohne erfundene Uhrzeit", () => {
    expect(formatDatumZeitFlexibel("2026-08-07")).toBe("07.08.2026");
    expect(formatDatumZeitFlexibel("7.8.2026")).toBe("07.08.2026");
  });
  it("Uhrzeit ohne Zone so, wie sie dasteht", () => {
    expect(formatDatumZeitFlexibel("07.08.2026, 14:30")).toBe("07.08.2026, 14:30 Uhr");
    expect(formatDatumZeitFlexibel("2026-08-07T14:30")).toBe("07.08.2026, 14:30 Uhr");
  });
});

describe("tageSeit in deutscher Zeit", () => {
  it("zählt Kalendertage", () => {
    const jetzt = new Date("2026-10-10T08:00:00.000Z");
    expect(tageSeit("07.10.2026", jetzt)).toBe(3);
    // 23:30 Uhr deutscher Zeit am Vortag
    expect(tageSeit("2026-10-09T21:30:00.000Z", jetzt)).toBe(1);
    // 00:30 Uhr deutscher Zeit am selben Tag
    expect(tageSeit("2026-10-09T22:30:00.000Z", jetzt)).toBe(0);
  });
});

describe("formatDatumFlexibel: nur das Datum", () => {
  it("Kalendertage aus den Datumsteilen, Zeitpunkte in deutscher Zeit", () => {
    expect(formatDatumFlexibel("2026-10-01")).toBe("01.10.2026");
    expect(formatDatumFlexibel("1.10.2026")).toBe("01.10.2026");
    // 30.09. 23:30 UTC ist in Berlin schon der 01.10.
    expect(formatDatumFlexibel("2026-09-30T23:30:00Z")).toBe("01.10.2026");
    expect(formatDatumFlexibel("2026-10-01T00:30:00+02:00")).toBe("01.10.2026");
    expect(formatDatumFlexibel("Unsinn")).toBe("Unsinn");
  });
  it("DashboardKopf nutzt die Anzeige in deutscher Zeit", async () => {
    const { readFileSync } = await import("node:fs");
    const kopf = readFileSync("src/components/dashboard/DashboardKopf.tsx", "utf8");
    expect(kopf).toContain("formatDatumFlexibel(wert)");
    expect(kopf).not.toMatch(/toLocaleDateString\("de-DE", \{ day: "2-digit", month: "2-digit", year: "numeric" \}\)/);
  });
});
