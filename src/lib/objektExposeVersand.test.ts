import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Kundenlink im Browser: Liste „Gesendete Links“ im Kundenprofil,
 * Zurückziehen, Senden über `send-kunden-expose`, und das Verhalten ohne die
 * Migrationen 20260923151000 und 20260923171000.
 */

const db = vi.hoisted(() => ({
  antwort: { data: null as unknown, error: null as null | { code?: string; message?: string } },
  /** Antworten der Reihe nach, für Abfragen, die es ein zweites Mal versuchen. */
  folge: [] as Array<{ data: unknown; error: null | { code?: string; message?: string } }>,
  aufrufe: [] as Array<{ tabelle: string; methode: string; args: unknown[] }>,
  invoke: { data: null as unknown, error: null as unknown },
  invokeArgs: [] as unknown[],
  sprachRueckfrage: [] as unknown[],
}));

// Die einmalige Rückfrage „Deutsch oder English?“ (Plan Kundensprache 2.4)
// hat eigene Tests in `kundenSprache.test.ts`. Hier zählt nur, wann sie kommt.
vi.mock("@/lib/kundenSprache", () => ({
  stelleKundenspracheSicher: async (id: unknown) => { db.sprachRueckfrage.push(id); return "de"; },
}));

vi.mock("@/integrations/supabase/client", () => {
  const kette = (tabelle: string) => {
    const k: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "not", "order", "limit", "insert", "update", "maybeSingle", "single"]) {
      k[m] = (...args: unknown[]) => { db.aufrufe.push({ tabelle, methode: m, args }); return k; };
    }
    k.then = (res: (v: unknown) => unknown) => Promise.resolve(res(db.folge.length ? db.folge.shift() : db.antwort));
    return k;
  };
  return {
    supabase: {
      from: (t: string) => kette(t),
      functions: { invoke: (...args: unknown[]) => { db.invokeArgs = args; return Promise.resolve(db.invoke); } },
    },
  };
});

vi.mock("@/lib/dataCache", () => ({
  cacheGet: (t: string) => ({
    objekte: [{ id: "o1", titel: "Haus am Park", adresse: "Parkstraße 8", ort: "Augsburg" }],
    wohnungen: [{ id: "w7", we_nr: "WE 7" }],
    kontakte: [{ id: "k1", email: "martina@example.com" }, { id: "k2", email: "" }],
  } as Record<string, unknown[]>)[t] ?? [],
  onCacheChange: () => () => undefined,
  cacheGetById: () => undefined,
}));

const store = await import("@/lib/objektExposeStore");
const gemeinsam = await import("../../supabase/functions/_shared/kunden-expose");

beforeEach(() => {
  db.antwort = { data: null, error: null };
  db.folge = [];
  db.aufrufe = [];
  db.invoke = { data: null, error: null };
  db.invokeArgs = [];
  db.sprachRueckfrage = [];
});

