import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";

/*
 * Die Reservierung eines Globalobjekts (das ganze Haus), seit dem 23.09.2026:
 * Datenhaltung, gemeinsame Regeln, Edge Functions und Migration.
 *
 * Christians Regeln gelten fürs Haus wie für eine Einheit: 60 Minuten
 * Vormerkung beim Absenden, danach frei bis zur Unterschrift, die erste
 * Unterschrift gewinnt, im Konfliktfall Glocke und Vermerk. Anders als bei der
 * Einheit gibt es ohne Migration keinen Rückfallweg: Dann hielte niemand das
 * Haus fest, obwohl der Vertrag es verspricht.
 */

const zustand = vi.hoisted(() => ({
  rows: {} as Record<string, Array<Record<string, unknown>>>,
  upserts: [] as Array<{ tabelle: string; zeile: Record<string, unknown> }>,
  rpc: { data: null as unknown, error: null as unknown },
  rpcAufrufe: [] as Array<{ name: string; args: unknown }>,
  neuGeladen: [] as string[],
}));

vi.mock("@/lib/dataCache", () => ({
  cacheGet: (table: string) => zustand.rows[table] || [],
  cacheFilter: (table: string, filter: (row: Record<string, unknown>) => boolean) => (zustand.rows[table] || []).filter(filter),
  cacheReload: async (table: string) => { zustand.neuGeladen.push(table); },
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
    from: (tabelle: string) => ({
      // `saveObjekt` liest vor dem Schreiben den frischen Stand (seit dem
      // 23.09.2026). Hier ist das derselbe Stand wie im Zwischenspeicher.
      select: () => {
        const filter: Array<[string, unknown[]]> = [];
        const zeilen = () => (zustand.rows[tabelle] || []).filter((z) => filter.every(([s, w]) => w.includes(z[s])));
        const kette = {
          eq: (s: string, w: unknown) => { filter.push([s, [w]]); return kette; },
          in: (s: string, w: unknown[]) => { filter.push([s, w]); return kette; },
          order: () => kette,
          range: async () => ({ data: zeilen(), error: null }),
          maybeSingle: async () => ({ data: zeilen()[0] ?? null, error: null }),
        };
        return kette;
      },
      upsert: async (zeile: Record<string, unknown>) => { zustand.upserts.push({ tabelle, zeile }); return { error: null }; },
      delete: () => ({ eq: async () => ({ error: null }) }),
      insert: async () => ({ error: null }),
    }),
  },
}));

const {
  OBJEKT_BELEGUNG_SPALTEN, anzahlEinheiten, getObjekte, objektToDbRow, saveObjekt, vormerkeObjekt,
} = await import("@/lib/objekteStore");
const { hausKnopfStand, objektVormerkMeldung, uebersichtsBelegung } = await import("@/lib/objektBelegung");
const { istVerfuegbar } = await import("@/lib/objektFavoritenGruppen");
const { empfehlungsKandidaten } = await import("@/lib/einheitEmpfehlung");
const {
  hausReservierungNachUnterschrift, hausVormerkenMoeglich, reserviereObjektNachUnterschrift,
} = await import("../../supabase/functions/_shared/objekt-belegung");

const lies = (pfad: string) => readFileSync(resolve(__dirname, "../..", pfad), "utf-8");

const BELEGUNG = {
  belegung: "reserviert",
  belegung_kunde_id: "k-1",
  belegung_kunde_name: "Anna Beispiel",
  belegung_am: "2026-09-23T12:00:00+00:00",
  belegung_von: "nutzer-paul",
  vorgemerkt_bis: null,
  vorgemerkt_kunde_id: null,
  vorgemerkt_kunde_name: null,
  vorgemerkt_von: null,
  vorgemerkt_berater_name: null,
};

function hausZeile(extra: Record<string, unknown> = {}) {
  zustand.rows.objekte = [{ id: "haus", titel: "Haus", adresse: "Musterstraße 1", global_objekt: true, ...extra }];
  zustand.rows.wohnungen = [];
  zustand.rows.objekt_bilder = [];
  zustand.rows.objekt_dokumente = [];
  zustand.rows.wohnungs_bilder = [];
  zustand.rows.wohnungs_dokumente = [];
}

