/**
 * Favoriten fuer Notizen im Kundenprofil (Auftrag vom 28.09.2026).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  zeilen: [] as Record<string, unknown>[],
  aufrufe: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/dataCache", () => ({
  cacheGet: () => state.zeilen,
  cacheFilter: (_t: string, pruefe: (r: Record<string, unknown>) => boolean) => state.zeilen.filter(pruefe),
  cacheUpdate: async (_t: string, id: string, patch: Record<string, unknown>) => {
    state.aufrufe.push(patch);
    const zeile = state.zeilen.find((r) => r.id === id);
    if (zeile) Object.assign(zeile, patch);
    return !!zeile;
  },
  cacheInsert: async () => {},
  cacheDelete: async () => true,
}));
vi.mock("@/lib/dbStoreHelper", () => ({ isTestAccount: () => false, localGet: () => [], localSet: () => {} }));
vi.mock("@/lib/currentUser", () => ({ getCurrentUserId: () => "u-test-a" }));

import { angepinnteZuerst, istAngepinnt } from "./notizFavoriten";
import { getAktivitaeten, setzeNotizAngepinnt } from "./aktivitaetenStore";
import { darfNotizBearbeiten } from "./aktivitaetRechte";

describe("angepinnteZuerst", () => {
  it("stellt Favoriten nach oben, ohne eine Notiz doppelt zu zeigen", () => {
    // Eingang nach Datum, neueste oben
    const liste = [
      { id: "n4", datum: "2026-09-28" },
      { id: "n3", datum: "2026-09-27", angepinntAm: "2026-09-28T09:00:00Z" },
      { id: "n2", datum: "2026-09-26" },
      { id: "n1", datum: "2026-09-25", angepinntAm: "2026-09-28T08:00:00Z" },
    ];
    const ergebnis = angepinnteZuerst(liste);
    expect(ergebnis.map((n) => n.id)).toEqual(["n3", "n1", "n4", "n2"]);
    expect(new Set(ergebnis.map((n) => n.id)).size).toBe(liste.length);
  });

  it("laesst die Liste ohne Favoriten unveraendert", () => {
    const liste: { id: string; angepinntAm?: string }[] = [{ id: "a" }, { id: "b" }];
    expect(angepinnteZuerst(liste)).toEqual(liste);
  });
});

describe("setzeNotizAngepinnt", () => {
  beforeEach(() => {
    state.zeilen = [{ id: "n1", kunde_id: "k1", art: "notiz", beschreibung: "Rueckruf", von: "Testperson A", datum: "2026-09-28" }];
    state.aufrufe = [];
  });

  it("setzt den Favoriten mit Zeitpunkt und Kennung und entfernt ihn wieder", async () => {
    await setzeNotizAngepinnt("n1", true);
    expect(state.aufrufe[0]).toMatchObject({ angepinnt_von: "u-test-a" });
    expect(typeof state.aufrufe[0].angepinnt_am).toBe("string");
    expect(istAngepinnt(getAktivitaeten("k1")[0])).toBe(true);

    await setzeNotizAngepinnt("n1", false);
    expect(state.aufrufe[1]).toEqual({ angepinnt_am: null, angepinnt_von: null });
    expect(istAngepinnt(getAktivitaeten("k1")[0])).toBe(false);
  });
});

describe("darfNotizBearbeiten", () => {
  const notiz = { id: "n1", von: "Testperson A", art: "notiz" as const };

  it("gilt fuer jede interne Rolle, wie die Update-Regel der Datenbank", () => {
    expect(darfNotizBearbeiten(notiz, { rolle: "vertriebspartner" })).toBe(true);
    expect(darfNotizBearbeiten(notiz, { rolle: "admin" })).toBe(true);
  });

  it("gilt nicht fuer Rollen von aussen", () => {
    expect(darfNotizBearbeiten(notiz, { rolle: "kunde" })).toBe(false);
    expect(darfNotizBearbeiten(notiz, { rolle: "tippgeber" })).toBe(false);
  });

  it("gilt nicht fuer Systemeintraege und Nicht-Notizen", () => {
    expect(darfNotizBearbeiten({ ...notiz, von: "System" }, { rolle: "admin" })).toBe(false);
    expect(darfNotizBearbeiten({ ...notiz, id: "log-1" }, { rolle: "admin" })).toBe(false);
    expect(darfNotizBearbeiten({ ...notiz, art: "aufgabe" as const }, { rolle: "admin" })).toBe(false);
  });
});
