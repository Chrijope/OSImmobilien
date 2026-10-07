import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Prueft das blockweise Laden grosser Tabellen in dataCache.ts, konkret die
 * Drosselung der Zwischenmeldungen: Waehrend des Ladens darf die Oberflaeche
 * genau zweimal benachrichtigt werden (erster Block fuer den fruehen
 * Bildaufbau, Endstand nach dem letzten Block), nicht nach jeder Welle.
 * Jede Meldung loest App-weit Re-Renders aus; bei mehreren tausend Kontakten
 * hat das die Kontaktliste waehrend des Ladens mehrfach teuer rechnen lassen.
 */

// Zeilen, die der gemockte Supabase-Client je Tabelle liefert.
const state = vi.hoisted(() => ({
  zeilen: {} as Record<string, Array<{ id: string }>>,
  /** Antwortverzoegerung je Tabelle in Millisekunden. */
  verzoegerung: {} as Record<string, number>,
  /** Abgesetzte Abfragen je Tabelle: "block:<von>" oder "zaehlung". */
  abfragen: [] as string[],
  /** Tabellen, die mit einem Fehler antworten sollen, mit ihrer Meldung. */
  fehler: {} as Record<string, string>,
  /** Realtime-Handler, die der Cache angemeldet hat. */
  handler: [] as Array<{ event: string; table: string; fn: (p: unknown) => void }>,
  /** Wartezeit fuer insert, upsert und delete in Millisekunden. */
  schreibWarte: 0,
}));

const toastFehler = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastFehler } }));

vi.mock("@/integrations/supabase/client", () => {
  // Minimaler Query-Builder: alle Modifikatoren geben this zurueck, await
  // liefert den angeforderten Zeilenausschnitt.
  class FakeQuery {
    private table: string;
    private von = 0;
    private bis = Number.MAX_SAFE_INTEGER;
    private nurZaehlen = false;
    constructor(table: string) { this.table = table; }
    select(_spalten?: string, opts?: { count?: string; head?: boolean }) {
      if (opts?.head) this.nurZaehlen = true;
      return this;
    }
    or() { return this; }
    order() { return this; }
    limit(n: number) { this.von = 0; this.bis = n - 1; return this; }
    range(von: number, bis: number) { this.von = von; this.bis = bis; return this; }
    abortSignal() { return this; }
    eq() { return this; }
    private schreiben = false;
    insert() { this.schreiben = true; return this; }
    upsert() { this.schreiben = true; return this; }
    delete() { this.schreiben = true; return this; }
    then(resolve: (r: { data: unknown[] | null; count?: number; error: { message: string } | null }) => void) {
      if (this.schreiben) {
        setTimeout(() => resolve({ data: null, error: null }), state.schreibWarte);
        return;
      }
      const alle = state.zeilen[this.table] || [];
      state.abfragen.push(`${this.table} ${this.nurZaehlen ? "zaehlung" : `block:${this.von}`}`);
      if (state.fehler[this.table]) {
        resolve({ data: null, error: { message: state.fehler[this.table] } });
        return;
      }
      const antwort = this.nurZaehlen
        ? { data: null, count: alle.length, error: null }
        : { data: alle.slice(this.von, this.bis + 1), error: null };
      const wartezeit = state.verzoegerung[this.table] || 0;
      if (wartezeit > 0) setTimeout(() => resolve(antwort), wartezeit);
      else resolve(antwort);
    }
  }
  const channel = {
    on: (_art: string, filter: { event: string; table: string }, fn: (p: unknown) => void) => {
      state.handler.push({ event: filter.event, table: filter.table, fn });
      return channel;
    },
    subscribe: () => channel,
  };
  return {
    supabase: {
      from: (table: string) => new FakeQuery(table),
      channel: () => channel,
      removeChannel: () => {},
    },
  };
});

