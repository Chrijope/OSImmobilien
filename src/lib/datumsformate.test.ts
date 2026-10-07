import { describe, it, expect } from "vitest";
import {
  parseDatumFlexibel,
  datumSortierwert,
  datumVergleich,
  jetztAlsIsoDatum,
  formatDatumZeitFlexibel,
  tageSeit,
  heuteBerlinIso,
} from "./datumsformate";

// Seit dem 04.10.2026 gelten Angaben ohne Zeitzone als deutsche Zeit. Die
// Tests pruefen deshalb den Tag in deutscher Zeit, nicht die Uhr des Geraets,
// und laufen in jeder Zeitzone gleich.

describe("parseDatumFlexibel", () => {
  it("liest ISO", () => {
    const d = parseDatumFlexibel("2026-08-07T09:12:00Z");
    expect(d?.toISOString()).toBe("2026-08-07T09:12:00.000Z");
  });

  it("liest deutsches Datum als Tag.Monat.Jahr, nicht als Monat.Tag.Jahr", () => {
    // Das ist der eigentliche Grund fuer diese Funktion: new Date("07.08.2026")
    // liefert den 8. Juli, nicht den 7. August.
    const d = parseDatumFlexibel("07.08.2026");
    expect(heuteBerlinIso(d!)).toBe("2026-08-07"); // 7. August
  });

  it("liest deutsches Datum, das new Date gar nicht versteht", () => {
    const d = parseDatumFlexibel("31.12.2025");
    expect(heuteBerlinIso(d!)).toBe("2025-12-31");
  });

  it("liest deutsches Datum mit Uhrzeit", () => {
    // 14:30 Uhr deutscher Sommerzeit = 12:30 UTC
    const d = parseDatumFlexibel("07.08.2026, 14:30");
    expect(d?.toISOString()).toBe("2026-08-07T12:30:00.000Z");
  });

  it("gibt null bei leer, Unsinn und unmoeglichem Datum", () => {
    expect(parseDatumFlexibel("")).toBeNull();
    expect(parseDatumFlexibel(null)).toBeNull();
    expect(parseDatumFlexibel(undefined)).toBeNull();
    expect(parseDatumFlexibel("   ")).toBeNull();
    expect(parseDatumFlexibel("kein Datum")).toBeNull();
    expect(parseDatumFlexibel("31.02.2026")).toBeNull();
    expect(parseDatumFlexibel("07.13.2026")).toBeNull();
  });
});

describe("datumSortierwert", () => {
  it("macht aus beiden Formaten einen vergleichbaren Schluessel", () => {
    expect(datumSortierwert("2026-08-07T00:00:00Z")).toMatch(/^2026-08-07T/);
    expect(datumSortierwert("07.08.2026")).toMatch(/^2026-08-0[67]T/);
  });

  it("gibt leeren String bei fehlendem Wert", () => {
    expect(datumSortierwert("")).toBe("");
    expect(datumSortierwert(undefined)).toBe("");
    expect(datumSortierwert("Unsinn")).toBe("");
  });
});

describe("datumVergleich", () => {
  it("sortiert gemischte Formate richtig", () => {
    // Genau der Fall aus der Praxis: Altbestand deutsch, Neuzugang ISO.
    const werte = ["2026-08-06T10:00:00Z", "01.08.2026", "2026-08-01T10:00:00Z", "10.08.2026"];
    const sortiert = [...werte].sort(datumVergleich);
    expect(sortiert[0]).toMatch(/^(01\.08\.2026|2026-08-01)/);
    expect(sortiert[sortiert.length - 1]).toBe("10.08.2026");
  });

  it("sortiert falsch herum, wenn man stattdessen localeCompare nimmt", () => {
    // Absicherung des Befunds selbst: das alte Verhalten war nachweislich falsch.
    const alt = ["2026-08-10T10:00:00Z", "01.08.2026"].sort((a, b) => a.localeCompare(b));
    expect(alt[0]).toBe("01.08.2026"); // spaeteres Datum steht vorne
    const neu = ["2026-08-10T10:00:00Z", "01.08.2026"].sort(datumVergleich);
    expect(neu[0]).toBe("01.08.2026"); // hier steht es richtig vorne
    const neu2 = ["2026-08-01T10:00:00Z", "10.08.2026"].sort(datumVergleich);
    expect(neu2[0]).toBe("2026-08-01T10:00:00Z");
  });

  it("schiebt leere Werte nach vorne beim Aufsteigenden", () => {
    const sortiert = ["07.08.2026", "", "2026-08-01T00:00:00Z"].sort(datumVergleich);
    expect(sortiert[0]).toBe("");
  });
});

