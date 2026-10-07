import { describe, it, expect, vi } from "vitest";

/*
 * Dieselbe Person in verschiedenen aktiven Rollen. Seit dem 27.09.2026
 * entscheidet die aktive Rolle, wen sie einladen darf, nicht die Liste aller
 * Rollen, die sie traegt: admin und inhaber alle, vertriebspartner nur die
 * eigene Downline, alle anderen niemanden.
 */
const ICH = "person-1";
const DOWNLINE = "vp-downline";
const FREMD = "vp-fremd";

vi.mock("./dataCache", () => ({
  cacheGet: (tabelle: string) => {
    if (tabelle === "user_roles") {
      return [
        // Die Person traegt mehrere Rollen.
        { user_id: ICH, role: "admin" },
        { user_id: ICH, role: "vertriebspartner" },
        { user_id: ICH, role: "backoffice" },
        { user_id: DOWNLINE, role: "vertriebspartner" },
        { user_id: FREMD, role: "vertriebspartner" },
      ];
    }
    // DOWNLINE haengt unter ICH, FREMD unter jemand anderem.
    if (tabelle === "user_settings") {
      return [
        { user_id: DOWNLINE, einstellungen: { teamleader_id: ICH } },
        { user_id: FREMD, einstellungen: { teamleader_id: "jemand-anderes" } },
      ];
    }
    return [];
  },
  cacheInsert: vi.fn(async () => undefined),
}));
vi.mock("./loadAllUsers", () => ({
  loadAllUsers: () => [
    { id: DOWNLINE, name: "Dora Downline", rolle: "vertriebspartner" },
    { id: FREMD, name: "Vera Partner", rolle: "vertriebspartner" },
  ],
}));
vi.mock("./chatStore", () => ({
  addMessage: vi.fn(async () => undefined),
  chatTeilnehmerEintragen: vi.fn(async () => undefined),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ insert: async () => ({ error: null }) }) },
}));

const { einladbareTeilnehmer, ladeTeilnehmerEin } = await import("./chatEinladung");

const chat = () => ({ id: "c1", kundeName: "Test", teilnehmer: [] }) as never;
const ids = (rolle: string) => einladbareTeilnehmer(ICH, rolle).map((u) => u.id).sort();

describe("einladbareTeilnehmer, aktive Rolle", () => {
  it("gibt admin und inhaber alle einladbaren Nutzer", () => {
    expect(ids("admin")).toEqual([DOWNLINE, FREMD].sort());
    expect(ids("inhaber")).toEqual([DOWNLINE, FREMD].sort());
  });

  it("gibt dem Vertriebspartner nur die eigene Downline", () => {
    expect(ids("vertriebspartner")).toEqual([DOWNLINE]);
  });

  it("gibt nach dem Wechsel zu backoffice niemanden, trotz Downline", () => {
    expect(ids("backoffice")).toEqual([]);
    expect(ids("kunde")).toEqual([]);
  });
});

describe("ladeTeilnehmerEin, aktive Rolle", () => {
  it("laesst die Person als Admin jeden einladbaren Nutzer hinzufuegen", async () => {
    await expect(ladeTeilnehmerEin(chat(), [FREMD], ICH, "admin")).resolves.toBe(1);
  });

  it("laesst sie als Vertriebspartner nur die Downline einladen", async () => {
    await expect(ladeTeilnehmerEin(chat(), [DOWNLINE], ICH, "vertriebspartner")).resolves.toBe(1);
    await expect(ladeTeilnehmerEin(chat(), [FREMD], ICH, "vertriebspartner")).rejects.toThrow(/Downline/);
  });

  it("verweigert ihr als Backoffice auch die eigene Downline", async () => {
    await expect(ladeTeilnehmerEin(chat(), [DOWNLINE], ICH, "backoffice")).rejects.toThrow(/Downline/);
  });
});