beforeEach(() => {
  zustand.upserts = [];
  zustand.rpc = { data: null, error: null };
  zustand.rpcAufrufe = [];
  zustand.neuGeladen = [];
  hausZeile();
});

describe("Belegung und Vormerkung am Objekt im Store", () => {
  it("liest alle Felder mit den abgesprochenen Namen", () => {
    hausZeile({ ...BELEGUNG, vorgemerkt_berater_name: "Paul Partner" });
    const o = getObjekte()[0];
    expect(o.belegung).toBe("reserviert");
    expect(o.belegungKundeId).toBe("k-1");
    expect(o.belegungKundeName).toBe("Anna Beispiel");
    expect(o.belegungAm).toBe(BELEGUNG.belegung_am);
    expect(o.belegungVon).toBe("nutzer-paul");
    expect(o.vorgemerktBeraterName).toBe("Paul Partner");
  });

  it("lässt die Belegung leer, solange die Migration fehlt, und sperrt damit den Knopf", () => {
    const o = getObjekte()[0];
    expect(o.belegung).toBeUndefined();
    expect(hausKnopfStand(o, { darfReservieren: true })).toBe("ohne_migration");
    hausZeile({ belegung: "frei" });
    expect(hausKnopfStand(getObjekte()[0], { darfReservieren: true })).toBe("reservierbar");
  });

  it("überschreibt beim Speichern des ganzen Objekts weder Belegung noch Vormerkung", async () => {
    hausZeile({ ...BELEGUNG, vorgemerkt_bis: "2026-09-23T13:00:00+00:00", vorgemerkt_kunde_id: "k-2" });
    const objekt = getObjekte()[0];
    expect(objekt.belegung).toBe("reserviert");
    expect(await saveObjekt({ ...objekt, titel: "Neuer Titel" })).toBe(true);
    const zeile = zustand.upserts.find((u) => u.tabelle === "objekte")?.zeile || {};
    expect(zeile.titel).toBe("Neuer Titel");
    for (const spalte of OBJEKT_BELEGUNG_SPALTEN) expect(spalte in zeile).toBe(false);
  });

  it("hält die Spalten auch aus der Zeile selbst heraus", () => {
    hausZeile(BELEGUNG);
    const zeile = objektToDbRow(getObjekte()[0]);
    expect(Object.keys(zeile).filter((k) => k.startsWith("belegung") || k.startsWith("vorgemerkt"))).toEqual([]);
  });

  it("zählt die Einheiten an den Einheiten, auch die ausgeblendeten", () => {
    const w = { id: "w" } as ObjektWohnung;
    expect(anzahlEinheiten({ wohnungen: [w, w, w], wohnungenNichtImAngebot: [w] })).toBe(4);
    expect(anzahlEinheiten({ wohnungen: [] })).toBe(0);
    expect(anzahlEinheiten(null)).toBe(0);
  });
});

