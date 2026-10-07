import { describe, it, expect, vi } from "vitest";
import {
  FEHLER_META_SCHLUESSEL, MESS_START_BIS_MS, MESSUNGEN_JE_LAUF, standorteMessen, type StandortDb,
} from "../../supabase/functions/investagon-import/standort";
import { gemesseneAdresseAus } from "../../supabase/functions/_shared/standort-messung";

/**
 * Der Standort wird beim Investagon-Import einmal gemessen und dann fest
 * hinterlegt (Christian, 23.09.2026). Geprüft wird der Ablauf ohne Netz: eine
 * Tabelle im Speicher statt der Datenbank und eine Attrappe statt der Messung.
 */

type Zeile = { id: string; titel?: string; adresse: string; plz: string; ort: string; meta: Record<string, unknown> };

function tabelle(zeilen: Zeile[]) {
  const daten = new Map(zeilen.map((z) => [z.id, structuredClone(z)]));
  const geschrieben: Array<{ id: string; meta: Record<string, unknown> }> = [];
  const db: StandortDb = {
    from: () => ({
      select: () => ({
        eq: (_s: "id", id: string) => ({
          maybeSingle: async () => ({ data: daten.has(id) ? structuredClone(daten.get(id)!) : null, error: null }),
        }),
      }),
      update: (werte: { meta: Record<string, unknown> }) => ({
        eq: async (_s: "id", id: string) => {
          geschrieben.push({ id, meta: werte.meta });
          daten.get(id)!.meta = werte.meta;
          return { data: null, error: null };
        },
      }),
    }),
  };
  return { db, daten, geschrieben };
}

const STRALSUND = { adresse: "Danziger Straße 1", plz: "18437", ort: "Stralsund" };

/** Eine gemessene Analyse, wie `messeStandort` sie seit dem 23.09.2026 schreibt. */
const analyseFuer = (adresse: { adresse: string; plz: string; ort: string }) => ({
  schema: 2, gemessen_am: "2026-09-23T10:00:00Z", objekt_koordinaten: { lat: 54.3087, lng: 13.0741 },
  mikrolage: { oepnv: [{ name: "Haltestelle", entfernung_m: 150, lat: 54.309, lng: 13.074 }] },
  mikrolage_hinweis: "Entfernungen als Luftlinie.",
  gemessene_adresse: gemesseneAdresseAus(adresse),
});

function messAttrappe(ergebnis: "ok" | "adresse" | "dienst" = "ok") {
  return vi.fn(async (teile: { adresse?: unknown; plz?: unknown; ort?: unknown }, _o?: unknown) => {
    const lage = { koordinate: { lat: 54.3087, lng: 13.0741 }, genauigkeit: "adresse" as const, lage: {}, quelle: "photon" as const };
    if (ergebnis === "ok") {
      return { ok: true as const, lage, analyse: { ...analyseFuer(teile as typeof STRALSUND), gemessen_am: "2026-09-23T20:00:00Z" } };
    }
    return { ok: false as const, art: ergebnis, grund: ergebnis === "adresse" ? "Adresse nicht gefunden." : "Overpass war nicht erreichbar.", ...(ergebnis === "dienst" ? { lage } : {}) };
  });
}

const umgebung = (messe: ReturnType<typeof messAttrappe>, extra: Partial<Parameters<typeof standorteMessen>[2]> = {}) => ({
  laufBeginn: 0, jetzt: () => 1_000, pause: vi.fn(async () => undefined), messe: messe as never, ...extra,
});

describe("Import misst den Standort nur, wenn nötig", () => {
  it("misst ohne Analyse und bei geänderter Adresse, lässt eine gemessene mit gleicher Adresse stehen", async () => {
    const { db, daten } = tabelle([
      { id: "ohne", ...STRALSUND, meta: {} },
      { id: "fest", ...STRALSUND, meta: { standortanalyse: analyseFuer(STRALSUND) } },
      { id: "umgezogen", ...STRALSUND, adresse: "Danziger Straße 5", meta: { standortanalyse: analyseFuer(STRALSUND) } },
    ]);
    const messe = messAttrappe();
    const bericht = await standorteMessen(db, ["ohne", "fest", "umgezogen"], umgebung(messe));
    expect(messe).toHaveBeenCalledTimes(2);
    expect(messe.mock.calls.map(([t]) => t.adresse)).toEqual(["Danziger Straße 1", "Danziger Straße 5"]);
    expect(bericht).toMatchObject({ kandidaten: 3, gemessen: 2, uebersprungen: 1, fehlgeschlagen: 0, ende: "fertig" });
    expect((daten.get("ohne")!.meta.standortanalyse as { schema: number }).schema).toBe(2);
    expect(daten.get("fest")!.meta.standortanalyse).toEqual(analyseFuer(STRALSUND));
  });

  it("gibt der Koordinate aus Investagon Vorrang vor der Adresssuche", async () => {
    const investagon = { lat: 54.31, lng: 13.07, quelle: "investagon", am: "2026-09-23T19:00:00Z" };
    const { db } = tabelle([{ id: "o1", ...STRALSUND, meta: { koordinaten: investagon } }]);
    const messe = messAttrappe();
    await standorteMessen(db, ["o1"], umgebung(messe));
    const optionen = messe.mock.calls[0][1] as { koordinate?: { lat: number; lng: number; quelle?: string } | null };
    expect(optionen.koordinate).toMatchObject({ lat: 54.31, lng: 13.07, quelle: "investagon" });
  });

  it("sucht ohne Investagon-Koordinate über die Adresse", async () => {
    const { db } = tabelle([{ id: "o1", ...STRALSUND, meta: { koordinaten: { lat: 54.3, lng: 13.1, quelle: "photon", am: "x" } } }]);
    const messe = messAttrappe();
    await standorteMessen(db, ["o1"], umgebung(messe));
    expect((messe.mock.calls[0][1] as { koordinate?: unknown }).koordinate).toBeNull();
  });
});

