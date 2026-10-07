import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useObjekteNeu } from "./useObjekteNeu";
import { ERST_GESEHEN_SCHLUESSEL, NEU_ANGELEGT_META_SCHLUESSEL, type NeuPruefbar } from "@/lib/objekteNeu";

/*
 * Der Einstellungshelfer wird nachgestellt, nicht die Datenbank. Aufbau wie
 * der Test von `useNichtVerfuegbarOffen`: Geprueft wird, wann und was der
 * Hook schreibt, und dass er nicht schreibt, wenn er nicht soll.
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

const TAG = 24 * 60 * 60 * 1000;
const JETZT = Date.parse("2026-09-23T12:00:00.000Z");
const vor = (tage: number) => new Date(JETZT - tage * TAG).toISOString();

const neuesObjekt = (id: string, tageHer = 1): NeuPruefbar => ({
  id,
  meta: { [NEU_ANGELEGT_META_SCHLUESSEL]: vor(tageHer) },
});
const bestand = (id: string): NeuPruefbar => ({ id, meta: {} });

beforeEach(() => {
  // Nur die Uhr wird angehalten, keine Zeitgeber: Die Grenzen haengen am Datum.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(JETZT);
  mocks.userId = "a";
  mocks.currentId = "a";
  mocks.bereit = true;
  mocks.version = 0;
  mocks.gespeichert = {};
  mocks.schreibt.mockReset().mockImplementation((schluessel: string, wert: unknown) => {
    mocks.gespeichert[mocks.currentId] = { ...(mocks.gespeichert[mocks.currentId] || {}), [schluessel]: wert };
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Das erste Sehen wird gemerkt", () => {
  it("zeigt ein nie gesehenes neues Objekt als neu", () => {
    const h = renderHook(useObjekteNeu);
    expect(h.result.current.neuSeit(neuesObjekt("x", 2))).toBe(JETZT - 2 * TAG);
    expect(h.result.current.neuSeit(bestand("y"))).toBeNull();
  });

  /*
   * Beim ersten Anzeigen wird genau einmal geschrieben. Ein zweiter Aufruf
   * mit denselben Objekten, wie ihn die Seite nach jedem Zeichnen macht,
   * schreibt nicht noch einmal.
   */
  it("schreibt das erste Sehen genau einmal, ausschliesslich den eigenen Schluessel", () => {
    const h = renderHook(useObjekteNeu);
    const angezeigt = [neuesObjekt("x"), bestand("y")];
    act(() => h.result.current.merkeGesehen(angezeigt));
    act(() => h.result.current.merkeGesehen(angezeigt));
    act(() => h.result.current.merkeGesehen(angezeigt));
    expect(mocks.schreibt).toHaveBeenCalledTimes(1);
    expect(mocks.schreibt).toHaveBeenCalledWith(ERST_GESEHEN_SCHLUESSEL, { x: new Date(JETZT).toISOString() });
  });

  it("zeigt das Kennzeichen nach dem Merken weiter, sieben Tage lang", () => {
    const h = renderHook(useObjekteNeu);
    act(() => h.result.current.merkeGesehen([neuesObjekt("x")]));
    expect(h.result.current.neuSeit(neuesObjekt("x"))).not.toBeNull();

    vi.setSystemTime(JETZT + 7 * TAG);
    h.rerender();
    expect(h.result.current.neuSeit(neuesObjekt("x"))).not.toBeNull();

    vi.setSystemTime(JETZT + 7 * TAG + 1);
    h.rerender();
    expect(h.result.current.neuSeit(neuesObjekt("x"))).toBeNull();
  });

  it("liest ein frueheres erstes Sehen aus den Einstellungen", () => {
    mocks.gespeichert.a = { [ERST_GESEHEN_SCHLUESSEL]: { x: vor(8) } };
    const h = renderHook(useObjekteNeu);
    expect(h.result.current.neuSeit(neuesObjekt("x", 9))).toBeNull();
    act(() => h.result.current.merkeGesehen([neuesObjekt("x", 9)]));
    expect(mocks.schreibt).not.toHaveBeenCalled();
  });

  it("schreibt nicht, wenn kein neues Objekt angezeigt wird", () => {
    const h = renderHook(useObjekteNeu);
    act(() => h.result.current.merkeGesehen([bestand("y"), neuesObjekt("alt", 31)]));
    expect(mocks.schreibt).not.toHaveBeenCalled();
  });
});

