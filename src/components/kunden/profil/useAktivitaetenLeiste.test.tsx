import { act, renderHook, waitFor } from "@testing-library/react";
import { useAktivitaetenLeiste, AKTIVITAETEN_LEISTE_SCHLUESSEL } from "./useAktivitaetenLeiste";
const mocks = vi.hoisted(() => ({ userId: "a", currentId: "a", bereit: true, version: 0, werte: {} as Record<string, boolean>, save: vi.fn(), toast: vi.fn() }));
vi.mock("@/contexts/UserContext", () => ({ useUser: () => ({ authUser: { id: mocks.userId } }) }));
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => mocks.bereit }));
vi.mock("@/hooks/useLiveData", () => ({ useLiveVersion: () => mocks.version }));
vi.mock("@/lib/currentUser", () => ({ getCurrentUserId: () => mocks.currentId }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/lib/userSettingsCache", () => ({ getUserSetting: (_: string, fallback: boolean) => mocks.werte[mocks.currentId] ?? fallback, setUserSettingSicher: mocks.save }));
beforeEach(() => { mocks.userId = "a"; mocks.currentId = "a"; mocks.bereit = true; mocks.version = 0; mocks.werte = {}; mocks.toast.mockReset(); mocks.save.mockReset().mockImplementation(async (_: string, wert: boolean) => { mocks.werte[mocks.currentId] = wert; }); });
it("speichert nur die Ansicht und liest sie beim erneuten Öffnen", async () => {
  const h = renderHook(useAktivitaetenLeiste);
  expect(h.result.current.offen).toBe(true);
  await act(() => h.result.current.setzen(false));
  expect(mocks.save).toHaveBeenCalledWith(AKTIVITAETEN_LEISTE_SCHLUESSEL, false);
  h.unmount();
  const neu = renderHook(useAktivitaetenLeiste);
  expect(neu.result.current.offen).toBe(false);
});
it("überschreibt keine noch ladende Entscheidung mit einem Standard", async () => {
  mocks.bereit = false; mocks.werte.a = false;
  const h = renderHook(useAktivitaetenLeiste);
  expect(h.result.current.offen).toBe(true);
  expect(mocks.save).not.toHaveBeenCalled();
  mocks.bereit = true; h.rerender();
  await waitFor(() => expect(h.result.current.offen).toBe(false));
  expect(mocks.save).not.toHaveBeenCalled();
});
it("übernimmt beim Nutzerwechsel keine fremde Einstellung", () => {
  mocks.werte.a = false;
  const h = renderHook(useAktivitaetenLeiste);
  expect(h.result.current.offen).toBe(false);
  mocks.userId = "b"; mocks.currentId = "b"; h.rerender();
  expect(h.result.current.offen).toBe(true);
});
it("stellt nach einem Speicherfehler die vorherige Ansicht wieder her", async () => {
  mocks.save.mockRejectedValue(new Error("offline"));
  const h = renderHook(useAktivitaetenLeiste);
  await act(() => h.result.current.setzen(false));
  expect(h.result.current.offen).toBe(true);
  expect(mocks.toast).toHaveBeenCalled();
  expect(h.result.current.speichert).toBe(false);
});
