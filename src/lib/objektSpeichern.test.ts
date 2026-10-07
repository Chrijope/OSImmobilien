import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";

/*
 * `saveObjekt` schreibt nur noch, was sich geändert hat (23.09.2026).
 *
 * Vorher löschte es Einheiten, Objektunterlagen und Objektbilder und legte
 * sie neu an. Vier Folgen davon werden hier nachgestellt, jede mit einer
 * nachgebildeten Datenbank, die die Kaskaden wirklich ausführt:
 *
 *   1. `objekt_exposes.wohnung_id` hängt mit ON DELETE CASCADE an
 *      `wohnungen`: gesendete Exposé-Links einer Einheit verschwanden.
 *   2. `wohnungs_dokumente` und `wohnungs_bilder` ebenso: die Unterlagen aus
 *      Investagon waren bis zum nächsten Import weg.
 *   3. Die Freigabespalten an `objekt_dokumente` gingen beim Neuanlegen
 *      verloren: ein gesperrtes Dokument war wieder frei.
 *   4. Status, Kunde und Reservierung jeder Einheit kamen aus dem
 *      Zwischenspeicher zurück: eine inzwischen unterschriebene Reservierung
 *      fiel auf „frei“.
 */

type Zeile = Record<string, unknown>;

const db = vi.hoisted(() => ({
  tabellen: {} as Record<string, Array<Record<string, unknown>>>,
  cache: {} as Record<string, Array<Record<string, unknown>>>,
  aufrufe: [] as Array<{ tabelle: string; art: string; werte?: unknown }>,
  fehler: {} as Record<string, { message: string }>,
  /** Tabellen, in denen die Zeilensicherheit das Löschen still verhindert. */
  loeschenVerboten: new Set<string>(),
  neuGeladen: [] as string[],
  testkonto: false,
  lokal: {} as Record<string, unknown>,
}));

vi.mock("@/integrations/supabase/client", () => {
  type Z = Record<string, unknown>;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  /** ON DELETE CASCADE wie in den Migrationen. */
  const KASKADE: Record<string, Array<[string, string]>> = {
    objekte: [["objekt_bilder", "objekt_id"], ["objekt_dokumente", "objekt_id"], ["wohnungen", "objekt_id"]],
    wohnungen: [["wohnungs_bilder", "wohnung_id"], ["wohnungs_dokumente", "wohnung_id"], ["objekt_exposes", "wohnung_id"]],
  };
  const tabelle = (name: string): Z[] => {
    if (!db.tabellen[name]) db.tabellen[name] = [];
    return db.tabellen[name];
  };
  const loeschen = (name: string, treffer: (z: Z) => boolean): Z[] => {
    const weg = tabelle(name).filter(treffer);
    db.tabellen[name] = tabelle(name).filter((z) => !treffer(z));
    const ids = new Set(weg.map((z) => z.id));
    for (const [kind, spalte] of KASKADE[name] || []) loeschen(kind, (z) => ids.has(z[spalte]));
    return weg;
  };
  const fehler = (name: string, art: string) => db.fehler[`${name}:${art}`] ?? null;
  const idFehler = (z: Z) => (UUID.test(String(z.id ?? ""))
    ? null
    : { message: `invalid input syntax for type uuid: "${String(z.id)}"`, code: "22P02" });

  /** Spalte oder JSON-Pfad wie `meta->>wohnungId`. */
  const wertIn = (z: Z, spalte: string): unknown => {
    const [basis, schluessel] = spalte.split("->>");
    if (schluessel === undefined) return z[basis];
    const json = z[basis];
    return json && typeof json === "object" ? (json as Z)[schluessel] : undefined;
  };

  class Abfrage {
    private filter: Array<(z: Z) => boolean> = [];
    private bereich: [number, number] | null = null;
    private mitRueckgabe = false;
    constructor(private name: string, private art: "select" | "update" | "delete", private werte?: Z) {}
    eq(spalte: string, wert: unknown) { this.filter.push((z) => wertIn(z, spalte) === wert); return this; }
    in(spalte: string, werte: unknown[]) { this.filter.push((z) => werte.includes(wertIn(z, spalte))); return this; }
    order() { return this; }
    range(von: number, bis: number) { this.bereich = [von, bis]; return this; }
    select() { this.mitRueckgabe = true; return this; }
    maybeSingle() {
      return this.ausfuehren().then(({ data, error }) => ({ data: Array.isArray(data) ? data[0] ?? null : data, error }));
    }
    then<A, B>(ok?: (w: { data: unknown; error: unknown }) => A, nein?: (e: unknown) => B) {
      return this.ausfuehren().then(ok, nein);
    }
    private async ausfuehren(): Promise<{ data: unknown; error: unknown }> {
      db.aufrufe.push({ tabelle: this.name, art: this.art, werte: this.werte });
      const f = fehler(this.name, this.art);
      if (f) return { data: null, error: f };
      const treffer = (z: Z) => this.filter.every((p) => p(z));
      if (this.art === "select") {
        let zeilen = tabelle(this.name).filter(treffer).map((z) => JSON.parse(JSON.stringify(z)) as Z);
        zeilen.sort((a, b) => String(a.id).localeCompare(String(b.id)));
        if (this.bereich) zeilen = zeilen.slice(this.bereich[0], this.bereich[1] + 1);
        return { data: zeilen, error: null };
      }
      if (this.art === "update") {
        for (const z of tabelle(this.name)) if (treffer(z)) Object.assign(z, this.werte);
        return { data: null, error: null };
      }
      if (db.loeschenVerboten.has(this.name)) return { data: [], error: null };
      const weg = loeschen(this.name, treffer);
      return { data: this.mitRueckgabe ? weg.map((z) => ({ id: z.id })) : null, error: null };
    }
  }

  return {
    supabase: {
      from: (name: string) => ({
        select: () => new Abfrage(name, "select"),
        update: (werte: Z) => new Abfrage(name, "update", werte),
        delete: () => new Abfrage(name, "delete"),
        upsert: async (zeilen: Z | Z[]) => {
          const liste = Array.isArray(zeilen) ? zeilen : [zeilen];
          db.aufrufe.push({ tabelle: name, art: "upsert", werte: liste });
          const f = fehler(name, "upsert") ?? liste.map(idFehler).find(Boolean) ?? null;
          if (f) return { error: f };
          for (const z of liste) {
            const vorhanden = tabelle(name).find((x) => x.id === z.id);
            if (vorhanden) Object.assign(vorhanden, z);
            else tabelle(name).push({ ...z });
          }
          return { error: null };
        },
        insert: async (zeilen: Z | Z[]) => {
          const liste = Array.isArray(zeilen) ? zeilen : [zeilen];
          db.aufrufe.push({ tabelle: name, art: "insert", werte: liste });
          const doppelt = liste.some((z) => tabelle(name).some((x) => x.id === z.id));
          const f = fehler(name, "insert")
            ?? liste.map(idFehler).find(Boolean)
            ?? (doppelt ? { message: "duplicate key value violates unique constraint", code: "23505" } : null);
          if (f) return { error: f };
          tabelle(name).push(...liste.map((z) => ({ ...z })));
          return { error: null };
        },
      }),
    },
  };
});

