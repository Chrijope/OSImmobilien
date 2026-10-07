/**
 * „Heute“ und Uhrzeiten in deutscher Zeit (04.10.2026): Reservierungs-PDF,
 * Mieterhöhung in Kennzahlen, Store und Exposé.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { heuteBerlinIso } from "./datumsformate";
import { kaltmieteVon } from "./objektKennzahlen";

afterEach(() => {
  vi.useRealTimers();
});

describe("heuteBerlinIso", () => {
  it("00:30 Uhr am 01.10. in Berlin ist der 01.10., auch wenn UTC noch den 30.09. zeigt", () => {
    expect(heuteBerlinIso(new Date("2026-09-30T22:30:00.000Z"))).toBe("2026-10-01");
  });
  it("Winterzeit", () => {
    expect(heuteBerlinIso(new Date("2026-12-31T23:30:00.000Z"))).toBe("2027-01-01");
  });
});

describe("kaltmieteVon", () => {
  const w = { mieteGesamt: 800, neueMiete: 850, mieterhoehungAb: "2026-10-01" };
  it("nimmt die Mieterhöhung ab Mitternacht deutscher Zeit", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T22:30:00.000Z"));
    expect(kaltmieteVon(w)).toBe(850);
    vi.setSystemTime(new Date("2026-09-30T21:30:00.000Z"));
    expect(kaltmieteVon(w)).toBe(800);
  });
});

describe("Quelltexte", () => {
  it("Reservierungs-PDF schreibt Datum und Uhrzeit in deutscher Zeit", () => {
    const pdf = readFileSync("src/lib/reservierungPdf.ts", "utf8");
    const aufrufe = pdf.match(/toLocale(Date|Time)String\("de-DE"[^)]*\)/g) ?? [];
    expect(aufrufe.length).toBeGreaterThanOrEqual(3);
    for (const a of aufrufe) expect(a).toContain('timeZone: "Europe/Berlin"');
  });
  it("kein UTC-Tag mehr für heute", () => {
    expect(readFileSync("src/lib/objektKennzahlen.ts", "utf8")).not.toContain("new Date().toISOString().slice(0, 10)");
    expect(readFileSync("src/lib/objekteStore.ts", "utf8")).not.toContain('stichtag || new Date().toISOString().split("T")[0]');
    expect(readFileSync("src/lib/exposeInhalt.ts", "utf8")).toContain("heuteBerlinIso(heute)");
  });
});
