/**
 * Provisionsabrechnung seit dem 04.10.2026: je Investment, in Cent, ohne
 * bereits Ausgezahltes in „Fällig“, gesperrte Bescheide, sichtbar fehlender
 * Kaufpreis, Abrechnungsmonat in deutscher Zeit.
 */
import { existsSync, readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  abgerechneteGeschaefte,
  abrechnungsHistorie,
  notarDatumFuer,
  abrechnungsstand,
  investmentsOhneKaufpreis,
  kaufpreisMitRueckfall,
  provisionCent,
} from "./abrechnungRechnung";
import { istKaufphaseVorNotar, istProvisionsrelevant, ABSCHLUSS_STUFEN, ABWICKLUNG_STUFEN } from "./abschlussDefinition";
import { monatBerlinIso } from "./datumsformate";

const zeilen: any[] = [];
const upserts: any[] = [];
let naechsterFehler: unknown = null;
let nachFehler: (() => void) | null = null;
vi.mock("./dataCache", async (original) => ({
  ...(await original<typeof import("./dataCache")>()),
  cacheGet: (tabelle: string) => (tabelle === "provisionsabrechnungen" ? zeilen : []),
  cacheRefreshTable: async () => {},
  cacheUpsert: async (_t: string, row: any) => {
    if (naechsterFehler) {
      const f = naechsterFehler;
      naechsterFehler = null;
      nachFehler?.();
      nachFehler = null;
      throw f;
    }
    upserts.push(row);
    const i = zeilen.findIndex((z) => z.id === row.id);
    if (i >= 0) zeilen[i] = row;
    else zeilen.push(row);
    return row;
  },
}));

const loeschStand = vi.hoisted(() => ({
  aufrufe: [] as unknown[][],
  antwort: { data: [{ id: "b-1" }], error: null } as { data: unknown; error: unknown },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const kette: any = {
        delete: () => kette,
        eq: (spalte: string, wert: unknown) => { loeschStand.aufrufe.push(["eq", spalte, wert]); return kette; },
        select: (spalten: string) => { loeschStand.aufrufe.push(["select", spalten]); return Promise.resolve(loeschStand.antwort); },
      };
      return kette;
    },
  },
}));

const store = await import("./provisionsAbrechnungStore");

describe("provisionCent", () => {
  it("rechnet Kaufpreis mal Satz in ganzen Cent", () => {
    expect(provisionCent(289_900, 4)).toBe(1_159_600);
    expect(provisionCent(199_999.99, 3.5)).toBe(700_000); // 6.999,9996 € -> 7.000,00 €
    expect(provisionCent(123_457, 3.33)).toBe(411_112); // 4.111,1181 €
  });
  it("ohne Preis oder Satz null", () => {
    expect(provisionCent(0, 4)).toBe(0);
    expect(provisionCent(100_000, 0)).toBe(0);
  });
  it("summiert ohne Rundungsdrift: drei Posten zu je 0,5 Cent Rest", () => {
    // Vorher: jede Summe auf ganze Euro gerundet.
    const posten = [100_001.25, 100_001.25, 100_001.25].map((kp) => provisionCent(kp, 4));
    expect(posten.reduce((a, b) => a + b, 0) / 100).toBe(12_000.15);
  });
});