vi.mock("@/lib/dataCache", () => ({
  cacheGet: (t: string) => db.cache[t] || [],
  cacheFilter: (t: string, f: (z: Record<string, unknown>) => boolean) => (db.cache[t] || []).filter(f),
  cacheReload: async (t: string) => {
    db.neuGeladen.push(t);
    db.cache[t] = JSON.parse(JSON.stringify(db.tabellen[t] || []));
  },
  cacheInsert: async () => ({}), cacheUpdate: async () => true, cacheDelete: async () => true,
  cacheSet: () => {}, cacheUpsert: async () => ({}),
  // Der Löschschutz lädt `objektExposeStore` nach, und darüber `investmentsStore`.
  onCacheChange: () => () => {},
}));
vi.mock("@/lib/dbStoreHelper", () => ({
  isTestAccount: () => db.testkonto,
  localGet: (k: string, f: unknown) => (k in db.lokal ? db.lokal[k] : f),
  localSet: (k: string, v: unknown) => { db.lokal[k] = v; },
}));
vi.mock("@/lib/userSettingsCache", () => ({ getUserSetting: (_k: string, f: unknown) => f, setUserSetting: () => {} }));

const {
  deleteWohnung, getLastObjektSaveError, getLastObjektSaveHinweise, getObjektById, pruefeEinheitLoeschen, saveObjekt,
} = await import("@/lib/objekteStore");

// ── Stand ──

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const UUID_MUSTER = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBJEKT = u(1);
const W1 = u(11);
const W2 = u(12);
const W3 = u(13);
const W4 = u(14);
const W5 = u(15);
const W6 = u(16);
const IN_EINER_STUNDE = new Date(Date.now() + 60 * 60 * 1000).toISOString();

const kopie = <T>(w: T): T => JSON.parse(JSON.stringify(w)) as T;

function einheit(id: string, weNr: string, extra: Zeile = {}): Zeile {
  return {
    id, objekt_id: OBJEKT, we_nr: weNr, etage: "EG", lage: "", groesse: 50, zimmer: 2, miete_gesamt: 600,
    vk_gesamt: 200000, qm_preis: 4000, rendite: 3.6, vermietet: true, status: "frei", kunde_id: null,
    kunde_name: null, reserviert_am: null, meta: {}, ...extra,
  };
}

function grundstand(extra: Record<string, Zeile[]> = {}): Record<string, Zeile[]> {
  return {
    objekte: [{ id: OBJEKT, titel: "Haus am See", adresse: "Seeweg 1", global_objekt: false, meta: {} }],
    wohnungen: [einheit(W1, "1")],
    objekt_bilder: [],
    objekt_dokumente: [],
    wohnungs_bilder: [],
    wohnungs_dokumente: [],
    objekt_exposes: [],
    ...extra,
  };
}

/** Datenbank und Zwischenspeicher mit demselben Stand; ein Test kann sie danach auseinanderlaufen lassen. */
function datenbank(tabellen: Record<string, Zeile[]>) {
  db.tabellen = kopie(tabellen);
  db.cache = kopie(tabellen);
}

/** Das Objekt so, wie die Oberfläche es aus dem Zwischenspeicher bekommt. */
function objekt(): ObjektData {
  const o = getObjektById(OBJEKT);
  if (!o) throw new Error("Objekt fehlt im Zwischenspeicher");
  return o;
}

const aufrufe = (tabelle: string, art: string) => db.aufrufe.filter((a) => a.tabelle === tabelle && a.art === art);
const schreibend = () => db.aufrufe.filter((a) => a.art !== "select");
const zeile = (tabelle: string, id: string) => db.tabellen[tabelle]?.find((z) => z.id === id);
const mitEinheit = (o: ObjektData, id: string, teile: Partial<ObjektWohnung>): ObjektData => ({
  ...o,
  wohnungen: o.wohnungen.map((w) => (w.id === id ? { ...w, ...teile } : w)),
});

beforeEach(() => {
  db.aufrufe = [];
  db.fehler = {};
  db.loeschenVerboten = new Set();
  db.neuGeladen = [];
  db.testkonto = false;
  db.lokal = {};
  datenbank(grundstand());
});

// ── Die vier Folgen ──

