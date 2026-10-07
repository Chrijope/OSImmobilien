import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  alsNachholZeile, DIENST_WARTEZEIT_MS, messGrund, nachholAuswahl, NACHHOLEN_JE_LAUF, NACHHOLEN_PAUSE_MS, NACHHOLEN_SPALTEN, type NachholZeile,
} from "../../supabase/functions/_shared/standort-nachholen";
import { FEHLER_META_SCHLUESSEL, standorteMessen, type StandortDb } from "../../supabase/functions/_shared/standort-lauf";
import { gemesseneAdresseAus, MESSFASSUNG } from "../../supabase/functions/_shared/standort-messung";

/**
 * Die Umgebung jedes Objekts wird automatisch gemessen (Christian,
 * 24.09.2026): beim Anlegen, bei jeder Adressänderung und als Nachholen für
 * alte Messungen, gedrosselt und ohne endlose Wiederholung einer
 * unbrauchbaren Adresse. Alle Adressen hier sind nur Testwerte.
 */

const JETZT = Date.parse("2026-09-24T20:00:00Z");
const HOF = { adresse: "Ossecker Straße 42", plz: "95030", ort: "Hof" };
// `null`: eine Messung der ersten Fassung, ohne Messfassung.
const gemessen = (adresse = HOF, messfassung: number | null = MESSFASSUNG) =>
  ({ schema: 2, ...(messfassung !== null ? { messfassung } : {}), gemessene_adresse: gemesseneAdresseAus(adresse) });
const zeile = (id: string, extra: Partial<NachholZeile> = {}): NachholZeile => ({ id, ...HOF, ...extra });

describe("messGrund: wann ein Objekt gemessen wird", () => {
  it("misst ein neu angelegtes Objekt ohne Messung", () => {
    expect(messGrund(zeile("neu"), JETZT)).toBe("fehlt");
  });

  it("misst nach einer Adressänderung neu, eine gleiche Adresse in anderer Schreibweise aber nicht", () => {
    expect(messGrund(zeile("umgezogen", { adresse: "Ossecker Straße 46", analyse: gemessen() }), JETZT)).toBe("adresse");
    expect(messGrund(zeile("gleich", { adresse: "Ossecker Str. 42", analyse: gemessen() }), JETZT)).toBeNull();
  });

  it("holt alte Messfassungen nach, eine aktuelle Messung bleibt stehen", () => {
    expect(messGrund(zeile("alt", { analyse: gemessen(HOF, null) }), JETZT)).toBe("fassung");
    expect(messGrund(zeile("alt1", { analyse: gemessen(HOF, 1) }), JETZT)).toBe("fassung");
    expect(messGrund(zeile("aktuell", { analyse: gemessen() }), JETZT)).toBeNull();
  });

  it("versucht eine unbrauchbare Adresse wie „9a“ nicht endlos neu, erst nach einer Änderung", () => {
    const neunA = { adresse: "9a", plz: "04177", ort: "Crailsheim" };
    const fehler = { art: "adresse", grund: "Adresse nicht gefunden.", am: "2026-09-20T10:00:00Z", adresse: gemesseneAdresseAus(neunA) };
    expect(messGrund({ id: "c", ...neunA, fehler }, JETZT)).toBeNull();
    expect(messGrund({ id: "c", ...neunA, adresse: "Industriestraße 9a", fehler }, JETZT)).toBe("fehlt");
  });

  it("wartet nach einer Störung der Dienste kurz, dann wieder", () => {
    const fehler = (am: number) => ({ art: "dienst", grund: "Overpass war nicht erreichbar.", am: new Date(am).toISOString(), adresse: gemesseneAdresseAus(HOF) });
    expect(messGrund(zeile("d", { fehler: fehler(JETZT - 60_000) }), JETZT)).toBeNull();
    expect(messGrund(zeile("d", { fehler: fehler(JETZT - DIENST_WARTEZEIT_MS - 1) }), JETZT)).toBe("fehlt");
  });

  it("misst nach einem Aussetzer von Overpass noch am selben Tag erneut, nicht erst morgen (01.10.2026)", () => {
    const fehler = { art: "dienst", grund: "Overpass war nicht erreichbar.", am: new Date(JETZT - 3 * 60 * 60 * 1000).toISOString(), adresse: gemesseneAdresseAus(HOF) };
    expect(messGrund(zeile("d", { fehler }), JETZT)).toBe("fehlt");
  });
});

