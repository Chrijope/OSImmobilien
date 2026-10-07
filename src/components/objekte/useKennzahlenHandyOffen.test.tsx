import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { KENNZAHLEN_HANDY_OFFEN_SCHLUESSEL, leseOffen, useKennzahlenHandyOffen } from "./useKennzahlenHandyOffen";

/*
 * Objektliste auf dem Handy (Befund vom 24.09.2026): Vor dem ersten Objekt
 * standen die Portfolio-Kacheln. Dort sind sie jetzt eingeklappt, gemerkt je
 * Nutzer. Aufbau wie der Test von `useNichtVerfuegbarOffen`.
 */
const mocks = vi.hoisted(() => ({
  userId: "a",
  currentId: "a",
  bereit: true,
  gespeichert: {} as Record<string, Record<string, unknown>>,
  schreibt: vi.fn(),
}));
vi.mock("@/contexts/UserContext", () => ({ useUser: () => ({ authUser: { id: mocks.userId } }) }));
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => mocks.bereit }));
vi.mock("@/hooks/useLiveData", () => ({ useLiveVersion: () => 0 }));
vi.mock("@/lib/currentUser", () => ({ getCurrentUserId: () => mocks.currentId }));
vi.mock("@/lib/userSettingsCache", () => ({
  getUserSetting: (schluessel: string, rueckfall: unknown) =>
    mocks.gespeichert[mocks.currentId]?.[schluessel] ?? rueckfall,
  setUserSetting: mocks.schreibt,
}));

beforeEach(() => {
  mocks.userId = "a";
  mocks.currentId = "a";
  mocks.bereit = true;
  mocks.gespeichert = {};
  mocks.schreibt.mockReset().mockImplementation((schluessel: string, wert: unknown) => {
    mocks.gespeichert[mocks.currentId] = { ...(mocks.gespeichert[mocks.currentId] || {}), [schluessel]: wert };
  });
});

describe("Kennzahlen auf dem Handy", () => {
  it("sind ohne gespeicherten Wert eingeklappt, und es wird nichts geschrieben", () => {
    const h = renderHook(useKennzahlenHandyOffen);
    expect(h.result.current.offen).toBe(false);
    expect(mocks.schreibt).not.toHaveBeenCalled();
  });

  it("bleiben offen bis zum nächsten Öffnen der Seite, nur mit dem eigenen Schlüssel", () => {
    const h = renderHook(useKennzahlenHandyOffen);
    act(() => h.result.current.setzeOffen(true));
    expect(h.result.current.offen).toBe(true);
    expect(mocks.schreibt).toHaveBeenCalledWith(KENNZAHLEN_HANDY_OFFEN_SCHLUESSEL, true);
    h.unmount();
    expect(renderHook(useKennzahlenHandyOffen).result.current.offen).toBe(true);
  });

  it("gelten je Nutzer", () => {
    mocks.gespeichert = { a: { [KENNZAHLEN_HANDY_OFFEN_SCHLUESSEL]: true } };
    mocks.userId = "b";
    mocks.currentId = "b";
    expect(renderHook(useKennzahlenHandyOffen).result.current.offen).toBe(false);
  });

  it("nur ein echtes true klappt auf", () => {
    expect(leseOffen(true)).toBe(true);
    for (const w of [false, "true", 1, null, undefined, {}]) expect(leseOffen(w)).toBe(false);
  });

  it("die Objektliste nutzt den Schalter nur auf dem Handy und heißt „Objektsuche“", () => {
    const quelle = readFileSync(resolve(process.cwd(), "src/pages/Objekte.tsx"), "utf8");
    expect(quelle).toContain("istHandy ? (");
    expect(quelle).toContain('"Kennzahlen anzeigen"');
    expect(quelle).toContain(">Objektsuche<");
    expect(quelle).not.toContain("Objekt suche:");
  });
});