describe("Die Folgen des alten Speicherns treten nicht mehr auf", () => {
  it("1. lässt gesendete Exposé-Links einer Einheit stehen", async () => {
    datenbank(grundstand({ objekt_exposes: [{ id: u(90), objekt_id: OBJEKT, wohnung_id: W1, token: "link-1" }] }));
    const o = mitEinheit(objekt(), W1, { etage: "2. OG" });

    expect(await saveObjekt({ ...o, titel: "Neuer Titel" })).toBe(true);

    expect(db.tabellen.objekt_exposes).toHaveLength(1);
    expect(aufrufe("wohnungen", "delete")).toHaveLength(0);
    expect(aufrufe("wohnungen", "insert")).toHaveLength(0);
    // Geschrieben wird nur das eine geänderte Feld.
    expect(aufrufe("wohnungen", "update").map((a) => a.werte)).toEqual([{ etage: "2. OG" }]);
    expect(zeile("objekte", OBJEKT)?.titel).toBe("Neuer Titel");
  });

  it("2. lässt Einheitenunterlagen und Einheitenbilder aus Investagon unangetastet", async () => {
    const unterlage = {
      id: u(40), wohnung_id: W1, name: "Mietvertrag", url: "https://investagon.test/mv.pdf",
      kategorie: "wohnungsunterlagen", kunden_freigabe: "frei", geschwaerzt: true,
    };
    const bild = { id: u(50), wohnung_id: W1, url: "https://investagon.test/b1.jpg", alt: "", reihenfolge: 0 };
    datenbank(grundstand({
      wohnungen: [einheit(W1, "1", { meta: { investagonId: "inv-1" } })],
      wohnungs_dokumente: [unterlage],
      wohnungs_bilder: [bild],
    }));

    expect(await saveObjekt({ ...objekt(), titel: "Neuer Titel" })).toBe(true);

    expect(db.tabellen.wohnungs_dokumente).toEqual([unterlage]);
    expect(db.tabellen.wohnungs_bilder).toEqual([bild]);
    expect(schreibend().filter((a) => a.tabelle.startsWith("wohnung"))).toEqual([]);
  });

  it("3. behält die Freigabe einer Objektunterlage, auch wenn sie umbenannt wird", async () => {
    const gesperrt = {
      id: u(30), objekt_id: OBJEKT, name: "Energieausweis", url: "https://x.test/ea.pdf", typ: "standard",
      kategorie: "objektunterlagen", sichtbar: true,
      kunden_freigabe: "gesperrt", kunden_freigabe_von: u(99), kunden_freigabe_am: "2026-09-23T10:00:00Z", geschwaerzt: false,
    };
    datenbank(grundstand({ objekt_dokumente: [gesperrt] }));
    const o = objekt();
    o.dokumente = o.dokumente.map((d) => ({ ...d, name: "Energieausweis 2026" }));

    expect(await saveObjekt(o)).toBe(true);

    expect(zeile("objekt_dokumente", u(30))).toEqual({ ...gesperrt, name: "Energieausweis 2026" });
    expect(aufrufe("objekt_dokumente", "delete")).toHaveLength(0);
    for (const aufruf of aufrufe("objekt_dokumente", "upsert")) {
      for (const z of aufruf.werte as Zeile[]) {
        expect(Object.keys(z).sort()).toEqual(["id", "kategorie", "name", "objekt_id", "sichtbar", "typ", "url"]);
      }
    }
  });

  it("4. setzt eine inzwischen reservierte Einheit nicht aus dem Zwischenspeicher auf frei zurück", async () => {
    const reserviert = {
      status: "reserviert", kunde_id: "k-1", kunde_name: "Anna Beispiel", reserviert_am: "2026-09-23T11:00:00Z",
      reserviert_von: u(98), meta: { beraterName: "Paul Partner" },
    };
    datenbank(grundstand());
    // Die Unterschrift kam nach dem Laden der Seite: nur die Datenbank weiß es.
    Object.assign(zeile("wohnungen", W1)!, reserviert);
    const o = mitEinheit(objekt(), W1, { vkGesamt: 210000 });
    expect(o.wohnungen[0].status).toBe("frei");

    expect(await saveObjekt(o)).toBe(true);

    expect(zeile("wohnungen", W1)).toMatchObject({ ...reserviert, vk_gesamt: 210000 });
    expect(aufrufe("wohnungen", "update").map((a) => a.werte)).toEqual([{ vk_gesamt: 210000 }]);
    expect(aufrufe("wohnungen", "insert")).toHaveLength(0);
  });

  it("4. lässt auch eine laufende Vormerkung stehen, die der Zwischenspeicher nicht kennt", async () => {
    const vormerkung = {
      vorgemerkt_bis: IN_EINER_STUNDE, vorgemerkt_kunde_id: "k-2", vorgemerkt_kunde_name: "Bernd",
      vorgemerkt_berater_name: "Paul Partner", vorgemerkt_von: u(97),
    };
    Object.assign(zeile("wohnungen", W1)!, vormerkung);

    expect(await saveObjekt(mitEinheit(objekt(), W1, { etage: "1. OG" }))).toBe(true);

    expect(zeile("wohnungen", W1)).toMatchObject({ ...vormerkung, etage: "1. OG" });
    for (const aufruf of aufrufe("wohnungen", "update")) {
      expect(Object.keys(aufruf.werte as Zeile).filter((k) => k.startsWith("vorgemerkt") || k === "status")).toEqual([]);
    }
  });
});

// ── Einheiten ──