import { initDataCache, onCacheChange, cacheGet, resetCache, ladeTabellen, isTableLoaded, cacheRefreshTable, cacheReload, cacheNutzerSetzen, cacheInsert, cacheUpsert, cacheDelete, cacheLadeZeilenFuer } from "./dataCache";
import { readFileSync } from "node:fs";

describe("dataCache: blockweises Laden der Kontakte", () => {
  beforeEach(() => {
    resetCache();
    state.zeilen = {};
    state.verzoegerung = {};
    state.abfragen = [];
    state.fehler = {};
    toastFehler.mockClear();
  });

  afterEach(() => {
    resetCache();
  });

  it("meldet beim Laden vieler Bloecke nur ersten Block und Endstand", async () => {
    // 2500 Zeilen = Block 0 (1000), Block 1 (1000), Block 2 (500).
    state.zeilen["kontakte"] = Array.from({ length: 2500 }, (_, i) => ({ id: `k${i}` }));

    const gemeldeteStaende: number[] = [];
    const unsub = onCacheChange((table) => {
      if (table === "kontakte") gemeldeteStaende.push(cacheGet("kontakte").length);
    });

    await initDataCache({ sofort: ["kontakte"] });
    unsub();

    expect(cacheGet("kontakte")).toHaveLength(2500);
    // Zwei Zwischenmeldungen aus dem Blocklader (1000, dann 2500) plus die
    // eine Abschlussmeldung nach dem Laden der Startwelle. Nach
    // jeder Welle zu melden waere mindestens eine Meldung mehr.
    expect(gemeldeteStaende).toEqual([1000, 2500, 2500]);
  });

  it("meldet bei einer kleinen Tabelle einmal beim ersten Block", async () => {
    state.zeilen["kontakte"] = Array.from({ length: 42 }, (_, i) => ({ id: `k${i}` }));

    const gemeldeteStaende: number[] = [];
    const unsub = onCacheChange((table) => {
      if (table === "kontakte") gemeldeteStaende.push(cacheGet("kontakte").length);
    });

    await initDataCache({ sofort: ["kontakte"] });
    unsub();

    expect(cacheGet("kontakte")).toHaveLength(42);
    expect(gemeldeteStaende).toEqual([42, 42]);
  });

  it("laedt nur, was noch fehlt, und startet keinen zweiten Vorgang", async () => {
    state.zeilen["kontakte"] = [{ id: "k1" }];
    state.zeilen["aufgaben"] = [{ id: "a1" }];
    await initDataCache({ sofort: ["kontakte"] });
    expect(isTableLoaded("kontakte")).toBe(true);
    expect(isTableLoaded("aufgaben")).toBe(false);

    const gemeldet: string[] = [];
    const unsub = onCacheChange((table) => gemeldet.push(table));
    // Zwei gleichzeitige Anforderungen derselben Tabelle: eine Meldung.
    await Promise.all([ladeTabellen(["aufgaben", "kontakte"]), ladeTabellen(["aufgaben"])]);
    unsub();

    expect(isTableLoaded("aufgaben")).toBe(true);
    expect(cacheGet("aufgaben")).toHaveLength(1);
    expect(gemeldet).toEqual(["aufgaben"]);
  });

  it("laedt vor dem Start nichts", async () => {
    state.zeilen["aufgaben"] = [{ id: "a1" }];
    await ladeTabellen(["aufgaben"]);
    expect(isTableLoaded("aufgaben")).toBe(false);
  });

  it("blaettert auch die Medientabellen, statt bei 1000 Zeilen still abzuschneiden", async () => {
    // Supabase liefert je Abruf hoechstens 1000 Zeilen. Vor dem 23.09.2026
    // kamen Objektdokumente in einem einzigen Abruf, und einem Teil der
    // Objekte fehlten die Unterlagen auf dem Bildschirm.
    for (const tabelle of ["objekt_bilder", "objekt_dokumente", "wohnungs_bilder", "wohnungs_dokumente"]) {
      state.zeilen[tabelle] = Array.from({ length: 1500 }, (_, i) => ({ id: `${tabelle}-${i}` }));
    }
    await initDataCache({ sofort: ["objekt_bilder", "objekt_dokumente", "wohnungs_bilder", "wohnungs_dokumente"] });
    for (const tabelle of ["objekt_bilder", "objekt_dokumente", "wohnungs_bilder", "wohnungs_dokumente"]) {
      expect(cacheGet(tabelle)).toHaveLength(1500);
      expect(state.abfragen.filter((a) => a.startsWith(`${tabelle} `))).toEqual([
        `${tabelle} zaehlung`, `${tabelle} block:0`, `${tabelle} block:1000`,
      ]);
    }
  });

  it("holt die restlichen Bloecke nach der Zaehlung auf einmal", async () => {
    // 3500 Zeilen = 4 Bloecke. Erwartet: Zaehlung, Block 0, dann die Bloecke
    // 1 bis 3 gemeinsam, kein blinder fuenfter Block.
    state.zeilen["kontakte"] = Array.from({ length: 3500 }, (_, i) => ({ id: `k${i}` }));
    await initDataCache({ sofort: ["kontakte"] });
    expect(cacheGet("kontakte")).toHaveLength(3500);
    const kontaktAbfragen = state.abfragen.filter((a) => a.startsWith("kontakte"));
    expect(kontaktAbfragen).toEqual([
      "kontakte zaehlung", "kontakte block:0", "kontakte block:1000", "kontakte block:2000", "kontakte block:3000",
    ]);
  });
});

