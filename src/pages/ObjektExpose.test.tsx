import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ObjektData } from "@/lib/objekteStore";

/**
 * Die Exposé-Seite als Ganzes: Rechte wie die Einheiten-Seite, alle zwölf
 * Abschnitte, Kennzeichnung der Selbstauskunft, sauberer Hinweis ohne
 * Migration und der Hinweis „Preis hat sich geändert".
 */

beforeAll(() => {
  class RO { observe() { /* leer */ } unobserve() { /* leer */ } disconnect() { /* leer */ } }
  (globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
});

const rolle = vi.hoisted(() => ({ wert: "admin", testFreigabe: false }));
const db = vi.hoisted(() => ({
  antworten: {} as Record<string, { data: unknown; error: null | { code?: string; message?: string } }>,
}));

vi.mock("@/integrations/supabase/client", () => {
  const kette = (tabelle: string) => {
    const k: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "in", "order", "limit", "insert", "update", "maybeSingle", "single"]) {
      k[m] = () => k;
    }
    k.then = (res: (v: unknown) => unknown) => Promise.resolve(res(db.antworten[tabelle] ?? { data: null, error: null }));
    return k;
  };
  // Der Speicher gibt zu jedem Pfad eine befristete Adresse, wie `createSignedUrl`.
  const storage = { from: (eimer: string) => ({ createSignedUrl: async (pfad: string) => ({ data: { signedUrl: `https://abc.supabase.co/storage/v1/object/sign/${eimer}/${pfad}?token=kurz` }, error: null }) }) };
  return { supabase: { from: (t: string) => kette(t), storage, channel: () => ({ on: () => ({ subscribe: () => undefined }) }) } };
});
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { role: rolle.wert, name: "Max Mustermann", email: "max@example.com" }, authUser: { id: "u1" } }),
}));
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => true }));
vi.mock("@/hooks/useLiveData", () => ({ useLiveVersion: () => 0 }));

/*
 * Die Zeilen, die der Investagon-Import zu den Dateien unten anlegt: intern,
 * am Objekt unsichtbar, die Datei als Zeiger auf den geschützten Eimer. Aus
 * ihnen wählt das Exposé seit dem 23.09.2026 die Grundrisse.
 */
const IMPORTIERTE_UNTERLAGEN = [
  { id: "d-we7", name: "WE 7 Grundriss", url: "/investagon-dokument/o1/1a2b3c4d-WE7_Grundriss.jpg", typ: "standard", kategorie: "intern", sichtbar: false },
  { id: "d-we8", name: "WE 8 Grundriss", url: "/investagon-dokument/o1/2b3c4d5e-WE8_Grundriss.jpg", typ: "standard", kategorie: "intern", sichtbar: false },
  { id: "d-mv7", name: "Mietvertrag Wohnung 7", url: "/investagon-dokument/o1/3c4d5e6f-Mietvertrag.pdf", typ: "standard", kategorie: "intern", sichtbar: false },
] as ObjektData["dokumente"];

const objekt: ObjektData = {
  id: "o1", titel: "Musterstraße 12", adresse: "Musterstraße 12", plz: "86150", ort: "Augsburg", beschreibung: "", highlights: [],
  bildUrl: "", bilder: [], dokumente: IMPORTIERTE_UNTERLAGEN, videoUrl: "", videoSichtbar: false, badge: "", groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0,
  renditeVon: 0, renditeBis: 0, sichtbar: true, status: "freigegeben", erstellt_am: "2026-01-01",
  globalDaten: { gesamtQm: 0, etagen: 4, baujahr: 1962, grundstueckQm: 0, verkaufspreis: 0, qmPreis: 0, rendite: 0, jahresnettomiete: 0, hausgeldMonat: 0, kaufnebenkosten: 0, grundstueckAnteil: 0 } as ObjektData["globalDaten"],
  meta: {
    energieausweis: { art: "Verbrauchsausweis", kennwert: 121, energietraeger: "Gas" },
    standortargumente: ["Wirtschaft. Starke Arbeitgeber vor Ort."],
    // Die gemessene Standortanalyse (schema 2), aus der die Mikrolage kommt.
    standortanalyse: {
      schema: 2, gemessen_am: "2026-09-20T10:00:00Z", objekt_koordinaten: { lat: 48.33, lng: 10.87 },
      mikrolage: {
        einkaufen: [{ name: "REWE Göggingen", typ: "Supermarkt", entfernung_m: 320, lat: 48.331, lng: 10.871 }],
        freizeit: [{ name: "Kurhauspark", typ: "Park", entfernung_m: 520, lat: 48.332, lng: 10.868 }],
        oepnv: [{ name: "Musterstraße", typ: "Bus", entfernung_m: 240, lat: 48.329, lng: 10.872 }],
      },
      mikrolage_hinweis: "Entfernungen als Luftlinie, Einrichtungen aus OpenStreetMap, Stand der Abfrage.",
    },
    /*
     * Der Originaldatensatz des Investagon-Imports, gekürzt auf die Felder,
     * die das Exposé auswertet. Die Grundrisse liegen am Objekt und tragen
     * die Nummer der Einheit, zu der sie gehören.
     */
    investagonRaw: {
      files: [
        { id: "f1", title: "WE 7 Grundriss", category: "layout", filename: "https://invest.example/we7-grundriss.jpg", original_filename: "WE7 Grundriss.jpg", position: 1 },
        { id: "f2", title: "WE 8 Grundriss", category: "layout", filename: "https://invest.example/we8-grundriss.jpg", original_filename: "WE8 Grundriss.jpg", position: 2 },
        { id: "f3", title: "Mietvertrag Wohnung 7", category: "rental_agreement", filename: "https://invest.example/mietvertrag.pdf", original_filename: "Mietvertrag.pdf", position: 3 },
      ],
      extras: [
        { id: "x1", value: "Dach und Fassade wurden bereits renoviert.", weight: 2 },
        { id: "x2", value: "Die ausgewiesene Kaltmiete wird notariell gewährleistet.", weight: 1 },
      ],
      // Beim Import hat das Haus die Liste einer einzelnen Wohnung bekommen,
      // samt deren Etage. Im Exposé einer Wohnung darf davon nichts stehen.
      tags: ["2. Fahrradkeller: vorhanden", "4. Erdgeschoss Links"],
      heating_type: "district_heating",
      transaction_tax_rate: 3.5,
    },
  } as ObjektData["meta"],
  wohnungen: [
    { id: "w7", weNr: "WE 7", etage: "2. OG", lage: "rechts", groesse: 61.4, zimmer: 3, mieteGesamt: 790, vkGesamt: 232000, qmPreis: 0, rendite: 0, vermietet: true, status: "frei", stellplatzPreis: 9500, hausgeldNichtUmlagefaehigEuro: 45 },
  ],
} as ObjektData;

/** Dasselbe Objekt ohne Investagon-Daten, also ohne einen einzigen Grundriss. */
const objektOhnePlaene = { ...objekt, id: "o2", dokumente: [], meta: { ...objekt.meta, investagonRaw: undefined } } as ObjektData;

/*
 * Knappe Objekte der vier Arten: nur, was ein frisch angelegtes Objekt
 * mindestens hat. Das Exposé muss trotzdem sauber aussehen.
 */
