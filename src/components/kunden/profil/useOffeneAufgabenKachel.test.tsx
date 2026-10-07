import { act, renderHook, waitFor } from "@testing-library/react";
import { useNaechsteAktionKachel, useOffeneAufgabenKachel, NAECHSTE_AKTION_SCHLUESSEL, OFFENE_AUFGABEN_SCHLUESSEL } from "./useOffeneAufgabenKachel";

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
  getUserSetting: (_: string, fallback: boolean) => mocks.werte[mocks.currentId] ?? fallback,
  setUserSetting: mocks.save,
}));

beforeEach(() => {
  mocks.userId = "a";
  mocks.currentId = "a";
  mocks.bereit = true;
  mocks.version = 0;
  mocks.werte = {};
  mocks.save.mockReset().mockImplementation((_: string, wert: boolean) => {
    mocks.werte[mocks.currentId] = wert;
  });
});

it("startet zugeklappt und merkt das Aufklappen", async () => {
  const h = renderHook(useOffeneAufgabenKachel);
  expect(h.result.current.offen).toBe(false);
  await act(async () => h.result.current.umschalten());
  expect(h.result.current.offen).toBe(true);
  expect(mocks.save).toHaveBeenCalledWith(OFFENE_AUFGABEN_SCHLUESSEL, true);
  h.unmount();
  const neu = renderHook(useOffeneAufgabenKachel);
  expect(neu.result.current.offen).toBe(true);
});

it("speichert nichts, solange die Einstellungen noch laden", async () => {
  mocks.bereit = false;
  mocks.werte.a = true;
  const h = renderHook(useOffeneAufgabenKachel);
  expect(h.result.current.offen).toBe(false);
  await act(async () => h.result.current.umschalten());
  expect(mocks.save).not.toHaveBeenCalled();
  mocks.bereit = true;
  h.rerender();
  await waitFor(() => expect(h.result.current.offen).toBe(true));
});

it("übernimmt beim Nutzerwechsel keine fremde Einstellung", () => {
  mocks.werte.a = true;
  const h = renderHook(useOffeneAufgabenKachel);
  expect(h.result.current.offen).toBe(true);
  mocks.userId = "b";
  mocks.currentId = "b";
  h.rerender();
  expect(h.result.current.offen).toBe(false);
});

it("merkt die Kachel Nächste Aktion unter einem eigenen Schlüssel", async () => {
  const h = renderHook(useNaechsteAktionKachel);
  expect(h.result.current.offen).toBe(false);
  await act(async () => h.result.current.umschalten());
  expect(h.result.current.offen).toBe(true);
  expect(mocks.save).toHaveBeenCalledWith(NAECHSTE_AKTION_SCHLUESSEL, true);
  expect(NAECHSTE_AKTION_SCHLUESSEL).not.toBe(OFFENE_AUFGABEN_SCHLUESSEL);
});