describe("dataCache: Freigabe je Tabelle", () => {
  beforeEach(() => {
    resetCache();
    state.zeilen = {};
    state.verzoegerung = {};
    state.abfragen = [];
    state.fehler = {};
    toastFehler.mockClear();
  });

  afterEach(() => {
    resetCache();
  });

  it("gibt eine schnelle Tabelle frei, bevor die langsame derselben Gruppe fertig ist", async () => {
    // Das war die Bremse der Pipeline: aufgaben und follow_ups galten erst als
    // geladen, wenn auch die 20.000 Aktivitaeten derselben Gruppe da waren.
    state.zeilen["aufgaben"] = [{ id: "a1" }];
    state.zeilen["aktivitaeten"] = [{ id: "x1" }];
    state.verzoegerung["aktivitaeten"] = 300;

    const reihenfolge: string[] = [];
    const unsub = onCacheChange((table) => reihenfolge.push(table));
    const start = initDataCache({ sofort: ["aufgaben", "aktivitaeten"] });

    await new Promise((weiter) => setTimeout(weiter, 50));
    expect(isTableLoaded("aufgaben")).toBe(true);
    expect(isTableLoaded("aktivitaeten")).toBe(false);
    expect(reihenfolge).toEqual(["aufgaben"]);

    await start;
    unsub();
    expect(isTableLoaded("aktivitaeten")).toBe(true);
    expect(reihenfolge).toEqual(["aufgaben", "aktivitaeten", "cache_bereit"]);
  });

  it("laedt die Kernstufe direkt nach der Startroute, ohne auf Leerlauf zu warten", async () => {
    state.zeilen["aufgaben"] = [{ id: "a1" }];
    state.zeilen["kontakte"] = [{ id: "k1" }];
    state.zeilen["investments"] = [{ id: "i1" }];
    state.zeilen["news"] = [{ id: "n1" }];
    // Kein requestIdleCallback in jsdom: der Rueckfall wartet 200 ms je Gruppe.
    await initDataCache({ sofort: ["aufgaben"], danach: [["kontakte"], ["investments"]], spaeter: [["news"]] });

    await new Promise((weiter) => setTimeout(weiter, 30));
    expect(isTableLoaded("kontakte")).toBe(true);
    expect(isTableLoaded("investments")).toBe(true);
    expect(isTableLoaded("news")).toBe(false);

    await new Promise((weiter) => setTimeout(weiter, 250));
    expect(isTableLoaded("news")).toBe(true);
  });
});