describe("Die Merkliste bleibt klein", () => {
  it("raeumt beim Schreiben Eintraege weg, die aelter als 40 Tage sind", () => {
    mocks.gespeichert.a = { [ERST_GESEHEN_SCHLUESSEL]: { alt: vor(41), frisch: vor(3) } };
    const h = renderHook(useObjekteNeu);
    act(() => h.result.current.merkeGesehen([neuesObjekt("x")]));
    expect(mocks.schreibt).toHaveBeenCalledWith(ERST_GESEHEN_SCHLUESSEL, {
      frisch: vor(3),
      x: new Date(JETZT).toISOString(),
    });
  });

  /*
   * Hat ein zweiter Tab inzwischen etwas eingetragen, geht es nicht verloren:
   * Geschrieben wird auf dem frischen Stand, nicht auf dem beim Laden gelesenen.
   */
  it("uebernimmt Eintraege, die inzwischen dazugekommen sind", () => {
    const h = renderHook(useObjekteNeu);
    mocks.gespeichert.a = { [ERST_GESEHEN_SCHLUESSEL]: { anderswo: vor(1) } };
    act(() => h.result.current.merkeGesehen([neuesObjekt("x")]));
    expect(mocks.schreibt).toHaveBeenCalledWith(ERST_GESEHEN_SCHLUESSEL, {
      anderswo: vor(1),
      x: new Date(JETZT).toISOString(),
    });
  });
});

describe("Laden und Nutzerwechsel", () => {
  it("schreibt nichts und zeigt nichts als neu, solange die Einstellungen laden", () => {
    mocks.bereit = false;
    const h = renderHook(useObjekteNeu);
    expect(h.result.current.neuSeit(neuesObjekt("x"))).toBeNull();
    act(() => h.result.current.merkeGesehen([neuesObjekt("x")]));
    expect(mocks.schreibt).not.toHaveBeenCalled();

    // Sind die Einstellungen da, wird nachgeholt.
    mocks.bereit = true;
    h.rerender();
    expect(h.result.current.neuSeit(neuesObjekt("x"))).not.toBeNull();
    act(() => h.result.current.merkeGesehen([neuesObjekt("x")]));
    expect(mocks.schreibt).toHaveBeenCalledTimes(1);
  });

  it("schreibt nicht, solange der Einstellungshelfer noch einem anderen Konto gehoert", () => {
    mocks.currentId = "alt";
    const h = renderHook(useObjekteNeu);
    act(() => h.result.current.merkeGesehen([neuesObjekt("x")]));
    expect(mocks.schreibt).not.toHaveBeenCalled();
  });

  /*
   * Jeder Nutzer hat seine eigene Frist. Was a vor acht Tagen gesehen hat,
   * ist fuer b trotzdem neu, und b bekommt nichts von a eingetragen.
   */
  it("uebernimmt beim Nutzerwechsel nichts vom vorigen Konto", () => {
    mocks.gespeichert.a = { [ERST_GESEHEN_SCHLUESSEL]: { x: vor(8), y: vor(2) } };
    const h = renderHook(useObjekteNeu);
    expect(h.result.current.neuSeit(neuesObjekt("x", 9))).toBeNull();

    mocks.userId = "b";
    mocks.currentId = "b";
    h.rerender();
    expect(h.result.current.neuSeit(neuesObjekt("x", 9))).not.toBeNull();
    act(() => h.result.current.merkeGesehen([neuesObjekt("x", 9)]));
    expect(mocks.schreibt).toHaveBeenCalledTimes(1);
    expect(mocks.gespeichert.b[ERST_GESEHEN_SCHLUESSEL]).toEqual({ x: new Date(JETZT).toISOString() });
    expect(mocks.gespeichert.a[ERST_GESEHEN_SCHLUESSEL]).toEqual({ x: vor(8), y: vor(2) });
  });
});