describe("nachholAuswahl: gedrosselt und in sinnvoller Reihenfolge", () => {
  const bestand: NachholZeile[] = [
    zeile("alt", { analyse: gemessen(HOF, null) }),
    zeile("aktuell", { analyse: gemessen() }),
    zeile("umgezogen", { adresse: "Ossecker Straße 46", analyse: gemessen() }),
    zeile("neu1"),
    zeile("neu2"),
    zeile("kaputt", { adresse: "9a", fehler: { art: "adresse", adresse: gemesseneAdresseAus({ ...HOF, adresse: "9a" }) } }),
  ];

  it("misst je Lauf höchstens sechs Objekte, zuerst die ohne Messung", () => {
    // Seit dem 24.09.2026 sechs statt zwei je Lauf, mit längerer Pause dazwischen.
    expect(NACHHOLEN_JE_LAUF).toBe(6);
    expect(NACHHOLEN_PAUSE_MS).toBeGreaterThanOrEqual(5_000);
    expect(nachholAuswahl(bestand, JETZT).ids).toEqual(["neu1", "neu2", "umgezogen", "alt"]);
    // Die Grenze gilt: Bei zwei je Lauf erst die neuen, danach die geänderte Adresse, zuletzt die alte Fassung.
    expect(nachholAuswahl(bestand, JETZT, 2).ids).toEqual(["neu1", "neu2"]);
    const zweiter = nachholAuswahl(bestand.filter((z) => !z.id.startsWith("neu")), JETZT, 2);
    expect(zweiter.ids).toEqual(["umgezogen", "alt"]);
    const viele = Array.from({ length: 20 }, (_, i) => zeile(`o${i}`));
    expect(nachholAuswahl(viele, JETZT).ids).toHaveLength(NACHHOLEN_JE_LAUF);
  });

  it("holt nach der Erhöhung auf Messfassung 3 jede Messung der Fassung 2 nach", () => {
    expect(MESSFASSUNG).toBe(3);
    expect(messGrund(zeile("fassung2", { analyse: gemessen(HOF, 2) }), JETZT)).toBe("fassung");
    expect(messGrund(zeile("fassung3", { analyse: gemessen(HOF, 3) }), JETZT)).toBeNull();
  });

  it("zählt den Stand über alle Objekte, nur als Zahlen", () => {
    expect(nachholAuswahl(bestand, JETZT).stand).toEqual({
      objekte: 6, aktuell: 1, fehlt: 2, adresse: 1, fassung: 1, adresseUnbrauchbar: 1, dienstWartet: 0,
    });
  });

  it("liest nur Auszüge aus meta, nie die ganze Spalte", () => {
    expect(NACHHOLEN_SPALTEN).not.toMatch(/(^|, )meta(,|$)/);
    expect(alsNachholZeile({ id: "o1", ...HOF, schema: 2, messfassung: MESSFASSUNG, gemessene_adresse: gemesseneAdresseAus(HOF), fehler: null }))
      .toEqual({ id: "o1", ...HOF, analyse: gemessen(), fehler: null });
    expect(alsNachholZeile({ id: "o2", ...HOF, schema: null }).analyse).toBeUndefined();
  });
});

describe("Der Messablauf mit der Regel des Nachholens", () => {
  function tabelle(zeilen: Array<{ id: string; adresse: string; plz: string; ort: string; meta: Record<string, unknown> }>) {
    const daten = new Map(zeilen.map((z) => [z.id, structuredClone(z)]));
    const db: StandortDb = {
      from: () => ({
        select: () => ({ eq: (_s: "id", id: string) => ({ maybeSingle: async () => ({ data: daten.has(id) ? structuredClone(daten.get(id)!) : null, error: null }) }) }),
        update: (werte: { meta: Record<string, unknown> }) => ({ eq: async (_s: "id", id: string) => { daten.get(id)!.meta = werte.meta; return { data: null, error: null }; } }),
      }),
    };
    return { db, daten };
  }

  it("misst nacheinander mit Pause, vermerkt einen Fehlschlag am Objekt und behält eine alte Messung", async () => {
    const alteAnalyse = { schema: 2, objekt_koordinaten: { lat: 50.3, lng: 11.9 }, mikrolage: {}, gemessene_adresse: gemesseneAdresseAus(HOF) };
    const { db, daten } = tabelle([
      { id: "neu", ...HOF, meta: {} },
      { id: "alt", ...HOF, meta: { standortanalyse: alteAnalyse } },
    ]);
    let aufruf = 0;
    const messe = vi.fn(async () => {
      aufruf += 1;
      if (aufruf === 1) return { ok: true as const, analyse: { schema: 2, messfassung: 2, gemessen_am: "2026-09-24T20:00:00Z", objekt_koordinaten: { lat: 50.3, lng: 11.9 }, mikrolage: {}, mikrolage_hinweis: "x", gemessene_adresse: gemesseneAdresseAus(HOF) } };
      return { ok: false as const, art: "dienst" as const, grund: "Overpass war nicht erreichbar." };
    });
    const pause = vi.fn(async () => undefined);
    const bericht = await standorteMessen(db, ["neu", "alt"], {
      laufBeginn: JETZT, jetzt: () => JETZT, pause, messe: messe as never, obergrenze: 2,
      brauchtMessung: (z) => messGrund({ id: z.id, adresse: z.adresse, plz: z.plz, ort: z.ort, analyse: (z.meta || {}).standortanalyse, fehler: (z.meta || {})[FEHLER_META_SCHLUESSEL] }, JETZT) !== null,
    });
    expect(bericht).toMatchObject({ gemessen: 1, fehlgeschlagen: 1 });
    // Zwischen zwei Messungen eine Pause, aus Rücksicht auf OpenStreetMap.
    expect(pause).toHaveBeenCalledTimes(1);
    expect((daten.get("neu")!.meta.standortanalyse as { messfassung: number }).messfassung).toBe(2);
    expect(daten.get("alt")!.meta.standortanalyse).toEqual(alteAnalyse);
    expect(daten.get("alt")!.meta[FEHLER_META_SCHLUESSEL]).toMatchObject({ art: "dienst" });
    // Und der nächste Lauf lässt es einen Tag lang in Ruhe.
    expect(messGrund({ id: "alt", ...HOF, analyse: alteAnalyse, fehler: daten.get("alt")!.meta[FEHLER_META_SCHLUESSEL] }, JETZT + 60_000)).toBeNull();
  });
});

