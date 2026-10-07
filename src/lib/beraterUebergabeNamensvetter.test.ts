import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Lead-Uebergabe, wenn zwei Partner gleich heissen.
 *
 * Vorher suchte `reassignBerater` die Kennung ueber den Namen und nahm den
 * ersten Treffer. Der Lead, die Glocke und die Mail landeten dann womoeglich
 * beim Namensvetter. Jetzt gilt die mitgegebene Kennung, und ein doppelter
 * Name ohne Kennung bricht ab, bevor etwas geschrieben ist.
 */

interface FakeKontakt {
  id: string;
  vorname: string;
  nachname: string;
  berater?: string;
  zustaendig_id?: string;
  erstellt_am?: string;
  beraterHistorie?: any[];
}

const kontakte = new Map<string, FakeKontakt>();
const glocken: string[] = [];

vi.mock("@/lib/kundenStore", () => ({
  getKontaktById: (id: string) => kontakte.get(id) || null,
  updateKontakt: (id: string, patch: Record<string, unknown>) => {
    const vorher = kontakte.get(id);
    if (vorher) kontakte.set(id, { ...vorher, ...patch } as FakeKontakt);
    return Promise.resolve(true);
  },
  kontaktZustaendigkeitGeleert: async () => true,
}));

vi.mock("@/lib/loadAllUsers", () => ({
  loadAllUsers: () => [
    { id: "max-1", name: "Max Muster" },
    { id: "max-2", name: "Max Muster" },
    { id: "erika", name: "Erika Beispiel" },
  ],
}));

vi.mock("@/lib/bellNotifications", () => ({
  notifyLeadZugewiesen: (_l: string, _n: string, beraterId: string) => { glocken.push(beraterId); },
  notifyLeadAbgegeben: () => {},
  notifyRueckgabeAbReservierung: () => {},
  LEITUNG_ROLLEN: ["admin", "inhaber", "vertriebsleiter"],
}));

/** Die Glocken gehen erst nach der Antwort der Datenbank raus (29.09.2026). */
const gemeldet = () => new Promise((r) => setTimeout(r, 0));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: async () => ({ data: null, error: null }) } },
}));

const { reassignBerater, reassignBeraterBulk, releaseBeraterToPool, NAME_MEHRDEUTIG_MELDUNG } = await import("./beraterHistorie");

beforeEach(() => {
  kontakte.clear();
  glocken.length = 0;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("Uebergabe bei gleichnamigen Partnern", () => {
  it("haengt den Lead und die Glocke an die mitgegebene Kennung", async () => {
    kontakte.set("k1", { id: "k1", vorname: "Lea", nachname: "Kunde" });
    expect(reassignBerater("k1", "Max Muster", { zielId: "max-2", changedById: "chef" })).toBe(true);
    expect(kontakte.get("k1")?.zustaendig_id).toBe("max-2");
    await gemeldet();
    expect(glocken).toEqual(["max-2"]);
    expect(kontakte.get("k1")?.beraterHistorie?.at(-1)).toMatchObject({ name: "Max Muster", id: "max-2" });
  });

  it("ordnet einen doppelten Namen ohne Kennung nicht zu und schreibt nichts", () => {
    kontakte.set("k1", { id: "k1", vorname: "Lea", nachname: "Kunde" });
    expect(() => reassignBerater("k1", "Max Muster", { changedById: "chef" })).toThrow(NAME_MEHRDEUTIG_MELDUNG);
    expect(kontakte.get("k1")?.zustaendig_id).toBeUndefined();
    expect(glocken).toEqual([]);
  });

  it("ordnet einen eindeutigen Namen ohne Kennung wie bisher zu", async () => {
    kontakte.set("k1", { id: "k1", vorname: "Lea", nachname: "Kunde" });
    expect(reassignBerater("k1", "Erika Beispiel", { changedById: "chef" })).toBe(true);
    expect(kontakte.get("k1")?.zustaendig_id).toBe("erika");
    await gemeldet();
    expect(glocken).toEqual(["erika"]);
  });

  it("verteilt in der Sammelzuweisung an die Kennung", () => {
    kontakte.set("k1", { id: "k1", vorname: "Lea", nachname: "Eins" });
    kontakte.set("k2", { id: "k2", vorname: "Lea", nachname: "Zwei" });
    expect(reassignBeraterBulk(["k1", "k2"], "Max Muster", { zielId: "max-1", changedById: "chef" })).toBe(2);
    expect(kontakte.get("k1")?.zustaendig_id).toBe("max-1");
    expect(kontakte.get("k2")?.zustaendig_id).toBe("max-1");
  });

  it("schliesst in der Historie den Eintrag der Kennung, nicht den des Namensvetters", () => {
    kontakte.set("k1", {
      id: "k1", vorname: "Lea", nachname: "Kunde", berater: "Max Muster", zustaendig_id: "max-2",
      beraterHistorie: [
        { name: "Max Muster", id: "max-1", von: "2026-01-01T00:00:00.000Z" },
        { name: "Max Muster", id: "max-2", von: "2026-02-01T00:00:00.000Z" },
      ],
    });
    // Der aeltere offene Eintrag gehoert max-1 und soll offen bleiben.
    reassignBerater("k1", "Erika Beispiel", { zielId: "erika", changedById: "chef", grund: { key: "auslastung" } });
    const h = kontakte.get("k1")?.beraterHistorie || [];
    expect(h[0].bis).toBeUndefined();
    expect(h[1].bis).toBeTruthy();
  });

  it("gibt an den Pool zurueck und schliesst den Eintrag ueber die Kennung", () => {
    kontakte.set("k1", {
      id: "k1", vorname: "Lea", nachname: "Kunde", berater: "Max Muster", zustaendig_id: "max-2",
      beraterHistorie: [{ name: "Max Muster", id: "max-2", von: "2026-02-01T00:00:00.000Z" }],
    });
    expect(releaseBeraterToPool("k1", { changedById: "chef" })).toBe(true);
    expect(kontakte.get("k1")?.zustaendig_id).toBe("");
    expect(kontakte.get("k1")?.beraterHistorie?.[0].bis).toBeTruthy();
  });
});
