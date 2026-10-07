/**
 * Objekt löschen (04.10.2026): dieselbe Sperre wie bei einer einzelnen
 * Einheit, jeder Schritt geprüft, Erfolg erst nach der Antwort.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const stand = vi.hoisted(() => ({
  objekt: { id: "o-1", belegung: "frei", belegung_kunde_id: null } as Record<string, unknown> | null,
  einheiten: [] as Record<string, unknown>[],
  investments: [] as Record<string, unknown>[],
  offeneLinks: new Map<string, number>(),
  geloeschteObjekte: [] as string[],
  loeschAntwort: null as null | { data: unknown; error: unknown },
  loeschAufrufe: [] as string[],
  // Standard: Funktion fehlt noch, der Browserweg greift.
  rpcAntwort: { data: null, error: { code: "PGRST202", message: "Could not find the function" } } as { data: unknown; error: unknown },
  rpcAufrufe: [] as Array<{ name: string; args: unknown }>,
}));

function abfrage(tabelle: string) {
  let art: "lesen" | "loeschen" = "lesen";
  let einzeln = false;
  const kette: any = {
    select: () => kette,
    eq: () => kette,
    in: () => kette,
    delete: () => { art = "loeschen"; stand.loeschAufrufe.push(tabelle); return kette; },
    maybeSingle: () => { einzeln = true; return kette; },
    then: (fertig: (wert: unknown) => unknown) => {
      if (art === "loeschen") {
        const antwort = stand.loeschAntwort ?? { data: [{ id: "o-1" }], error: null };
        return Promise.resolve(antwort).then(fertig);
      }
      const daten = tabelle === "objekte" ? stand.objekt
        : tabelle === "wohnungen" ? stand.einheiten
        : tabelle === "investments" ? stand.investments
        : [];
      return Promise.resolve({ data: einzeln ? daten : daten, error: null }).then(fertig);
    },
  };
  return kette;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => abfrage(t),
    rpc: async (name: string, args: unknown) => {
      stand.rpcAufrufe.push({ name, args });
      return stand.rpcAntwort;
    },
  },
}));
vi.mock("./objektExposeStore", () => ({
  ladeOffeneLinksZuEinheiten: async () => ({ jeEinheit: stand.offeneLinks, fehler: null }),
}));
vi.mock("./dataCache", async (original) => ({
  ...(await original<typeof import("./dataCache")>()),
  cacheGet: () => [],
  cacheReload: async () => {},
}));

const { deleteObjekt } = await import("./objekteStore");

beforeEach(() => {
  stand.objekt = { id: "o-1", belegung: "frei", belegung_kunde_id: null };
  stand.einheiten = [{ id: "w-1", we_nr: "1", status: "frei", meta: {} }];
  stand.investments = [];
  stand.offeneLinks = new Map();
  stand.loeschAntwort = null;
  stand.loeschAufrufe = [];
  stand.rpcAntwort = { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
  stand.rpcAufrufe = [];
});

describe("deleteObjekt über die Datenbankfunktion", () => {
  it("ruft objekt_loeschen auf und löscht nicht selbst", async () => {
    stand.rpcAntwort = { data: { geloescht: true }, error: null };
    expect(await deleteObjekt("o-1")).toEqual({ geloescht: true, grund: null });
    expect(stand.rpcAufrufe).toEqual([{ name: "objekt_loeschen", args: { _objekt_id: "o-1" } }]);
    expect(stand.loeschAufrufe).toEqual([]);
  });
  it("gibt den Satz der Datenbank als Grund weiter, ohne Rückfall", async () => {
    stand.rpcAntwort = { data: null, error: { code: "P0001", message: "Das Objekt kann nicht gelöscht werden, weil Einheiten gebunden sind: Einheit „2“ (reserviert)." } };
    const ergebnis = await deleteObjekt("o-1");
    expect(ergebnis.geloescht).toBe(false);
    expect(ergebnis.grund).toContain("Einheit „2“ (reserviert)");
    expect(stand.loeschAufrufe).toEqual([]);
  });
});

describe("Migration 20261004193000", () => {
  const DATEI = "20261004193000_objekt_loeschen.sql";
  const SQL = readFileSync(`supabase/migrations/${DATEI}`, "utf8");
  it("sperrt Objekt und Einheiten, prüft Recht und Bezüge vor dem Löschen", () => {
    expect(SQL).toContain("FROM public.objekte o WHERE o.id = _objekt_id FOR UPDATE");
    expect(SQL).toContain("FROM public.wohnungen w WHERE w.objekt_id = _objekt_id FOR UPDATE");
    expect(SQL).toContain("public.is_admin_role(_uid)");
    // NULL-sicher: ohne erstellt_von darf kein Objektpartner loeschen
    expect(SQL).toContain("coalesce(public.is_admin_role(_uid), false)");
    expect(SQL).toContain("coalesce(public.has_role(_uid, 'objektpartner'::public.app_role), false)");
    expect(SQL).toContain("AND (_o ->> 'erstellt_von') IS NOT NULL");
  });
  it("Auslöser auf objekte und wohnungen prüfen jedes Löschen aus dem Browser", () => {
    expect(SQL).toContain("BEFORE DELETE ON public.objekte");
    expect(SQL).toContain("BEFORE DELETE ON public.wohnungen");
    expect(SQL).toContain("->> 'role',");
    expect(SQL).toMatch(/\) IN \('authenticated', 'anon'\)/);
    expect(SQL.match(/IF NOT public\.loeschen_aus_dem_browser\(\) THEN/g)?.length).toBe(2);
    // RPC und Ausloeser nutzen dieselbe Regel
    expect(SQL.match(/public\.objekt_loesch_grund\(/g)?.length).toBeGreaterThanOrEqual(3);
    expect(SQL).toContain("_grund := public.einheit_loesch_grund(to_jsonb(OLD));");
    for (const teil of ["'verkauft'", "'reserviert', 'gesetzt'", "kunde_id", "vorgemerkt_bis", "investagonId", "(i.meta ->> 'wohnungId')", "(i.meta ->> 'objektId')", "zurueckgezogen_am", "belegung_kunde_id"]) {
      expect(SQL).toContain(teil);
    }
    expect(SQL.indexOf("FOR UPDATE")).toBeLessThan(SQL.indexOf("DELETE FROM public.objekte"));
    expect(SQL).toContain("SECURITY DEFINER");
    expect(SQL).toContain("REVOKE ALL ON FUNCTION public.objekt_loeschen(uuid) FROM public, anon;");
  });
  it("liegt im Eingangskorb und in der Sammeldatei", () => {
    expect(readFileSync(`supabase/migrations-inbox/${DATEI}`, "utf8")).toBe(SQL);
    expect(readFileSync("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql", "utf8")).toContain(SQL.trim());
    expect(readFileSync("supabase/migrations-inbox/99_PRUEFUNG.sql", "utf8")).toContain("78.1");
    expect(readFileSync("supabase/migrations-inbox/99_PRUEFUNG.sql", "utf8")).toContain("78.2");
  });
});

describe("deleteObjekt", () => {
  it("löscht ein freies Objekt in einem Schritt über die Objektzeile", async () => {
    expect(await deleteObjekt("o-1")).toEqual({ geloescht: true, grund: null });
    expect(stand.loeschAufrufe).toEqual(["objekte"]);
  });

  for (const [fall, einheit] of [
    ["reserviert", { status: "reserviert" }],
    ["verkauft", { status: "verkauft" }],
    ["mit Kunde", { kunde_name: "X" }],
  ] as const) {
    it(`sperrt bei einer Einheit ${fall} und löscht nichts`, async () => {
      stand.einheiten = [{ id: "w-1", we_nr: "1", status: "frei", meta: {} }, { id: "w-2", we_nr: "2", meta: {}, ...einheit }];
      const ergebnis = await deleteObjekt("o-1");
      expect(ergebnis.geloescht).toBe(false);
      expect(ergebnis.grund).toMatch(/Einheiten gebunden/);
      expect(stand.loeschAufrufe).toEqual([]);
    });
  }

  it("sperrt, wenn ein Investment auf eine Einheit zeigt", async () => {
    stand.investments = [{ id: "i-1", meta: { wohnungId: "w-1" } }];
    expect((await deleteObjekt("o-1")).geloescht).toBe(false);
    expect(stand.loeschAufrufe).toEqual([]);
  });

  it("sperrt, wenn das ganze Haus belegt ist", async () => {
    stand.objekt = { id: "o-1", belegung: "reserviert", belegung_kunde_id: "k-1" };
    const ergebnis = await deleteObjekt("o-1");
    expect(ergebnis.grund).toMatch(/ganze Haus/);
    expect(stand.loeschAufrufe).toEqual([]);
  });

  it("meldet ein still abgelehntes Löschen als Fehler", async () => {
    stand.loeschAntwort = { data: [], error: null };
    const ergebnis = await deleteObjekt("o-1");
    expect(ergebnis.geloescht).toBe(false);
    expect(ergebnis.grund).toMatch(/abgelehnt/);
  });

  it("meldet einen Datenbankfehler beim Löschen", async () => {
    stand.loeschAntwort = { data: null, error: { message: "boom" } };
    expect((await deleteObjekt("o-1")).geloescht).toBe(false);
  });
});

describe("Seiten melden Erfolg erst nach dem Ergebnis", () => {
  for (const datei of ["src/pages/Objekte.tsx", "src/pages/ObjektDetail.tsx"]) {
    it(datei, () => {
      const s = readFileSync(datei, "utf8");
      expect(s).toContain("await deleteObjekt(");
      expect(s).toContain("ergebnis.geloescht");
    });
  }
});