/**
 * Entprellung der Ladefehler-Meldung.
 *
 * Am 16.09.2026 meldete ein Vertriebspartner, er bekomme "die ganze Zeit
 * Fehlercodes, egal wo ich rumklicke". Einer der Verstaerker: Eine gescheiterte
 * Tabelle bleibt bewusst ungeladen, `ladeTabellen` versucht sie deshalb bei
 * jedem Seitenwechsel erneut, und jeder Versuch schrieb einen weiteren roten
 * Hinweis. Das Wiederholen bleibt richtig, nur das Melden wird ruhiger.
 */
describe("dataCache: Entprellung der Ladefehler-Meldung", () => {
  beforeEach(() => {
    resetCache();
    state.zeilen = {};
    state.verzoegerung = {};
    state.abfragen = [];
    state.fehler = {};
    toastFehler.mockClear();
  });

  afterEach(() => {
    resetCache();
  });

  it("meldet dieselbe Tabelle beim naechsten Seitenwechsel nicht erneut", async () => {
    state.fehler["aufgaben"] = "permission denied for table aufgaben";
    await initDataCache({ sofort: ["aufgaben"] });
    expect(toastFehler).toHaveBeenCalledTimes(1);

    // Zwei weitere Seitenwechsel, die dieselbe Tabelle wieder anfordern.
    await ladeTabellen(["aufgaben"]);
    await ladeTabellen(["aufgaben"]);

    expect(toastFehler).toHaveBeenCalledTimes(1);
    // Der Ladeversuch selbst wird nicht unterdrueckt, nur die Meldung.
    expect(isTableLoaded("aufgaben")).toBe(false);
    expect(state.abfragen.filter((a) => a.startsWith("aufgaben")).length).toBeGreaterThan(2);
  }, 30000);

  it("zeigt endliche Dauer und den Knopf Erneut laden", async () => {
    state.fehler["aufgaben"] = "permission denied for table aufgaben";
    await initDataCache({ sofort: ["aufgaben"] });

    const optionen = toastFehler.mock.calls[0][1] as {
      duration: number;
      action: { label: string };
    };
    expect(Number.isFinite(optionen.duration)).toBe(true);
    expect(optionen.duration).toBeGreaterThan(0);
    expect(optionen.action.label).toBe("Erneut laden");
  }, 30000);

  it("meldet eine andere Tabelle trotz laufender Ruhepause", async () => {
    state.fehler["aufgaben"] = "permission denied for table aufgaben";
    state.fehler["news"] = "permission denied for table news";
    await initDataCache({ sofort: ["aufgaben"] });
    expect(toastFehler).toHaveBeenCalledTimes(1);

    await ladeTabellen(["aufgaben", "news"]);
    expect(toastFehler).toHaveBeenCalledTimes(2);
  }, 30000);
});