describe("Einheiten", () => {
  it("legt eine neue Einheit an, auch mit einer Kennung, die keine UUID ist, und ohne Kunden", async () => {
    const o = objekt();
    const neu = (id: string, weNr: string, status: ObjektWohnung["status"]): ObjektWohnung => ({
      id, weNr, etage: "1. OG", lage: "", groesse: 60, zimmer: 2, mieteGesamt: 700, vkGesamt: 250000, qmPreis: 0,
      rendite: 0, vermietet: true, status, kundeId: "k-fremd", kundeName: "Fremd", beraterName: "Jemand",
      bilder: [{ id: `tmp-${weNr}`, url: `https://x.test/${weNr}.jpg`, alt: "", reihenfolge: 0 }],
    });
    // So vergibt die Verwaltungsansicht Kennungen (ObjektDetail, „Einheit hinzufügen“).
    const eingabe = [neu(`${OBJEKT}-w1727000000000`, "2", "frei"), neu(`${OBJEKT}-w1727000000001`, "3", "verkauft")];

    expect(await saveObjekt({ ...o, wohnungen: [...o.wohnungen, ...eingabe] })).toBe(true);

    const eingefuegt = aufrufe("wohnungen", "insert")[0].werte as Zeile[];
    expect(eingefuegt).toHaveLength(2);
    for (const z of eingefuegt) {
      expect(z.id).toMatch(UUID_MUSTER);
      for (const spalte of ["kunde_id", "kunde_name", "reserviert_am", "reserviert_von", "vorgemerkt_bis"]) {
        expect(z).not.toHaveProperty(spalte);
      }
      expect((z.meta as Zeile).beraterName).toBeUndefined();
    }
    expect(eingefuegt.map((z) => z.status)).toEqual(["frei", "verkauft"]);
    expect(db.tabellen.wohnungen.map((w) => w.id)).toEqual([W1, eingefuegt[0].id, eingefuegt[1].id]);
    expect(db.tabellen.wohnungs_bilder).toEqual([
      expect.objectContaining({ wohnung_id: eingefuegt[0].id, url: "https://x.test/2.jpg" }),
      expect.objectContaining({ wohnung_id: eingefuegt[1].id, url: "https://x.test/3.jpg" }),
    ]);
    expect(aufrufe("wohnungen", "update")).toHaveLength(0);
  });

  it("ändert nur, was sich geändert hat, und behält fremde und neuere meta-Schlüssel", async () => {
    datenbank(grundstand({
      wohnungen: [einheit(W1, "1", { meta: { investagonId: "inv-1", investagonRaw: { statusName: "Frei" } } })],
    }));
    // Inzwischen hat der Import neu geschrieben, der Zwischenspeicher weiß es nicht.
    zeile("wohnungen", W1)!.meta = {
      investagonId: "inv-1", investagonRaw: { statusName: "Notartermin" }, moebelPreis: 12000,
      investagonStatusVerwaltet: true, beraterName: "Paul Partner",
    };

    expect(await saveObjekt(mitEinheit(objekt(), W1, { ruecklageWohnung: 900 }))).toBe(true);

    expect(aufrufe("wohnungen", "update").map((a) => a.werte)).toEqual([{
      meta: {
        investagonId: "inv-1", investagonRaw: { statusName: "Notartermin" }, moebelPreis: 12000,
        investagonStatusVerwaltet: true, beraterName: "Paul Partner", ruecklageWohnung: 900,
      },
    }]);
  });

  it("schreibt an den Einheiten nichts und lädt nur die Objekte neu, wenn nur das Objekt geändert ist", async () => {
    datenbank(grundstand({
      wohnungen: [einheit(W1, "1"), einheit(W2, "2")],
      wohnungs_bilder: [{ id: u(50), wohnung_id: W1, url: "https://x.test/b.jpg", alt: "", reihenfolge: 0 }],
    }));

    expect(await saveObjekt({ ...objekt(), titel: "Nur der Titel" })).toBe(true);

    expect(schreibend().map((a) => `${a.tabelle}:${a.art}`)).toEqual(["objekte:upsert"]);
    expect(db.neuGeladen).toEqual(["objekte"]);
  });

  it("entfernt eine freie, von Hand angelegte Einheit", async () => {
    datenbank(grundstand({ wohnungen: [einheit(W1, "1"), einheit(W2, "2")] }));
    const o = objekt();

    expect(await saveObjekt({ ...o, wohnungen: o.wohnungen.filter((w) => w.id !== W2) })).toBe(true);

    expect(db.tabellen.wohnungen.map((w) => w.id)).toEqual([W1]);
    expect(getLastObjektSaveHinweise()).toEqual([]);
    expect(db.neuGeladen).toEqual(expect.arrayContaining(["wohnungen", "wohnungs_bilder", "wohnungs_dokumente"]));
  });

  it("löscht nie eine reservierte, verkaufte, vorgemerkte, vergebene oder aus Investagon stammende Einheit", async () => {
    datenbank(grundstand({
      wohnungen: [
        einheit(W1, "1"),
        einheit(W2, "2", { status: "reserviert", kunde_id: "k-1", kunde_name: "Anna" }),
        einheit(W3, "3", { status: "verkauft" }),
        einheit(W4, "4", { vorgemerkt_bis: IN_EINER_STUNDE, vorgemerkt_kunde_id: "k-2" }),
        einheit(W5, "5", { meta: { investagonId: "inv-5" } }),
        einheit(W6, "6", { kunde_id: "k-3" }),
      ],
    }));
    const o = objekt();

    expect(await saveObjekt({ ...o, wohnungen: o.wohnungen.filter((w) => w.id === W1) })).toBe(true);

    expect(db.tabellen.wohnungen).toHaveLength(6);
    expect(aufrufe("wohnungen", "delete")).toHaveLength(0);
    expect(getLastObjektSaveHinweise()).toEqual([
      "Einheit „2“ wurde nicht entfernt, weil sie reserviert ist.",
      "Einheit „3“ wurde nicht entfernt, weil sie verkauft ist.",
      "Einheit „4“ wurde nicht entfernt, weil sie gerade für einen Kunden vorgemerkt ist.",
      "Einheit „5“ wurde nicht entfernt, weil sie aus Investagon kommt und dort gepflegt wird.",
      "Einheit „6“ wurde nicht entfernt, weil an ihr ein Kunde hängt.",
    ]);
  });

  it("prüft den Löschschutz am frischen Stand, nicht am Zwischenspeicher", async () => {
    datenbank(grundstand({ wohnungen: [einheit(W1, "1"), einheit(W2, "2")] }));
    Object.assign(zeile("wohnungen", W2)!, { status: "reserviert", kunde_id: "k-1" });
    const o = objekt();

    expect(await saveObjekt({ ...o, wohnungen: o.wohnungen.filter((w) => w.id !== W2) })).toBe(true);

    expect(zeile("wohnungen", W2)).toMatchObject({ status: "reserviert", kunde_id: "k-1" });
  });

  it("ändert den Verkaufsstatus einer vorhandenen Einheit nicht und sagt es", async () => {
    expect(await saveObjekt(mitEinheit(objekt(), W1, { status: "verkauft" }))).toBe(true);

    expect(zeile("wohnungen", W1)?.status).toBe("frei");
    expect(aufrufe("wohnungen", "update")).toHaveLength(0);
    expect(getLastObjektSaveHinweise()).toEqual([expect.stringContaining("Einheit „1“: Der Verkaufsstatus bleibt „Frei“.")]);
  });

  it("legt eine inzwischen anderswo gelöschte Einheit nicht wieder an", async () => {
    datenbank(grundstand({ wohnungen: [einheit(W1, "1"), einheit(W2, "2")] }));
    db.tabellen.wohnungen = db.tabellen.wohnungen.filter((w) => w.id !== W2);

    expect(await saveObjekt(objekt())).toBe(true);

    expect(aufrufe("wohnungen", "insert")).toHaveLength(0);
    expect(getLastObjektSaveHinweise()).toEqual([
      "Einheit „2“ wurde inzwischen an anderer Stelle entfernt und deshalb nicht wieder angelegt.",
    ]);
  });

  it("löscht keine Einheit, die der Zwischenspeicher gar nicht kennt", async () => {
    // Ein Kollege hat eben eine Einheit angelegt; auf diesem Bildschirm ist sie noch nicht angekommen.
    db.tabellen.wohnungen.push(einheit(W2, "2"));

    expect(await saveObjekt(objekt())).toBe(true);

    expect(zeile("wohnungen", W2)).toBeDefined();
    expect(getLastObjektSaveHinweise()).toEqual([]);
  });

  it("sagt es, wenn die Datenbank das Entfernen still ablehnt", async () => {
    datenbank(grundstand({ wohnungen: [einheit(W1, "1"), einheit(W2, "2")] }));
    db.loeschenVerboten.add("wohnungen");
    const o = objekt();

    expect(await saveObjekt({ ...o, wohnungen: o.wohnungen.filter((w) => w.id !== W2) })).toBe(true);

    expect(zeile("wohnungen", W2)).toBeDefined();
    expect(getLastObjektSaveHinweise()).toEqual(["Einheit „2“ konnte nicht entfernt werden, die Datenbank hat es abgelehnt."]);
  });
});

