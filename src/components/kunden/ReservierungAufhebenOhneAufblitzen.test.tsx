import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { useEffect, useLayoutEffect, useReducer } from "react";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";

/**
 * Kein Aufblitzen nach „Reservierung aufheben“ (gemeldet am 06.10.2026).
 *
 * Nach dem Klick zeigte die Objektauswahl kurz wieder die Karte mit dem alten
 * Objekt, ehe die Empfehlungen kamen. Zwei Ursachen, beide hier nachgestellt:
 *
 * 1. Vereinbarung, Objekt und Stufe gingen nacheinander hinaus, das Abräumen
 *    des Objekts sogar entprellt. Die Antwort auf den Stufenwechsel ersetzte
 *    das lokale meta, bevor das Abräumen in der Datenbank war, und brachte
 *    das alte Objekt zurück.
 * 2. Jeder dieser Schreibvorgänge kam als Live-Update zurück, das Echo eines
 *    früheren oft erst nach dem späteren, mit dem älteren Stand. Hier kommt
 *    deshalb mitten im Ablauf ein Echo mit dem Stand vor dem Klick.
 *
 * Geprüft wird mit echtem Ablauf, echtem Zwischenspeicher und echter Karte,
 * nur die Datenbank ist nachgebildet. Jede Antwort braucht etwas Zeit, die
 * Live-Updates kommen alle verspätet, in der Reihenfolge der Datenbank.
 */

type Meta = Record<string, unknown>;
type Zeile = Meta & { id: string; meta: Meta };
type Echo = (p: { new: Zeile }) => void;

const db = vi.hoisted(() => ({
  zeilen: {} as Record<string, Map<string, Zeile>>,
  echoHandler: {} as Record<string, Echo>,
  echos: [] as Array<{ table: string; row: Zeile }>,
  objekte: [] as unknown[],
  /** Ein Echo mit dem Stand vor dem Klick, das mitten im Ablauf eintrifft. */
  altesEcho: null as Zeile | null,
  /** Lehnt die Datenbank das Zusammenführen von meta ab? */
  metaAbgelehnt: false,
}));

vi.mock("@/integrations/supabase/client", () => {
  const netz = () => new Promise((r) => setTimeout(r, 5));
  const istObjekt = (w: unknown): w is Meta => !!w && typeof w === "object" && !Array.isArray(w);
  const tief = (a: unknown, b: unknown): unknown => {
    if (!istObjekt(a) || !istObjekt(b)) return b;
    const out: Meta = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = k in a ? tief(a[k], v) : v;
    return out;
  };
  // Eine Änderung festschreiben und ihr Live-Update für später vormerken.
  const festschreiben = (table: string, id: string, aenderung: Meta): Zeile => {
    const row = { ...db.zeilen[table].get(id), ...aenderung } as Zeile;
    db.zeilen[table].set(id, row);
    db.echos.push({ table, row: structuredClone(row) });
    return row;
  };
  const kanal = () => {
    const k: { on: (typ: string, filter: { event: string; table: string }, cb: Echo) => typeof k; subscribe: () => typeof k } = {
      on: (_typ, filter, cb) => {
        if (filter.event === "UPDATE") db.echoHandler[filter.table] = cb;
        return k;
      },
      subscribe: () => k,
    };
    return k;
  };
  return {
    supabase: {
      from: (table: string) => ({
        select: () => Object.assign(Promise.resolve({ data: null, error: new Error("offline") }), {
          eq: (_spalte: string, id: string) => ({
            maybeSingle: async () => { await netz(); return { data: structuredClone(db.zeilen[table].get(id) ?? null), error: null }; },
          }),
        }),
        update: (u: Meta) => ({
          eq: (_spalte: string, id: string) => ({
            select: async (spalten: string) => {
              await netz();
              const row = festschreiben(table, id, u);
              return { data: [Object.fromEntries(spalten.split(",").map((s) => [s, row[s]]))], error: null };
            },
          }),
        }),
      }),
      rpc: async (name: string, args: Record<string, string> & { _updates: Meta }) => {
        await netz();
        if (name === "merge_investment_meta") {
          if (db.metaAbgelehnt) return { data: null, error: { code: "42501", message: "abgelehnt" } };
          const alt = db.zeilen.investments.get(args._investment_id)!;
          const meta = festschreiben("investments", alt.id, { meta: { ...alt.meta, ...args._updates } }).meta;
          // Das verspätete Echo eines früheren Schreibvorgangs, während die Spalten noch laufen.
          const altesEcho = db.altesEcho;
          db.altesEcho = null;
          if (altesEcho) setTimeout(() => db.echoHandler.investments?.({ new: altesEcho }), 2);
          return { data: meta, error: null };
        }
        if (name === "merge_kontakt_meta") {
          const alt = db.zeilen.kontakte.get(args._kontakt_id)!;
          return { data: festschreiben("kontakte", alt.id, { meta: tief(alt.meta, args._updates) as Meta }).meta, error: null };
        }
        return { data: null, error: null };
      },
      storage: { from: () => ({ copy: async () => { await netz(); return { error: null }; } }) },
      channel: kanal,
      removeChannel: () => undefined,
    },
  };
});
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { role: "vertriebspartner", name: "Vera Partner", email: "" }, authUser: { id: "vp-1" } }),
}));
vi.mock("@/lib/sidebarNavigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sidebarNavigation")>()),
  siehtObjekteMenue: () => true,
}));
vi.mock("@/hooks/useLiveData", () => ({ useLiveVersion: () => 0 }));
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => true }));
vi.mock("@/components/kunden/TerminseiteKnopf", () => ({ TerminseiteKnopf: () => null }));
vi.mock("@/components/kunden/InvestmentBerechnungen", () => ({ InvestmentBerechnungen: () => null }));
vi.mock("@/components/kunden/ObjektDatenDialog", () => ({ ObjektDatenDialog: () => null }));
vi.mock("@/lib/geocodeCache", () => ({ getCachedCoords: () => null, geocodeAddress: async () => null }));
vi.mock("@/lib/objekteStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/objekteStore")>()),
  getObjekte: () => db.objekte,
  // Die Einheit gibt die Datenbank frei; hier nur der Stand danach.
  removeReservierung: async () => {
    await new Promise((r) => setTimeout(r, 5));
    Object.assign(einheit, { status: "frei", kundeId: undefined });
    return { ok: true };
  },
}));

