import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Vormerken und Reservieren im objekteStore.
 *
 * Drei Befunde aus der Planung am 23.09.2026, die hier festgehalten werden:
 *
 *   1. `reserveWohnung` setzte „reserviert“, ohne nachzusehen, ob die Einheit
 *      noch frei ist, und schrieb damit über die Reservierung eines anderen
 *      Kunden hinweg.
 *   2. Die neuen Felder der Vormerkung müssen zwischen Datenbank und Browser
 *      hin und zurück, auch durch das Löschen und Neuanlegen in `saveObjekt`.
 *   3. `updateWohnung` darf eine Vormerkung nie mit einem älteren Stand aus
 *      dem Zwischenspeicher überschreiben.
 */

const zustand = vi.hoisted(() => ({
  rows: {} as Record<string, Array<Record<string, unknown>>>,
  /** Was die Datenbank beim frischen Lesen einer Wohnung liefert. */
  frisch: null as Record<string, unknown> | null,
  updates: [] as Array<Record<string, unknown>>,
  updateFehler: null as unknown,
  rpc: { data: null as unknown, error: null as unknown },
  rpcAufrufe: [] as Array<{ name: string; args: unknown }>,
}));

vi.mock("@/lib/dataCache", () => ({
  cacheGet: (table: string) => zustand.rows[table] || [],
  cacheFilter: (table: string, filter: (row: Record<string, unknown>) => boolean) => (zustand.rows[table] || []).filter(filter),
  cacheReload: async () => {},
  cacheInsert: async () => ({}), cacheUpdate: async () => true, cacheDelete: async () => true,
  cacheSet: () => {}, cacheUpsert: async () => ({}),
}));
vi.mock("@/lib/dbStoreHelper", () => ({ isTestAccount: () => false, localGet: () => [], localSet: () => {} }));
vi.mock("@/lib/userSettingsCache", () => ({ getUserSetting: (_k: string, f: unknown) => f, setUserSetting: () => {} }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (name: string, args: unknown) => {
      zustand.rpcAufrufe.push({ name, args });
      return zustand.rpc;
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: zustand.frisch, error: null }) }) }),
      // `.select("id")` seit dem 30.09.2026: null geänderte Zeilen gelten als Ablehnung.
      update: (werte: Record<string, unknown>) => ({
        eq: () => ({
          select: async () => {
            zustand.updates.push(werte);
            return zustand.updateFehler
              ? { data: null, error: zustand.updateFehler }
              : { data: [{ id: "w1" }], error: null };
          },
        }),
      }),
    }),
  },
}));

const {
  EinheitVergebenFehler, getObjekte, reserveWohnung, updateWohnung, vormerkeEinheit, wohnungToDbRow,
} = await import("@/lib/objekteStore");

const VORMERKUNG = {
  vorgemerkt_bis: "2026-09-23T12:30:00.000Z",
  vorgemerkt_kunde_id: "k-1",
  vorgemerkt_kunde_name: "Anna Beispiel",
  vorgemerkt_berater_name: "Paul Partner",
  vorgemerkt_von: "nutzer-paul",
  reserviert_von: null,
};

function einheit(extra: Record<string, unknown> = {}) {
  zustand.rows.objekte = [{ id: "o1", titel: "Haus", global_objekt: false }];
  zustand.rows.wohnungen = [{ id: "w1", objekt_id: "o1", we_nr: "6", status: "frei", kunde_id: null, meta: {}, ...extra }];
  zustand.rows.wohnungs_bilder = [];
  zustand.rows.wohnungs_dokumente = [];
}

beforeEach(() => {
  zustand.frisch = null;
  zustand.updates = [];
  zustand.updateFehler = null;
  zustand.rpc = { data: null, error: null };
  zustand.rpcAufrufe = [];
  einheit();
});

describe("Die Felder der Vormerkung zwischen Datenbank und Browser", () => {
  it("liest alle Felder mit den abgesprochenen Namen", () => {
    einheit({ ...VORMERKUNG, reserviert_von: "nutzer-x" });
    const w = getObjekte()[0].wohnungen[0];
    expect(w.vorgemerktBis).toBe(VORMERKUNG.vorgemerkt_bis);
    expect(w.vorgemerktKundeId).toBe("k-1");
    expect(w.vorgemerktKundeName).toBe("Anna Beispiel");
    expect(w.vorgemerktBeraterName).toBe("Paul Partner");
    expect(w.vorgemerktVon).toBe("nutzer-paul");
    expect(w.reserviertVon).toBe("nutzer-x");
    // Regel 5: Während der Vormerkung bleibt die Einheit frei.
    expect(w.status).toBe("frei");
  });

  it("lässt die Felder leer, solange die Migration fehlt", () => {
    const w = getObjekte()[0].wohnungen[0];
    expect(w.vorgemerktBis).toBeUndefined();
    expect(w.reserviertVon).toBeUndefined();
  });

  it("schreibt eine Vormerkung beim Neuanlegen zurück, damit `saveObjekt` sie nicht verliert", () => {
    einheit(VORMERKUNG);
    const zeile = wohnungToDbRow(getObjekte()[0].wohnungen[0], "o1");
    expect(zeile.vorgemerkt_bis).toBe(VORMERKUNG.vorgemerkt_bis);
    expect(zeile.vorgemerkt_kunde_id).toBe("k-1");
    expect(zeile.vorgemerkt_von).toBe("nutzer-paul");
  });

  it("schreibt ohne Vormerkung keine der neuen Spalten, sonst scheitert das Einfügen ohne Migration", () => {
    const zeile = wohnungToDbRow(getObjekte()[0].wohnungen[0], "o1");
    for (const spalte of ["vorgemerkt_bis", "vorgemerkt_kunde_id", "vorgemerkt_kunde_name", "vorgemerkt_berater_name", "vorgemerkt_von", "reserviert_von"]) {
      expect(spalte in zeile).toBe(false);
    }
  });

  it("überschreibt in `updateWohnung` nie eine Vormerkung aus dem Zwischenspeicher", async () => {
    einheit(VORMERKUNG);
    await updateWohnung("o1", "w1", { etage: "2" });
    expect(zustand.updates).toHaveLength(1);
    for (const spalte of ["vorgemerkt_bis", "vorgemerkt_kunde_id", "vorgemerkt_von", "reserviert_von"]) {
      expect(spalte in zustand.updates[0]).toBe(false);
    }
  });

  it("gibt den Fehler der Datenbank zurück, statt ihn zu verschlucken", async () => {
    zustand.updateFehler = { message: "abgelehnt" };
    await expect(updateWohnung("o1", "w1", { etage: "2" })).resolves.toEqual({ message: "abgelehnt" });
  });
});