// ── Objektunterlagen ──

describe("Objektunterlagen", () => {
  const dok = (id: string, name: string, extra: Zeile = {}): Zeile => ({
    id, objekt_id: OBJEKT, name, url: `https://x.test/${name}.pdf`, typ: "custom", kategorie: "objektunterlagen", sichtbar: true, ...extra,
  });

  it("legt neue an, löscht entfernte und schickt die Freigabe nie mit", async () => {
    const frei = dok(u(31), "Grundriss", { kunden_freigabe: "frei", geschwaerzt: false });
    datenbank(grundstand({ objekt_dokumente: [frei, dok(u(32), "Altlast")] }));
    const o = objekt();
    o.dokumente = [
      ...o.dokumente.filter((d) => d.id !== u(32)),
      { id: u(33), name: "Lageplan", url: "https://x.test/lageplan.pdf", typ: "custom", kategorie: "objektunterlagen", sichtbar: true },
    ];

    expect(await saveObjekt(o)).toBe(true);

    expect(aufrufe("objekt_dokumente", "upsert").map((a) => a.werte)).toEqual([[
      { id: u(33), objekt_id: OBJEKT, name: "Lageplan", url: "https://x.test/lageplan.pdf", typ: "custom", kategorie: "objektunterlagen", sichtbar: true },
    ]]);
    expect(zeile("objekt_dokumente", u(32))).toBeUndefined();
    expect(zeile("objekt_dokumente", u(31))).toEqual(frei);
  });

  it("erkennt eine Unterlage mit neuer Kennung an Name und Adresse wieder, statt sie doppelt anzulegen", async () => {
    // Der Objektassistent hängt Zusatzunterlagen beim Bearbeiten mit neuer Kennung ein zweites Mal an.
    datenbank(grundstand({ objekt_dokumente: [dok(u(31), "Grundriss", { kunden_freigabe: "gesperrt" })] }));
    const o = objekt();
    o.dokumente = [...o.dokumente, { ...o.dokumente[0], id: u(35), kundenFreigabe: undefined, freigabeSpalten: undefined }];

    expect(await saveObjekt(o)).toBe(true);

    expect(db.tabellen.objekt_dokumente).toEqual([dok(u(31), "Grundriss", { kunden_freigabe: "gesperrt" })]);
    expect(schreibend().filter((a) => a.tabelle === "objekt_dokumente")).toEqual([]);
  });

  it("löscht keine Unterlage, solange der Zwischenspeicher nicht alle kennt", async () => {
    datenbank(grundstand({ objekt_dokumente: [dok(u(31), "Grundriss"), dok(u(32), "Altlast")] }));
    // Noch nicht geladen, etwa weil nur der erste Block da ist.
    db.tabellen.objekt_dokumente.push(dok(u(34), "Neu vom Import"));
    const o = objekt();
    o.dokumente = o.dokumente.filter((d) => d.id !== u(32));

    expect(await saveObjekt(o)).toBe(true);

    expect(db.tabellen.objekt_dokumente).toHaveLength(3);
    expect(getLastObjektSaveHinweise()).toEqual([expect.stringContaining("Entfernte Objektunterlagen wurden noch nicht gelöscht")]);
  });
});

// ── Bilder ──

describe("Objektbilder", () => {
  const bild = (id: string, name: string, reihenfolge: number): Zeile => ({
    id, objekt_id: OBJEKT, url: `https://x.test/${name}.jpg`, alt: "", reihenfolge,
  });

  it("fügt neue hinzu, entfernt fehlende und übergeht nicht hochgeladene", async () => {
    datenbank(grundstand({ objekt_bilder: [bild(u(20), "a", 0), bild(u(21), "b", 1)] }));
    const o = objekt();
    o.bilder = [
      o.bilder[0],
      { id: "neu-1", url: "https://x.test/c.jpg", alt: "", reihenfolge: 1 },
      { id: "neu-2", url: "data:image/png;base64,AAAA", alt: "", reihenfolge: 2 },
    ];

    expect(await saveObjekt(o)).toBe(true);

    const geschrieben = aufrufe("objekt_bilder", "upsert").flatMap((a) => a.werte as Zeile[]);
    expect(geschrieben).toEqual([expect.objectContaining({ url: "https://x.test/c.jpg", reihenfolge: 1 })]);
    expect(geschrieben[0].id).toMatch(UUID_MUSTER);
    expect(db.tabellen.objekt_bilder.map((b) => b.url)).toEqual(["https://x.test/a.jpg", "https://x.test/c.jpg"]);
  });

  it("lässt die Bilder stehen, wenn die Eingabe kein einziges gültiges Bild nennt", async () => {
    datenbank(grundstand({ objekt_bilder: [bild(u(20), "a", 0), bild(u(21), "b", 1)] }));

    expect(await saveObjekt({ ...objekt(), bilder: [] })).toBe(true);

    expect(db.tabellen.objekt_bilder).toHaveLength(2);
    expect(schreibend().filter((a) => a.tabelle === "objekt_bilder")).toEqual([]);
  });
});