describe("abrechnungsstand", () => {
  const bescheide = [
    { status: "ausgezahlt", monat: "2026-08", eigeneDeals: [{ investmentId: "inv-1", kontaktId: "k-1" }, { kontaktId: "k-alt" }] },
    { status: "freigegeben", monat: "2026-09", eigeneDeals: [{ investmentId: "inv-2", kontaktId: "k-2" }] },
    { status: "offen", monat: "2026-09", eigeneDeals: [{ investmentId: "inv-3", kontaktId: "k-3" }] },
  ];
  const nurAusgezahlt = abgerechneteGeschaefte(bescheide);
  const auchFreigegeben = abgerechneteGeschaefte(bescheide, ["ausgezahlt", "freigegeben"]);
  const g = (investmentId: string, kontaktId: string, notarMonat = "") => ({ investmentId, kontaktId, notarMonat });

  it("Investment-Kennung entscheidet, Status je nach Zweck", () => {
    expect(abrechnungsstand(nurAusgezahlt, g("inv-1", "k-1"), [])).toBe("ja");
    expect(abrechnungsstand(nurAusgezahlt, g("inv-2", "k-2"), [])).toBe("nein");
    expect(abrechnungsstand(auchFreigegeben, g("inv-2", "k-2"), [])).toBe("ja");
    expect(abrechnungsstand(auchFreigegeben, g("inv-3", "k-3"), [])).toBe("nein");
  });
  it("ein zweites Investment desselben Kunden ist nicht mitbezahlt", () => {
    expect(abrechnungsstand(nurAusgezahlt, g("inv-9", "k-1", "2026-08"), [])).toBe("nein");
  });
  it("Altbescheid ohne Kennung: nur das einzige Investment mit Notartermin im Bescheidmonat", () => {
    const a = g("a", "k-alt", "2026-08");
    const b = g("b", "k-alt", "2026-10");
    expect(abrechnungsstand(nurAusgezahlt, a, [a, b])).toBe("ja");
    // anderer Monat: nicht eindeutig, bitte klären statt still bezahlt
    expect(abrechnungsstand(nurAusgezahlt, b, [a, b])).toBe("klaeren");
  });
  it("Altbescheid ohne Kennung, zwei Investments im selben Monat oder ohne Notartermin: klären", () => {
    const a = g("a", "k-alt", "2026-08");
    const c = g("c", "k-alt", "2026-08");
    expect(abrechnungsstand(nurAusgezahlt, a, [a, c])).toBe("klaeren");
    expect(abrechnungsstand(nurAusgezahlt, g("d", "k-alt", ""), [])).toBe("klaeren");
  });
});

describe("kaufpreisMitRueckfall", () => {
  it("Investmentpreis zuerst", () => {
    expect(kaufpreisMitRueckfall(300_000, 250_000, 3)).toBe(300_000);
  });
  it("Kontaktwert nur bei genau einem Investment", () => {
    expect(kaufpreisMitRueckfall(0, 250_000, 1)).toBe(250_000);
    expect(kaufpreisMitRueckfall(0, 250_000, 2)).toBe(0);
    expect(kaufpreisMitRueckfall(0, 250_000, 0)).toBe(0);
  });
});

describe("investmentsOhneKaufpreis", () => {
  const kontakte = new Map<string, any>([
    ["k1", { kaufpreis: 0 }],
    ["k2", { kaufpreis: 250_000 }],
    ["k3", { kaufpreis: 0, archiviert: true }],
    ["k4", { kaufpreis: 0, pipelineStufe: "verloren" }],
    ["k5", { kaufpreis: 250_000 }],
  ]);
  const preis = (id: string) => (id === "mit" ? 300_000 : 0);
  const liste = investmentsOhneKaufpreis(
    [
      { id: "a", kontaktId: "k1", pipelineStufe: "reservierung" },
      { id: "b", kontaktId: "k1", pipelineStufe: "bonitaetsunterlagen" },
      { id: "c", kontaktId: "k1", pipelineStufe: "objektauswahl" },
      { id: "mit", kontaktId: "k1", pipelineStufe: "notar" },
      { id: "d", kontaktId: "k2", pipelineStufe: "finanzierung" },
      { id: "e", kontaktId: "k3", pipelineStufe: "notar" },
      { id: "f", kontaktId: "k4", pipelineStufe: "notar" },
      { id: "g", kontaktId: "k1", pipelineStufe: "verloren" },
      { id: "h1", kontaktId: "k5", pipelineStufe: "notar" },
      { id: "h2", kontaktId: "k5", pipelineStufe: "reservierung" },
    ],
    kontakte,
    preis,
  );
  it("ab Reservierung ohne eigenen Preis; Kontaktwert nur bei genau einem Investment", () => {
    expect(liste.map((e) => e.investmentId)).toEqual(["a", "b", "h1", "h2"]);
  });
});

