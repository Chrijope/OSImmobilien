import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

/**
 * Die Favoriten der Übungsansicht: setzen, entfernen, wieder laden.
 *
 * Gespeichert wird über `userSettingsCache` (Tabelle user_settings, Spalte
 * einstellungen), mit einer Kopie im localStorage, die antwortet, solange die
 * Datenbankzeile im frischen Fenster noch nicht da ist.
 */

// jsdom bringt hier keinen localStorage mit, die Kopie braucht ihn.
const speicher = new Map<string, string>();
Object.defineProperty(window, "localStorage", {
  writable: true,
  value: {
    getItem: (k: string) => speicher.get(k) ?? null,
    setItem: (k: string, v: string) => { speicher.set(k, String(v)); },
    removeItem: (k: string) => { speicher.delete(k); },
    clear: () => speicher.clear(),
  },
});

/** Die Datenbankzeile, wie der Zwischenspeicher sie hält. */
let einstellungen: Record<string, unknown> | null = null;
const setUserSetting = vi.fn((key: string, wert: unknown) => {
  einstellungen = { ...(einstellungen ?? {}), [key]: wert };
});
vi.mock("./userSettingsCache", () => ({
  getUserSetting: (key: string, fallback: unknown) =>
    einstellungen && einstellungen[key] !== undefined ? einstellungen[key] : fallback,
  setUserSetting: (key: string, wert: unknown) => setUserSetting(key, wert),
}));

let cacheListener: ((tabelle: string) => void) | null = null;
vi.mock("./dataCache", () => ({
  onCacheChange: (l: (tabelle: string) => void) => { cacheListener = l; return () => { cacheListener = null; }; },
}));

import { FAVORITEN_SCHLUESSEL, ladeFavoriten, usePraesentationsFavoriten } from "./praesentationsFavoriten";

beforeEach(() => {
  speicher.clear();
  einstellungen = null;
  setUserSetting.mockClear();
});

describe("usePraesentationsFavoriten", () => {
  it("setzt einen Favoriten und schreibt ihn in die Nutzereinstellungen und den Browser", () => {
    const { result } = renderHook(() => usePraesentationsFavoriten());
    expect(result.current.favoriten).toEqual([]);

    act(() => result.current.umschalten("vorabbogen||rechner"));
    expect(result.current.favoriten).toEqual(["vorabbogen||rechner"]);
    expect(result.current.istFavorit("vorabbogen||rechner")).toBe(true);
    expect(setUserSetting).toHaveBeenCalledWith(FAVORITEN_SCHLUESSEL, ["vorabbogen||rechner"]);
    expect(JSON.parse(speicher.get("mi_praesentationsFavoriten") ?? "[]")).toEqual(["vorabbogen||rechner"]);
  });

  it("entfernt einen Favoriten wieder", () => {
    einstellungen = { [FAVORITEN_SCHLUESSEL]: ["vorabbogen||rechner", "kennenlernbogen|weg2|kern-service"] };
    const { result } = renderHook(() => usePraesentationsFavoriten());
    expect(result.current.favoriten).toHaveLength(2);

    act(() => result.current.umschalten("vorabbogen||rechner"));
    expect(result.current.favoriten).toEqual(["kennenlernbogen|weg2|kern-service"]);
    expect(result.current.istFavorit("vorabbogen||rechner")).toBe(false);
    expect(setUserSetting).toHaveBeenLastCalledWith(FAVORITEN_SCHLUESSEL, ["kennenlernbogen|weg2|kern-service"]);
  });

  it("lädt beim nächsten Öffnen aus der Datenbankzeile", () => {
    einstellungen = { [FAVORITEN_SCHLUESSEL]: ["kennenlernbogen|weg3|kern-bedingungen", "quatsch"] };
    const { result } = renderHook(() => usePraesentationsFavoriten());
    // Unbrauchbares aus der Zeile fällt weg.
    expect(result.current.favoriten).toEqual(["kennenlernbogen|weg3|kern-bedingungen"]);
  });

  it("antwortet aus dem Browser, solange die Zeile fehlt, und wechselt zur Zeile, sobald sie da ist", () => {
    speicher.set("mi_praesentationsFavoriten", JSON.stringify(["vorabbogen||cover"]));
    expect(ladeFavoriten()).toEqual(["vorabbogen||cover"]);

    const { result } = renderHook(() => usePraesentationsFavoriten());
    expect(result.current.favoriten).toEqual(["vorabbogen||cover"]);

    // Die Datenbankzeile kommt nach: Sie hat das Sagen.
    einstellungen = { [FAVORITEN_SCHLUESSEL]: ["rechner||rechner"] };
    act(() => cacheListener?.("user_settings"));
    expect(result.current.favoriten).toEqual(["rechner||rechner"]);

    // Änderungen an anderen Tabellen sind egal.
    einstellungen = { [FAVORITEN_SCHLUESSEL]: [] };
    act(() => cacheListener?.("kontakte"));
    expect(result.current.favoriten).toEqual(["rechner||rechner"]);
  });
});