describe("Einheitenbilder", () => {
  const wbild = (id: string, name: string, reihenfolge: number): Zeile => ({
    id, wohnung_id: W1, url: `https://x.test/w-${name}.jpg`, alt: "", reihenfolge,
  });

  it("fügt ein neues hinzu und entfernt ein fehlendes", async () => {
    datenbank(grundstand({ wohnungs_bilder: [wbild(u(50), "a", 0), wbild(u(51), "b", 1)] }));
    const w = objekt().wohnungen[0];
    const bilder = [w.bilder![0], { id: "tmp", url: "https://x.test/w-c.jpg", alt: "", reihenfolge: 1 }];

    expect(await saveObjekt(mitEinheit(objekt(), W1, { bilder }))).toBe(true);

    expect(db.tabellen.wohnungs_bilder.map((b) => b.url)).toEqual(["https://x.test/w-a.jpg", "https://x.test/w-c.jpg"]);
    expect(zeile("wohnungs_bilder", u(51))).toBeUndefined();
  });

  it("löscht kein Einheitenbild, solange der Zwischenspeicher nicht alle Bilder kennt", async () => {
    datenbank(grundstand({ wohnungs_bilder: [wbild(u(50), "a", 0), wbild(u(51), "b", 1)] }));
    db.tabellen.wohnungs_bilder.push(wbild(u(52), "noch-nicht-geladen", 2));
    const w = objekt().wohnungen[0];

    expect(await saveObjekt(mitEinheit(objekt(), W1, { bilder: [w.bilder![0]] }))).toBe(true);

    expect(db.tabellen.wohnungs_bilder).toHaveLength(3);
    expect(getLastObjektSaveHinweise()).toEqual([expect.stringContaining("Entfernte Einheitenbilder wurden noch nicht gelöscht")]);
  });

  it("rührt Bilder und `meta.bilder` nicht an, wenn die Eingabe gar keine Bilder nennt", async () => {
    datenbank(grundstand({ wohnungs_bilder: [wbild(u(50), "a", 0)] }));

    expect(await saveObjekt(mitEinheit(objekt(), W1, { bilder: undefined, etage: "3. OG" }))).toBe(true);

    expect(aufrufe("wohnungen", "update").map((a) => a.werte)).toEqual([{ etage: "3. OG" }]);
    expect(db.tabellen.wohnungs_bilder).toHaveLength(1);
  });
});

// ── Neues Objekt, Fehler, Globalobjekt, Testkonto ──

describe("Ein neues Objekt", () => {
  const NEU = u(2);
  function neuesObjekt(): ObjektData {
    return {
      id: NEU, titel: "Neubau", adresse: "Neuweg 2", plz: "80331", ort: "München", beschreibung: "", highlights: [],
      bildUrl: "https://x.test/n.jpg", videoUrl: "", videoSichtbar: false, badge: "", groesseVon: 0, groesseBis: 0,
      preisVon: 0, preisBis: 0, renditeVon: 0, renditeBis: 0, sichtbar: true, status: "freigegeben", erstellt_am: "2026-09-23",
      bilder: [{ id: u(60), url: "https://x.test/n.jpg", alt: "", reihenfolge: 0 }],
      dokumente: [{ id: u(61), name: "Exposé", url: "", typ: "standard", kategorie: "objektunterlagen", sichtbar: true }],
      wohnungen: [{
        id: "w-new-1", weNr: "1", etage: "EG", lage: "", groesse: 40, zimmer: 1, mieteGesamt: 500, vkGesamt: 150000,
        qmPreis: 0, rendite: 0, vermietet: true, status: "frei",
        bilder: [{ id: "tmp", url: "https://x.test/nw.jpg", alt: "", reihenfolge: 0 }],
      }],
      meta: {},
    } as ObjektData;
  }

  it("legt Objekt, Unterlagen, Bilder, Einheiten und Einheitenbilder an", async () => {
    datenbank(grundstand());

    expect(await saveObjekt(neuesObjekt())).toBe(true);

    expect(zeile("objekte", NEU)).toMatchObject({ titel: "Neubau" });
    expect(db.tabellen.objekt_dokumente.filter((d) => d.objekt_id === NEU)).toHaveLength(1);
    expect(db.tabellen.objekt_bilder.filter((b) => b.objekt_id === NEU)).toHaveLength(1);
    const neueEinheit = db.tabellen.wohnungen.find((w) => w.objekt_id === NEU);
    expect(neueEinheit?.id).toMatch(UUID_MUSTER);
    expect(db.tabellen.wohnungs_bilder).toEqual([expect.objectContaining({ wohnung_id: neueEinheit?.id })]);
  });

  it("räumt bei einem Fehler wieder ab und nennt den Grund", async () => {
    datenbank(grundstand());
    db.fehler["wohnungen:insert"] = { message: "kaputt" };
    const fehler = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await saveObjekt(neuesObjekt())).toBe(false);

    expect(getLastObjektSaveError()).toContain("Wohnungen konnten nicht gespeichert werden");
    expect(zeile("objekte", NEU)).toBeUndefined();
    expect(db.tabellen.objekt_dokumente.filter((d) => d.objekt_id === NEU)).toEqual([]);
    expect(db.tabellen.objekt_bilder.filter((b) => b.objekt_id === NEU)).toEqual([]);
    // Das vorhandene Objekt nebenan bleibt.
    expect(zeile("objekte", OBJEKT)).toBeDefined();
    fehler.mockRestore();
  });
});