describe("Link und Status", () => {
  it("baut denselben Link wie die Function, und die Vorschau zählt nicht", () => {
    expect(store.kundenExposeLink("o1", "w7", "ab")).toBe(gemeinsam.kundenExposeLink("o1", "w7", "ab"));
    expect(store.kundenExposeLink("o1", null, "ab")).toBe("https://osimmobilien.netlify.app/expose/o1?token=ab");
    expect(store.kundenExposeVorschauLink("o1", "w7", "ab")).toBe("https://osimmobilien.netlify.app/expose/o1/wohnung/w7?token=ab&vorschau=1");
  });

  it("baut den Link je Art: Objektübersicht auf /immobilie, Vorschau zählt nicht", () => {
    const uebersicht = { art: "objektuebersicht" as const, objekt_id: "o1", wohnung_id: null, einstieg_wohnung_id: "w7", token: "ab" };
    const expose = { art: "expose" as const, objekt_id: "o1", wohnung_id: "w7", einstieg_wohnung_id: null, token: "ab" };
    expect(store.kundenlinkDesEintrags(uebersicht)).toBe("https://osimmobilien.netlify.app/immobilie/ab");
    expect(store.kundenlinkVorschauDesEintrags(uebersicht)).toBe("https://osimmobilien.netlify.app/immobilie/ab?vorschau=1");
    expect(store.kundenlinkDesEintrags(expose)).toBe("https://osimmobilien.netlify.app/expose/o1/wohnung/w7?token=ab");
    expect(store.kundenlinkVorschauDesEintrags(expose)).toBe("https://osimmobilien.netlify.app/expose/o1/wohnung/w7?token=ab&vorschau=1");
    expect(store.wohnungDesLinks(uebersicht)).toBe("w7");
    expect(store.wohnungDesLinks(expose)).toBe("w7");
  });

  it("sendet erneut mit derselben Art und derselben Wohnung, bei der Objektübersicht dem Einstieg", () => {
    const uebersicht = { art: "objektuebersicht" as const, objekt_id: "o1", wohnung_id: null, einstieg_wohnung_id: "w9" };
    expect(store.auftragZumErneutSenden(uebersicht, "k1", "i1", "mail"))
      .toEqual({ modus: "mail", art: "objektuebersicht", kontaktId: "k1", investmentId: "i1", objektId: "o1", wohnungId: "w9" });
    const expose = { art: "expose" as const, objekt_id: "o1", wohnung_id: "w7", einstieg_wohnung_id: null };
    expect(store.auftragZumErneutSenden(expose, "k1", "i1", "link")).toMatchObject({ art: "expose", wohnungId: "w7", modus: "link" });
  });

  it("unterscheidet aktiv, abgelaufen und zurückgezogen", () => {
    const jetzt = Date.parse("2026-09-23T12:00:00Z");
    expect(store.exposeLinkStatus({ gueltig_bis: "2026-11-22T00:00:00Z", zurueckgezogen_am: null }, jetzt)).toBe("aktiv");
    expect(store.exposeLinkStatus({ gueltig_bis: "2026-09-01T00:00:00Z", zurueckgezogen_am: null }, jetzt)).toBe("abgelaufen");
    expect(store.exposeLinkStatus({ gueltig_bis: "2026-11-22T00:00:00Z", zurueckgezogen_am: "2026-09-22T00:00:00Z" }, jetzt)).toBe("zurueckgezogen");
  });

  it("benennt das Exposé aus dem Zwischenspeicher und erkennt die E-Mail am Kunden", () => {
    expect(store.exposeBezeichnungAusCache("o1", "w7")).toBe("Wohnung 7, Parkstraße 8, Augsburg");
    expect(store.exposeBezeichnungAusCache("o1", null)).toBe("Haus am Park, Parkstraße 8, Augsburg");
    expect(store.exposeBezeichnungAusCache("fehlt", null)).toBe("Exposé");
    expect(store.kundeHatEmail("k1")).toBe(true);
    expect(store.kundeHatEmail("k2")).toBe(false);
    expect(store.kundeHatEmail(null)).toBe(false);
  });
});

describe("gesendete Links laden", () => {
  it("liest nur gesendete Zeilen dieses Kunden und Investments, beide Arten, neueste zuerst", async () => {
    db.antwort = {
      data: [
        { id: "u1", art: "objektuebersicht", objekt_id: "o1", wohnung_id: null, einstieg_wohnung_id: "w9", kontakt_id: "k1", investment_id: "i1", token: "t2", gueltig_bis: "2026-11-22T00:00:00Z", gesendet_am: "2026-09-24T10:00:00Z", gesendet_von: "u1", versandweg: "link", zurueckgezogen_am: null, aufrufe: 0, erstmals_aufgerufen_am: null, zuletzt_aufgerufen_am: null },
        { id: "e1", art: "expose", objekt_id: "o1", wohnung_id: "w7", einstieg_wohnung_id: null, kontakt_id: "k1", investment_id: "i1", token: "t", gueltig_bis: "2026-11-22T00:00:00Z", gesendet_am: "2026-09-23T10:00:00Z", gesendet_von: "u1", versandweg: "mail", zurueckgezogen_am: null, aufrufe: 2, erstmals_aufgerufen_am: "2026-09-23T11:00:00Z", zuletzt_aufgerufen_am: "2026-09-23T12:00:00Z" },
      ],
      error: null,
    };
    const erg = await store.ladeGesendeteExposes("k1", "i1");
    expect(erg.migrationFehlt).toBe(false);
    expect(erg.eintraege).toHaveLength(2);
    expect(erg.eintraege[0]).toMatchObject({ id: "u1", art: "objektuebersicht", wohnung_id: null, einstieg_wohnung_id: "w9" });
    expect(erg.eintraege[1]).toMatchObject({ id: "e1", art: "expose", versandweg: "mail", aufrufe: 2 });
    const filter = db.aufrufe.map((a) => [a.methode, ...a.args]);
    expect(filter).toContainEqual(["select", expect.stringContaining("art, einstieg_wohnung_id")]);
    expect(filter).toContainEqual(["eq", "kontakt_id", "k1"]);
    expect(filter).toContainEqual(["eq", "investment_id", "i1"]);
    expect(filter).toContainEqual(["not", "gesendet_am", "is", null]);
    expect(filter).toContainEqual(["order", "gesendet_am", { ascending: false }]);
  });

  it("liest ohne die Migration 20260923171000 weiter, dann ist alles ein Exposé", async () => {
    db.folge = [
      { data: null, error: { code: "42703", message: "column objekt_exposes.art does not exist" } },
      { data: [{ id: "e1", objekt_id: "o1", wohnung_id: "w7", token: "t", gesendet_am: "2026-09-23T10:00:00Z", aufrufe: 1 }], error: null },
    ];
    const erg = await store.ladeGesendeteExposes("k1", "i1");
    expect(erg.migrationFehlt).toBe(false);
    expect(erg.eintraege).toHaveLength(1);
    expect(erg.eintraege[0]).toMatchObject({ id: "e1", art: "expose", einstieg_wohnung_id: null });
    const spalten = db.aufrufe.filter((a) => a.methode === "select").map((a) => String(a.args[0]));
    expect(spalten).toHaveLength(2);
    expect(spalten[1]).not.toContain("art");
  });

  it("meldet ohne Migration still `migrationFehlt`", async () => {
    db.antwort = { data: null, error: { code: "42703", message: "column objekt_exposes.gesendet_am does not exist" } };
    const erg = await store.ladeGesendeteExposes("k1", "i1");
    expect(erg).toEqual({ eintraege: [], migrationFehlt: true, fehler: null });
  });
});