describe("Rücksicht auf OpenStreetMap", () => {
  it("misst höchstens die feste Zahl je Lauf, nacheinander mit Pause, den Rest beim nächsten Lauf", async () => {
    const ids = Array.from({ length: MESSUNGEN_JE_LAUF + 5 }, (_, i) => `o${i}`);
    const { db } = tabelle(ids.map((id) => ({ id, ...STRALSUND, meta: {} })));
    const messe = messAttrappe();
    const u = umgebung(messe);
    const bericht = await standorteMessen(db, ids, u);
    expect(MESSUNGEN_JE_LAUF).toBe(25);
    expect(messe).toHaveBeenCalledTimes(25);
    expect(u.pause).toHaveBeenCalledTimes(24);
    expect(bericht).toMatchObject({ gemessen: 25, offen: 5, ende: "obergrenze" });
  });

  it("beginnt nach dem Zeitbudget keine neue Messung mehr und bricht nicht ab", async () => {
    const { db } = tabelle([{ id: "a", ...STRALSUND, meta: {} }, { id: "b", ...STRALSUND, meta: {} }]);
    const messe = messAttrappe();
    let uhr = 0;
    const bericht = await standorteMessen(db, ["a", "b"], umgebung(messe, { jetzt: () => (uhr += MESS_START_BIS_MS / 2 + 1) }));
    expect(messe).toHaveBeenCalledTimes(1);
    expect(bericht).toMatchObject({ gemessen: 1, offen: 1, ende: "zeit" });
  });

  it("zählt jedes Objekt nur einmal, auch wenn es zweimal im Lauf vorkommt", async () => {
    const { db } = tabelle([{ id: "a", ...STRALSUND, meta: {} }]);
    const messe = messAttrappe();
    await standorteMessen(db, ["a", "a"], umgebung(messe));
    expect(messe).toHaveBeenCalledTimes(1);
  });
});

describe("Fehlschlag und Schreiben", () => {
  it("vermerkt einen Fehlschlag mit Grund am Objekt und behält die gefundene Lage", async () => {
    const { db, daten } = tabelle([{ id: "o1", ...STRALSUND, meta: { kurzbeschreibung: "Von Hand" } }]);
    const bericht = await standorteMessen(db, ["o1"], umgebung(messAttrappe("dienst")));
    expect(bericht.fehlgeschlagen).toBe(1);
    const meta = daten.get("o1")!.meta;
    expect(meta[FEHLER_META_SCHLUESSEL]).toMatchObject({ art: "dienst", grund: "Overpass war nicht erreichbar.", adresse: gemesseneAdresseAus(STRALSUND) });
    expect(meta.koordinaten).toMatchObject({ lat: 54.3087, lng: 13.0741, quelle: "photon" });
    expect(meta.kurzbeschreibung).toBe("Von Hand");
    expect(meta).not.toHaveProperty("standortanalyse");
  });

  it("wiederholt eine unauffindbare Adresse nicht, erst eine geänderte misst neu", async () => {
    const { db, daten } = tabelle([{ id: "o1", ...STRALSUND, meta: {} }]);
    await standorteMessen(db, ["o1"], umgebung(messAttrappe("adresse")));
    const zweiter = messAttrappe();
    const bericht = await standorteMessen(db, ["o1"], umgebung(zweiter));
    expect(zweiter).not.toHaveBeenCalled();
    expect(bericht.uebersprungen).toBe(1);
    daten.get("o1")!.adresse = "Danziger Straße 3";
    await standorteMessen(db, ["o1"], umgebung(zweiter));
    expect(zweiter).toHaveBeenCalledTimes(1);
    expect(daten.get("o1")!.meta).not.toHaveProperty(FEHLER_META_SCHLUESSEL);
  });

  it("versucht einen Ausfall der Dienste beim nächsten Lauf erneut", async () => {
    const { db } = tabelle([{ id: "o1", ...STRALSUND, meta: {} }]);
    await standorteMessen(db, ["o1"], umgebung(messAttrappe("dienst")));
    const zweiter = messAttrappe();
    await standorteMessen(db, ["o1"], umgebung(zweiter));
    expect(zweiter).toHaveBeenCalledTimes(1);
  });

  it("liest das meta unmittelbar vor dem Schreiben frisch und setzt nur die eigenen Schlüssel", async () => {
    const { db, daten } = tabelle([{ id: "o1", ...STRALSUND, meta: { alt: 1 } }]);
    const messe = vi.fn(async (t: { adresse?: unknown; plz?: unknown; ort?: unknown }) => {
      // Während der Messung schreibt jemand anderes an dasselbe Objekt.
      daten.get("o1")!.meta = { ...daten.get("o1")!.meta, parallel: "bleibt" };
      return { ok: true as const, analyse: analyseFuer(t as typeof STRALSUND) };
    });
    await standorteMessen(db, ["o1"], umgebung(messe as never));
    const meta = daten.get("o1")!.meta;
    expect(meta.parallel).toBe("bleibt");
    expect(meta.alt).toBe(1);
    expect(meta).toHaveProperty("standortanalyse");
    expect(meta).toHaveProperty("standortanalyse_generated_at");
  });
});