const { FreieWohnungenCard } = await import("./FreieWohnungenCard");
const { reservierungAufheben } = await import("@/lib/reservierungAufheben");
const { cacheSet, onCacheChange } = await import("@/lib/dataCache");
const { getInvestmentsByKontakt } = await import("@/lib/investmentsStore");
const { getKontaktById } = await import("@/lib/kundenStore");
const { objektauswahlFreigeschaltet } = await import("@/lib/investmentFreischaltung");
const { stufeErreicht } = await import("@/lib/pipelineStufen");

const einheit = {
  id: "a1", weNr: "1", etage: "EG", lage: "", groesse: 50, zimmer: 2, mieteGesamt: 800, vkGesamt: 274000,
  qmPreis: 0, rendite: 0, vermietet: true, status: "reserviert", kundeId: "k-1",
} as ObjektWohnung;
const frei = { ...einheit, id: "a2", weNr: "2", status: "frei", kundeId: undefined } as ObjektWohnung;
const haus = {
  id: "A", titel: "Haus A", adresse: "Teststraße 1", plz: "80331", ort: "München", beschreibung: "", highlights: [],
  bildUrl: "", bilder: [], dokumente: [], wohnungen: [einheit, frei], videoUrl: "", videoSichtbar: false, badge: "",
  groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0, renditeVon: 0, renditeBis: 0, sichtbar: true,
  erstellt_am: "2026-01-01", meta: { standortanalyse: { schema: 2, objekt_koordinaten: { lat: 48.14, lng: 11.58 } } },
} as unknown as ObjektData;

/** Ein reserviertes Investment, wie es nach der Unterschrift in der Datenbank steht. */
const INVESTMENT = {
  id: "inv-1", kunde_id: "k-1", objekt: "Haus A", wohnung: "1", status: "aktiv", erstellt_am: "2026-09-01",
  meta: {
    nummer: 1, label: "Investment 1", pipelineStufe: "reservierung",
    objektId: "A", wohnungId: "a1", objektTitel: "Haus A", weNr: "1", kaufpreis: 274000,
    rvVirtualWohnung: { objAdresse: "Teststraße 1", objPlz: "80331", objOrt: "München", weNr: "1", kaufpreis: 274000 },
    rvSigned: true, rvSignedAt: "2026-10-01T10:00:00.000Z", rvPdf: "RV.pdf", rvPdfPath: "reservierung/k-1/inv-1/RV.pdf",
    wohnortGeo: { plz: "83022", lat: 47.86, lng: 12.12 },
  },
};
const KONTAKT = {
  id: "k-1", vorname: "Max", nachname: "Muster", plz: "83022", ort: "Rosenheim", objekt: "Haus A WE 1",
  meta: { pipelineStufe: "reservierung" },
};

/** Was die Objektauswahl gerade zeigt, so wie es der Nutzer sieht. */
function zustand(): string {
  if (document.querySelector("[data-testid=gesperrt]")) return "gesperrt";
  if (document.querySelector("[data-testid=objektkarte]")) return "objektkarte";
  if (document.querySelector("[data-testid=objekt-empfehlungen]")) return "empfehlungen";
  if (document.body.textContent?.includes("Kein Objekt zugewiesen")) return "leer";
  return "sonst";
}