describe("zurückziehen", () => {
  it("setzt den Zeitpunkt nur an einem noch nicht zurückgezogenen Link", async () => {
    db.antwort = { data: [{ id: "e1" }], error: null };
    const erg = await store.zieheExposeZurueck("e1");
    expect(erg.erfolg).toBe(true);
    const update = db.aufrufe.find((a) => a.methode === "update");
    expect(Object.keys(update!.args[0] as object)).toEqual(["zurueckgezogen_am"]);
    expect(db.aufrufe.map((a) => [a.methode, ...a.args])).toContainEqual(["is", "zurueckgezogen_am", null]);
  });

  it("sagt, wenn keine Zeile getroffen wurde", async () => {
    db.antwort = { data: [], error: null };
    const erg = await store.zieheExposeZurueck("e1");
    expect(erg.erfolg).toBe(false);
    expect(erg.fehler).toMatch(/schon zurückgezogen/);
  });
});

describe("senden über send-kunden-expose", () => {
  it("schickt keine Empfängeradresse mit", async () => {
    db.invoke = { data: { ok: true, link: "https://osimmobilien.netlify.app/expose/o1/wohnung/w7?token=t", gueltigBis: "2026-11-22T10:00:00Z" }, error: null };
    const erg = await store.sendeKundenExpose({ modus: "mail", kontaktId: "k1", investmentId: "i1", objektId: "o1", wohnungId: "w7" });
    expect(erg.ok).toBe(true);
    expect(erg.link).toContain("token=t");
    expect(db.invokeArgs[0]).toBe("send-kunden-expose");
    const body = (db.invokeArgs[1] as { body: Record<string, unknown> }).body;
    expect(Object.keys(body).sort()).toEqual(["art", "investmentId", "kontaktId", "modus", "objektId", "wohnungId"]);
    // Ohne Angabe bleibt es beim Exposé.
    expect(body.art).toBe("expose");
  });

  it("fragt vor dem Mailversand einmal nach der Kundensprache, beim Link nicht", async () => {
    db.invoke = { data: { ok: true, link: "https://osimmobilien.netlify.app/expose/o1?token=t" }, error: null };
    await store.sendeKundenExpose({ modus: "mail", kontaktId: "k1", investmentId: "i1", objektId: "o1", wohnungId: null });
    expect(db.sprachRueckfrage).toEqual(["k1"]);
    await store.sendeKundenExpose({ modus: "link", kontaktId: "k1", investmentId: "i1", objektId: "o1", wohnungId: null });
    expect(db.sprachRueckfrage).toEqual(["k1"]);
  });

  it("schickt die Art mit", async () => {
    db.invoke = { data: { ok: true, art: "objektuebersicht", link: "https://osimmobilien.netlify.app/immobilie/t", gueltigBis: "2026-11-22T10:00:00Z" }, error: null };
    await store.sendeKundenExpose({ modus: "link", art: "objektuebersicht", kontaktId: "k1", investmentId: "i1", objektId: "o1", wohnungId: "w7" });
    expect((db.invokeArgs[1] as { body: Record<string, unknown> }).body).toMatchObject({ art: "objektuebersicht", wohnungId: "w7" });
  });

  it("meldet die fehlende Migration der Objektübersicht mit ihrem eigenen Satz", async () => {
    const antwort = new Response(JSON.stringify({ error: "Migration Kundenlink noch nicht ausgeführt", migrationFehlt: true }), { status: 409 });
    db.invoke = { data: null, error: Object.assign(new Error("Edge Function returned a non-2xx status code"), { context: antwort }) };
    const erg = await store.sendeKundenExpose({ modus: "mail", art: "objektuebersicht", kontaktId: "k1", investmentId: "i1", objektId: "o1", wohnungId: "w7" });
    expect(erg).toMatchObject({ ok: false, migrationFehlt: true, fehler: store.KUNDENLINK_MIGRATION_HINWEIS });
  });

  it("erkennt die fehlende Migration an der Antwort der Function", async () => {
    const antwort = new Response(JSON.stringify({ error: "Migration Exposé-Versand noch nicht ausgeführt", migrationFehlt: true }), { status: 409 });
    db.invoke = { data: null, error: Object.assign(new Error("Edge Function returned a non-2xx status code"), { context: antwort }) };
    const erg = await store.sendeKundenExpose({ modus: "link", kontaktId: "k1", investmentId: "i1", objektId: "o1", wohnungId: null });
    expect(erg.ok).toBe(false);
    expect(erg.migrationFehlt).toBe(true);
    expect(erg.fehler).toBe(store.EXPOSE_VERSAND_MIGRATION_HINWEIS);
  });

  it("gibt den Grund der Function weiter", async () => {
    const antwort = new Response(JSON.stringify({ error: "Am Kunden ist keine gültige E-Mail-Adresse hinterlegt." }), { status: 400 });
    db.invoke = { data: null, error: Object.assign(new Error("Edge Function returned a non-2xx status code"), { context: antwort }) };
    const erg = await store.sendeKundenExpose({ modus: "mail", kontaktId: "k1", investmentId: "i1", objektId: "o1", wohnungId: "w7" });
    expect(erg).toMatchObject({ ok: false, migrationFehlt: false, fehler: "Am Kunden ist keine gültige E-Mail-Adresse hinterlegt." });
  });
});