const knappBasis = {
  titel: "Knappstraße 1", adresse: "Knappstraße 1", plz: "86150", ort: "Augsburg", beschreibung: "", highlights: [],
  bildUrl: "", bilder: [], dokumente: [], videoUrl: "", videoSichtbar: false, badge: "", groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0,
  renditeVon: 0, renditeBis: 0, sichtbar: true, status: "freigegeben", erstellt_am: "2026-01-01", erstellt_von: "op1",
  globalDaten: { gesamtQm: 0, etagen: 0, baujahr: 0, grundstueckQm: 0, verkaufspreis: 0, qmPreis: 0, rendite: 0, jahresnettomiete: 0, hausgeldMonat: 0, kaufnebenkosten: 0, grundstueckAnteil: 20, zustand: "", energieeffizienzklasse: "", stellplaetze: 0, vermietungsstand: 0 },
} as const;
const knappeEinheit = (id: string, weNr: string) => ({ id, weNr, etage: "", lage: "", groesse: 48, zimmer: 2, mieteGesamt: 610, vkGesamt: 189000, qmPreis: 0, rendite: 0, vermietet: false, status: "frei" as const });
const knappMehrere = { ...knappBasis, id: "k-mehr", meta: {}, wohnungen: [knappeEinheit("km1", "WE 1"), knappeEinheit("km2", "WE 2")] } as unknown as ObjektData;
const knappEinzel = { ...knappBasis, id: "k-einzel", meta: { einzelwohnung: true }, wohnungen: [knappeEinheit("ke1", "")] } as unknown as ObjektData;
const knappWg = { ...knappBasis, id: "k-wg", meta: { einzelwohnung: true, objektart: "wg_coliving" }, wohnungen: [knappeEinheit("kw1", "WE 3")] } as unknown as ObjektData;
const knappGlobal = {
  ...knappBasis, id: "k-global", globalObjekt: true, meta: {},
  globalDaten: { ...knappBasis.globalDaten, verkaufspreis: 1400000, jahresnettomiete: 72000, gesamtQm: 650, baujahr: 1984, etagen: 4, hausgeldMonat: 900 },
  wohnungen: [{ ...knappeEinheit("kg1", "WE 1"), vermietet: true }, knappeEinheit("kg2", "WE 2")],
} as unknown as ObjektData;
const knappGlobalOhnePreis = { ...knappGlobal, id: "k-global-leer", globalDaten: { ...knappBasis.globalDaten } } as unknown as ObjektData;

const OBJEKTE: Record<string, ObjektData> = {
  o1: objekt, o2: objektOhnePlaene,
  [knappMehrere.id]: knappMehrere, [knappEinzel.id]: knappEinzel, [knappWg.id]: knappWg,
  [knappGlobal.id]: knappGlobal, [knappGlobalOhnePreis.id]: knappGlobalOhnePreis,
};

vi.mock("@/lib/objekteStore", async (orig) => {
  const echt = await orig<typeof import("@/lib/objekteStore")>();
  return { ...echt, getObjektById: (id: string) => OBJEKTE[id] };
});

const cache = vi.hoisted(() => ({
  tabellen: {} as Record<string, unknown[]>,
  /** Die Rohzeilen der Einheiten, wie `cacheGetById("wohnungen", id)` sie liefert. */
  einheiten: {
    w7: {
      id: "w7",
      meta: {
        investagonRaw: {
          tags: [
            "9. Einbauküche: inklusive",
            "3. 24 Monate Mietgarantie ab wirtschaftlichen Übergang: inklusive",
            "Viele Klicks",
            "Viele ♡",
            "3.OG Links",
            "3.5% Afa",
            "7. Wohnfläche: 61.5 m²",
          ],
        },
      },
    },
  } as Record<string, unknown>,
}));
vi.mock("@/lib/dataCache", () => ({
  cacheGet: (t: string) => cache.tabellen[t] ?? [],
  cacheGetById: (t: string, id: string) => (t === "wohnungen" ? cache.einheiten[id] : undefined),
  onCacheChange: () => () => undefined,
  isTableLoaded: () => true,
}));
// Testfreischaltung für das Konto u1 in der Rolle Vertriebspartner (`objekte_test_vertriebspartner`).
vi.mock("@/lib/appConfigStore", async (orig) => {
  const echt = await orig<typeof import("@/lib/appConfigStore")>();
  return { ...echt, getAppConfig: (key: string, fallback: unknown) => (key === "objekte_test_vertriebspartner" ? (rolle.testFreigabe ? ["u1"] : []) : echt.getAppConfig(key, fallback)) };
});
vi.mock("@/hooks/useVertretungen", () => ({ useVertretungen: () => new Set<string>() }));

const { default: ObjektExpose } = await import("./ObjektExpose");
const { EXPOSE_MIGRATION_HINWEIS } = await import("@/lib/objektExposeStore");
const { RECHNER_HINWEIS_OHNE_SPEICHERN } = await import("@/components/expose/ExposeAnsicht");
const { istVomRoutenspeicherAusgenommen } = await import("@/components/LastRouteMemory");
/*
 * Keine Adresssuche im Browser (Christian, 23.09.2026): Jede Anfrage an einen
 * Geodienst landet hier und fällt in den Tests zur Mikrolage auf. Alles andere
 * läuft unverändert weiter.
 */
