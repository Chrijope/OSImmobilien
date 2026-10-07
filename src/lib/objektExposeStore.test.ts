import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Der Exposé-Datensatz: Verhalten ohne Migration, Preisstand-Vergleich,
 * Zusammenführen gespeicherter Annahmen und die Kundenauswahl aus dem
 * Zwischenspeicher.
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
  exposeDatensatzPasst, ladeExposeFuer, speichereExpose, preisHatSichGeaendert, annahmenZusammenfuehren, kundeAusCache, kundenZurAuswahl, EXPOSE_MIGRATION_HINWEIS,
} = await import("@/lib/objektExposeStore");
const { standardAnnahmen } = await import("@/lib/exposeAnnahmen");

beforeEach(() => {
  db.antwort = { data: null, error: null };
  db.aufrufe = [];
  cache.tabellen = {};
});

describe("objekt_exposes ohne Migration", () => {
  it("meldet beim Laden sauber, dass die Migration fehlt", async () => {
    db.antwort = { data: null, error: { code: "42P01", message: 'relation "public.objekt_exposes" does not exist' } };
    const erg = await ladeExposeFuer("w1", null, "u1");
    expect(erg).toEqual({ expose: null, migrationFehlt: true, fehler: null });
    expect(EXPOSE_MIGRATION_HINWEIS).toContain("20260902200000_objekt_exposes.sql");
  });

  it("meldet beim Speichern sauber, dass die Migration fehlt, auch bei der PostgREST-Meldung", async () => {
    db.antwort = { data: null, error: { code: "PGRST205", message: "Could not find the table 'public.objekt_exposes' in the schema cache" } };
    const erg = await speichereExpose({ wohnungId: "w1", objektId: "o1", kontaktId: null, erstelltVon: "u1", annahmen: standardAnnahmen(2026), annahmenGesperrt: false, preisstand: 232000 });
    expect(erg.migrationFehlt).toBe(true);
    expect(erg.expose).toBeNull();
  });

  it("gibt andere Fehler als Text weiter", async () => {
    db.antwort = { data: null, error: { code: "42501", message: "new row violates row-level security policy" } };
    const erg = await ladeExposeFuer("w1", "k1", "u1");
    expect(erg.migrationFehlt).toBe(false);
    expect(erg.fehler).toContain("row-level security");
  });

  it("fragt ohne Kunden nach kontakt_id IS NULL, mit Kunden nach der Kennung", async () => {
    await ladeExposeFuer("w1", null, "u1");
    expect(db.aufrufe.some((a) => a.methode === "is" && a.args[0] === "kontakt_id")).toBe(true);
    db.aufrufe = [];
    await ladeExposeFuer("w1", "k1", "u1");
    expect(db.aufrufe.some((a) => a.methode === "eq" && a.args[0] === "kontakt_id" && a.args[1] === "k1")).toBe(true);
  });

  // Seit dem 05.10.2026 (Prüfung Codex): Die neutrale Vorschau gehört dem, der sie gespeichert hat.
  it("lädt die neutrale Vorschau nur aus den eigenen Zeilen, ohne Kennung gar nicht", async () => {
    await ladeExposeFuer("w1", null, "u1");
    expect(db.aufrufe.some((a) => a.methode === "eq" && a.args[0] === "erstellt_von" && a.args[1] === "u1")).toBe(true);
    db.aufrufe = [];
    await ladeExposeFuer("w1", "k1", "u1");
    expect(db.aufrufe.some((a) => a.args[0] === "erstellt_von")).toBe(false);
    db.aufrufe = [];
    expect((await ladeExposeFuer("w1", null, null)).expose).toBeNull();
    expect(db.aufrufe).toHaveLength(0);
  });

  it("legt beim Speichern ohne Kennung neu an, mit Preisstand", async () => {
    db.antwort = { data: { id: "e1", wohnung_id: "w1", objekt_id: "o1", kontakt_id: null, token: "abc", annahmen: {}, annahmen_gesperrt: false, sichtbare_abschnitte: [], preisstand: "232000", aufrufe: 0, erstellt_am: "2026-09-02T10:00:00Z", aktualisiert_am: "2026-09-02T10:00:00Z" }, error: null };
    const erg = await speichereExpose({ wohnungId: "w1", objektId: "o1", kontaktId: null, erstelltVon: "u1", annahmen: standardAnnahmen(2026), annahmenGesperrt: true, preisstand: 232000 });
    const insert = db.aufrufe.find((a) => a.methode === "insert");
    expect(insert).toBeDefined();
    expect(insert!.args[0]).toMatchObject({ wohnung_id: "w1", erstellt_von: "u1", preisstand: 232000, annahmen_gesperrt: true });
    expect(erg.expose?.preisstand).toBe(232000);
    expect(erg.expose?.token).toBe("abc");
  });
});

describe("Preisstand", () => {
  it("erkennt eine Preisänderung ab einem Euro Abweichung", () => {
    expect(preisHatSichGeaendert({ preisstand: 232000 }, 232000)).toBe(false);
    expect(preisHatSichGeaendert({ preisstand: 232000 }, 232000.4)).toBe(false);
    expect(preisHatSichGeaendert({ preisstand: 232000 }, 235000)).toBe(true);
    expect(preisHatSichGeaendert({ preisstand: null }, 235000)).toBe(false);
    expect(preisHatSichGeaendert(null, 235000)).toBe(false);
  });
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

describe("Datensatz aus ?expose= nur, wenn er zur Seite passt", () => {
  const seite = { objektId: "o1", wohnungId: "w1", erlaubterKundeId: "k1", eigeneId: "u1" };
  const zeile = { objekt_id: "o1", wohnung_id: "w1", kontakt_id: "k1", erstellt_von: "u2" };

  it("nimmt einen Datensatz zum erlaubten Kunden, Objekt und Einheit", () => {
    expect(exposeDatensatzPasst(zeile, seite)).toBe(true);
  });

  it("verwirft fremdes Objekt, fremde Einheit und fremden Kunden", () => {
    expect(exposeDatensatzPasst({ ...zeile, objekt_id: "o2" }, seite)).toBe(false);
    expect(exposeDatensatzPasst({ ...zeile, wohnung_id: "w2" }, seite)).toBe(false);
    expect(exposeDatensatzPasst({ ...zeile, kontakt_id: "k2" }, seite)).toBe(false);
    // Ohne erlaubten Kunden auf der Seite (etwa fremder Kunde beim Partner) zählt kein Kundendatensatz.
    expect(exposeDatensatzPasst(zeile, { ...seite, erlaubterKundeId: null })).toBe(false);
  });

  it("nimmt ohne Kundenbezug nur die eigene neutrale Vorschau", () => {
    const neutral = { ...zeile, kontakt_id: null };
    const ohneKunde = { ...seite, erlaubterKundeId: null };
    expect(exposeDatensatzPasst({ ...neutral, erstellt_von: "u1" }, ohneKunde)).toBe(true);
    expect(exposeDatensatzPasst({ ...neutral, erstellt_von: "u2" }, ohneKunde)).toBe(false);
    expect(exposeDatensatzPasst({ ...neutral, erstellt_von: "u1" }, { ...ohneKunde, eigeneId: null })).toBe(false);
    expect(exposeDatensatzPasst(null, seite)).toBe(false);
  });
});