describe("reserveWohnung prüft vorher, ob die Einheit noch frei ist", () => {
  it("reserviert eine freie Einheit", async () => {
    zustand.frisch = { status: "frei", kunde_id: null };
    await reserveWohnung("o1", "w1", "k-1", "Anna Beispiel");
    expect(zustand.updates[0]).toMatchObject({ status: "reserviert", kunde_id: "k-1" });
  });

  it("wirft bei einer Einheit, die schon einem anderen Kunden gehört, und schreibt nichts", async () => {
    zustand.frisch = { status: "reserviert", kunde_id: "k-9" };
    await expect(reserveWohnung("o1", "w1", "k-1", "Anna Beispiel")).rejects.toBeInstanceOf(EinheitVergebenFehler);
    expect(zustand.updates).toHaveLength(0);
  });

  it("vertraut dem frischen Stand, nicht dem veralteten Zwischenspeicher", async () => {
    // Im Zwischenspeicher noch frei, in der Datenbank schon vergeben.
    zustand.frisch = { status: "reserviert", kunde_id: "k-9" };
    await expect(reserveWohnung("o1", "w1", "k-1", "Anna")).rejects.toMatchObject({ grund: "vergeben" });
  });

  it("lässt dieselbe Reservierung für denselben Kunden zu", async () => {
    zustand.frisch = { status: "reserviert", kunde_id: "k-1" };
    await reserveWohnung("o1", "w1", "k-1", "Anna Beispiel");
    expect(zustand.updates).toHaveLength(1);
  });

  it("reserviert nie eine Einheit eines Globalobjekts", async () => {
    zustand.rows.objekte = [{ id: "o1", titel: "Haus", global_objekt: true }];
    zustand.frisch = { status: "frei", kunde_id: null };
    await expect(reserveWohnung("o1", "w1", "k-1", "Anna")).rejects.toMatchObject({ grund: "globalobjekt" });
    expect(zustand.updates).toHaveLength(0);
  });

  it("wirft, wenn die Datenbank ablehnt, statt Erfolg vorzutäuschen", async () => {
    zustand.frisch = { status: "frei", kunde_id: null };
    zustand.updateFehler = { message: "Reservieren duerfen nur Admin, Inhaber, Vertriebsleitung und Vertriebspartner." };
    await expect(reserveWohnung("o1", "w1", "k-1", "Anna")).rejects.toThrow(/Reservieren duerfen nur/);
  });
});

describe("vormerkeEinheit fragt die Datenbank", () => {
  it("ruft `vormerke_einheit` mit Einheit und Kunde", async () => {
    zustand.rpc = { data: { ok: true, grund: "vorgemerkt", vorgemerkt_bis: VORMERKUNG.vorgemerkt_bis }, error: null };
    const e = await vormerkeEinheit("w1", "k-1");
    expect(zustand.rpcAufrufe).toEqual([{ name: "vormerke_einheit", args: { p_wohnung_id: "w1", p_kontakt_id: "k-1" } }]);
    expect(e).toMatchObject({ ok: true, grund: "vorgemerkt", vorgemerktBis: VORMERKUNG.vorgemerkt_bis });
  });

  it("gibt die Ablehnung weiter", async () => {
    zustand.rpc = { data: { ok: false, grund: "vergeben" }, error: null };
    expect(await vormerkeEinheit("w1", "k-1")).toMatchObject({ ok: false, grund: "vergeben" });
  });

  it("meldet die fehlende Migration als eigenen Fall, damit der Rückfallweg greift", async () => {
    const warnung = vi.spyOn(console, "warn").mockImplementation(() => {});
    zustand.rpc = { data: null, error: { code: "PGRST202", message: "Could not find the function public.vormerke_einheit" } };
    expect(await vormerkeEinheit("w1", "k-1")).toEqual({ ok: false, grund: "ohne_migration" });
    expect(warnung).toHaveBeenCalled();
    warnung.mockRestore();
  });

  it("meldet jeden anderen Fehler als Fehler und nie als Erfolg", async () => {
    const fehler = vi.spyOn(console, "error").mockImplementation(() => {});
    zustand.rpc = { data: null, error: { code: "500", message: "Server kaputt" } };
    expect(await vormerkeEinheit("w1", "k-1")).toMatchObject({ ok: false, grund: "fehler", fehlerText: "Server kaputt" });
    fehler.mockRestore();
  });
});