const geoAnfragen: string[] = [];
const echtesFetch = globalThis.fetch;
beforeEach(() => {
  geoAnfragen.length = 0;
  vi.stubGlobal("fetch", (url: RequestInfo | URL, init?: RequestInit) => {
    if (/photon|komoot|nominatim/i.test(String(url))) {
      geoAnfragen.push(String(url));
      return Promise.resolve(new Response("{}", { status: 599 }));
    }
    return echtesFetch(url, init);
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

function renderMit(pfad: string) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <Routes>
        <Route path="/objekte/:id/einheiten/:weId/expose" element={<ObjektExpose />} />
        <Route path="/objekte/:id/expose" element={<ObjektExpose />} />
        <Route path="/objekte/:id/wohnung/:weId" element={<p>Verwaltungsansicht</p>} />
        <Route path="/objekte/:id/verwaltung" element={<p>Verwaltungsansicht Objekt</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  rolle.wert = "admin";
  rolle.testFreigabe = false;
  db.antworten = {};
  cache.tabellen = {
    kontakte: [
      { id: "k1", vorname: "Anna", nachname: "Muster", zustaendig_id: "u1" },
      { id: "k2", vorname: "Bernd", nachname: "Beispiel", zustaendig_id: "u2" },
    ],
    investments: [{ id: "i1", kunde_id: "k1", meta: { saData: { person1: { einkommenBruttoJahr: 120000, familienstand: "verheiratet" } } } }],
    profiles: [
      { id: "u2", name: "Paula Partner", telefon: "+49 89 123456", email: "paula@example.com", avatar_url: "https://example.org/paula.jpg" },
      { id: "op1", name: "Otto Objektpartner", telefon: "+49 89 999", email: "otto@example.com" },
    ],
    user_roles: [{ user_id: "u2", role: "vertriebspartner" }],
  };
});

describe("Exposé-Seite", () => {
  it("leitet einen Vertriebspartner wie die Einheiten-Seite auf die Verwaltungsansicht", () => {
    rolle.wert = "vertriebspartner";
    renderMit("/objekte/o1/einheiten/w7/expose");
    expect(screen.getByText("Verwaltungsansicht")).toBeInTheDocument();
    expect(screen.queryByTestId("abschnitt-start")).not.toBeInTheDocument();
  });

  /*
   * Seit dem 05.10.2026 (Christians Go) öffnen auch Vertriebsleitung und
   * Vertriebspartner das interne Exposé, mit demselben Zugang wie die
   * Einheitsseite. Den Kundenbezug bekommt der Partner nur für eigene Kunden.
   */
  it("zeigt der Vertriebsleitung das Exposé, mit Kundenbezug für jeden Kunden", () => {
    rolle.wert = "vertriebsleiter";
    renderMit("/objekte/o1/einheiten/w7/expose?kunde=k2");
    expect(screen.getByTestId("abschnitt-start")).toBeInTheDocument();
    expect(screen.getByTestId("kopf-kunde")).toHaveTextContent("für Bernd Beispiel");
  });

  it("zeigt einem freigeschalteten Vertriebspartner das Exposé, den Kundenbezug nur für eigene Kunden", () => {
    rolle.wert = "vertriebspartner";
    rolle.testFreigabe = true;
    const eigen = renderMit("/objekte/o1/einheiten/w7/expose?kunde=k1");
    expect(screen.getByTestId("kopf-kunde")).toHaveTextContent("für Anna Muster");
    eigen.unmount();
    // k2 betreut ein anderer Partner: neutrale Vorschau, kein Name, kein fremder Partner.
    renderMit("/objekte/o1/einheiten/w7/expose?kunde=k2");
    expect(screen.getByTestId("kopf-kunde")).toHaveTextContent("Vorschau ohne Kunden");
    expect(screen.queryByText(/Bernd Beispiel/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Paula Partner/)).not.toBeInTheDocument();
  });

  it("zeigt Admin alle elf Abschnitte, die Vorschau ohne Kunden und den Standort", async () => {
    renderMit("/objekte/o1/einheiten/w7/expose");
    // Der Grundriss steht da, sobald seine befristete Adresse geholt ist.
    await screen.findByTestId("abschnitt-grundriss");
    for (const id of ["start", "standort", "mikrolage", "objektdaten", "grundriss", "wirtschaftlichkeit", "verwaltung", "zeitplan", "chancen-risiken", "rechtliches", "kontakt"]) {
      expect(screen.getByTestId(`abschnitt-${id}`)).toBeInTheDocument();
    }
    expect(screen.queryByTestId("abschnitt-naechste-schritte")).not.toBeInTheDocument();
    expect(screen.getByTestId("kopf-kunde")).toHaveTextContent("Vorschau ohne Kunden");
    expect(screen.getByTestId("leiste-zaehler")).toHaveTextContent("1 / 11");
    expect(screen.getByTestId("gesamtinvestition")).toHaveTextContent("241.500 €");
    expect(screen.queryByTestId("anzahl-selbstauskunft")).not.toBeInTheDocument();
    expect(screen.getByTestId("energiestufe-D")).toHaveAttribute("aria-current", "true");
    expect(screen.getByTestId("rechtliches-entwurf")).toBeInTheDocument();
    expect(screen.getByTestId("standort-argumente")).toHaveTextContent("Wirtschaft");
    await waitFor(() => expect(screen.getByTestId("speicher-status")).toHaveTextContent("Die Regler sind zum Ausprobieren. Mit „Annahmen speichern“ bleiben deine Einstellungen für diese Einheit erhalten. Der Kundenlink rechnet immer mit den Standardwerten."));
  });

  it("nennt den Kunden, übernimmt aber keine Zahlen aus einer Selbstauskunft", async () => {
    /*
     * Ein Exposé gehört zu einer Einheit, nicht zu einem Investment. Welche
     * Selbstauskunft gemeint wäre, steht also gar nicht fest, und die eines
     * anderen Kaufs wäre geraten. Deshalb bleiben die Annahmen Standardwerte,
     * und statt einer stillen Leerstelle steht dort ein Hinweis
     * (Entscheidung Christian, 10.09.2026).
     */
    renderMit("/objekte/o1/einheiten/w7/expose?kunde=k1");
    expect(screen.getByTestId("kopf-kunde")).toHaveTextContent("für Anna Muster, erstellt von Max Mustermann");
    expect(screen.queryByTestId("anzahl-selbstauskunft")).not.toBeInTheDocument();
    expect(screen.getByTestId("ohne-selbstauskunft-hinweis")).toHaveTextContent("Standardwerte");
    expect(screen.getByTestId("regler-zve-wert")).not.toHaveTextContent("84.000 €");
    expect(screen.getByTestId("schalter-verheiratet")).toHaveAttribute("aria-checked", "false");
    await waitFor(() => expect(screen.getByTestId("speicher-status")).toHaveTextContent("Die Regler sind zum Ausprobieren. Mit „Annahmen speichern“ bleiben deine Einstellungen für diese Einheit erhalten. Der Kundenlink rechnet immer mit den Standardwerten."));
  });

  it("zeigt den Grundriss dieser Einheit, aber weder den fremden noch den Mietvertrag", async () => {
    /*
     * Die Grundrisse aller Einheiten hängen am Objekt. Der Plan einer fremden
     * Wohnung wäre eine falsche Angabe in einem Dokument, auf das sich ein
     * Käufer beruft. Die übrigen Investagon-Unterlagen, etwa der Mietvertrag,
     * bleiben ohnehin gesperrt.
     */
    renderMit("/objekte/o1/einheiten/w7/expose");
    const abschnitt = await screen.findByTestId("abschnitt-grundriss");
    expect(abschnitt).toHaveTextContent("WE 7 Grundriss");
    expect(abschnitt).not.toHaveTextContent("WE 8 Grundriss");
    expect(abschnitt).not.toHaveTextContent("Mietvertrag");
    // Die Adresse ist die befristete aus dem eigenen Speicher, nie der Zeiger und nie Investagon.
    const bild = screen.getByAltText("WE 7 Grundriss");
    expect(bild).toHaveAttribute("src", "https://abc.supabase.co/storage/v1/object/sign/investagon-dokumente/o1/1a2b3c4d-WE7_Grundriss.jpg?token=kurz");
    expect(abschnitt.innerHTML).not.toContain("invest.example");
    expect(abschnitt.innerHTML).not.toContain("/investagon-dokument/");
  });

  it("füllt Beschreibung, Merkmale und Objektdaten aus den Investagon-Daten", () => {
    renderMit("/objekte/o1/einheiten/w7/expose");
    const texte = screen.getByTestId("investagon-beschreibung").textContent ?? "";
    // `weight` gibt die Reihenfolge vor, nicht die Stelle im Datensatz.
    expect(texte.indexOf("Kaltmiete")).toBeGreaterThan(-1);
    expect(texte.indexOf("Kaltmiete")).toBeLessThan(texte.indexOf("Dach und Fassade"));
    const merkmale = screen.getByTestId("investagon-merkmale").textContent ?? "";
    expect(merkmale).toContain("Einbauküche");
    expect(merkmale.indexOf("Mietgarantie")).toBeLessThan(merkmale.indexOf("Einbauküche"));
    // Nur die Merkmale dieser Wohnung, nicht die des Hauses (24.09.2026).
    expect(merkmale).not.toContain("Fahrradkeller");
    expect(merkmale).not.toContain("Erdgeschoss");
    // Die Sperrliste: Beliebtheit, Etage und AfA-Satz erscheinen nie.
    expect(merkmale).not.toMatch(/Klicks|♡|3\.OG|Afa/);
    // Dezimalpunkte aus Investagon in deutscher Schreibweise.
    expect(merkmale).toContain("61,5 m²");
    // Investagons Nummer sortiert nur; angezeigt wird fortlaufend neu gezählt (05.10.2026).
    expect(merkmale).not.toContain("9.");
    expect(merkmale).toContain("3. Einbauküche");
    const tabelle = screen.getByTestId("objektdaten-tabelle");
    expect(tabelle).toHaveTextContent("Fernwärme");
    expect(tabelle).toHaveTextContent("3,5 %");
    // Die Effizienzklasse steht als Skala da und wird nicht doppelt behauptet.
    expect(screen.getByTestId("energiestufe-D")).toHaveAttribute("aria-current", "true");
  });

  it("lässt den Grundriss-Abschnitt weg, wenn es keinen einzigen Plan gibt", () => {
    renderMit("/objekte/o2/einheiten/w7/expose");
    expect(screen.queryByTestId("abschnitt-grundriss")).not.toBeInTheDocument();
    expect(screen.getByTestId("abschnitt-objektdaten")).toBeInTheDocument();
    expect(screen.getByTestId("leiste-zaehler")).toHaveTextContent("1 / 10");
  });

  it("meldet ohne Migration sauber und zeigt das Exposé trotzdem", async () => {
    db.antworten = { objekt_exposes: { data: null, error: { code: "42P01", message: "relation does not exist" } } };
    renderMit("/objekte/o1/einheiten/w7/expose");
    await waitFor(() => expect(screen.getByTestId("speicher-status")).toHaveTextContent(EXPOSE_MIGRATION_HINWEIS));
    expect(screen.getByTestId("abschnitt-wirtschaftlichkeit")).toBeInTheDocument();
    expect(screen.getByTestId("annahmen-speichern")).toBeEnabled();
  });

  it("zeigt den Hinweis zur Preisänderung, wenn der gespeicherte Preisstand abweicht, und übernimmt gespeicherte Annahmen", async () => {
    db.antworten = {
      objekt_exposes: {
        data: [{ id: "e1", wohnung_id: "w7", objekt_id: "o1", kontakt_id: null, erstellt_von: "u1", token: "t", annahmen: { zinsProzent: 3.5 }, annahmen_gesperrt: true, sichtbare_abschnitte: [], preisstand: 225000, preisstand_am: "2026-08-01T00:00:00Z", aufrufe: 0, erstellt_am: "2026-08-01T00:00:00Z", aktualisiert_am: "2026-08-01T00:00:00Z" }],
        error: null,
      },
    };
    renderMit("/objekte/o1/einheiten/w7/expose");
    await waitFor(() => expect(screen.getByTestId("preisstand-hinweis")).toBeInTheDocument());
    expect(screen.getByTestId("preisstand-hinweis")).toHaveTextContent("225.000 €");
    expect(screen.getByTestId("preisstand-hinweis")).toHaveTextContent("232.000 €");
    expect(screen.getByTestId("regler-zins-wert")).toHaveTextContent("3,50 %");
    expect(screen.getByTestId("schalter-sperren")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("speicher-status")).toHaveTextContent(/Gespeichert am/);
  });

  // Prüfung Codex vom 05.10.2026: `?expose=` übernimmt nur einen Datensatz zu Objekt, Einheit und erlaubtem Kunden.
  it("startet neutral, wenn der Datensatz aus ?expose= zu einem anderen Kunden gehört", async () => {
    db.antworten = {
      objekt_exposes: {
        data: { id: "e1", wohnung_id: "w7", objekt_id: "o1", kontakt_id: "k2", erstellt_von: "u2", token: "t", annahmen: { zinsProzent: 3.5 }, annahmen_gesperrt: true, sichtbare_abschnitte: [], preisstand: 225000, preisstand_am: "2026-08-01T00:00:00Z", aufrufe: 0, erstellt_am: "2026-08-01T00:00:00Z", aktualisiert_am: "2026-08-01T00:00:00Z" },
        error: null,
      },
    };
    renderMit("/objekte/o1/einheiten/w7/expose?expose=e1");
    await waitFor(() => expect(screen.getByTestId("speicher-status")).toHaveTextContent("Die Regler sind zum Ausprobieren"));
    expect(screen.getByTestId("regler-zins-wert")).not.toHaveTextContent("3,50 %");
    expect(screen.getByTestId("schalter-sperren")).toHaveAttribute("aria-checked", "false");
  });

  it("färbt den Knopf nach bestätigter Speicherung grün und nimmt das bei der nächsten Änderung zurück", async () => {
    renderMit("/objekte/o1/einheiten/w7/expose");
    await waitFor(() => expect(screen.getByTestId("speicher-status")).toHaveTextContent("Die Regler sind zum Ausprobieren"));
    // Ab hier antwortet die Datenbank auf das Anlegen mit der gespeicherten Zeile.
    db.antworten = {
      objekt_exposes: { data: { id: "e9", wohnung_id: "w7", objekt_id: "o1", kontakt_id: null, token: "t", annahmen: {}, annahmen_gesperrt: false, sichtbare_abschnitte: [], preisstand: 232000, preisstand_am: "2026-10-05T08:00:00Z", aufrufe: 0, erstellt_am: "2026-10-05T08:00:00Z", aktualisiert_am: "2026-10-05T08:00:00Z" }, error: null },
    };
    fireEvent.click(screen.getByTestId("annahmen-speichern"));
    await waitFor(() => expect(screen.getByTestId("annahmen-speichern")).toHaveAttribute("data-zustand", "gespeichert"));
    expect(screen.getByTestId("annahmen-speichern")).toHaveTextContent("Gespeichert");
    expect(screen.getByTestId("annahmen-speichern")).toHaveClass("bg-success");

    fireEvent.click(screen.getByTestId("schalter-sperren"));
    expect(screen.getByTestId("annahmen-speichern")).not.toHaveAttribute("data-zustand");
    expect(screen.getByTestId("annahmen-speichern")).toHaveTextContent("Annahmen speichern");
  });

  it("bleibt bei einem Fehler beim Speichern normal", async () => {
    renderMit("/objekte/o1/einheiten/w7/expose");
    await waitFor(() => expect(screen.getByTestId("speicher-status")).toHaveTextContent("Die Regler sind zum Ausprobieren"));
    db.antworten = { objekt_exposes: { data: null, error: { code: "42501", message: "keine Berechtigung" } } };
    fireEvent.click(screen.getByTestId("annahmen-speichern"));
    await waitFor(() => expect(screen.getByTestId("annahmen-speichern")).toBeEnabled());
    expect(screen.getByTestId("annahmen-speichern")).not.toHaveAttribute("data-zustand");
    expect(screen.getByTestId("annahmen-speichern")).toHaveTextContent("Annahmen speichern");
  });
});

/** Text eines Elements mit einfachen Leerzeichen, auch statt geschützter. */
const text = (el: Element | null) => (el?.textContent ?? "").replace(/[\u00A0\u202F\s]+/g, " ");

/**
 * Was in keinem Exposé stehen darf, egal wie knapp die Daten sind: kein
 * „undefined“, kein „NaN“, kein „0 €“, kein „Nicht hinterlegt“, kein
 * Objektpartner, keine Kachel mit „Keine Angabe“ und kein Abschnitt, der nur
 * aus seiner Überschrift besteht.
 */
function pruefeSauber(container: HTMLElement) {
  const alles = text(container);
  expect(alles).not.toMatch(/undefined|NaN/);
  // Ausgenommen ist der Regler „Eigenkapital 0,0 % · 0 €“: Das ist die gewählte Annahme, keine fehlende Angabe.
  const nullStellen = [...alles.matchAll(/(?<![\d.,])(?<!% · )0 €/g)].map((m) => alles.slice(Math.max(0, (m.index ?? 0) - 60), (m.index ?? 0) + 10));
  expect(nullStellen).toEqual([]);
  expect(alles).not.toContain("Nicht hinterlegt");
  expect(alles).not.toContain("Objektpartner");
  expect(alles).not.toContain("Otto");
  expect(alles).not.toContain("Wohnung ?");
  expect(text(screen.getByTestId("start-kennzahlen"))).not.toContain("Keine Angabe");
  for (const abschnitt of container.querySelectorAll("section[data-testid^='abschnitt-']")) {
    const kopf = text(abschnitt.querySelector(".section-head"));
    expect(text(abschnitt).length - kopf.length, abschnitt.getAttribute("data-testid") ?? "").toBeGreaterThan(40);
    for (const h3 of abschnitt.querySelectorAll("h3")) expect(text(h3).trim()).not.toBe("");
  }
}

describe("Exposé-Seite seit dem 23.09.2026", () => {
  it("zeigt den Ansprechpartner ganz oben nur im Exposé für einen Kunden", async () => {
    const ohne = renderMit("/objekte/o1/einheiten/w7/expose");
    expect(screen.queryByTestId("kunden-ansprechpartner")).not.toBeInTheDocument();
    ohne.unmount();

    renderMit("/objekte/o1/einheiten/w7/expose?kunde=k1");
    const kasten = screen.getByTestId("kunden-ansprechpartner");
    expect(kasten).toHaveTextContent("Max Mustermann");
    expect(kasten).toHaveTextContent("max@example.com");
    // Oberhalb der Bilder: vor dem Startabschnitt im Dokument.
    expect(kasten.compareDocumentPosition(screen.getByTestId("abschnitt-start")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("speicher-status")).toBeInTheDocument());
  });

  it("nimmt den zuständigen Partner des Kunden, oben wie unten, und nie den Objektpartner", async () => {
    const { container } = renderMit("/objekte/k-mehr/einheiten/km1/expose?kunde=k2");
    const kasten = screen.getByTestId("kunden-ansprechpartner");
    expect(kasten).toHaveTextContent("Paula Partner");
    expect(screen.getByTestId("kp-telefon")).toHaveAttribute("href", "tel:+4989123456");
    expect(screen.getByTestId("kp-email")).toHaveAttribute("href", "mailto:paula@example.com");
    expect(kasten.querySelector("img")).toHaveAttribute("src", "https://example.org/paula.jpg");
    const kontakt = screen.getByTestId("abschnitt-kontakt");
    expect(kontakt).toHaveTextContent("Paula Partner");
    expect(kontakt).not.toHaveTextContent("Max Mustermann");
    expect(text(container)).not.toContain("Otto Objektpartner");
    expect(text(container)).not.toContain("Objektpartner");
    await waitFor(() => expect(screen.getByTestId("speicher-status")).toBeInTheDocument());
  });

  it("zeigt den Zeitstrahl kurz wie die Vorlage, ohne Gebührentext, die Zahlungen hervorgehoben", async () => {
    /*
     * Bis zum 23.09.2026 stand an der Reservierung der lange Text zur Gebühr
     * mit Betrag, Frist und Rückzahlung. Christian will ihn nur noch in der
     * Reservierungsvereinbarung; im Zeitstrahl steht die kurze Angabe.
     */
    renderMit("/objekte/o1/einheiten/w7/expose");
    const zeitplan = screen.getByTestId("zeitplan");
    // Sechs Stationen, davor die abgehakte Beratung.
    expect(zeitplan.querySelectorAll("li")).toHaveLength(7);
    expect(zeitplan.querySelectorAll("[data-testid^='zeitplan-station-']")).toHaveLength(6);
    expect(screen.getByTestId("zeitplan-station-1")).toHaveTextContent("ReservierungMit Anzahlung wirksam");
    expect(screen.getByTestId("zeitplan-station-6")).toHaveTextContent("Übergabe an die Verwaltung");
    expect(screen.getByTestId("zeitplan-station-6").querySelector(".zeitplan-kasten")).toBeNull();
    expect(screen.getAllByTestId("zeitplan-zahlung").map((k) => k.textContent)).toEqual(["Mit Anzahlung wirksam", "nach Regelung im Kaufvertrag"]);
    expect(zeitplan).not.toHaveTextContent(/Reservierungsgebühr|Werkvertrag/);
    await waitFor(() => expect(screen.getByTestId("speicher-status")).toBeInTheDocument());
  });

  it("zeigt die Mikrolage sofort: links die Karte, rechts der Kasten nach Kategorien, ohne Listen darunter", async () => {
    renderMit("/objekte/o1/einheiten/w7/expose");
    const aufbau = screen.getByTestId("mikrolage-aufbau");
    const [links, rechts] = Array.from(aufbau.children);
    expect(links).toHaveAttribute("data-testid", "mikrolage-karte");
    expect(rechts).toHaveAttribute("data-testid", "mikrolage-liste");
    // Seit dem 24.09.2026 die Kategorien der Umgebungspunkte statt der drei Gruppen.
    // Der Park einer älteren Messung steht unter „Parks und Grün“.
    expect(screen.getByTestId("mikrolage-einkaufen")).toHaveTextContent("Einkaufen");
    expect(screen.getByTestId("mikrolage-einkaufen")).toHaveTextContent("REWE Göggingen");
    expect(screen.getByTestId("mikrolage-gruen")).toHaveTextContent(/Parks und Grün.*Kurhauspark/);
    expect(screen.getByTestId("mikrolage-verkehr")).toHaveTextContent(/Bus und Bahn.*Musterstraße/);
    expect(screen.getByTestId("umgebung-legende")).toHaveTextContent("Parks und Grün");
    // Kein Zustimmungsknopf mehr, keine Punktlisten unter der Karte. Mikro- und
    // Makrolage stehen seit dem 24.09.2026 beide rechts im Kasten neben ihr.
    expect(screen.queryByRole("button", { name: /Karte und Umgebung laden/ })).not.toBeInTheDocument();
    expect(aufbau.children).toHaveLength(2);
    expect(screen.getByTestId("mikrolage-karte")).not.toHaveTextContent(/Makrolage|Mikrolage/);
    expect(rechts).toHaveTextContent("Mikrolage");
    expect(within(rechts as HTMLElement).getByTestId("makrolage")).toHaveTextContent("Makrolage");
    await waitFor(() => expect(screen.getByTestId("speicher-status")).toBeInTheDocument());
  });

  /*
   * Bis zum 23.09.2026 fiel die Mikrolage ohne gemessene Analyse ganz weg,
   * samt Kartenknopf. Seitdem steht die Karte an ihrem Platz, mit der Nadel
   * aus der Adresse und rechts dem Hinweis statt leerer Listen.
   */
  it("zeigt die Mikrolage auch ohne gemessene Analyse und ohne Lage: Adresse, Hinweis, oben „Karte öffnen“, keine Adresssuche", async () => {
    renderMit("/objekte/k-mehr/einheiten/km1/expose");
    const abschnitt = screen.getByTestId("abschnitt-mikrolage");
    expect(screen.getByTestId("start-karte")).toHaveTextContent("Karte öffnen");
    const [links, rechts] = Array.from(screen.getByTestId("mikrolage-aufbau").children);
    expect(links).toHaveAttribute("data-testid", "mikrolage-karte");
    expect(rechts).toHaveAttribute("data-testid", "mikrolage-ersatz");
    expect(screen.getByTestId("mikrolage-karte-ersatz")).toHaveTextContent("Die Karte zur Lage folgt.");
    expect(abschnitt).toHaveTextContent("Knappstraße 1, 86150 Augsburg");
    expect(abschnitt).toHaveTextContent("Die Auswertung der Umgebung liegt noch nicht vor.");
    expect(screen.queryByTestId("mikrolage-liste")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("speicher-status")).toBeInTheDocument());
    expect(geoAnfragen).toEqual([]);
  });

  it("zeigt das Exposé einer Einheit im Objekt mit mehreren Einheiten auch mit knappen Daten sauber", async () => {
    const { container } = renderMit("/objekte/k-mehr/einheiten/km1/expose");
    pruefeSauber(container);
    // Zwei Einheiten im CRM sagen nichts über das Haus. Ohne gepflegte Zahl
    // (`meta.einheitenImHaus`) steht keine Einheitenzahl da (24.09.2026).
    expect(screen.getByTestId("objektdaten-tabelle")).not.toHaveTextContent("Einheiten im Haus");
    expect(screen.getByTestId("objektdaten-tabelle")).not.toHaveTextContent("Keine Angabe");
    expect(screen.getByTestId("verwaltung-ohne-leistungen")).toBeInTheDocument();
    expect(screen.getByTestId("kontakt-personen")).toHaveTextContent("Max Mustermann");
    await waitFor(() => expect(screen.getByTestId("speicher-status")).toBeInTheDocument());
  });

  it("zeigt die Einzelwohnung sauber, ohne „Wohnung ?“ und ohne „1 Einheit im Haus“", async () => {
    const { container } = renderMit("/objekte/k-einzel/einheiten/ke1/expose");
    pruefeSauber(container);
    expect(screen.getByTestId("objektdaten-tabelle")).not.toHaveTextContent("Einheiten im Haus");
    await waitFor(() => expect(screen.getByTestId("speicher-status")).toBeInTheDocument());
  });

  it("zeigt die WG sauber und nennt dort die WEG- und SEV-Verwaltung", async () => {
    const { container } = renderMit("/objekte/k-wg/einheiten/kw1/expose");
    pruefeSauber(container);
    expect(screen.getByTestId("abschnitt-verwaltung")).toHaveTextContent("WEG- und SEV-Verwaltung");
    expect(screen.getByTestId("abschnitt-start")).toHaveTextContent("WG und Co-Living");
    await waitFor(() => expect(screen.getByTestId("speicher-status")).toBeInTheDocument());
  });

  it("öffnet unter /objekte/:id/expose das Exposé des Globalobjekts mit Zahlen des ganzen Hauses", () => {
    const { container } = renderMit("/objekte/k-global/expose");
    pruefeSauber(container);
    const start = screen.getByTestId("start-kennzahlen");
    expect(text(start)).toContain("1.400.000 €");
    expect(start).toHaveTextContent("Kaufpreis Gesamtobjekt");
    expect(start).toHaveTextContent("650,0 m²");
    expect(text(start)).toContain("72.000 €");
    // Mietenspiegel statt Einzelpreise, kein Link auf ein Einheitsexposé.
    const spiegel = screen.getByTestId("einheiten-mietenspiegel");
    expect(text(spiegel)).toContain("610 €");
    expect(spiegel).not.toHaveTextContent("189.000");
    expect(screen.queryByRole("link", { name: /Exposé Einheit/ })).not.toBeInTheDocument();
    // Der Rechner rechnet mit dem Kaufpreis des Hauses.
    expect(text(screen.getByTestId("gesamtinvestition"))).toContain("1.400.000 €");
    // Der Zeitstrahl nennt auch beim ganzen Haus keinen Betrag mehr (23.09.2026).
    expect(screen.getByTestId("zeitplan")).not.toHaveTextContent("€");
    // Kopf: die Adresse des Hauses, ohne Wohneinheit.
    expect(screen.getByTestId("kopf-ueberschrift")).toHaveTextContent(/^Knappstraße 1, 86150 Augsburg$/);
    expect(screen.getByTestId("kopf-kunde")).toHaveTextContent("Vorschau ohne Kunden");
    // Über dem Rechner derselbe Satz wie in der Kundenansicht (23.09.2026).
    expect(screen.getByTestId("speicher-status")).toHaveTextContent(RECHNER_HINWEIS_OHNE_SPEICHERN);
  });

  it("zeigt ein Globalobjekt ohne Kaufpreis ehrlich, ohne Rechner und ohne leere Kacheln", () => {
    const { container } = renderMit("/objekte/k-global-leer/expose");
    pruefeSauber(container);
    expect(screen.getByTestId("rechner-nicht-verfuegbar")).toHaveTextContent("Berechnung noch nicht verfügbar");
    // Fläche und Miete kommen als Summe der Einheiten, gekennzeichnet.
    expect(screen.getByTestId("objektdaten-tabelle")).toHaveTextContent("Summe der Einheiten");
  });

  it("zeigt mit Kunde auch im Objekt-Exposé den Partner oben", () => {
    renderMit("/objekte/k-global/expose?kunde=k2");
    expect(screen.getByTestId("kunden-ansprechpartner")).toHaveTextContent("Paula Partner");
  });

  it("leitet /objekte/:id/expose einer Einzelwohnung auf das Exposé ihrer Einheit", async () => {
    renderMit("/objekte/k-einzel/expose?kunde=k1");
    expect(screen.getByTestId("abschnitt-start")).toBeInTheDocument();
    expect(screen.getByTestId("kopf-kunde")).toHaveTextContent("für Anna Muster");
    expect(screen.getByTestId("annahmen-speichern")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("speicher-status")).toBeInTheDocument());
  });

  it("leitet einen Vertriebspartner auch vom Objekt-Exposé auf die Verwaltungsansicht", () => {
    rolle.wert = "vertriebspartner";
    renderMit("/objekte/k-global/expose");
    expect(screen.getByText("Verwaltungsansicht Objekt")).toBeInTheDocument();
  });
});

describe("Vorschau aus „Exposé für Kunden“ (seit dem 23.09.2026)", () => {
  /*
   * „Vorschau öffnen“ hängt `ansicht=kunde` an. Genau so sieht es der Kunde
   * über seinen Link: keine interne Leiste, der Partner oben im Kasten.
   */
  it("zeigt weder „Zur Einheit im CRM“ noch den Hinweis zur Vorschau, dafür den Partnerkasten", async () => {
    const { container } = renderMit("/objekte/k-mehr/einheiten/km1/expose?kunde=k2&ansicht=kunde");
    expect(screen.queryByTestId("kopf-kunde")).not.toBeInTheDocument();
    expect(container.querySelector(".expose-editor-bar")).toBeNull();
    expect(screen.queryByText(/Zur Einheit im CRM/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("zum-crm")).not.toBeInTheDocument();
    expect(text(container)).not.toMatch(/Vorschau ohne Kunden|erstellt von/);
    expect(screen.queryByTestId("annahmen-speichern")).not.toBeInTheDocument();
    expect(screen.queryByTestId("speicher-status")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ohne-selbstauskunft-hinweis")).not.toBeInTheDocument();
    expect(text(container)).not.toContain("Interne Vorschau");
    const kasten = screen.getByTestId("kunden-ansprechpartner");
    expect(kasten).toHaveTextContent("Paula Partner");
    // Wie im Kundenlink nur Bild, Name, Telefon und E-Mail, keine Rolle.
    expect(kasten).not.toHaveTextContent("Vertrieb");
  });

  it("zeigt den Partnerkasten auch ohne Kunden, mit dir als Ansprechpartner", () => {
    renderMit("/objekte/o1/einheiten/w7/expose?ansicht=kunde");
    expect(screen.getByTestId("kunden-ansprechpartner")).toHaveTextContent("Max Mustermann");
    expect(screen.queryByTestId("kopf-kunde")).not.toBeInTheDocument();
  });

  it("rechnet wie der Kundenlink mit Standardannahmen, nicht mit gespeicherten", async () => {
    db.antworten = {
      objekt_exposes: {
        data: [{ id: "e1", wohnung_id: "w7", objekt_id: "o1", kontakt_id: null, token: "t", annahmen: { zinsProzent: 3.5 }, annahmen_gesperrt: true, sichtbare_abschnitte: [], preisstand: 232000, preisstand_am: "2026-08-01T00:00:00Z", aufrufe: 0, erstellt_am: "2026-08-01T00:00:00Z", aktualisiert_am: "2026-08-01T00:00:00Z" }],
        error: null,
      },
    };
    renderMit("/objekte/o1/einheiten/w7/expose?ansicht=kunde");
    // Kurz warten, damit ein Laden der gespeicherten Annahmen Zeit gehabt hätte.
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId("regler-zins-wert")).not.toHaveTextContent("3,50 %");
    expect(screen.queryByTestId("schalter-sperren")).not.toBeInTheDocument();
  });

  it("blendet auch im Exposé des ganzen Objekts die interne Leiste aus", () => {
    renderMit("/objekte/k-global/expose?kunde=k2&ansicht=kunde");
    expect(screen.queryByTestId("an-kunden-senden")).not.toBeInTheDocument();
    expect(screen.queryByTestId("kopf-kunde")).not.toBeInTheDocument();
    expect(screen.queryByText(/Zum Objekt im CRM/)).not.toBeInTheDocument();
    expect(screen.getByTestId("kunden-ansprechpartner")).toHaveTextContent("Paula Partner");
  });

  it("lässt die interne Leiste in der normalen Ansicht stehen", async () => {
    renderMit("/objekte/o1/einheiten/w7/expose");
    expect(screen.getByTestId("kopf-kunde")).toBeInTheDocument();
    // Seit dem 23.09.2026 im eigenen Tab: kein „Zurück“, sondern der Weg ins CRM im selben Tab.
    const zumCrm = screen.getByRole("link", { name: /Zur Einheit im CRM/ });
    expect(zumCrm).toHaveAttribute("href", "/objekte/o1/einheiten/w7");
    expect(zumCrm).not.toHaveAttribute("target");
    expect(screen.queryByText(/Zurück zur Einheit/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("speicher-status")).toBeInTheDocument());
  });
});

/*
 * Christian am 23.09.2026: Das Exposé erschien im CRM mit Seitenleiste, seine
 * Symbolleiste lag über der Seitenleiste des CRM und reichte bis ganz nach
 * unten. Seitdem öffnet es immer in einem eigenen Tab, ohne CRM-Rahmen, wie
 * „Als Kunde ansehen“. Geprüft wird am Wortlaut von `App.tsx` und des CSS,
 * denn Rahmen und Lage der Leiste zeigt jsdom nicht.
 */
describe("Exposé im eigenen Tab ohne CRM-Rahmen (seit dem 23.09.2026)", () => {
  const lies = (pfad: string) => readFileSync(resolve(process.cwd(), pfad), "utf8");
  const app = lies("src/App.tsx").replace(/\s+/g, " ");
  const schale = "<Route element={<AppShell />}>";

  it("hängt beide Exposé-Routen vor die AppShell, hinter den Anmeldeschutz", () => {
    // Ohne gefundene AppShell wäre der Test immer grün.
    expect(app).toContain(schale);
    const [ohneRahmen, imRahmen] = app.split(schale);
    for (const pfad of ["/objekte/:id/einheiten/:weId/expose", "/objekte/:id/expose"]) {
      expect(ohneRahmen).toContain(`<Route path="${pfad}" element={<PraesentationGuard><ObjektExpose /></PraesentationGuard>} />`);
      expect(imRahmen).not.toContain(`path="${pfad}"`);
    }
  });

  it("zeigt im Exposé des ganzen Objekts „Zum Objekt im CRM“ statt „Zurück“", () => {
    renderMit("/objekte/k-global/expose");
    const zumCrm = screen.getByRole("link", { name: /Zum Objekt im CRM/ });
    expect(zumCrm).toHaveAttribute("href", "/objekte/k-global");
    expect(zumCrm).not.toHaveAttribute("target");
    expect(screen.queryByText(/Zurück zum Objekt/)).not.toBeInTheDocument();
  });

  it("merkt sich das Exposé nie als letzte Seite, die Objekt- und Einheitsseiten schon", () => {
    expect(istVomRoutenspeicherAusgenommen("/objekte/o1/einheiten/w7/expose")).toBe(true);
    expect(istVomRoutenspeicherAusgenommen("/objekte/o1/einheiten/w7/expose?kunde=k1&ansicht=kunde")).toBe(true);
    expect(istVomRoutenspeicherAusgenommen("/objekte/o1/expose")).toBe(true);
    expect(istVomRoutenspeicherAusgenommen("/objekte/o1")).toBe(false);
    expect(istVomRoutenspeicherAusgenommen("/objekte/o1/einheiten/w7")).toBe(false);
    // Nur das Wortende zählt, ein Objekt namens „expose“ bleibt eine Objektseite.
    expect(istVomRoutenspeicherAusgenommen("/objekte/expose")).toBe(false);
  });

  it("öffnet „Vermögensaufbau im Exposé“ auf der Einheitsseite in einem neuen Tab", () => {
    const quelle = lies("src/components/objektseite/EinheitFinanzen.tsx").replace(/\s+/g, " ");
    expect(quelle).toMatch(/<Link to=\{exposePfad\(objekt\.id, w\.id\)\} target="_blank" rel="noopener noreferrer">Vermögensaufbau im Exposé<\/Link>/);
  });

  describe("die Symbolleiste links", () => {
    const css = lies("src/components/expose/premiumExpose.css");
    /** Der Inhalt eines `@media`-Blocks mit genau dieser Bedingung. */
    const block = (bedingung: string) => {
      const start = css.indexOf(`@media${bedingung}{`);
      expect(start).toBeGreaterThanOrEqual(0);
      return css.slice(start, css.indexOf("\n}", start));
    };

    it("endet ab 801 Pixel Breite nach dem letzten Symbol und bleibt im Fenster", () => {
      const breit = block("(min-width:801px)");
      const regel = breit.match(/\.premium-expose>nav\{([^}]*)\}/)?.[1] ?? "";
      expect(regel).toContain("bottom:auto");
      expect(regel).not.toMatch(/bottom:\d/);
      expect(regel).toMatch(/max-height:calc\(100dvh - \d+px\)/);
    });

    it("scrollt erst in sehr niedrigen Fenstern in sich", () => {
      const niedrig = block("(min-width:801px) and (max-height:600px)");
      expect(niedrig).toContain("overflow-y:auto");
    });

    it("bleibt auf dem Handy die Leiste am unteren Rand", () => {
      // Die Regel für schmale Fenster aus der Vorlage ist unverändert da.
      expect(css).toMatch(/@media\(max-width:800px\)\{[^\n]*\.premium-expose nav\{left:0;top:auto;bottom:0;height:62px;width:100%/);
    });
  });
});

/*
 * Christians Entscheidung vom 25.09.2026: Im Kundenbezug zeigt das Exposé
 * die Sprache des Kunden aus dem Kundenprofil, und sein PDF (der Druck der
 * Seite) ist in derselben Sprache. Ohne Kunde bleibt es deutsch.
 */
describe("Exposé in der Sprache des Kunden", () => {
  beforeEach(() => {
    cache.tabellen.kontakte = [
      ...(cache.tabellen.kontakte ?? []),
      { id: "k-en", vorname: "Emma", nachname: "English", zustaendig_id: "u1", meta: { kundenSprache: "en" } },
    ];
  });

  it("zeigt beim englischen Kunden Seite und Druck auf Englisch, die Leiste für dich bleibt deutsch", async () => {
    const { container } = renderMit("/objekte/o1/einheiten/w7/expose?kunde=k-en");
    await screen.findByTestId("abschnitt-grundriss");
    expect(screen.getAllByText("Download exposé").length).toBeGreaterThan(0);
    expect(screen.queryByText("Exposé herunterladen")).not.toBeInTheDocument();
    expect(screen.getByText("PROPERTY WITH PERSPECTIVE")).toBeInTheDocument();
    // Für den Mitarbeiter: wer und welche Sprache, auf Deutsch.
    expect(screen.getByTestId("kopf-kunde")).toHaveTextContent("für Emma English, erstellt von Max Mustermann");
    expect(screen.getByTestId("kopf-sprache")).toHaveTextContent("Kundensprache Englisch: Exposé und PDF auf Englisch");
    // Die deutschen Bedienelemente und Hinweise kommen nicht ins PDF des Kunden.
    expect(screen.getByTestId("annahmen-speichern-bereich")).toHaveClass("screen-only");
    expect(screen.getByTestId("rechner-hinweis-intern")).toHaveClass("screen-only");
    expect(container.querySelector("footer")?.textContent).not.toContain("Interne Vorschau");
  });

  it("zeigt die Kundenansicht („Vorschau öffnen“) beim englischen Kunden auf Englisch", async () => {
    renderMit("/objekte/o1/einheiten/w7/expose?kunde=k-en&ansicht=kunde");
    await screen.findByTestId("abschnitt-start");
    expect(screen.getByText("PROPERTY WITH PERSPECTIVE")).toBeInTheDocument();
  });

  it("bleibt beim deutschen Kunden deutsch und sagt das", async () => {
    renderMit("/objekte/o1/einheiten/w7/expose?kunde=k1");
    await screen.findByTestId("abschnitt-start");
    expect(screen.getByText("IMMOBILIEN MIT PERSPEKTIVE")).toBeInTheDocument();
    expect(screen.getByTestId("kopf-sprache")).toHaveTextContent("Kundensprache Deutsch");
  });

  it("bleibt ohne Kunden deutsch wie bisher, ohne Sprachhinweis und mit Bedienelementen im Druck", async () => {
    const { container } = renderMit("/objekte/o1/einheiten/w7/expose");
    await screen.findByTestId("abschnitt-start");
    expect(screen.getByText("IMMOBILIEN MIT PERSPEKTIVE")).toBeInTheDocument();
    expect(screen.queryByTestId("kopf-sprache")).not.toBeInTheDocument();
    expect(screen.getByTestId("annahmen-speichern-bereich")).not.toHaveClass("screen-only");
    expect(container.querySelector("footer")?.textContent).toContain("Interne Vorschau");
    expect(screen.getByTestId("zum-crm")).toHaveAttribute("href", "/objekte/o1/einheiten/w7");
    expect(screen.queryByTestId("zum-kundenprofil")).not.toBeInTheDocument();
  });

  it("führt im Kundenbezug zurück zur Einheit mit Kunde und direkt ins Kundenprofil", async () => {
    const zurueck = "/kunden/k-en?tab=investments&investment=inv1#objektauswahl";
    renderMit(`/objekte/o1/einheiten/w7/expose?kunde=k-en&empfehlung=inv1&zurueck=${encodeURIComponent(zurueck)}`);
    await screen.findByTestId("abschnitt-start");
    const zurEinheit = new URL(screen.getByTestId("zum-crm").getAttribute("href") || "", "https://crm.test");
    expect(zurEinheit.pathname).toBe("/objekte/o1/einheiten/w7");
    expect(zurEinheit.searchParams.get("empfehlung")).toBe("inv1");
    expect(zurEinheit.searchParams.get("zurueck")).toBe(zurueck);
    expect(screen.getByTestId("zum-kundenprofil")).toHaveAttribute("href", zurueck);
  });

  it("nimmt eine fremde Adresse nicht als Rückweg an", async () => {
    renderMit(`/objekte/o1/einheiten/w7/expose?kunde=k-en&zurueck=${encodeURIComponent("https://boese.example/kunden/x")}`);
    await screen.findByTestId("abschnitt-start");
    expect(screen.queryByTestId("zum-kundenprofil")).not.toBeInTheDocument();
    expect(screen.getByTestId("zum-crm")).toHaveAttribute("href", "/objekte/o1/einheiten/w7");
  });
});