describe("dataCache: Abmelden waehrend eines Ladevorgangs", () => {
  beforeEach(() => {
    resetCache();
    state.zeilen = { kontakte: [{ id: "alt-1" }] };
    state.verzoegerung = {};
    state.abfragen = [];
    state.fehler = {};
  });

  afterEach(() => {
    resetCache();
  });

  it.each([
    ["cacheRefreshTable", cacheRefreshTable],
    ["cacheReload", cacheReload],
  ])("%s verwirft das Ergebnis, wenn inzwischen abgemeldet wurde", async (_name, laden) => {
    await initDataCache({ sofort: ["kontakte"] });
    state.verzoegerung["kontakte"] = 30;

    const vorgang = laden("kontakte");
    resetCache(); // Abmeldung, waehrend die Antwort noch unterwegs ist
    await vorgang;

    expect(isTableLoaded("kontakte")).toBe(false);
    expect(cacheGet("kontakte")).toEqual([]);
  });

  it("Abmelden waehrend des blockweisen Ladens: nichts vom alten Konto bleibt stehen", async () => {
    // 2500 Zeilen = drei Bloecke; nach dem ersten wird abgemeldet.
    state.zeilen["kontakte"] = Array.from({ length: 2500 }, (_, i) => ({ id: `alt-${i}` }));
    state.verzoegerung["kontakte"] = 10;
    let abgemeldet = false;
    const unsub = onCacheChange((table) => {
      if (table === "kontakte" && !abgemeldet) {
        abgemeldet = true;
        resetCache();
      }
    });

    await initDataCache({ sofort: ["kontakte"] });
    unsub();

    expect(abgemeldet).toBe(true);
    expect(cacheGet("kontakte")).toEqual([]);
    expect(isTableLoaded("kontakte")).toBe(false);
  });

  it("Abmelden waehrend des ersten Ladens, danach neu anmelden: die Tabellen werden geladen", async () => {
    state.verzoegerung["kontakte"] = 30;
    const ersterStart = initDataCache({ sofort: ["kontakte"] });
    resetCache();
    await ersterStart;

    state.zeilen["kontakte"] = [{ id: "neu-1" }];
    state.verzoegerung = {};
    await initDataCache({ sofort: ["kontakte"] });

    expect(isTableLoaded("kontakte")).toBe(true);
    expect(cacheGet("kontakte")).toEqual([{ id: "neu-1" }]);
  });

  it("Kontowechsel ohne Abmelden leert den Speicher, eine Token-Erneuerung nicht", async () => {
    cacheNutzerSetzen("konto-a");
    await initDataCache({ sofort: ["kontakte"] });
    expect(isTableLoaded("kontakte")).toBe(true);

    cacheNutzerSetzen("konto-a"); // gleiche Kennung, etwa nach Token-Erneuerung
    expect(cacheGet("kontakte")).toEqual([{ id: "alt-1" }]);

    cacheNutzerSetzen("konto-b");
    expect(isTableLoaded("kontakte")).toBe(false);
    expect(cacheGet("kontakte")).toEqual([]);
  });

  it("behaelt die Beobachter ueber das Abmelden hinweg", async () => {
    const gemeldet: string[] = [];
    const unsub = onCacheChange((table) => gemeldet.push(table));
    resetCache();

    await initDataCache({ sofort: ["kontakte"] });
    unsub();

    expect(gemeldet).toContain("kontakte");
  });
});

