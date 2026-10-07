import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { NICHT_VERFUEGBAR_ZU_SCHLUESSEL, leseZu, useNichtVerfuegbarOffen } from "./useNichtVerfuegbarOffen";

/*
 * Der Einstellungshelfer wird nachgestellt, nicht die Datenbank. Geprueft wird
 * damit genau das, was hier entschieden wird: welcher Schluessel geschrieben
 * wird, und dass nur er geschrieben wird.
 */
const mocks = vi.hoisted(() => ({
  userId: "a",
  currentId: "a",
  bereit: true,
  version: 0,
  /** Die Einstellungen je Nutzer, so wie sie in `user_settings` laegen. */
  gespeichert: {} as Record<string, Record<string, unknown>>,
  schreibt: vi.fn(),
}));
vi.mock("@/contexts/UserContext", () => ({ useUser: () => ({ authUser: { id: mocks.userId } }) }));
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => mocks.bereit }));
vi.mock("@/hooks/useLiveData", () => ({ useLiveVersion: () => mocks.version }));
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
  mocks.version = 0;
  mocks.gespeichert = {};
  mocks.schreibt.mockReset().mockImplementation((schluessel: string, wert: unknown) => {
    mocks.gespeichert[mocks.currentId] = { ...(mocks.gespeichert[mocks.currentId] || {}), [schluessel]: wert };
  });
});

describe("Der Block Nicht verfuegbar merkt sich, ob er zu ist", () => {
  it("steht ohne gespeicherten Wert offen und schreibt nichts", () => {
    const h = renderHook(useNichtVerfuegbarOffen);
    expect(h.result.current.offen).toBe(true);
    expect(mocks.schreibt).not.toHaveBeenCalled();
  });

  it("bleibt zugeklappt bis zum naechsten Oeffnen der Seite", () => {
    const h = renderHook(useNichtVerfuegbarOffen);
    act(() => h.result.current.setzeOffen(false));
    expect(h.result.current.offen).toBe(false);
    h.unmount();

    const neu = renderHook(useNichtVerfuegbarOffen);
    expect(neu.result.current.offen).toBe(false);
  });

  /*
   * Geschrieben wird genau ein Schluessel, niemals das ganze
   * Einstellungsobjekt. Sonst raeumt ein zugeklappter Block nebenbei eine
   * parallel gespeicherte Einstellung weg.
   */
  it("schreibt ausschliesslich den eigenen Schluessel", () => {
    const h = renderHook(useNichtVerfuegbarOffen);
    act(() => h.result.current.setzeOffen(false));
    expect(mocks.schreibt).toHaveBeenCalledTimes(1);
    expect(mocks.schreibt).toHaveBeenCalledWith(NICHT_VERFUEGBAR_ZU_SCHLUESSEL, true);
    act(() => h.result.current.setzeOffen(true));
    expect(mocks.schreibt).toHaveBeenLastCalledWith(NICHT_VERFUEGBAR_ZU_SCHLUESSEL, false);
  });

  it("schreibt nicht, wenn sich nichts aendert", () => {
    const h = renderHook(useNichtVerfuegbarOffen);
    act(() => h.result.current.setzeOffen(true));
    expect(mocks.schreibt).not.toHaveBeenCalled();
  });

  /*
   * Jeder Partner sieht den Block so, wie er ihn selbst eingestellt hat, und
   * nicht so, wie ihn der vorher angemeldete Nutzer verlassen hat.
   */
  it("uebernimmt beim Nutzerwechsel keine fremde Ansicht", () => {
    mocks.gespeichert.a = { [NICHT_VERFUEGBAR_ZU_SCHLUESSEL]: true };
    const h = renderHook(useNichtVerfuegbarOffen);
    expect(h.result.current.offen).toBe(false);

    mocks.userId = "b";
    mocks.currentId = "b";
    h.rerender();
    expect(h.result.current.offen).toBe(true);
  });

  it("speichert nichts, solange die Einstellungen noch laden", () => {
    mocks.bereit = false;
    const h = renderHook(useNichtVerfuegbarOffen);
    act(() => h.result.current.setzeOffen(false));
    expect(mocks.schreibt).not.toHaveBeenCalled();
    // Auf dem Bildschirm klappt der Block trotzdem zu, sonst reagiert der
    // Klick scheinbar gar nicht.
    expect(h.result.current.offen).toBe(false);
  });
});

describe("Was aus der Datenbank kommt, wird geprueft", () => {
  it("klappt nur bei einem echten true zu", () => {
    expect(leseZu(true)).toBe(true);
    for (const wert of [false, null, undefined, "true", 1, {}, []]) {
      expect(leseZu(wert)).toBe(false);
    }
  });
});