describe("Kaufphase gegen die Datenbank", () => {
  it("Abwicklung plus Abschluss ist genau pipelinestufe_ist_kaufphase", () => {
    const sql = readFileSync("supabase/migrations/20260929140000_provisionssatz_ab_reservierung.sql", "utf8");
    const rumpf = /pipelinestufe_ist_kaufphase\(_stufe text\)[\s\S]*?IN \(([\s\S]*?)\);/.exec(sql)?.[1] ?? "";
    const db = [...rumpf.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(db.length).toBeGreaterThan(5);
    expect([...ABWICKLUNG_STUFEN, ...ABSCHLUSS_STUFEN].sort()).toEqual(db);
    for (const s of db) expect(istProvisionsrelevant(s)).toBe(true);
  });
  it("Prognose ohne Notardatum: Reservierung bis Notar, nicht danach", () => {
    for (const s of ["reservierung", "bonitaetsunterlagen", "finanzierung", "notar"]) {
      expect(istKaufphaseVorNotar(s)).toBe(true);
    }
    for (const s of ["faelligkeit", "abrechnung", "abgeschlossen", "objektauswahl", "verloren", "notartermin"]) {
      expect(istKaufphaseVorNotar(s)).toBe(false);
    }
  });
});

describe("monatBerlinIso", () => {
  it("Nacht zum Monatsersten zählt zum neuen Monat", () => {
    // 01.10.2026 00:30 Uhr Berlin = 30.09. 22:30 UTC
    expect(monatBerlinIso(new Date("2026-09-30T22:30:00.000Z"))).toBe("2026-10");
    expect(new Date("2026-09-30T22:30:00.000Z").toISOString().slice(0, 7)).toBe("2026-09");
  });
  it("liest ISO-Datum und deutsches Datum, Unlesbares ergibt leer", () => {
    expect(monatBerlinIso("2026-11-01")).toBe("2026-11");
    expect(monatBerlinIso("15.12.2026")).toBe("2026-12");
    expect(monatBerlinIso("kaputt")).toBe("");
  });
});

describe("provisionsAbrechnungStore", () => {
  beforeEach(() => {
    zeilen.length = 0;
    upserts.length = 0;
    naechsterFehler = null;
  });

  const bescheid = (status: "offen" | "freigegeben" | "ausgezahlt", netto: number) => ({
    id: "b-1", monat: "2026-10", userId: "u-1", userName: "P", eigeneDeals: [],
    overridesErhalten: [], overheadsAbgezogen: [], summeEigen: netto, summeOverridesErhalten: 0,
    summeOverhead: 0, netto, status, erstelltAm: "2026-10-01T00:00:00.000Z",
  });

  it("offener Bescheid bekommt die neuen Zahlen", async () => {
    await store.upsertAbrechnung(bescheid("offen", 100));
    await store.upsertAbrechnung({ ...bescheid("offen", 200), id: "neu" });
    expect(upserts.at(-1).netto).toBe(200);
    expect(upserts.at(-1).id).toBe("b-1");
  });

  it("freigegebener oder ausgezahlter Bescheid behält seine Zahlen, nur der PDF-Vermerk kommt dazu", async () => {
    for (const status of ["freigegeben", "ausgezahlt"] as const) {
      zeilen.length = 0;
      await store.upsertAbrechnung(bescheid(status, 100));
      await store.upsertAbrechnung({ ...bescheid("offen", 999), pdfErstelltAm: "2026-10-04T10:00:00.000Z" });
      const letzte = upserts.at(-1);
      expect(letzte.netto).toBe(100);
      expect(letzte.status).toBe(status);
      expect(letzte.pdf_erstellt_am).toBe("2026-10-04T10:00:00.000Z");
    }
  });

  it("ein Rechte- oder Sperrfehler wird gemeldet und weicht NICHT auf den Browser aus", async () => {
    naechsterFehler = { code: "42501", message: "new row violates row-level security policy" };
    await expect(store.upsertAbrechnung(bescheid("offen", 1))).rejects.toThrow(/Schreibrecht/);
    expect(store.abrechnungenPersistenz()).toBe("datenbank");

    naechsterFehler = { code: "P0001", message: "Bescheid ist gesperrt (Status ausgezahlt)" };
    await expect(store.updateAbrechnungStatus("x", "offen", "A")).resolves.toBeNull();
    zeilen.push({ id: "s-1", monat: "2026-10", user_id: "u-2", status: "offen" });
    naechsterFehler = { code: "P0001", message: "Bescheid ist gesperrt (Status ausgezahlt)" };
    await expect(store.updateAbrechnungStatus("s-1", "freigegeben", "A")).rejects.toThrow(/freigegeben oder ausgezahlt/);
    expect(store.abrechnungenPersistenz()).toBe("datenbank");
  });

  describe("Rechnung bezahlt bei vorhandenem Monatsbescheid", () => {
    const vorhanden = (deals: { investmentId?: string; kontaktId: string; betrag: number }[], netto: number) => ({
      id: "m-1", monat: "2026-10", user_id: "u-9", user_name: "P", status: "offen", netto, summe_eigen: netto,
      eigene_deals: deals.map((d) => ({ ...d, kundeName: "K", objekt: "O", kaufpreis: 1, satz: 4 })),
    });
    const deal = (investmentId: string) => ({ investmentId, kontaktId: "k", kundeName: "K", objekt: "O", kaufpreis: 1, satz: 4, betrag: 500 });

    it("gleiche Investments und gleicher Betrag: ausgezahlt", async () => {
      zeilen.push(vorhanden([{ investmentId: "i-1", kontaktId: "k", betrag: 500 }], 500));
      const r = await store.setzeRechnungBezahlt({ userId: "u-9", name: "P" }, "2026-10", 500, true, "B", [deal("i-1")]);
      expect(r?.status).toBe("ausgezahlt");
    });
    it("andere Investments: Meldung, nichts geändert", async () => {
      zeilen.push(vorhanden([{ investmentId: "i-1", kontaktId: "k", betrag: 500 }], 500));
      await expect(
        store.setzeRechnungBezahlt({ userId: "u-9", name: "P" }, "2026-10", 500, true, "B", [deal("i-2")]),
      ).rejects.toBeInstanceOf(store.BescheidWeichtAb);
      expect(upserts).toHaveLength(0);
    });
    it("anderer Betrag oder Altposten ohne Kennung: Meldung, nichts geändert", async () => {
      zeilen.push(vorhanden([{ investmentId: "i-1", kontaktId: "k", betrag: 500 }], 500));
      await expect(
        store.setzeRechnungBezahlt({ userId: "u-9", name: "P" }, "2026-10", 500.01, true, "B", [deal("i-1")]),
      ).rejects.toThrow(/weicht ab/);
      zeilen.length = 0;
      zeilen.push(vorhanden([{ kontaktId: "k", betrag: 500 }], 500));
      await expect(
        store.setzeRechnungBezahlt({ userId: "u-9", name: "P" }, "2026-10", 500, true, "B", [deal("i-1")]),
      ).rejects.toThrow(/weicht ab/);
      expect(upserts).toHaveLength(0);
    });
  });

  it("nur eine fehlende Tabelle führt auf den Browser-Speicher", () => {
    expect(store.istTabelleFehlt({ code: "PGRST205", message: "Could not find the table" })).toBe(true);
    expect(store.istTabelleFehlt({ code: "42P01" })).toBe(true);
    expect(store.istTabelleFehlt({ code: "42501", message: "permission denied" })).toBe(false);
    expect(store.istTabelleFehlt({ message: "Failed to fetch" })).toBe(false);
  });
});

describe("zweiter Durchgang: Konflikt, Doppelung, Positionen, Notartermin", () => {
  beforeEach(() => {
    zeilen.length = 0;
    upserts.length = 0;
    naechsterFehler = null;
    nachFehler = null;
  });
  const zeile = (id: string, monat: string, status: string, deals: { investmentId?: string; kontaktId: string; betrag: number }[], netto = 500) => ({
    id, monat, user_id: "u-1", user_name: "P", status, netto, summe_eigen: netto,
    eigene_deals: deals.map((d) => ({ kundeName: "K", objekt: "O", kaufpreis: 1, satz: 4, ...d })),
  });
  const bescheid = (id: string, deals: string[]) => ({
    id, monat: "2026-10", userId: "u-1", userName: "P",
    eigeneDeals: deals.map((investmentId) => ({ investmentId, kontaktId: "k", kundeName: "K", objekt: "O", kaufpreis: 1, satz: 4, betrag: 500 })),
    overridesErhalten: [], overheadsAbgezogen: [], summeEigen: 500, summeOverridesErhalten: 0, summeOverhead: 0,
    netto: 500, status: "offen" as const, erstelltAm: "2026-10-01T00:00:00.000Z",
  });

  it("23505: nachladen, mit dem gespeicherten Bescheid neu prüfen, unter dessen Kennung speichern", async () => {
    naechsterFehler = { code: "23505", message: "duplicate key value violates unique constraint" };
    // Beim Nachladen taucht der Bescheid auf, den dieser Browser nicht kannte.
    nachFehler = () => zeilen.push(zeile("alt-1", "2026-10", "offen", []));
    await store.upsertAbrechnung(bescheid("neu-1", ["i-1"]));
    expect(upserts.at(-1).id).toBe("alt-1");
  });
  it("23505 gegen einen gesperrten Bescheid: dessen Zahlen bleiben", async () => {
    naechsterFehler = { code: "23505", message: "duplicate key" };
    nachFehler = () => zeilen.push(zeile("alt-2", "2026-10", "ausgezahlt", [{ investmentId: "i-9", kontaktId: "k", betrag: 100 }], 100));
    await store.upsertAbrechnung(bescheid("neu-2", ["i-1"]));
    expect(upserts.at(-1).id).toBe("alt-2");
    expect(upserts.at(-1).netto).toBe(100);
  });
  it("dataCache wertet 23505 nicht mehr als gespeichert", () => {
    const quelle = readFileSync("src/lib/dataCache.ts", "utf8");
    const upsert = quelle.slice(quelle.indexOf("export async function cacheUpsert"), quelle.indexOf("export async function cacheUpsert") + 2500);
    expect(upsert).not.toMatch(/isDuplicate\) \{ lastError = null; break; \}/);
  });

  it("Freigeben lehnt ab, wenn ein Investment schon in einem anderen freigegebenen Bescheid steht", async () => {
    zeilen.push(zeile("sept", "2026-09", "freigegeben", [{ investmentId: "i-1", kontaktId: "k", betrag: 500 }]));
    zeilen.push(zeile("okt", "2026-10", "offen", [{ investmentId: "i-1", kontaktId: "k", betrag: 500 }]));
    await expect(store.updateAbrechnungStatus("okt", "freigegeben", "A")).rejects.toBeInstanceOf(store.AbschlussDoppelt);
    expect(upserts).toHaveLength(0);
  });
  it("Freigeben geht, wenn das Investment nur in einem offenen Bescheid steht", async () => {
    zeilen.push(zeile("sept", "2026-09", "offen", [{ investmentId: "i-1", kontaktId: "k", betrag: 500 }]));
    zeilen.push(zeile("okt", "2026-10", "offen", [{ investmentId: "i-1", kontaktId: "k", betrag: 500 }]));
    expect((await store.updateAbrechnungStatus("okt", "freigegeben", "A"))?.status).toBe("freigegeben");
  });
  it("Rechnung bezahlt ohne Monatsbescheid prüft vor dem Anlegen", async () => {
    zeilen.push(zeile("sept", "2026-09", "ausgezahlt", [{ investmentId: "i-1", kontaktId: "k", betrag: 500 }]));
    const deal = { investmentId: "i-1", kontaktId: "k", kundeName: "K", objekt: "O", kaufpreis: 1, satz: 4, betrag: 500 };
    await expect(
      store.setzeRechnungBezahlt({ userId: "u-1", name: "P" }, "2026-10", 500, true, "B", [deal]),
    ).rejects.toBeInstanceOf(store.AbschlussDoppelt);
    expect(upserts).toHaveLength(0);
  });

  it("Positionen werden je Investment auf den Cent verglichen", () => {
    const b = { eigeneDeals: [{ investmentId: "a", betrag: 300 }, { investmentId: "b", betrag: 200 }] as any, netto: 500 };
    expect(store.bescheidPasst(b, [{ investmentId: "a", betrag: 300 }, { investmentId: "b", betrag: 200 }], 500)).toBe(true);
    // gleiche Summe, andere Verteilung
    expect(store.bescheidPasst(b, [{ investmentId: "a", betrag: 250 }, { investmentId: "b", betrag: 250 }], 500)).toBe(false);
    expect(store.bescheidPasst(b, [{ investmentId: "a", betrag: 300.01 }, { investmentId: "b", betrag: 199.99 }], 500)).toBe(false);
  });

  it("Altbescheide nur über den Notartermin zuordnen, kein Rückfall auf Änderungsdatum", () => {
    expect(notarDatumFuer({ notarTermin: "" }, { notarTermin: "", aktualisiert_am: "2026-10-01" } as any)).toBe("");
    expect(notarDatumFuer({ notarTermin: "" }, { notarTermin: "2026-08-03" })).toBe("2026-08-03");
    const prov = readFileSync("src/pages/Provisionsabrechnung.tsx", "utf8");
    const abr = readFileSync("src/pages/Abrechnungen.tsx", "utf8");
    expect(prov).toContain("notarMonat: monatBerlinIso(notarDatumFuer(inv, k))");
    expect(abr).toContain("notarMonat: monatBerlinIso(notarDatumFuer(inv, k))");
    expect(abr).not.toContain("abschlussDatumFuer");
  });

  it("Neuberechnen entfernt veraltete offene Bescheide ohne Abschluss", () => {
    const prov = readFileSync("src/pages/Provisionsabrechnung.tsx", "utf8");
    expect(prov).toContain("await entferneLeerenBescheid(b)");
    expect(prov).toContain('b.status !== "offen" || mitAbschluss.has(b.userId)');
  });

  it("Lesefehler: fehlende Tabelle schaltet auf lokal, andere werden gemeldet", () => {
    const abr = readFileSync("src/pages/Abrechnungen.tsx", "utf8");
    expect(abr).toContain("Die Bescheide konnten nicht geladen werden.");
    const store = readFileSync("src/lib/provisionsAbrechnungStore.ts", "utf8");
    expect(store).toContain("if (istTabelleFehlt({ message: fehler })) {");
  });

  it("Historie summiert in Cent", () => {
    const h = abrechnungsHistorie([
      { kaufpreis: 100_001.25, stufe: "faelligkeit", satz: 4, kaufpreisfaelligAm: "2026-09-10" },
      { kaufpreis: 100_001.25, stufe: "faelligkeit", satz: 4, kaufpreisfaelligAm: "2026-09-11" },
    ]);
    expect(h[0].provision).toBe(8000.1);
  });

  it("Migration 20261004170000: kein Investment in zwei freigegebenen oder ausgezahlten Bescheiden", () => {
    const sql = readFileSync("supabase/migrations/20261004170000_abrechnung_bescheid_sperre.sql", "utf8");
    expect(sql).toContain("BEFORE INSERT OR UPDATE ON public.provisionsabrechnungen");
    expect(sql).toContain("IF NEW.status NOT IN ('freigegeben', 'ausgezahlt') THEN");
    expect(sql).toContain("AND p.status IN ('freigegeben', 'ausgezahlt')");
    expect(sql).toContain("p.user_id = NEW.user_id");
    expect(sql).toContain("pg_advisory_xact_lock(hashtext('provisionsabrechnung:' || NEW.user_id::text))");
    expect(readFileSync("supabase/migrations-inbox/99_PRUEFUNG.sql", "utf8")).toContain("75.2");
  });
});