describe("jetztAlsIsoDatum", () => {
  it("liefert ISO", () => {
    expect(jetztAlsIsoDatum()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe("formatDatumZeitFlexibel", () => {
  it("zeigt ISO als deutsches Datum mit Uhrzeit", () => {
    // Seit dem 04.10.2026 in deutscher Zeit, gleich auf welchem Geraet.
    expect(formatDatumZeitFlexibel("2026-09-01T12:05:00.000Z")).toBe("01.09.2026, 14:05 Uhr");
    expect(formatDatumZeitFlexibel("2026-09-01T14:05:00+02:00")).toBe("01.09.2026, 14:05 Uhr");
    // Nachts nach Mitternacht deutscher Zeit, in UTC noch der Vortag
    expect(formatDatumZeitFlexibel("2026-08-31T22:30:00Z")).toBe("01.09.2026, 00:30 Uhr");
  });

  it("zeigt das deutsche Altformat ohne erfundene Uhrzeit", () => {
    // Genau der Fall aus dem Vertrags-Reiter: sendVertrag schrieb "31.8.2026",
    // und new Date() darauf ergab "Invalid Date".
    expect(formatDatumZeitFlexibel("31.8.2026")).toBe("31.08.2026");
    expect(formatDatumZeitFlexibel("07.08.2026")).toBe("07.08.2026");
  });

  it("zeigt das deutsche Altformat mit Uhrzeit samt Uhrzeit", () => {
    expect(formatDatumZeitFlexibel("07.08.2026, 14:30")).toBe("07.08.2026, 14:30 Uhr");
  });

  it("gibt leeren String bei leerem Wert", () => {
    expect(formatDatumZeitFlexibel("")).toBe("");
    expect(formatDatumZeitFlexibel("   ")).toBe("");
    expect(formatDatumZeitFlexibel(null)).toBe("");
    expect(formatDatumZeitFlexibel(undefined)).toBe("");
  });

  it("gibt bei Unsinn den Rohtext zurueck, nie Invalid Date", () => {
    expect(formatDatumZeitFlexibel("kein Datum")).toBe("kein Datum");
    expect(formatDatumZeitFlexibel("31.02.2026")).toBe("31.02.2026");
    expect(formatDatumZeitFlexibel("kein Datum")).not.toContain("Invalid");
  });
});

describe("tageSeit", () => {
  const jetzt = new Date("2026-08-07T08:00:00.000Z"); // 07.08.2026, 10:00 Uhr deutscher Zeit

  it("zaehlt heute als 0", () => {
    // 01:00 Uhr deutscher Zeit am selben Tag
    expect(tageSeit("2026-08-06T23:00:00.000Z", jetzt)).toBe(0);
  });

  it("zaehlt gestern spaetabends als 1", () => {
    // 23:30 Uhr deutscher Zeit am Vortag
    expect(tageSeit("2026-08-06T21:30:00.000Z", jetzt)).toBe(1);
  });

  it("zaehlt Kalendertage, auch bei deutschem Datum", () => {
    expect(tageSeit("04.08.2026", jetzt)).toBe(3);
  });

  it("gibt null bei unlesbarem Wert", () => {
    expect(tageSeit("", jetzt)).toBeNull();
    expect(tageSeit("Unsinn", jetzt)).toBeNull();
  });
});
