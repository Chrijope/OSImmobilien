/**
 * Kundensprache (Plan Kundensprache vom 25.09.2026, Etappe 0).
 *
 * Geprüft werden die Regeln aus `_shared/kunden-sprache.ts` (Browser und
 * Edge Function lesen dieselbe Datei), das Lesen und Setzen im Browser und
 * die einmalige Rückfrage vor dem ersten Versand:
 *   - fragt nur, wenn noch nie bewusst gewählt wurde,
 *   - speichert die Wahl,
 *   - blockiert den Versand nie.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const t = vi.hoisted(() => ({
  zeilen: [] as Array<{ id: string; vorname?: string; nachname?: string; meta?: unknown }>,
  merge: vi.fn(),
  auswahl: vi.fn(),
}));

vi.mock("./dataCache", () => ({
  cacheGet: () => t.zeilen,
  onCacheChange: () => () => undefined,
}));
vi.mock("./kundenStore", () => ({
  mergeKontaktMetaMitGrund: (...a: unknown[]) => t.merge(...a),
}));
vi.mock("./currentUser", () => ({ getCurrentUserId: () => "mitarbeiter-1" }));
vi.mock("./confirm", () => ({ auswahlDialog: (...a: unknown[]) => t.auswahl(...a) }));

const {
  kundenSprache,
  spracheBewusstGewaehlt,
  setzeKundenSprache,
  stelleKundenspracheSicher,
  englischsprachigeKontaktIds,
  normalisiereSprache,
  spracheAusMeta,
  kundenSpracheMetaPatch,
} = await import("./kundenSprache");
const server = await import("../../supabase/functions/_shared/kunden-sprache.ts");

const GEWAEHLT_EN = { kundenSprache: "en", kundenSpracheGesetztAm: "2026-09-25T10:00:00.000Z" };

beforeEach(() => {
  t.zeilen = [];
  t.merge.mockReset().mockResolvedValue({ ok: true });
  t.auswahl.mockReset();
});

describe("Regeln", () => {
  it("liest Sprachangaben nachsichtig", () => {
    expect(normalisiereSprache("en")).toBe("en");
    expect(normalisiereSprache("EN-gb")).toBe("en");
    expect(normalisiereSprache(" English ")).toBe("en");
    expect(normalisiereSprache("deutsch")).toBe("de");
    expect(normalisiereSprache("de_DE")).toBe("de");
    expect(normalisiereSprache("fr")).toBeNull();
    expect(normalisiereSprache("enx")).toBeNull();
    expect(normalisiereSprache(3)).toBeNull();
  });

  it("fehlt der Wert oder ist er unbekannt, gilt Deutsch", () => {
    expect(spracheAusMeta(undefined)).toBe("de");
    expect(spracheAusMeta({})).toBe("de");
    expect(spracheAusMeta({ kundenSprache: "fr" })).toBe("de");
    expect(spracheAusMeta({ kundenSprache: "en" })).toBe("en");
  });

  it("bewusst gewählt heißt: Zeitpunkt gesetzt", () => {
    expect(server.spracheBewusstGewaehltAusMeta({ kundenSprache: "de" })).toBe(false);
    expect(server.spracheBewusstGewaehltAusMeta(GEWAEHLT_EN)).toBe(true);
  });

  it("baut den Patch mit Zeitpunkt und Urheber", () => {
    expect(kundenSpracheMetaPatch("en", "u1", "2026-09-25T00:00:00.000Z")).toEqual({
      kundenSprache: "en",
      kundenSpracheGesetztAm: "2026-09-25T00:00:00.000Z",
      kundenSpracheGesetztVon: "u1",
    });
    expect(kundenSpracheMetaPatch("de", null, "x")).not.toHaveProperty("kundenSpracheGesetztVon");
  });
});

describe("Lesen im Browser", () => {
  it("findet den Kontakt über die Kennung, über ein KundeData ohne meta und über eine Zeile", () => {
    t.zeilen = [{ id: "k1", meta: GEWAEHLT_EN }, { id: "k2", meta: {} }];
    expect(kundenSprache("k1")).toBe("en");
    expect(kundenSprache({ id: "k1" })).toBe("en");
    expect(kundenSprache({ id: "fremd", meta: { kundenSprache: "en" } })).toBe("en");
    expect(kundenSprache("k2")).toBe("de");
    expect(kundenSprache("unbekannt")).toBe("de");
    expect(kundenSprache(null)).toBe("de");
    expect(spracheBewusstGewaehlt("k1")).toBe(true);
    expect(spracheBewusstGewaehlt("k2")).toBe(false);
  });

  it("sammelt englischsprachige Kontakte für Listen", () => {
    t.zeilen = [{ id: "a", meta: GEWAEHLT_EN }, { id: "b", meta: {} }, { id: "c", meta: { kundenSprache: "en" } }];
    expect([...englischsprachigeKontaktIds()].sort()).toEqual(["a", "c"]);
  });
});

describe("setzeKundenSprache", () => {
  it("schreibt über den Meta-Merge-Weg mit Zeitpunkt und Mitarbeiter", async () => {
    expect(await setzeKundenSprache("k1", "en")).toEqual({ ok: true });
    const [id, patch] = t.merge.mock.calls[0];
    expect(id).toBe("k1");
    expect(patch).toMatchObject({ kundenSprache: "en", kundenSpracheGesetztVon: "mitarbeiter-1" });
    expect(typeof patch.kundenSpracheGesetztAm).toBe("string");
  });

  it("gibt den Grund weiter und wirft nicht", async () => {
    t.merge.mockRejectedValue(new Error("Not authorized"));
    expect(await setzeKundenSprache("k1", "de")).toEqual({ ok: false, grund: "Not authorized" });
    expect(await setzeKundenSprache("", "de")).toMatchObject({ ok: false });
  });
});

describe("stelleKundenspracheSicher: die einmalige Rückfrage", () => {
  it("fragt nicht, wenn schon gewählt wurde", async () => {
    t.zeilen = [{ id: "k1", meta: GEWAEHLT_EN }];
    expect(await stelleKundenspracheSicher("k1")).toBe("en");
    expect(t.auswahl).not.toHaveBeenCalled();
    expect(t.merge).not.toHaveBeenCalled();
  });

  it("fragt beim Bestand „Deutsch oder English?“ und speichert die Wahl", async () => {
    t.zeilen = [{ id: "k1", vorname: "Max", nachname: "Muster", meta: {} }];
    t.auswahl.mockResolvedValue("en");
    expect(await stelleKundenspracheSicher("k1")).toBe("en");
    const frage = t.auswahl.mock.calls[0][0];
    expect(frage.title).toBe("Deutsch oder English?");
    expect(frage.description).toContain("Max Muster");
    expect(frage.optionen.map((o: { text: string }) => o.text)).toEqual(["Deutsch", "English"]);
    expect(t.merge).toHaveBeenCalledWith("k1", expect.objectContaining({ kundenSprache: "en" }));
  });

  it("ohne Wahl geschlossen: Deutsch, nichts gespeichert, Versand läuft weiter", async () => {
    t.zeilen = [{ id: "k1", meta: {} }];
    t.auswahl.mockResolvedValue(null);
    expect(await stelleKundenspracheSicher("k1")).toBe("de");
    expect(t.merge).not.toHaveBeenCalled();
  });

  it("scheitert das Speichern, gilt die Wahl trotzdem für diesen Versand", async () => {
    t.zeilen = [{ id: "k1", meta: {} }];
    t.auswahl.mockResolvedValue("en");
    t.merge.mockResolvedValue({ ok: false, grund: "offline" });
    expect(await stelleKundenspracheSicher("k1")).toBe("en");
  });

  it("scheitert der Dialog selbst, blockiert er nicht", async () => {
    t.zeilen = [{ id: "k1", meta: {} }];
    t.auswahl.mockRejectedValue(new Error("kein DOM"));
    expect(await stelleKundenspracheSicher("k1")).toBe("de");
  });

  it("fragt nicht bei unbekanntem oder fehlendem Kontakt", async () => {
    expect(await stelleKundenspracheSicher("unbekannt")).toBe("de");
    expect(await stelleKundenspracheSicher(undefined)).toBe("de");
    expect(t.auswahl).not.toHaveBeenCalled();
  });

  it("zwei Versandknöpfe zugleich: nur eine Rückfrage", async () => {
    t.zeilen = [{ id: "k1", meta: {} }];
    let antworten: (w: string) => void = () => undefined;
    t.auswahl.mockReturnValue(new Promise((r) => { antworten = r; }));
    const a = stelleKundenspracheSicher("k1");
    const b = stelleKundenspracheSicher("k1");
    antworten("de");
    expect(await Promise.all([a, b])).toEqual(["de", "de"]);
    expect(t.auswahl).toHaveBeenCalledTimes(1);
  });
});

describe("serverseitig: kundenSprache(admin, …)", () => {
  /** Ein nachgebauter Supabase-Client, der Filter und Ergebnis mitschreibt. */
  function client(antworten: { einzeln?: unknown; liste?: unknown[]; fehler?: boolean } = {}) {
    const aufrufe: string[] = [];
    const abfrage: Record<string, unknown> = {};
    const kette = () => abfrage;
    Object.assign(abfrage, {
      select: kette,
      eq: (sp: string, w: string) => { aufrufe.push(`eq ${sp}=${w}`); return abfrage; },
      or: (f: string) => { aufrufe.push(`or ${f}`); return abfrage; },
      ilike: (sp: string, w: string) => { aufrufe.push(`ilike ${sp}=${w}`); return abfrage; },
      maybeSingle: async () => (antworten.fehler ? { data: null, error: { message: "x" } } : { data: antworten.einzeln ?? null, error: null }),
      limit: async () => (antworten.fehler ? { data: null, error: { message: "x" } } : { data: antworten.liste ?? [], error: null }),
    });
    return { client: { from: () => abfrage }, aufrufe };
  }
  const ID = "11111111-1111-1111-1111-111111111111";

  it("die mitgegebene Sprache hat Vorrang, ohne Abfrage", async () => {
    const { client: c, aufrufe } = client();
    expect(await server.kundenSprache(c, { sprache: "en", kontaktId: ID })).toBe("en");
    expect(aufrufe).toEqual([]);
  });

  it("liest über die Kontakt-ID", async () => {
    const { client: c } = client({ einzeln: { meta: GEWAEHLT_EN } });
    expect(await server.kundenSprache(c, { kontaktId: ID })).toBe("en");
  });

  it("Rückfall Deutsch bei fehlendem Kontakt, Fehler oder ungültiger Kennung", async () => {
    expect(await server.kundenSprache(client().client, { kontaktId: ID })).toBe("de");
    expect(await server.kundenSprache(client({ fehler: true }).client, { kontaktId: ID })).toBe("de");
    const { client: c, aufrufe } = client();
    expect(await server.kundenSprache(c, { kontaktId: "x,or(1=1)" })).toBe("de");
    expect(aufrufe).toEqual([]);
  });

  it("über den Portalnutzer nur, wenn alle Treffer dieselbe Sprache haben", async () => {
    expect(await server.kundenSprache(client({ liste: [{ meta: GEWAEHLT_EN }] }).client, { authUserId: ID })).toBe("en");
    expect(await server.kundenSprache(
      client({ liste: [{ meta: GEWAEHLT_EN }, { meta: {} }] }).client,
      { authUserId: ID },
    )).toBe("de");
  });

  it("über die E-Mail mit maskierten Platzhaltern", async () => {
    const { client: c, aufrufe } = client({ liste: [{ meta: GEWAEHLT_EN }] });
    expect(await server.kundenSprache(c, { email: "a_b%@x.de" })).toBe("en");
    expect(aufrufe).toEqual(["ilike email=a\\_b\\%@x.de"]);
  });
});