describe("vormerkeObjekt fragt die Datenbank", () => {
  it("ruft `vormerke_objekt` mit Haus und Kunde und lädt die Objekte neu", async () => {
    zustand.rpc = { data: { ok: true, grund: "vorgemerkt", vorgemerkt_bis: "2026-09-23T12:30:00.000Z" }, error: null };
    const e = await vormerkeObjekt("haus", "k-1");
    expect(zustand.rpcAufrufe).toEqual([{ name: "vormerke_objekt", args: { p_objekt_id: "haus", p_kontakt_id: "k-1" } }]);
    expect(e).toMatchObject({ ok: true, grund: "vorgemerkt", vorgemerktBis: "2026-09-23T12:30:00.000Z" });
    expect(zustand.neuGeladen).toContain("objekte");
  });

  it("gibt Ablehnungen weiter, auch „kein Globalobjekt“", async () => {
    zustand.rpc = { data: { ok: false, grund: "vergeben" }, error: null };
    expect(await vormerkeObjekt("haus", "k-1")).toMatchObject({ ok: false, grund: "vergeben" });
    zustand.rpc = { data: { ok: false, grund: "kein_globalobjekt" }, error: null };
    expect(await vormerkeObjekt("haus", "k-1")).toMatchObject({ ok: false, grund: "kein_globalobjekt" });
  });

  it("meldet die fehlende Migration als eigenen Fall, nie als Erfolg", async () => {
    const warnung = vi.spyOn(console, "warn").mockImplementation(() => {});
    zustand.rpc = { data: null, error: { code: "PGRST202", message: "Could not find the function public.vormerke_objekt" } };
    expect(await vormerkeObjekt("haus", "k-1")).toEqual({ ok: false, grund: "ohne_migration" });
    warnung.mockRestore();
  });

  it("meldet eine unbekannte Antwort als Fehler", async () => {
    const fehler = vi.spyOn(console, "error").mockImplementation(() => {});
    zustand.rpc = { data: { ok: true }, error: null };
    expect(await vormerkeObjekt("haus", "k-1")).toMatchObject({ ok: false, grund: "fehler" });
    fehler.mockRestore();
  });

  it("formuliert die Meldungen in Du-Form, ohne Technik für den Vertrieb", () => {
    expect(objektVormerkMeldung({ ok: false, grund: "ohne_migration" }, { technik: true }).titel)
      .toBe("Migration Globalobjekt-Reservierung noch nicht ausgeführt");
    const vertrieb = objektVormerkMeldung({ ok: false, grund: "ohne_migration" });
    expect(vertrieb.text).not.toContain(".sql");
    expect(vertrieb.text).toContain("Es ist nichts an den Kunden hinausgegangen.");
    for (const grund of ["vergeben", "vorgemerkt_von_anderem", "keine_berechtigung", "kein_globalobjekt", "exklusiv", "nicht_gefunden", "fehler"] as const) {
      expect(objektVormerkMeldung({ ok: false, grund }).text).not.toMatch(/[–—]/);
    }
  });
});

describe("Die gemeinsamen Regeln fürs Haus", () => {
  const jetzt = new Date("2026-09-23T12:00:00Z");

  it("merkt nur ein freies Haus ohne fremde laufende Vormerkung vor", () => {
    expect(hausVormerkenMoeglich({ belegung: "frei" }, "k-1", jetzt)).toEqual({ moeglich: true });
    expect(hausVormerkenMoeglich({ belegung: "reserviert", kundeId: "k-2" }, "k-1", jetzt)).toMatchObject({ moeglich: false, grund: "vergeben" });
    expect(hausVormerkenMoeglich({ belegung: "frei", vorgemerktBis: "2026-09-23T12:30:00Z", vorgemerktKundeId: "k-2" }, "k-1", jetzt))
      .toMatchObject({ moeglich: false, grund: "vorgemerkt_von_anderem" });
    // Die eigene Vormerkung verlängert, eine abgelaufene zählt nicht.
    expect(hausVormerkenMoeglich({ belegung: "frei", vorgemerktBis: "2026-09-23T12:30:00Z", vorgemerktKundeId: "k-1" }, "k-1", jetzt)).toEqual({ moeglich: true });
    expect(hausVormerkenMoeglich({ belegung: "frei", vorgemerktBis: "2026-09-23T11:30:00Z", vorgemerktKundeId: "k-2" }, "k-1", jetzt)).toEqual({ moeglich: true });
  });

  it("lässt nach der Unterschrift die erste gewinnen, ohne Rücksicht auf eine Vormerkung", () => {
    expect(hausReservierungNachUnterschrift({ belegung: "frei" }, "k-1")).toBe("frei");
    expect(hausReservierungNachUnterschrift({ belegung: "reserviert", kundeId: "k-1" }, "k-1")).toBe("schon_fuer_diesen_kunden");
    expect(hausReservierungNachUnterschrift({ belegung: "reserviert", kundeId: "k-2" }, "k-1")).toBe("vergeben");
    expect(hausReservierungNachUnterschrift({ belegung: "verkauft", kundeId: "k-1" }, "k-1")).toBe("vergeben");
  });
});