/*
 * Christian am 23.09.2026: Einheitsseite, „Kundenlink senden“, „Link
 * kopieren“, und es kam eine 404. Jeder Weg dorthin endet jetzt in einem
 * lesbaren Satz, keiner in einer nackten 404.
 */
describe("Link kopieren, alle Wege zu einer 404", () => {
  const LINK_AUFTRAG = { modus: "link" as const, art: "objektuebersicht" as const, kontaktId: "k1", investmentId: "i1", objektId: "o1", wohnungId: "w7" };
  const httpFehler = (status: number, rumpf: string) =>
    Object.assign(new Error("Edge Function returned a non-2xx status code"), { name: "FunctionsHttpError", context: new Response(rumpf, { status }) });

  it("sagt bei der 404 von Supabase, dass send-kunden-expose nicht ausgerollt ist", async () => {
    db.invoke = { data: null, error: httpFehler(404, JSON.stringify({ code: "NOT_FOUND", message: "Requested function was not found" })) };
    const erg = await store.sendeKundenExpose(LINK_AUFTRAG);
    expect(erg).toMatchObject({ ok: false, link: null, migrationFehlt: false });
    expect(erg.fehler).toBe("Die Function send-kunden-expose ist noch nicht ausgerollt. Roll sie in Lovable aus, dann klappt es.");
  });

  it("sagt ohne jede Antwort, dass send-kunden-expose nicht erreichbar ist", async () => {
    db.invoke = {
      data: null,
      error: Object.assign(new Error("Failed to send a request to the Edge Function"), { name: "FunctionsFetchError", context: new TypeError("Failed to fetch") }),
    };
    const erg = await store.sendeKundenExpose(LINK_AUFTRAG);
    expect(erg.ok).toBe(false);
    expect(erg.fehler).toMatch(/^Die Function send-kunden-expose ist nicht erreichbar\. Meist ist sie noch nicht ausgerollt/);
  });

  it("gibt die eigene 404 der Function mit ihrem Grund weiter", async () => {
    db.invoke = { data: null, error: httpFehler(404, JSON.stringify({ error: "Das Objekt gibt es nicht mehr." })) };
    const erg = await store.sendeKundenExpose(LINK_AUFTRAG);
    expect(erg).toMatchObject({ ok: false, migrationFehlt: false, fehler: "Das Objekt gibt es nicht mehr." });
  });

  it("meldet bei der Objektübersicht die fehlende Migration 20260923171000 als Migration, nicht als 404", async () => {
    db.invoke = { data: null, error: httpFehler(409, JSON.stringify({ error: "Migration Kundenlink noch nicht ausgeführt", migrationFehlt: true })) };
    const erg = await store.sendeKundenExpose(LINK_AUFTRAG);
    expect(erg).toMatchObject({ ok: false, migrationFehlt: true, fehler: "Migration Kundenlink noch nicht ausgeführt" });
  });

  it("erkennt die alte Fassung der Function, die aus der Objektübersicht still ein Exposé macht", async () => {
    // Die Fassung vor dem 23.09.2026 antwortet ohne `art`, mit einem Exposé-Link.
    db.invoke = { data: { ok: true, link: "https://osimmobilien.netlify.app/expose/o1/wohnung/w7?token=t", gueltigBis: "2026-11-22T10:00:00Z" }, error: null };
    const erg = await store.sendeKundenExpose(LINK_AUFTRAG);
    expect(erg).toMatchObject({ ok: false, link: null, fehler: store.KUNDENLINK_FUNCTION_VERALTET });
    expect(erg.fehler).toContain("Roll sie in Lovable neu aus");
  });

  it("erkennt die Fassung vor der Wohnungsauswahl, die eine Auswahl still übergeht", async () => {
    const link = `https://osimmobilien.netlify.app/immobilie/${"a".repeat(64)}`;
    db.invoke = { data: { ok: true, art: "objektuebersicht", link, gueltigBis: "2026-11-22T10:00:00Z" }, error: null };
    const erg = await store.sendeKundenExpose({ ...LINK_AUFTRAG, wohnungAuswahl: ["w7"] });
    expect((db.invokeArgs[1] as { body: Record<string, unknown> }).body.wohnungAuswahl).toEqual(["w7"]);
    expect(erg).toMatchObject({ ok: false, link: null, fehler: store.KUNDENLINK_AUSWAHL_FUNCTION_VERALTET });
    expect(erg.fehler).toContain("Der Kunde sieht über den Link alle freien Wohnungen");
    // Die neue Fassung nennt die Auswahl: dann ist alles gut.
    db.invoke = { data: { ok: true, art: "objektuebersicht", link, gueltigBis: null, wohnungAuswahl: ["w7"] }, error: null };
    expect(await store.sendeKundenExpose({ ...LINK_AUFTRAG, wohnungAuswahl: ["w7"] })).toMatchObject({ ok: true, link });
  });

  it("meldet die fehlende Migration der Wohnungsauswahl als Migration", async () => {
    db.invoke = { data: null, error: httpFehler(409, JSON.stringify({ error: store.KUNDENLINK_AUSWAHL_MIGRATION_HINWEIS, migrationFehlt: true })) };
    const erg = await store.sendeKundenExpose({ ...LINK_AUFTRAG, wohnungAuswahl: ["w7"] });
    expect(erg).toMatchObject({ ok: false, migrationFehlt: true, fehler: store.KUNDENLINK_AUSWAHL_MIGRATION_HINWEIS });
  });

  it("nimmt den Link der neuen Fassung an, die Objektübersicht auf /immobilie/<token>", async () => {
    const link = `https://osimmobilien.netlify.app/immobilie/${"a".repeat(64)}`;
    db.invoke = { data: { ok: true, art: "objektuebersicht", link, gueltigBis: "2026-11-22T10:00:00Z" }, error: null };
    const erg = await store.sendeKundenExpose(LINK_AUFTRAG);
    expect(erg).toMatchObject({ ok: true, link, fehler: null });
  });

  it("lässt „nur Exposé“ auch ohne Art in der Antwort durch, dafür braucht es die Migration 20260923171000 nicht", async () => {
    const link = "https://osimmobilien.netlify.app/expose/o1/wohnung/w7?token=t";
    db.invoke = { data: { ok: true, link, gueltigBis: null }, error: null };
    const erg = await store.sendeKundenExpose({ ...LINK_AUFTRAG, art: "expose" });
    expect(erg).toMatchObject({ ok: true, link });
  });

  it("erkennt, ob das CRM gerade auf der Adresse des Links läuft", () => {
    expect(store.kundenlinkAufDieserAdresse("osimmobilien.netlify.app")).toBe(true);
    expect(store.kundenlinkAufDieserAdresse("id-preview--abc.lovable.app")).toBe(false);
    expect(store.kundenlinkAufDieserAdresse("localhost")).toBe(false);
  });
});