describe("dritter Durchgang: Löschen nur offen, Bezahlt nach Konflikt, Bereinigung", () => {
  beforeEach(() => {
    zeilen.length = 0;
    upserts.length = 0;
    naechsterFehler = null;
    nachFehler = null;
    loeschStand.aufrufe.length = 0;
    loeschStand.antwort = { data: [{ id: "b-1" }], error: null };
  });
  const offen = (id: string, netto = 300) => ({
    id, monat: "2026-10", user_id: "u-1", user_name: "P", status: "offen", netto, summe_eigen: netto,
    eigene_deals: [{ investmentId: "i-1", kontaktId: "k", kundeName: "K", objekt: "O", kaufpreis: 1, satz: 4, betrag: netto }],
  });

  it("löscht nur mit Bedingung id und status offen", async () => {
    zeilen.push(offen("b-1"));
    const b = store.getAbrechnungen()[0];
    expect(await store.entferneLeerenBescheid(b)).toBe("entfernt");
    expect(loeschStand.aufrufe).toEqual([["eq", "id", "b-1"], ["eq", "status", "offen"], ["select", "id"]]);
    expect(upserts).toHaveLength(0);
  });
  it("lehnt die Datenbank still ab (Buchhaltung), wird der Bescheid geleert", async () => {
    zeilen.push(offen("b-1"));
    loeschStand.antwort = { data: [], error: null };
    const b = store.getAbrechnungen()[0];
    expect(await store.entferneLeerenBescheid(b)).toBe("geleert");
    expect(upserts.at(-1).eigene_deals).toEqual([]);
    expect(upserts.at(-1).netto).toBe(0);
  });
  it("freigegebene Bescheide bleiben unberührt", async () => {
    zeilen.push({ ...offen("b-1"), status: "freigegeben" });
    const b = store.getAbrechnungen()[0];
    expect(await store.entferneLeerenBescheid(b)).toBe("unveraendert");
    expect(loeschStand.aufrufe).toHaveLength(0);
  });

  it("Rechnung bezahlt nach 23505: nimmt den gespeicherten Bescheid und zahlt dessen Kennung aus", async () => {
    naechsterFehler = { code: "23505", message: "duplicate key" };
    nachFehler = () => zeilen.push({ ...offen("alt-1", 999), eigene_deals: [] });
    const deal = { investmentId: "i-1", kontaktId: "k", kundeName: "K", objekt: "O", kaufpreis: 1, satz: 4, betrag: 300 };
    const r = await store.setzeRechnungBezahlt({ userId: "u-1", name: "P" }, "2026-10", 300, true, "B", [deal]);
    expect(r?.id).toBe("alt-1");
    expect(r?.status).toBe("ausgezahlt");
    expect(upserts.at(-1).id).toBe("alt-1");
  });
  it("Rechnung bezahlt nach 23505 gegen freigegebenen fremden Bescheid: Abweichung, nichts ausgezahlt", async () => {
    naechsterFehler = { code: "23505", message: "duplicate key" };
    nachFehler = () => zeilen.push({ ...offen("alt-2", 999), status: "freigegeben" });
    const deal = { investmentId: "i-1", kontaktId: "k", kundeName: "K", objekt: "O", kaufpreis: 1, satz: 4, betrag: 300 };
    await expect(
      store.setzeRechnungBezahlt({ userId: "u-1", name: "P" }, "2026-10", 300, true, "B", [deal]),
    ).rejects.toBeInstanceOf(store.BescheidWeichtAb);
    expect(upserts.some((u) => u.status === "ausgezahlt")).toBe(false);
  });

  it("Objekt-Neuanlage: Bereinigung prüft jeden Schritt und meldet Restbestand", () => {
    const quelle = readFileSync("src/lib/objekteStore.ts", "utf8");
    const teil = quelle.slice(quelle.indexOf("const rollbackNewObjekt"), quelle.indexOf("const geschrieben = new Set"));
    expect(teil).toContain("if (error) offen.push(");
    expect(teil).toContain('db.from("objekte").select("id").eq("id", objekt.id)');
    expect(teil).toContain('title: "Objekt wurde nur teilweise angelegt"');
    expect(teil).toContain("Bitte prüfen oder Admin melden.");
  });

  it("Migration 20261004170000: Bescheide ungleich offen nicht aus dem Browser löschen", () => {
    const sql = readFileSync("supabase/migrations/20261004170000_abrechnung_bescheid_sperre.sql", "utf8");
    expect(sql).toContain("BEFORE DELETE ON public.provisionsabrechnungen");
    expect(sql).toContain("IF OLD.status <> 'offen'");
    expect(sql).toMatch(/->> 'role', ''\)\s+IN \('authenticated', 'anon'\)/);
    expect(readFileSync("supabase/migrations-inbox/99_PRUEFUNG.sql", "utf8")).toContain("75.3");
  });
});