describe("Fehler bei einem vorhandenen Objekt", () => {
  it("räumt ein vorhandenes Objekt nie ab", async () => {
    db.fehler["wohnungen:update"] = { message: "kaputt" };
    const fehler = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await saveObjekt(mitEinheit(objekt(), W1, { etage: "5. OG" }))).toBe(false);

    expect(zeile("objekte", OBJEKT)).toBeDefined();
    expect(zeile("wohnungen", W1)).toBeDefined();
    // Die Objektzeile ist schon geschrieben; die Anzeige soll das zeigen.
    expect(db.neuGeladen).toEqual(["objekte"]);
    expect(getLastObjektSaveError()).toContain("Wohnungen konnten nicht gespeichert werden");
    fehler.mockRestore();
  });

  it("schreibt gar nichts, wenn sich der aktuelle Stand nicht lesen lässt", async () => {
    db.fehler["wohnungen:select"] = { message: "Zeitüberschreitung" };
    const fehler = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await saveObjekt({ ...objekt(), titel: "Egal" })).toBe(false);

    expect(schreibend()).toEqual([]);
    expect(getLastObjektSaveError()).toContain("konnte nicht gelesen werden");
    fehler.mockRestore();
  });
});

describe("Globalobjekt", () => {
  it("hält den Schalter eines reservierten Hauses, auch wenn der Zwischenspeicher ihn nicht kennt", async () => {
    datenbank(grundstand({
      objekte: [{ id: OBJEKT, titel: "Haus", global_objekt: false, meta: { anlageklasse: "Mehrfamilienhaus" } }],
    }));
    // Inzwischen als ganzes Haus reserviert, nur die Datenbank weiß es.
    Object.assign(zeile("objekte", OBJEKT)!, {
      global_objekt: true, belegung: "reserviert", belegung_kunde_id: "k-1", meta: { anlageklasse: "Globalobjekt" },
    });

    expect(await saveObjekt({ ...objekt(), titel: "Haus, neu" })).toBe(true);

    const upsert = aufrufe("objekte", "upsert")[0].werte as Zeile[];
    expect(upsert[0]).not.toHaveProperty("global_objekt");
    expect(upsert[0]).not.toHaveProperty("belegung");
    expect(zeile("objekte", OBJEKT)).toMatchObject({
      titel: "Haus, neu", global_objekt: true, belegung: "reserviert", belegung_kunde_id: "k-1",
      meta: { anlageklasse: "Globalobjekt" },
    });
    expect(getLastObjektSaveHinweise()).toEqual([expect.stringContaining("bleibt es ein Globalobjekt")]);
  });
});

// ── Der Mülleimer an einer Einheit (deleteWohnung) ──

