/**
 * Zahlen, Euro, Datum und Uhrzeit je Kundensprache (Plan Kundensprache,
 * Entscheidung 9): Englisch britisch, Euro als „€1,234“, Datum „25 Sep 2026“,
 * Zeit immer in deutscher Zeit, auch wenn der Rechner in UTC läuft.
 */
import { describe, expect, it } from "vitest";
import {
  datumLangText,
  datumText,
  datumUhrzeitText,
  euroText,
  prozentText,
  uhrzeitText,
  zahlText,
} from "./sprachFormat";
import * as deno from "../../supabase/functions/_shared/sprach-format.ts";
import * as praesentation from "./beratungspraesentationSprache";

describe("Zahlen und Beträge", () => {
  it("schreibt Zahlen deutsch und britisch", () => {
    expect(zahlText(1234.5, "de", 1)).toBe("1.234,5");
    expect(zahlText(1234.5, "en", 1)).toBe("1,234.5");
    expect(zahlText(Number.NaN, "en")).toBe("0");
  });

  it("setzt das Euro-Zeichen im Englischen voran, im Deutschen dahinter", () => {
    expect(euroText(1234, "de")).toBe("1.234 €");
    expect(euroText(1234, "en")).toBe("€1,234");
    expect(euroText(-354, "en")).toBe("−€354");
    expect(euroText(-354, "de")).toBe("−354 €");
    expect(euroText(99.5, "en", 2)).toBe("€99.50");
  });

  it("schreibt Prozent mit und ohne Leerzeichen", () => {
    expect(prozentText(3, "de")).toBe("3,0 %");
    expect(prozentText(3, "en")).toBe("3.0%");
  });

  it("die Beratungspräsentation rechnet unverändert über dieselbe Quelle", () => {
    expect(praesentation.euroText(4000, "de")).toBe("4.000 €");
    expect(praesentation.euroText(4000, "en")).toBe("€4,000");
    expect(praesentation.zahlText).toBe(zahlText);
  });
});

describe("Datum und Uhrzeit", () => {
  // 25.09.2026, 12:30 UTC ist 14:30 in Berlin (Sommerzeit).
  const zeitpunkt = "2026-09-25T12:30:00Z";

  it("kurzes Datum: 25.09.2026 und 25 Sep 2026", () => {
    expect(datumText(zeitpunkt, "de")).toBe("25.09.2026");
    expect(datumText(zeitpunkt, "en")).toBe("25 Sep 2026");
  });

  it("nimmt für September „Sep“, nie „Sept“, unabhängig von den ICU-Daten", () => {
    expect(datumText("2026-09-01", "en")).toBe("1 Sep 2026");
  });

  it("langes Datum mit Wochentag", () => {
    expect(datumLangText(zeitpunkt, "de")).toBe("25. September 2026");
    expect(datumLangText(zeitpunkt, "en")).toBe("25 September 2026");
    expect(datumLangText(zeitpunkt, "de", { wochentag: true })).toBe("Freitag, 25. September 2026");
    expect(datumLangText(zeitpunkt, "en", { wochentag: true })).toBe("Friday, 25 September 2026");
  });

  it("rechnet die Uhrzeit in deutscher Zeit", () => {
    expect(uhrzeitText(zeitpunkt, "de")).toBe("14:30");
    expect(uhrzeitText(zeitpunkt, "en")).toBe("14:30");
    expect(datumUhrzeitText(zeitpunkt, "de")).toBe("25.09.2026, 14:30 Uhr");
    expect(datumUhrzeitText(zeitpunkt, "en")).toBe("25 Sep 2026, 14:30");
    // Winterzeit: 23:30 UTC am 31.12. ist schon der 1. Januar in Berlin.
    expect(datumUhrzeitText("2026-12-31T23:30:00Z", "en")).toBe("1 Jan 2027, 00:30");
  });

  it("liest reine Daten ohne Verschiebung, auch in deutscher Schreibweise", () => {
    expect(datumText("2026-03-29", "en")).toBe("29 Mar 2026"); // Tag der Zeitumstellung
    expect(datumText("25.09.2026", "en")).toBe("25 Sep 2026");
    expect(datumText(new Date(Date.UTC(2026, 8, 25, 10)), "de")).toBe("25.09.2026");
  });

  it("gibt bei Leerem oder Ungültigem einen leeren Text", () => {
    expect(datumText(null, "en")).toBe("");
    expect(datumText("", "de")).toBe("");
    expect(datumText("kein Datum", "de")).toBe("");
    expect(datumUhrzeitText(undefined, "en")).toBe("");
  });

  it("unbekannte Sprache fällt auf Deutsch", () => {
    expect(datumText(zeitpunkt, "fr" as never)).toBe("25.09.2026");
    expect(euroText(5, "fr" as never)).toBe("5 €");
  });
});

describe("eine Quelle für Browser und Edge Functions", () => {
  it("src/lib/sprachFormat reicht die Deno-Fassung unverändert weiter", () => {
    expect(datumText).toBe(deno.datumText);
    expect(euroText).toBe(deno.euroText);
  });
});
