import { act, renderHook, waitFor } from "@testing-library/react";
import { useNaechsteAktionKachel, NAECHSTE_AKTION_SCHLUESSEL, OFFENE_AUFGABEN_SCHLUESSEL } from "./useOffeneAufgabenKachel";

// Einstellungen je Nutzer und Schluessel, wie in der Tabelle user_settings.
const mocks = vi.hoisted(() => ({
  userId: "a",
  currentId: "a",
  bereit: true,
  version: 0,
  werte: {} as Record<string, boolean>,
  save: vi.fn(),
}));
vi.mock("@/contexts/UserContext", () => ({ useUser: () => ({ authUser: { id: mocks.userId } }) }));
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => mocks.bereit }));
vi.mock("@/hooks/useLiveData", () => ({ useLiveVersion: () => mocks.version }));
vi.mock("@/lib/currentUser", () => ({ getCurrentUserId: () => mocks.currentId }));
vi.mock("@/lib/userSettingsCache", () => ({
  getUserSetting: (key: string, fallback: unknown) => mocks.werte[`${mocks.currentId}|${key}`] ?? fallback,
  setUserSetting: mocks.save,
}));

const setze = (user: string, key: string, wert: boolean) => { mocks.werte[`${user}|${key}`] = wert; };

beforeEach(() => {
  mocks.userId = "a";
  mocks.currentId = "a";
  mocks.bereit = true;
  mocks.version = 0;
  mocks.werte = {};
  mocks.save.mockReset().mockImplementation((key: string, wert: boolean) => setze(mocks.currentId, key, wert));
});

it("startet zugeklappt und merkt das Aufklappen unter dem eigenen Schlüssel", async () => {
  const h = renderHook(useNaechsteAktionKachel);
  expect(h.result.current.offen).toBe(false);
  await act(async () => h.result.current.umschalten());
  expect(h.result.current.offen).toBe(true);
  expect(mocks.save).toHaveBeenCalledWith(NAECHSTE_AKTION_SCHLUESSEL, true);
  h.unmount();
  const neu = renderHook(useNaechsteAktionKachel);
  expect(neu.result.current.offen).toBe(true);
});

it("speichert nichts, solange die Einstellungen noch laden", async () => {
  mocks.bereit = false;
  setze("a", NAECHSTE_AKTION_SCHLUESSEL, true);
  const h = renderHook(useNaechsteAktionKachel);
  expect(h.result.current.offen).toBe(false);
  await act(async () => h.result.current.umschalten());
  expect(mocks.save).not.toHaveBeenCalled();
  mocks.bereit = true;
  h.rerender();
  await waitFor(() => expect(h.result.current.offen).toBe(true));
});

it("übernimmt beim Nutzerwechsel keine fremde Einstellung", () => {
  setze("a", NAECHSTE_AKTION_SCHLUESSEL, true);
  const h = renderHook(useNaechsteAktionKachel);
  expect(h.result.current.offen).toBe(true);
  mocks.userId = "b";
  mocks.currentId = "b";
  h.rerender();
  expect(h.result.current.offen).toBe(false);
});

describe("Rückfall auf den Schalter der früheren Kachel Offene Aufgaben", () => {
  it("öffnet die Kachel, wenn die alte Liste offen war und die neue nie geschaltet wurde", () => {
    setze("a", OFFENE_AUFGABEN_SCHLUESSEL, true);
    const h = renderHook(useNaechsteAktionKachel);
    expect(h.result.current.offen).toBe(true);
  });

  it("der eigene Schlüssel schlägt den alten, und der alte wird nie geschrieben", async () => {
    setze("a", OFFENE_AUFGABEN_SCHLUESSEL, true);
    setze("a", NAECHSTE_AKTION_SCHLUESSEL, false);
    const h = renderHook(useNaechsteAktionKachel);
    expect(h.result.current.offen).toBe(false);
    await act(async () => h.result.current.umschalten());
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.save).toHaveBeenCalledWith(NAECHSTE_AKTION_SCHLUESSEL, true);
  });
});
