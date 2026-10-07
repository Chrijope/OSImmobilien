import { describe, it, expect, vi, beforeEach } from "vitest";

/*
 * Nachgestellt werden Zwischenspeicher und Datenbankaufruf. Geprueft wird,
 * dass `patchUserSetting` nur den Teil schickt und den Zwischenspeicher so
 * mischt wie `public.jsonb_deep_merge`.
 */
const mocks = vi.hoisted(() => ({
  zeilen: [] as Array<Record<string, unknown>>,
  rpc: vi.fn(),
  reload: vi.fn(),
}));
vi.mock("./dataCache", () => ({
  cacheGet: () => mocks.zeilen,
  cacheUpdate: vi.fn(),
  cacheReload: mocks.reload,
}));
vi.mock("./currentUser", () => ({ getCurrentUserId: () => "u1" }));
vi.mock("./dbStoreHelper", () => ({ isTestAccount: () => false }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));

const { mischeWieDatenbank, patchUserSetting, getUserSetting } = await import("./userSettingsCache");

beforeEach(() => {
  mocks.zeilen.length = 0;
  mocks.rpc.mockReset().mockResolvedValue({ error: null });
  mocks.reload.mockReset();
});

describe("mischeWieDatenbank", () => {
  it("mischt Objekte tief und lässt Fehlendes stehen", () => {
    expect(mischeWieDatenbank({ a: { x: true, y: false }, b: 1 }, { a: { y: true } })).toEqual({
      a: { x: true, y: true },
      b: 1,
    });
  });

  it("überschreibt mit null, statt zu löschen", () => {
    expect(mischeWieDatenbank({ a: { x: true } }, { a: { x: null } })).toEqual({ a: { x: null } });
  });

  it("ersetzt, wenn eine Seite kein Objekt ist", () => {
    expect(mischeWieDatenbank(["alt"], { a: 1 })).toEqual({ a: 1 });
    expect(mischeWieDatenbank({ a: 1 }, "neu")).toBe("neu");
    expect(mischeWieDatenbank(undefined, { a: 1 })).toEqual({ a: 1 });
  });
});

describe("patchUserSetting", () => {
  it("schickt nur den Teil und mischt den Zwischenspeicher", async () => {
    mocks.zeilen.push({ user_id: "u1", einstellungen: { k: { inv1: { notar: false } }, anderes: 5 } });
    const ok = await patchUserSetting("k", { inv2: { bonitaet: false } });
    expect(ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("merge_user_settings", {
      _user_id: "u1",
      _patch: { k: { inv2: { bonitaet: false } } },
    });
    expect(getUserSetting("k", null)).toEqual({ inv1: { notar: false }, inv2: { bonitaet: false } });
    expect(getUserSetting("anderes", null)).toBe(5);
  });

  it("meldet einen abgelehnten Schreibvorgang", async () => {
    mocks.zeilen.push({ user_id: "u1", einstellungen: {} });
    mocks.rpc.mockResolvedValue({ error: { message: "nein" } });
    const fehler = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await patchUserSetting("k", { inv1: { notar: false } })).toBe(false);
    fehler.mockRestore();
  });

  it("legt ohne Zeile eine vorläufige an und lädt danach nach", async () => {
    expect(await patchUserSetting("k", { inv1: { notar: false } })).toBe(true);
    expect(getUserSetting("k", null)).toEqual({ inv1: { notar: false } });
    expect(mocks.reload).toHaveBeenCalledWith("user_settings");
  });
});
