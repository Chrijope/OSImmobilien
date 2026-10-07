import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Gemeldet beim Musterkunden Otto Hans: Er stand jeden Tag mit
 * "Kaufpreisfaelligkeit pruefen" in der Inbox, und Abhaken half nur bis zum
 * naechsten Laden. Hier ist abgesichert, dass ein stummgeschalteter Kontakt
 * erkannt wird und dass die Erkennung im Zweifel NICHT stumm schaltet.
 */

const daten = vi.hoisted(() => ({ kontakte: [] as Array<Record<string, unknown>>, wirft: false }));

vi.mock("@/lib/dataCache", () => ({
  cacheGet: (tabelle: string) => {
    if (daten.wirft) throw new Error("Cache nicht bereit");
    return tabelle === "kontakte" ? daten.kontakte : [];
  },
}));

import { istKontaktStumm, kontaktDarfMelden, STUMM_FELD } from "./kontaktStumm";

describe("istKontaktStumm", () => {
  beforeEach(() => { daten.kontakte = []; daten.wirft = false; });

  it("erkennt einen stummgeschalteten Kontakt", () => {
    daten.kontakte = [{ id: "otto", meta: { [STUMM_FELD]: true } }];
    expect(istKontaktStumm("otto")).toBe(true);
    expect(kontaktDarfMelden("otto")).toBe(false);
  });

  it("laesst gewoehnliche Kontakte melden", () => {
    daten.kontakte = [{ id: "anna", meta: {} }, { id: "otto", meta: { [STUMM_FELD]: true } }];
    expect(istKontaktStumm("anna")).toBe(false);
    expect(kontaktDarfMelden("anna")).toBe(true);
  });

  it("nimmt nur ein echtes Ja, keine Zeichenkette", () => {
    // Sonst schaltete ein versehentliches "false" als Text alles stumm.
    daten.kontakte = [{ id: "x", meta: { [STUMM_FELD]: "false" } }];
    expect(istKontaktStumm("x")).toBe(false);
  });

  it("bleibt gelassen bei unbekanntem oder fehlendem Kontakt", () => {
    expect(istKontaktStumm("gibtesnicht")).toBe(false);
    expect(istKontaktStumm(undefined)).toBe(false);
    expect(istKontaktStumm(null)).toBe(false);
    expect(istKontaktStumm("")).toBe(false);
  });

  it("schaltet nicht stumm, wenn der Zwischenspeicher noch nicht da ist", () => {
    // Die sichere Richtung: eine Erinnerung zu viel ist harmloser als eine,
    // die nie kommt, weil der Cache beim Laden kurz nichts wusste.
    daten.wirft = true;
    expect(istKontaktStumm("otto")).toBe(false);
  });
});
