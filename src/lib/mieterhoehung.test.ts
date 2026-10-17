import { describe, expect, it } from "vitest";
import { kappungsgrenzeVorgabe, naechsteErhoehung } from "./mieterhoehung";

// Werte aus „Mietdifferenz Hauffstraße Abgleich.xlsx“ (Schwielowsee: 20 %, Vergleichsmiete 12,54 €/m²).
const HAUFF = { kappungsgrenze: 0.2, vergleichsmieteQm: 12.54 };
const HEUTE = "2026-10-17";

describe("Mieterhöhungsplaner", () => {
  it("WE1: Kappungsgrenze durch +20 % zum 01.09.2025 ausgeschöpft, nächste Erhöhung 01.09.2028 auf 485,91 €", () => {
    const r = naechsteErhoehung({ istMiete: 404.93, flaeche: 42.53, mietbeginn: "2007-07-15", letzteErhoehung: "2025-09-01", mieteVorErhoehung: 337.44 }, HAUFF, HEUTE)!;
    expect(r).toMatchObject({ ab: "2028-09-01", neueMiete: 485.91, begrenztDurch: "Kappungsgrenze" });
  });

  it("WE2: letzte Erhöhung 2022, nächste zum 01.01.2027 auf 495,36 € (Kappungsgrenze)", () => {
    const r = naechsteErhoehung({ istMiete: 412.8, flaeche: 42.53, mietbeginn: "2016-04-01", letzteErhoehung: "2022-09-01", mieteVorErhoehung: null }, HAUFF, HEUTE)!;
    expect(r).toMatchObject({ ab: "2027-01-01", neueMiete: 495.36, plus: 82.56, begrenztDurch: "Kappungsgrenze" });
  });

  it("deckelt bei der Vergleichsmiete und meldet, wenn nichts mehr geht", () => {
    const r = naechsteErhoehung({ istMiete: 495.36, flaeche: 42.53, mietbeginn: "2016-04-01", letzteErhoehung: "2020-01-01", mieteVorErhoehung: null }, HAUFF, HEUTE)!;
    expect(r).toMatchObject({ neueMiete: 533.32, begrenztDurch: "Vergleichsmiete" });
    const voll = naechsteErhoehung({ istMiete: 540, flaeche: 42.53, mietbeginn: "2016-04-01", letzteErhoehung: "", mieteVorErhoehung: null }, HAUFF, HEUTE)!;
    expect(voll.plus).toBe(0);
  });

  it("wartet 15 Monate nach Mietbeginn und kennt die Berliner Kappungsgrenze", () => {
    const r = naechsteErhoehung({ istMiete: 1000, flaeche: 79.72, mietbeginn: "2025-08-01", letzteErhoehung: "", mieteVorErhoehung: null }, { kappungsgrenze: 0.15, vergleichsmieteQm: null }, HEUTE)!;
    // 15 Monate nach Mietbeginn wäre der 01.11.2026; bei Versand im Oktober wirkt sie erst ab 01.01.2027.
    expect(r).toMatchObject({ ab: "2027-01-01", neueMiete: 1150 });
    expect(kappungsgrenzeVorgabe("berlin")).toBe(0.15);
    expect(kappungsgrenzeVorgabe("brandenburg")).toBe(0.2);
  });
});
