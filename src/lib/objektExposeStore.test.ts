import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Der Exposé-Datensatz: Zusammenführen gespeicherter Annahmen und die
 * Kundenauswahl aus dem Zwischenspeicher.
 */

const db = vi.hoisted(() => ({
  antwort: { data: null as unknown, error: null as null | { code?: string; message?: string } },
  aufrufe: [] as Array<{ tabelle: string; methode: string; args: unknown[] }>,
}));

vi.mock("@/integrations/supabase/client", () => {
  const kette = (tabelle: string) => {
    const k: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "order", "limit", "insert", "update", "maybeSingle", "single"]) {
      k[m] = (...args: unknown[]) => { db.aufrufe.push({ tabelle, methode: m, args }); return k; };
    }
    k.then = (res: (v: unknown) => unknown) => Promise.resolve(res(db.antwort));
    return k;
  };
  return { supabase: { from: (t: string) => kette(t) } };
});

const cache = vi.hoisted(() => ({ tabellen: {} as Record<string, unknown[]> }));
vi.mock("@/lib/dataCache", () => ({
  cacheGet: (t: string) => cache.tabellen[t] ?? [],
  onCacheChange: () => () => undefined,
  cacheGetById: () => undefined,
}));

const {
  annahmenZusammenfuehren, kundeAusCache, kundenZurAuswahl,
} = await import("@/lib/objektExposeStore");
const { standardAnnahmen } = await import("@/lib/exposeAnnahmen");

beforeEach(() => {
  db.antwort = { data: null, error: null };
  db.aufrufe = [];
  cache.tabellen = {};
});

describe("Annahmen zusammenführen", () => {
  it("übernimmt nur bekannte Schlüssel mit passendem Typ", () => {
    const basis = standardAnnahmen(2026);
    const erg = annahmenZusammenfuehren(basis, { zinsProzent: 3.5, verheiratet: true, zvE: "viel" as unknown as number, fremd: 1 } as never);
    expect(erg.zinsProzent).toBe(3.5);
    expect(erg.verheiratet).toBe(true);
    expect(erg.zvE).toBe(basis.zvE);
    expect((erg as unknown as Record<string, unknown>).fremd).toBeUndefined();
    expect(annahmenZusammenfuehren(basis, null)).toBe(basis);
  });
});

describe("Kunde aus dem Zwischenspeicher", () => {
  it("findet den Kunden, aber ohne Selbstauskunft", () => {
    cache.tabellen = {
      kontakte: [{ id: "k1", vorname: "Anna", nachname: "Muster", zustaendig_id: "u1" }, { id: "k2", vorname: "", nachname: "", firma: "Muster GmbH", geloescht: true }],
      investments: [
        { id: "i1", kunde_id: "k1", erstellt_am: "2026-01-01", meta: { saData: { person1: { einkommenBruttoJahr: 80000, familienstand: "verheiratet" }, abgeschlossenAm: "2026-01-05" } } },
        { id: "i2", kunde_id: "k1", erstellt_am: "2026-03-01", meta: { saData: { person1: { einkommenBruttoJahr: 90000 }, abgeschlossenAm: "2026-03-05" } } },
      ],
    };
    const k = kundeAusCache("k1");
    expect(k?.name).toBe("Anna Muster");
    // Ein Exposé gehört zu einer Einheit, nicht zu einem Investment. Deshalb
    // hängt hier keine Selbstauskunft mehr dran (Regel in saQuelle.ts).
    // Nur die Zuständigkeit kommt dazu: Der zuständige Partner steht im
    // Exposé des Kunden als Ansprechpartner (seit 23.09.2026).
    expect(k).toEqual({ id: "k1", name: "Anna Muster", zustaendigId: "u1" });
    expect(kundeAusCache("gibt-es-nicht")).toBeNull();
    expect(kundeAusCache(null)).toBeNull();
  });

  it("bietet nur aktive Kontakte zur Auswahl an und markiert die Selbstauskunft", () => {
    cache.tabellen = {
      kontakte: [
        { id: "k1", vorname: "Zoe", nachname: "Adler" },
        { id: "k2", vorname: "Ben", nachname: "Berg", archiviert: true },
        { id: "k3", vorname: "Cem", nachname: "Can", meta: { saData: { person1: {} } } },
      ],
      investments: [{ id: "i1", kunde_id: "k1", meta: { saSnapshot: {} } }],
    };
    const liste = kundenZurAuswahl();
    expect(liste.map((k) => k.name)).toEqual(["Cem Can", "Zoe Adler"]);
    expect(liste.map((k) => k.hatSelbstauskunft)).toEqual([true, true]);
  });
});
