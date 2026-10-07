import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { merkeSprache, spracheSchluessel, startSprache } from "@/lib/beratungspraesentationSprache";
import { usePraesentationsSprache } from "./usePraesentationsSprache";

/*
 * Plan Kundensprache, K10: Die Beratungspräsentation startet in der Sprache
 * des Kunden, wenn sie mit ihm geöffnet wird. Ohne Kunden gilt die gemerkte
 * Wahl des Beraters. Eine Umschaltung im Kundengespräch überschreibt diese
 * Wahl nicht.
 */

/** Ein Speicher im Arbeitsspeicher; die Testumgebung stellt keinen localStorage bereit. */
function speicher(): Storage {
  const daten = new Map<string, string>();
  return {
    get length() { return daten.size; },
    clear: () => daten.clear(),
    getItem: (k: string) => daten.get(k) ?? null,
    key: (i: number) => [...daten.keys()][i] ?? null,
    removeItem: (k: string) => { daten.delete(k); },
    setItem: (k: string, v: string) => { daten.set(k, String(v)); },
  };
}

beforeEach(() => {
  Object.defineProperty(window, "localStorage", { value: speicher(), configurable: true });
});

describe("startSprache", () => {
  it("nimmt mit Kunden dessen Sprache, sonst die gemerkte, sonst Deutsch", () => {
    expect(startSprache("en", "de")).toBe("en");
    expect(startSprache("de", "en")).toBe("de");
    expect(startSprache(null, "en")).toBe("en");
    expect(startSprache(undefined, null)).toBe("de");
  });
});

describe("usePraesentationsSprache", () => {
  it("startet ohne Kunden in der gemerkten Sprache des Beraters", () => {
    merkeSprache(spracheSchluessel("berater-1"), "en");
    const { result } = renderHook(() => usePraesentationsSprache("berater-1"));
    expect(result.current[0]).toBe("en");
  });

  it("startet mit Kunden in dessen Sprache, auch gegen die gemerkte Wahl", () => {
    merkeSprache(spracheSchluessel("berater-1"), "de");
    const { result } = renderHook(() => usePraesentationsSprache("berater-1", "en"));
    expect(result.current[0]).toBe("en");
  });

  it("folgt der Kundensprache, wenn sie erst nachgeladen wird", () => {
    const { result, rerender } = renderHook(({ kunde }) => usePraesentationsSprache("berater-1", kunde), {
      initialProps: { kunde: "de" as "de" | "en" },
    });
    expect(result.current[0]).toBe("de");
    rerender({ kunde: "en" });
    expect(result.current[0]).toBe("en");
  });

  it("merkt eine Umschaltung im Kundengespräch nicht als eigene Wahl", () => {
    merkeSprache(spracheSchluessel("berater-1"), "de");
    const { result } = renderHook(() => usePraesentationsSprache("berater-1", "en"));
    act(() => result.current[1]("de"));
    expect(result.current[0]).toBe("de");
    expect(window.localStorage.getItem(spracheSchluessel("berater-1"))).toBe("de");
    act(() => result.current[1]("en"));
    // Die gemerkte Wahl des Beraters bleibt unberührt.
    expect(window.localStorage.getItem(spracheSchluessel("berater-1"))).toBe("de");
  });
});