describe("dataCache: spaete Schreibvorgaenge des alten Kontos", () => {
  const warte = (ms: number) => new Promise((fertig) => setTimeout(fertig, ms));

  beforeEach(() => {
    resetCache();
    state.zeilen = {};
    state.verzoegerung = {};
    state.abfragen = [];
    state.fehler = {};
    state.handler = [];
    state.schreibWarte = 0;
  });

  afterEach(() => {
    resetCache();
  });

  it("Realtime-Ereignisse eines alten Kanals schreiben nach dem Abmelden nichts", async () => {
    state.zeilen["aufgaben"] = [{ id: "a1" }];
    await initDataCache({ sofort: ["aufgaben"] });
    await warte(300); // Sammeltimer der Realtime-Bindung
    const handler = (event: string) => state.handler.find((h) => h.table === "aufgaben" && h.event === event)!;
    expect(handler("INSERT")).toBeDefined();

    resetCache();
    state.zeilen["aufgaben"] = [{ id: "b1" }];
    await initDataCache({ sofort: ["aufgaben"] });
    const gemeldet: string[] = [];
    const unsub = onCacheChange((table) => gemeldet.push(table));
    // Die alten Kanaele melden sich erst verzoegert ab.
    handler("INSERT").fn({ new: { id: "a-geheim" } });
    handler("UPDATE").fn({ new: { id: "b1", titel: "fremd" } });
    handler("DELETE").fn({ old: { id: "b1" } });
    unsub();

    expect(cacheGet("aufgaben")).toEqual([{ id: "b1" }]);
    expect(gemeldet).toEqual([]);
  });

  it("ein cacheInsert, das nach dem Kontowechsel fertig wird, bleibt nicht stehen", async () => {
    state.zeilen["aktivitaeten"] = [{ id: "a-alt", kunde_id: "k1" } as { id: string }];
    cacheNutzerSetzen("konto-a");
    await initDataCache({ sofort: ["aktivitaeten"] });
    await cacheLadeZeilenFuer("aktivitaeten", "kunde_id", "k1"); // A oeffnet ein Kundenprofil
    state.schreibWarte = 50;
    const einfuegen = cacheInsert("aktivitaeten", { id: "a-notiz", kunde_id: "k1" });
    cacheNutzerSetzen("konto-b");
    await einfuegen;

    state.zeilen["aktivitaeten"] = [{ id: "b-1", kunde_id: "k9" } as { id: string }];
    await initDataCache({ sofort: ["aktivitaeten"] });
    expect(cacheGet("aktivitaeten").map((r: { id: string }) => r.id)).toEqual(["b-1"]);
  });

  it.each([
    ["cacheUpsert", () => cacheUpsert("aufgaben", { id: "a-neu" })],
    ["cacheDelete", () => cacheDelete("aufgaben", "b1")],
  ])("%s nach dem Abmelden schreibt und meldet nichts", async (_name, schreiben) => {
    await initDataCache({ sofort: ["aufgaben"] });
    state.schreibWarte = 30;
    const vorgang = schreiben();
    resetCache();
    state.zeilen["aufgaben"] = [{ id: "b1" }];
    await initDataCache({ sofort: ["aufgaben"] });
    const gemeldet: string[] = [];
    const unsub = onCacheChange((table) => gemeldet.push(table));
    await vorgang;
    unsub();

    expect(cacheGet("aufgaben")).toEqual([{ id: "b1" }]);
    expect(gemeldet).toEqual([]);
  });

  it("UserContext meldet das Konto vor dem Laden des Profils", () => {
    const code = readFileSync("src/contexts/UserContext.tsx", "utf8");
    const sitzung = code.slice(code.indexOf("setCurrentUserId(session.user.id);"));
    expect(sitzung.indexOf("cacheNutzerSetzen(session.user.id);")).toBeGreaterThan(-1);
    expect(sitzung.indexOf("cacheNutzerSetzen(session.user.id);")).toBeLessThan(sitzung.indexOf("await loadProfile("));
  });
});

describe("dataCache: gezieltes Nachladen nach mehreren Spalten", () => {
  beforeEach(() => {
    resetCache();
    state.zeilen = {};
    state.verzoegerung = {};
    state.abfragen = [];
    state.fehler = {};
    state.schreibWarte = 0;
  });

  afterEach(() => {
    resetCache();
  });

  it("behält beim Neuladen die Zeilen beider Spalten (Kundenprofil und Statistik)", async () => {
    state.zeilen["activity_log"] = [
      { id: "profil", kontakt_id: "k1", action: "kontakt_updated" } as { id: string },
      { id: "umhaengen", kontakt_id: "k2", action: "kontakt_reassigned" } as { id: string },
    ];
    await cacheLadeZeilenFuer("activity_log", "kontakt_id", "k1");
    expect(await cacheLadeZeilenFuer("activity_log", "action", "kontakt_reassigned")).toBe(true);

    // Das Neuladen liefert nur noch die neuesten Zeilen, die beiden alten fehlen.
    state.zeilen["activity_log"] = [{ id: "neu", kontakt_id: "k9", action: "x" } as { id: string }];
    await cacheReload("activity_log");
    expect(cacheGet("activity_log").map((r: { id: string }) => r.id).sort()).toEqual(["neu", "profil", "umhaengen"]);
  });

  it("meldet ein gescheitertes Nachladen", async () => {
    state.fehler["activity_log"] = "permission denied";
    expect(await cacheLadeZeilenFuer("activity_log", "action", "kontakt_reassigned")).toBe(false);
  });
});