describe("Reservieren nach der Unterschrift, für die Edge Functions", () => {
  const AUFTRAG = { objektId: "haus", kontaktId: "k-1", kundeName: "Anna Beispiel", reserviertAm: "2026-09-23T12:00:00.000Z", reserviertVon: "partner-1" };
  const client = (antwort: { data: unknown; error: unknown }) => {
    const aufrufe: Array<{ name: string; args?: Record<string, unknown> }> = [];
    return { aufrufe, db: { rpc: (name: string, args?: Record<string, unknown>) => { aufrufe.push({ name, args }); return Promise.resolve(antwort); } } };
  };

  it("ruft die Datenbankfunktion mit allen Angaben", async () => {
    const { db, aufrufe } = client({ data: { ergebnis: "reserviert" }, error: null });
    expect(await reserviereObjektNachUnterschrift(db, AUFTRAG)).toMatchObject({ ergebnis: "reserviert" });
    expect(aufrufe).toEqual([{ name: "reserviere_objekt_nach_unterschrift", args: {
      p_objekt_id: "haus", p_kontakt_id: "k-1", p_kunde_name: "Anna Beispiel",
      p_belegung_am: "2026-09-23T12:00:00.000Z", p_belegung_von: "partner-1",
    } }]);
  });

  it("gibt den Konflikt weiter, samt Stand des Hauses", async () => {
    const { db } = client({ data: { ergebnis: "vergeben", belegung: "reserviert", kunde_id: "k-2", kunde_name: "Bernd" }, error: null });
    expect(await reserviereObjektNachUnterschrift(db, AUFTRAG)).toEqual({ ergebnis: "vergeben", belegung: "reserviert", kundeId: "k-2", kundeName: "Bernd" });
  });

  it("meldet ohne Migration einen Fehler und nimmt keinen Rückfallweg", async () => {
    const { db } = client({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    const e = await reserviereObjektNachUnterschrift(db, AUFTRAG);
    expect(e).toMatchObject({ ergebnis: "fehler", ohneMigration: true });
  });

  it("meldet eine unbekannte Antwort als Fehler, nie als reserviert", async () => {
    const { db } = client({ data: { ergebnis: "irgendwas" }, error: null });
    expect((await reserviereObjektNachUnterschrift(db, AUFTRAG)).ergebnis).toBe("fehler");
  });
});

describe("finalize-reservierung beim ganzen Haus", () => {
  const quelle = lies("supabase/functions/finalize-reservierung/index.ts");

  it("reserviert das Haus über den gemeinsamen Helfer, nie eine Einheit", () => {
    expect(quelle).toContain("reserviereObjektNachUnterschrift(");
    expect(quelle).toContain('const gesamtobjekt = rvData.gesamtobjekt === true;');
    expect(quelle).toContain("let resolvedWohnungId = gesamtobjekt ? null : (nextMeta.wohnungId || null);");
    expect(quelle).not.toMatch(/from\("objekte"\)\s*\.update\(/);
  });

  it("läutet im Konfliktfall mit eigenem Titel und vermerkt ohne den Namen des anderen Kunden", () => {
    expect(quelle).toContain("Haus inzwischen vergeben: ${notifKundeName}");
    expect(quelle).toContain("Einheit inzwischen vergeben: ${notifKundeName}");
    expect(quelle).toContain("...(gesamtobjekt ? { objektId: hausObjektId, gesamtobjekt: true } : {}),");
    expect(quelle).toContain("Es wurde nichts reserviert, und an den Kunden ging keine Zahlungsaufforderung. Bitte den Kunden informieren.");
    expect(quelle).not.toMatch(/rvReservierungEntfallenGrund[^\n]*konflikt\.kundeName/);
  });

  it("kennt bei der Gesellschaft keine Widerrufsfrist", () => {
    expect(quelle).toContain('const ohneWiderruf = ohneGebuehr || (gesamtobjekt && rvData.kaeuferArt === "gesellschaft");');
    expect(quelle).toMatch(/const widerrufWahl = ohneWiderruf\s*\? "sofort"/);
  });

  it("gibt der Vertragskopie Haus und fehlende Belehrung mit", () => {
    expect(quelle).toContain("...(rvData.gesamtobjekt === true ? { gesamtobjekt: true } : {}),");
    expect(quelle).toContain('...(rvData.gesamtobjekt === true && rvData.kaeuferArt === "gesellschaft" ? { ohneWiderruf: true } : {}),');
  });
});

describe("send-reservierung-eskalation beim ganzen Haus", () => {
  const quelle = lies("supabase/functions/send-reservierung-eskalation/index.ts");

  it("reserviert nach der Frist das Haus, ein Fehler lässt den Vorgang offen", () => {
    expect(quelle).toContain("reserviereObjektNachUnterschrift(");
    expect(quelle).toContain('if (haus.ergebnis === "fehler" || haus.ergebnis === "nicht_gefunden") {');
    expect(quelle).toContain("let frei = !gesamtobjekt;");
  });
});

describe("Die Vertragskopie", () => {
  const vorlage = lies("supabase/functions/_shared/transactional-email-templates/reservierung-kopie.tsx");

  it("spricht beim Haus vom Objekt und kündigt bei der Gesellschaft keine Belehrung an", () => {
    // Seit Etappe 2 der Kundensprache stehen die Texte im Objekt TEXTE, je Sprache.
    expect(vorlage).toContain("Leider war ${gesamt ? 'das Objekt' : 'die Wohnung'} zum Zeitpunkt Ihrer Unterschrift");
    expect(vorlage).toContain("the ${gesamt ? 'property' : 'apartment'} had already been allocated");
    expect(vorlage).toContain("${mitWiderruf ? ' und enthält die Widerrufsbelehrung' : ''}");
    expect(vorlage).toContain("t.einleitung(objektTitel || '', !(ohneGebuehr || ohneWiderruf))");
  });
});

describe("Die Migration", () => {
  const sql = lies("supabase/migrations/20260923152000_globalobjekt_reservierung.sql");

  it("liegt, solange sie offen ist, als gleiche Kopie im Eingangskorb", () => {
    // Nach dem Ausfuehren nimmt Christian die Kopie aus dem Korb (README dort).
    // Liegt sie noch dort, muss sie der Historie gleichen.
    const kopie = resolve(__dirname, "../..", "supabase/migrations-inbox/20260923152000_globalobjekt_reservierung.sql");
    if (existsSync(kopie)) expect(readFileSync(kopie, "utf-8")).toBe(sql);
  });

  it("legt die Spalten wiederholbar an, mit Prüfung und Verweisen auf den Kontakt", () => {
    for (const spalte of [
      "belegung text NOT NULL DEFAULT 'frei'", "belegung_kunde_id uuid", "belegung_kunde_name text", "belegung_am timestamptz",
      "belegung_von uuid", "vorgemerkt_bis timestamptz", "vorgemerkt_kunde_id uuid", "vorgemerkt_kunde_name text",
      "vorgemerkt_von uuid", "vorgemerkt_berater_name text",
    ]) {
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${spalte}`);
    }
    expect(sql).toContain("CHECK (belegung IN ('frei', 'reserviert', 'verkauft'))");
    expect(sql).toContain("FOREIGN KEY (belegung_kunde_id) REFERENCES public.kontakte(id) ON DELETE SET NULL");
  });

  it("merkt in einem Schritt vor, mit denselben Prüfungen wie bei der Einheit", () => {
    const vormerken = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.vormerke_objekt"), sql.indexOf("REVOKE ALL ON FUNCTION public.vormerke_objekt"));
    expect(vormerken).toContain("SECURITY DEFINER");
    expect(vormerken).toContain("SET search_path = public");
    expect(vormerken).toContain("interval '60 minutes'");
    expect(vormerken).toContain("public.darf_reservieren(v_uid)");
    expect(vormerken).toContain("public.darf_kontakt_bearbeiten(v_uid, p_kontakt_id)");
    expect(vormerken).toContain("'kein_globalobjekt'");
    expect(vormerken).toContain("'exklusiv'");
    expect(vormerken).toMatch(/o\.vorgemerkt_bis IS NULL\s+OR o\.vorgemerkt_bis <= now\(\)\s+OR o\.vorgemerkt_kunde_id = p_kontakt_id/);
    expect(vormerken).not.toMatch(/SET belegung/);
  });

  it("gibt das Vormerken nur Angemeldeten und das Reservieren nur der Dienstrolle", () => {
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.vormerke_objekt(uuid, uuid) FROM public, anon;");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.reserviere_objekt_nach_unterschrift\(uuid, uuid, text, timestamptz, uuid\)\s+FROM public, anon, authenticated;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.reserviere_objekt_nach_unterschrift\(uuid, uuid, text, timestamptz, uuid\)\s+TO service_role;/);
  });

  it("reserviert nur frei oder schon für diesen Kunden, die fremde Vormerkung hält nicht auf", () => {
    const reservieren = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.reserviere_objekt_nach_unterschrift"), sql.indexOf("REVOKE ALL ON FUNCTION public.reserviere_objekt_nach_unterschrift"));
    expect(reservieren).toContain("vorgemerkt_bis = NULL");
    expect(reservieren).toContain("'vergeben'");
    const bedingung = reservieren.slice(reservieren.indexOf("WHERE o.id = p_objekt_id\n     AND ("), reservieren.indexOf("RETURNING o.id INTO v_treffer"));
    expect(bedingung).toContain("o.belegung_kunde_id = p_kontakt_id");
    expect(bedingung).not.toContain("vorgemerkt_bis");
  });

  it("schützt den Kunden am reservierten Haus: wechseln nur Admin und Inhaber", () => {
    const ausloeser = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.objekt_belegung_pruefen()"));
    expect(ausloeser).toContain("kundenwechsel AND NOT public.is_admin_role(auth.uid())");
    expect(ausloeser).toContain("NOT coalesce(NEW.global_objekt, false)");
    // Der Globalobjekt-Riegel steht VOR dem Ausstieg für die Dienstrolle.
    expect(ausloeser.indexOf("NEW.global_objekt")).toBeLessThan(ausloeser.indexOf("IF auth.uid() IS NULL THEN"));
    expect(sql).toContain("BEFORE UPDATE OF belegung, belegung_kunde_id ON public.objekte");
    expect(sql).toContain("NOTIFY pgrst, 'reload schema';");
  });

  it("hat eine lesende Prüfabfrage im Kopf und kein Fragezeichen", () => {
    expect(sql).toContain("to_regprocedure('public.vormerke_objekt(uuid,uuid)') is not null");
    expect(sql).not.toContain("?");
  });
});

/* ── Anzeige: Objektübersicht und Empfehlungsliste ── */

function we(id: string, teile: Partial<ObjektWohnung> = {}): ObjektWohnung {
  return {
    id, weNr: "1", etage: "EG", lage: "", groesse: 50, zimmer: 2, mieteGesamt: 800,
    vkGesamt: 100000, qmPreis: 0, rendite: 0, vermietet: true, status: "frei", ...teile,
  };
}

function globalHaus(teile: Partial<ObjektData> = {}): ObjektData {
  return {
    id: "g", titel: "Haus g", adresse: "Teststraße 1", plz: "80331", ort: "München", beschreibung: "", highlights: [],
    bildUrl: "", bilder: [], dokumente: [], wohnungen: [we("w1"), we("w2")], videoUrl: "", videoSichtbar: false, badge: "",
    groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0, renditeVon: 0, renditeBis: 0, sichtbar: true,
    erstellt_am: "2026-01-01", meta: {}, globalObjekt: true, belegung: "frei",
    globalDaten: { verkaufspreis: 270000 } as ObjektData["globalDaten"],
    ...teile,
  } as ObjektData;
}

describe("Die Objektübersicht zeigt das reservierte Haus", () => {
  it("setzt den Aufdruck „Reserviert“, obwohl die Einheiten frei heißen", () => {
    expect(uebersichtsBelegung(globalHaus({ belegung: "reserviert" }))).toMatchObject({ vollBelegt: true, aufdruck: "Reserviert" });
    expect(uebersichtsBelegung(globalHaus({ belegung: "verkauft" }))).toMatchObject({ vollBelegt: true, aufdruck: "Verkauft" });
    expect(uebersichtsBelegung(globalHaus()).vollBelegt).toBe(false);
  });

  it("lässt Objekte mit Einheiten unverändert", () => {
    expect(uebersichtsBelegung(globalHaus({ globalObjekt: false, belegung: "reserviert" })).vollBelegt).toBe(false);
  });

  it("stellt das reservierte Haus unter „Nicht verfügbar“", () => {
    expect(istVerfuegbar(globalHaus())).toBe(true);
    expect(istVerfuegbar(globalHaus({ belegung: "reserviert" }))).toBe(false);
  });
});

describe("Die Empfehlungsliste schließt ein vergebenes Haus aus", () => {
  const optionen = (kundeId = "k-1") => ({
    nutzer: { rolle: "admin" }, kundeId, rahmen: { von: 250000, bis: 300000 },
    wohnort: { lat: 47.86, lng: 12.12 }, objektKoordinate: () => ({ lat: 48.14, lng: 11.58 }),
    jetzt: new Date("2026-09-23T12:00:00Z"),
  });

  it("nimmt ein reserviertes Haus nicht auf", () => {
    expect(empfehlungsKandidaten([globalHaus()], optionen())).toHaveLength(1);
    expect(empfehlungsKandidaten([globalHaus({ belegung: "reserviert", belegungKundeId: "k-9" })], optionen())).toHaveLength(0);
  });

  it("nimmt ein für einen anderen Kunden vorgemerktes Haus nicht auf, das eigene schon", () => {
    const vorgemerkt = globalHaus({ vorgemerktBis: "2026-09-23T12:30:00Z", vorgemerktKundeId: "k-2" });
    expect(empfehlungsKandidaten([vorgemerkt], optionen("k-1"))).toHaveLength(0);
    const k = empfehlungsKandidaten([vorgemerkt], optionen("k-2"));
    expect(k).toHaveLength(1);
    expect(k[0].vorgemerktFuerKunde).toBe(true);
  });
});

describe("Der Notar-Aufnahmebogen fragt beim ganzen Haus nicht nach einer Wohnung", () => {
  it("zählt die Wohnungsnummer laut Teilungserklärung beim Globalobjekt nicht als Lücke", async () => {
    const { notarbogenLuecken } = await import("@/lib/notarbogenFelder");
    const felder = (data: Record<string, unknown>) => notarbogenLuecken(data as never, 2).map((l) => l.feld);
    expect(felder({})).toContain("obj_wohnungsnummer");
    expect(felder({ obj_gesamtobjekt: true })).not.toContain("obj_wohnungsnummer");
    // Die übrigen Angaben zum Vertragsobjekt bleiben Pflicht.
    expect(felder({ obj_gesamtobjekt: true })).toContain("flnr");
  });
});

describe("Kein fremder Kundenname über den Kundenlink", () => {
  it("gibt über die abgeschaltete Objektvorstellung weder Haus noch Einheit heraus", () => {
    // Bis zum 23.09.2026 blendete die Function Belegung und Vormerkung an Haus
    // und Einheiten aus. Seit die Objektvorstellung abgeschaltet ist, liest sie
    // Objekte und Einheiten gar nicht mehr, nur noch den Partner. Die genaue
    // Prüfung steht in `objektvorstellungAntwort.test.ts`.
    for (const datei of ["supabase/functions/get-objektvorstellung/index.ts", "supabase/functions/get-objektvorstellung/antwort.ts"]) {
      const quelle = lies(datei);
      expect(quelle).not.toMatch(/from\(\s*["'](objekte|wohnungen)["']/);
    }
  });

  it("lässt das öffentliche Exposé bei seiner Positivliste ohne Belegungsspalten", () => {
    const liste = lies("supabase/functions/_shared/expose-oeffentlich.ts");
    const objektSpalten = liste.slice(liste.indexOf("const OBJEKT_SPALTEN"), liste.indexOf("] as const;", liste.indexOf("const OBJEKT_SPALTEN")));
    expect(objektSpalten).not.toContain("belegung");
    expect(objektSpalten).not.toContain("vorgemerkt");
  });
});
