import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Kunden-Glocken erreichen den Kunden nur über die Kontakt-Kennung.
 *
 * `notifyKunde` schlägt den Kontakt nach und schreibt an dessen Anmeldekennung
 * (`meta.authUserId`), bei einem zweiten Käufer auch an dessen. Eine andere
 * Kennung, etwa die eines Investments, findet keinen Kontakt.
 */

const KONTAKT = "11111111-1111-1111-1111-111111111111";
const INVESTMENT = "33333333-3333-3333-3333-333333333333";

const cache = vi.hoisted(() => ({
  insert: vi.fn(),
  tabellen: {} as Record<string, unknown[]>,
}));

vi.mock("./dataCache", () => ({
  cacheGet: (tabelle: string) => cache.tabellen[tabelle] ?? [],
  cacheInsert: cache.insert,
}));
vi.mock("./dbStoreHelper", () => ({
  isTestAccount: () => false,
  localGet: (_s: string, standard: unknown) => standard,
  localSet: vi.fn(),
}));
vi.mock("./pushNotifications", () => ({ showPushNotification: vi.fn() }));
vi.mock("./userSettingsCache", () => ({ getUserSetting: (_k: string, standard: unknown) => standard }));
vi.mock("./currentUser", () => ({ getCurrentUserId: () => "mitarbeiter-1" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

import { notifyKundeFinanzierungFreigegeben } from "./bellNotifications";

describe("notifyKunde: Empfänger", () => {
  beforeEach(() => {
    cache.insert.mockClear();
    cache.tabellen = {
      kontakte: [{
        id: KONTAKT,
        meta: { authUserId: "auth-kunde", person2: { authUserId: "auth-person2" }, kundenSprache: "en" },
      }],
      benachrichtigungen: [],
    };
  });

  it("schreibt mit der Kontakt-Kennung an beide Käufer, in der Profilsprache", () => {
    notifyKundeFinanzierungFreigegeben(KONTAKT, "Darlehensvertrag");

    const empfaenger = cache.insert.mock.calls.map((c) => (c[1] as { benutzer_id: string }).benutzer_id);
    expect(empfaenger).toEqual(["auth-kunde", "auth-person2"]);
    const eintrag = cache.insert.mock.calls[0][1] as { titel: string; link: string };
    expect(eintrag.titel).toBe("Financing document approved ✓");
    expect(eintrag.link).toBe("/kunde/kundenordner");
  });

  it("schreibt mit einer Investment-Kennung an niemanden", () => {
    const warnung = vi.spyOn(console, "warn").mockImplementation(() => {});
    notifyKundeFinanzierungFreigegeben(INVESTMENT, "Darlehensvertrag");

    expect(cache.insert).not.toHaveBeenCalled();
    expect(warnung).toHaveBeenCalled();
    warnung.mockRestore();
  });
});