describe("Neu messen ohne neue Adresssuche", () => {
  it("nimmt bei gleicher Adresse die Lage der letzten Messung samt Genauigkeit und die Pause des Nachholens", async () => {
    const alteAnalyse = {
      schema: 2, messfassung: 2, objekt_koordinaten: { lat: 50.31, lng: 11.91 }, genauigkeit: "ort", koordinaten_quelle: "photon",
      lage: { ort: "Hof" }, mikrolage: {}, gemessene_adresse: gemesseneAdresseAus(HOF),
    };
    const daten = new Map<string, { id: string; adresse: string; plz: string; ort: string; meta: Record<string, unknown> }>([
      ["a", { id: "a", ...HOF, meta: { standortanalyse: alteAnalyse } }],
      ["b", { id: "b", ...HOF, adresse: "Ossecker Straße 46", meta: { standortanalyse: alteAnalyse } }],
    ]);
    const db: StandortDb = {
      from: () => ({
        select: () => ({ eq: (_s: "id", id: string) => ({ maybeSingle: async () => ({ data: structuredClone(daten.get(id) ?? null), error: null }) }) }),
        update: (werte: { meta: Record<string, unknown> }) => ({ eq: async (_s: "id", id: string) => { daten.get(id)!.meta = werte.meta; return { data: null, error: null }; } }),
      }),
    };
    const koordinaten: unknown[] = [];
    const messe = vi.fn(async (_teile: unknown, optionen: { koordinate?: unknown }) => {
      koordinaten.push(optionen.koordinate);
      return { ok: false as const, art: "dienst" as const, grund: "Testabbruch" };
    });
    const pause = vi.fn(async () => undefined);
    await standorteMessen(db, ["a", "b"], { laufBeginn: JETZT, jetzt: () => JETZT, pause, messe: messe as never, obergrenze: 2, pauseMs: NACHHOLEN_PAUSE_MS, brauchtMessung: () => true });
    // Gleiche Adresse: Lage, Genauigkeit und Ort der letzten Messung, keine neue Suche.
    expect(koordinaten[0]).toEqual({ lat: 50.31, lng: 11.91, quelle: "photon", genauigkeit: "ort", lage: { ort: "Hof" } });
    // Geänderte Adresse: neu suchen.
    expect(koordinaten[1]).toBeNull();
    expect(pause).toHaveBeenCalledWith(NACHHOLEN_PAUSE_MS);
  });
});

describe("Zeitplan und Function", () => {
  const wurzel = resolve(__dirname, "../..");
  it("läuft alle zehn Minuten ohne Anmeldetoken, die Function ist dafür freigeschaltet", () => {
    const sql = readFileSync(resolve(wurzel, "supabase/migrations/20260924190000_standort_nachholen_zeitplan.sql"), "utf8");
    expect(sql).toContain("'*/10 * * * *'");
    expect(sql).toContain("/functions/v1/standort-nachholen");
    // Die Kopie im Eingangskorb wird nicht geprueft: Der Korb ist die Merkliste
    // des Offenen und wird nach dem Ausfuehren geleert (am 24.09.2026 gelaufen).
    expect(readFileSync(resolve(wurzel, "supabase/config.toml"), "utf8")).toMatch(/\[functions\.standort-nachholen\]\s*\nverify_jwt = false/);
  });

  it("hat eine Mengenbremse und gibt nur Zahlen zurück", () => {
    const code = readFileSync(resolve(wurzel, "supabase/functions/standort-nachholen/index.ts"), "utf8");
    expect(code).toContain("checkEdgeRateLimit");
    expect(code).toContain("return antwort({ stand, bericht })");
  });
});