/** Wie das Kundenprofil: neu zeichnen bei jeder Änderung im Zwischenspeicher. */
function Profil({ protokoll }: { protokoll: string[] }) {
  const [, neu] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onCacheChange(() => neu()), []);
  useLayoutEffect(() => { protokoll.push(zustand()); });
  const inv = getInvestmentsByKontakt("k-1")[0];
  const kunde = getKontaktById("k-1")!;
  // Dieselbe Sperre wie in KundenDetail, ohne Selbstauskunft zählt nur die Stufe.
  const offen = objektauswahlFreigeschaltet({
    saLiegtVor: false, saEntfaellt: false, stufeErreicht: stufeErreicht(inv.pipelineStufe, "objektauswahl"),
  });
  if (!offen) return <div data-testid="gesperrt" />;
  return (
    <FreieWohnungenCard
      kunde={kunde} inv={inv} minRahmen={250000} maxRahmen={300000} allDocsApproved={false}
      canSwitchObjekt canSwitchObjektDirect={false} userRole="vertriebspartner" userName="Vera Partner"
      onSwitchObjekt={() => undefined} onNavigate={() => undefined}
    />
  );
}

const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("Reservierung aufheben ohne Aufblitzen", () => {
  // Ohne act-Umgebung zeichnet React wie im Browser, jeder Zwischenstand wird sichtbar.
  const vorher = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false; });
  afterAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = vorher; });

  it("zwischen Klick und Empfehlungen erscheint kein anderer Zustand, auch nicht durch verspätete Live-Updates", async () => {
    db.objekte = [haus];
    db.zeilen.investments = new Map([["inv-1", structuredClone(INVESTMENT)]]);
    db.zeilen.kontakte = new Map([["k-1", structuredClone(KONTAKT)]]);
    cacheSet("investments", [structuredClone(INVESTMENT)]);
    cacheSet("kontakte", [structuredClone(KONTAKT)]);
    db.altesEcho = structuredClone(INVESTMENT);

    const protokoll: string[] = [];
    render(<Profil protokoll={protokoll} />);
    await warte(20);
    expect(zustand()).toBe("objektkarte");

    const ergebnis = await reservierungAufheben({
      investmentId: "inv-1", kontaktId: "k-1", objektId: "A", wohnungId: "a1", anlass: "aufgehoben",
      vonName: "Vera Partner", vonId: "vp-1", darfOffeneLinksLoeschen: false,
    });
    expect(ergebnis).toMatchObject({ ok: true });
    // Hintergrund-Schreibvorgänge (entprellt, 120 ms) auslaufen lassen.
    await warte(400);

    // Jetzt erst die Live-Updates, einzeln und mit Zeit zum Zeichnen dazwischen.
    expect(db.echos.length).toBeGreaterThan(0);
    for (const { table, row } of db.echos.splice(0)) {
      db.echoHandler[table]?.({ new: row });
      await warte(10);
    }
    await warte(50);

    // Gleiche Bilder hintereinander zählen einmal.
    const folge = protokoll.filter((z, i) => z !== protokoll[i - 1]);
    expect(folge).toEqual(["objektkarte", "empfehlungen"]);

    // Und der Endstand stimmt auch in der Datenbank.
    const zeile = db.zeilen.investments.get("inv-1")!;
    expect(zeile.meta).toMatchObject({ pipelineStufe: "objektauswahl", objektId: null, wohnungId: null, rvSigned: false, rvVirtualWohnung: {} });
    expect(zeile.meta.rvHistorie).toEqual([expect.objectContaining({ stand: "unterschrieben", anlass: "aufgehoben" })]);
    expect(zeile.meta.einheitGewechseltVon).toBe("Vera Partner");
    expect(zeile.objekt).toBeNull();
    expect(db.altesEcho).toBeNull();
    expect(db.zeilen.kontakte.get("k-1")!.meta.pipelineStufe).toBe("objektauswahl");
  });
  it("scheitert meta, bleibt das Investment unberührt, auch die Spalten", async () => {
    db.zeilen.investments = new Map([["inv-1", structuredClone(INVESTMENT)]]);
    db.zeilen.kontakte = new Map([["k-1", structuredClone(KONTAKT)]]);
    cacheSet("investments", [structuredClone(INVESTMENT)]);
    cacheSet("kontakte", [structuredClone(KONTAKT)]);
    db.metaAbgelehnt = true;
    db.echos.length = 0;
    try {
      const ergebnis = await reservierungAufheben({
        investmentId: "inv-1", kontaktId: "k-1", anlass: "aufgehoben", vonName: "Vera Partner", darfOffeneLinksLoeschen: false,
      });
      expect(ergebnis).toMatchObject({ ok: false, schritt: "vereinbarung" });
      expect(db.zeilen.investments.get("inv-1")).toEqual(INVESTMENT);
      expect(db.zeilen.kontakte.get("k-1")).toEqual(KONTAKT);
      expect(getInvestmentsByKontakt("k-1")[0]).toMatchObject({ pipelineStufe: "reservierung", objektTitel: "Haus A", wohnungId: "a1" });
    } finally {
      db.metaAbgelehnt = false;
    }
  });
});