describe("Einheit löschen über den Mülleimer", () => {
  const VOR_EINER_STUNDE = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  /** Ein Kundenlink an der Einheit, gesendet und nicht zurückgezogen, wenn nichts anderes gesagt ist. */
  const link = (id: number, extra: Zeile = {}): Zeile => ({
    id: u(id), objekt_id: OBJEKT, wohnung_id: W2, token: `link-${id}`,
    gesendet_am: VOR_EINER_STUNDE, zurueckgezogen_am: null, ...extra,
  });
  const investment = (id: number, wohnungId: string): Zeile => ({ id: u(id), kunde_id: "k-9", meta: { wohnungId } });

  beforeEach(() => {
    datenbank(grundstand({ wohnungen: [einheit(W1, "1"), einheit(W2, "2")] }));
  });

  it("löscht eine freie, von Hand angelegte Einheit samt Bildern und Unterlagen", async () => {
    datenbank(grundstand({
      wohnungen: [einheit(W1, "1"), einheit(W2, "2")],
      wohnungs_bilder: [{ id: u(50), wohnung_id: W2, url: "https://x/bild.jpg" }],
      wohnungs_dokumente: [{ id: u(51), wohnung_id: W2, name: "Grundriss" }],
      // Nur intern gespeichert und ein zurückgezogener Link: beides sperrt nicht.
      objekt_exposes: [link(60, { gesendet_am: null }), link(61, { zurueckgezogen_am: VOR_EINER_STUNDE })],
    }));

    expect(await pruefeEinheitLoeschen(W2)).toBeNull();
    expect(await deleteWohnung(OBJEKT, W2)).toEqual({ geloescht: true, grund: null });

    expect(db.tabellen.wohnungen.map((w) => w.id)).toEqual([W1]);
    expect(db.tabellen.wohnungs_bilder).toEqual([]);
    expect(db.tabellen.wohnungs_dokumente).toEqual([]);
    expect(db.neuGeladen).toEqual(expect.arrayContaining(["wohnungen", "wohnungs_bilder", "wohnungs_dokumente"]));
  });

  it.each([
    ["reserviert", { status: "reserviert" }, "sie reserviert ist"],
    ["gesetzt", { status: "gesetzt" }, "sie reserviert ist"],
    ["verkauft", { status: "verkauft" }, "sie verkauft ist"],
    ["mit Kunde", { kunde_id: "k-1" }, "an ihr ein Kunde hängt"],
    ["mit Kundenname", { kunde_name: "Anna" }, "an ihr ein Kunde hängt"],
    ["vorgemerkt", { vorgemerkt_bis: IN_EINER_STUNDE, vorgemerkt_kunde_id: "k-2" }, "sie gerade für einen Kunden vorgemerkt ist"],
    ["aus Investagon", { meta: { investagonId: "inv-2" } }, "sie aus Investagon kommt und dort gepflegt wird"],
  ])("löscht keine Einheit, die %s ist, und nennt den Grund", async (_art, felder, grund) => {
    datenbank(grundstand({ wohnungen: [einheit(W1, "1"), einheit(W2, "2", felder)] }));

    expect(await deleteWohnung(OBJEKT, W2)).toEqual({
      geloescht: false,
      grund: `Einheit „2“ kann nicht gelöscht werden, weil ${grund}.`,
    });
    expect(zeile("wohnungen", W2)).toBeDefined();
    expect(aufrufe("wohnungen", "delete")).toHaveLength(0);
  });

  it("prüft frisch aus der Datenbank und übersieht eine eben eingegangene Reservierung nicht", async () => {
    // Im Zwischenspeicher ist die Einheit noch frei.
    Object.assign(zeile("wohnungen", W2)!, { status: "reserviert", kunde_id: "k-1" });

    const ergebnis = await deleteWohnung(OBJEKT, W2);

    expect(ergebnis).toEqual({ geloescht: false, grund: "Einheit „2“ kann nicht gelöscht werden, weil sie reserviert ist." });
    expect(zeile("wohnungen", W2)).toMatchObject({ status: "reserviert" });
  });

  it("löscht keine Einheit, auf die ein Investment im Zwischenspeicher verweist", async () => {
    db.cache.investments = [investment(70, W2)];

    expect(await deleteWohnung(OBJEKT, W2)).toEqual({
      geloescht: false,
      grund: "Einheit „2“ kann nicht gelöscht werden, weil ein Investment auf sie verweist.",
    });
    expect(zeile("wohnungen", W2)).toBeDefined();
  });

  it("findet auch ein Investment, das der Zwischenspeicher noch nicht geladen hat", async () => {
    db.tabellen.investments = [investment(70, W2), investment(71, W2), investment(72, W1)];
    db.cache.investments = [investment(70, W2)];

    expect((await deleteWohnung(OBJEKT, W2)).grund).toBe(
      "Einheit „2“ kann nicht gelöscht werden, weil 2 Investments auf sie verweisen.",
    );
    expect(zeile("wohnungen", W2)).toBeDefined();
  });

  it("löscht keine Einheit mit gesendetem Kundenlink, auch wenn er abgelaufen ist", async () => {
    db.tabellen.objekt_exposes = [link(60, { gueltig_bis: VOR_EINER_STUNDE })];

    expect((await deleteWohnung(OBJEKT, W2)).grund).toBe(
      "Einheit „2“ kann nicht gelöscht werden, weil an ihr ein gesendeter Kundenlink hängt, der nicht zurückgezogen ist.",
    );
    expect(db.tabellen.objekt_exposes).toHaveLength(1);
  });

  it("zählt die Objektübersicht mit, die bei der Einheit einsteigt", async () => {
    db.tabellen.objekt_exposes = [
      link(60),
      link(61, { art: "objektuebersicht", wohnung_id: null, einstieg_wohnung_id: W2 }),
    ];

    expect((await deleteWohnung(OBJEKT, W2)).grund).toBe(
      "Einheit „2“ kann nicht gelöscht werden, weil an ihr 2 gesendete Kundenlinks hängen, die nicht zurückgezogen sind.",
    );
  });

  it("löscht nichts, wenn sich der Stand der Einheit nicht lesen lässt", async () => {
    db.fehler["wohnungen:select"] = { message: "Netzwerkfehler" };

    const ergebnis = await deleteWohnung(OBJEKT, W2);

    expect(ergebnis.geloescht).toBe(false);
    expect(ergebnis.grund).toContain("ließ sich nicht lesen");
    expect(aufrufe("wohnungen", "delete")).toHaveLength(0);
  });

  it("löscht nichts, wenn sich die Kundenlinks nicht prüfen lassen", async () => {
    db.fehler["objekt_exposes:select"] = { message: "Netzwerkfehler" };

    const ergebnis = await deleteWohnung(OBJEKT, W2);

    expect(ergebnis.geloescht).toBe(false);
    expect(ergebnis.grund).toContain("ließ sich nicht prüfen");
    expect(aufrufe("wohnungen", "delete")).toHaveLength(0);
  });

  it("sagt es, wenn die Datenbank das Löschen still ablehnt", async () => {
    db.loeschenVerboten.add("wohnungen");

    expect(await deleteWohnung(OBJEKT, W2)).toEqual({
      geloescht: false,
      grund: "Die Datenbank hat das Löschen abgelehnt. Vermutlich fehlt dir dafür das Recht.",
    });
  });

  it("sagt es, wenn die Einheit schon weg ist", async () => {
    db.tabellen.wohnungen = db.tabellen.wohnungen.filter((w) => w.id !== W2);

    const ergebnis = await deleteWohnung(OBJEKT, W2);

    expect(ergebnis).toEqual({ geloescht: false, grund: expect.stringContaining("nicht gefunden") });
    expect(aufrufe("wohnungen", "delete")).toHaveLength(0);
  });

  it("dieselbe Regel gilt beim Entfernen über das Speichern des Objekts", async () => {
    datenbank(grundstand({ wohnungen: [einheit(W1, "1"), einheit(W2, "2"), einheit(W3, "3")] }));
    db.cache.investments = [investment(70, W2)];
    db.tabellen.objekt_exposes = [link(60, { wohnung_id: W3 })];
    const o = objekt();

    expect(await saveObjekt({ ...o, wohnungen: o.wohnungen.filter((w) => w.id === W1) })).toBe(true);

    expect(db.tabellen.wohnungen).toHaveLength(3);
    expect(getLastObjektSaveHinweise()).toEqual([
      "Einheit „2“ wurde nicht entfernt, weil ein Investment auf sie verweist.",
      "Einheit „3“ wurde nicht entfernt, weil an ihr ein gesendeter Kundenlink hängt, der nicht zurückgezogen ist.",
    ]);
  });

  it("entfernt im Testkonto wie bisher nur lokal und ohne Prüfung", async () => {
    db.lokal.mi_objekte = [objekt()];
    db.testkonto = true;

    expect(await pruefeEinheitLoeschen(W2)).toBeNull();
    expect(await deleteWohnung(OBJEKT, W2)).toEqual({ geloescht: true, grund: null });

    expect(db.aufrufe).toEqual([]);
    expect((db.lokal.mi_objekte as ObjektData[])[0].wohnungen.map((w) => w.id)).toEqual([W1]);
  });
});

describe("Testkonto", () => {
  it("speichert wie bisher nur im lokalen Speicher", async () => {
    const o = objekt();
    db.testkonto = true;

    expect(await saveObjekt({ ...o, titel: "Lokal" })).toBe(true);

    expect(db.aufrufe).toEqual([]);
    expect(db.lokal.mi_objekte).toEqual([expect.objectContaining({ id: OBJEKT, titel: "Lokal" })]);
  });
});