describe("Seiten nutzen die gemeinsame Grundlage", () => {
  const prov = readFileSync("src/pages/Provisionsabrechnung.tsx", "utf8");
  const abr = readFileSync("src/pages/Abrechnungen.tsx", "utf8");
  const chart = readFileSync("src/components/dashboard/ProvisionChart.tsx", "utf8");

  it("Bescheid je Investment mit investmentKaufpreis, gesperrte übersprungen", () => {
    expect(prov).toContain("kaufpreisMitRueckfall(investmentKaufpreis(inv.id), k.kaufpreis, jeKontakt.get(inv.kontaktId) ?? 0)");
    expect(prov).toContain('["ausgezahlt", "freigegeben"]');
    expect(prov).toContain('if (stand === "klaeren")');
    expect(prov).toContain("investmentId: inv.id");
    expect(prov).toContain("bescheidVeraenderbar(existing)");
    expect(prov).not.toMatch(/getInvestmentsByKontakt/);
  });
  it("PDF-Vermerk nur mit Schreibrecht", () => {
    expect(prov).toMatch(/!a\.pdfErstelltAm && darfSchreiben/);
  });
  it("kein Monat mehr aus toISOString oder Geraetezeit", () => {
    for (const s of [prov, abr]) expect(s).not.toMatch(/toISOString\(\)\.slice\(0, 7\)/);
    expect(prov).not.toMatch(/d\.setMonth\(d\.getMonth\(\) - i\)/);
  });
  it("Fällig zählt Ausgezahltes nicht mehr", () => {
    expect(abr).toContain("abrechnungsstand(");
    expect(abr).toContain('else if (abrechenbar && klaeren) klaerenCent += cent;');
    expect(abr).toContain('useCacheReady(["provisionsabrechnungen"])');
    expect(abr).toContain("partner.find((x) => x.userId === selectedPartnerId)");
  });
  it("Bestätigung: erst speichern, dann Vermerk, Protokoll, Meldung", () => {
    const teil = abr.slice(abr.indexOf("const handleGutschriftBestaetigen"), abr.indexOf("const hasOverhead ="));
    expect(teil.indexOf("await setzeRechnungBezahlt(")).toBeLessThan(teil.indexOf("updateGS({"));
    expect(teil.indexOf("await setzeRechnungBezahlt(")).toBeLessThan(teil.indexOf("logAudit("));
    expect(teil).toContain("e instanceof BescheidWeichtAb");
    expect(teil).toContain("nur in diesem Browser gespeichert");
  });
  it("Kurven: Kaufpreis vom Investment, kein Schlüssel notartermin", () => {
    for (const s of [abr, chart]) {
      expect(s).not.toMatch(/"notartermin"\]/);
      expect(s).toContain("istKaufphaseVorNotar(inv.pipelineStufe)");
    }
    expect(chart).toContain("kaufpreisMitRueckfall(investmentKaufpreis(inv.id), k.kaufpreis, jeKontakt.get(inv.kontaktId) ?? 0)");
    expect(chart).not.toMatch(/k\.kaufpreis \* \(rate \/ 100\)/);
  });
  it("Liste „Kaufpreis fehlt“ für Admin, Inhaber, Backoffice, Buchhaltung", () => {
    expect(abr).toContain('const KAUFPREIS_FEHLT_ROLLEN = ["admin", "inhaber", "backoffice", "buchhaltung"]');
    expect(abr).toContain("/kunden/${e.kontaktId}?investment=${e.investmentId}");
  });
});

describe("Migration 20261004170000: Sperre in der Datenbank", () => {
  const DATEI = "20261004170000_abrechnung_bescheid_sperre.sql";
  const SQL = readFileSync(`supabase/migrations/${DATEI}`, "utf8");
  it("prüft den alten Status und alle Zahlen", () => {
    expect(SQL).toContain("IF OLD.status <> 'offen'");
    for (const spalte of ["eigene_deals", "summe_eigen", "netto", "monat", "user_id"]) {
      expect(SQL).toContain(`NEW.${spalte} IS DISTINCT FROM OLD.${spalte}`);
    }
    expect(SQL).toContain("BEFORE UPDATE ON public.provisionsabrechnungen");
    expect(SQL).toMatch(/gesperrt/);
  });
  it("liegt im Eingangskorb und in der Sammeldatei", () => {
    const korb = `supabase/migrations-inbox/${DATEI}`;
    expect(existsSync(korb)).toBe(true);
    expect(readFileSync(korb, "utf8")).toBe(SQL);
    expect(readFileSync("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql", "utf8")).toContain(SQL.trim());
    expect(readFileSync("supabase/migrations-inbox/99_PRUEFUNG.sql", "utf8")).toContain("75.1");
  });
});
