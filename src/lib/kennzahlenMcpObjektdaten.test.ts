/**
 * Der Lesezugang der Personas zu den Objektdaten (`kennzahlen-mcp`).
 *
 * Zwei Dinge muss dieser Test beweisen:
 *   1. Die Positivliste lässt keine Personen durch: keine Kunden, Käufer,
 *      Reservierungsinhaber, Mieter, Verkäufer, Berater.
 *   2. Das Werkzeug bietet keinen schreibenden Pfad an: kein Insert, Update,
 *      Delete, Upsert, kein RPC, keine fremde Tabelle.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  EINHEIT_SPALTEN,
  ERLAUBTE_TABELLEN,
  detailObjekt,
  nurLesen,
  OBJEKT_DETAIL_SPALTEN,
  OBJEKT_LISTE_SPALTEN,
  OBJEKT_WERKZEUGE,
  objektWerkzeugAufrufen,
  ortAus,
  personasDokument,
  personasEinheit,
  personasMeta,
  type RohClient,
} from "../../supabase/functions/_shared/objektdaten";

const OBJEKT_ID = "11111111-1111-4111-8111-111111111111";
const WOHNUNG_ID = "22222222-2222-4222-8222-222222222222";

/** Alles, was eine Person verrät. Keiner dieser Werte darf in einer Antwort stehen. */
const PERSONEN = [
  "Kunde-Kennung-4711", "Erika Käuferin", "Rolf Reservierer", "Berta Beraterin", "Vera Verkäuferin",
  "Viktor Vertreter", "Moritz Mieter", "mieter@example.org", "+49 170 1234567", "Paul Partner",
  "Ersteller-Kennung-99", "Hausverwaltung Huber", "Nutzer-Kennung-12", "Vorgemerkt Volker",
  "https://drive.example.org/ordner", "https://tool.investagon.com/datei.pdf", "Geheime Provision",
];

function objektZeile(): Record<string, unknown> {
  return {
    id: OBJEKT_ID, titel: "Friesenstraße 5", adresse: "Friesenstraße 5", plz: "39104", ort: "Magdeburg",
    status: "freigegeben", sichtbar: true, global_objekt: false, preis_von: 180000, preis_bis: 240000,
    global_baujahr: 1928, erstellt_am: "2026-08-01T10:00:00Z", beschreibung: "Gründerzeithaus",
    belegung: "reserviert",
    belegung_kunde_id: "Kunde-Kennung-4711", belegung_kunde_name: "Erika Käuferin", belegung_von: "Nutzer-Kennung-12",
    vorgemerkt_kunde_id: "Kunde-Kennung-4711", vorgemerkt_kunde_name: "Vorgemerkt Volker",
    vorgemerkt_berater_name: "Berta Beraterin", vorgemerkt_von: "Nutzer-Kennung-12",
    erstellt_von: "Ersteller-Kennung-99", exklusiv_partner: ["Paul Partner"],
    cloud_ordner_url: "https://drive.example.org/ordner",
    meta: {
      kurzbeschreibung: "Ruhige Lage",
      hausgeldMonat: 310,
      ruecklageWeg: 45000,
      anlageklasse: "Bestand",
      verkaeuferDaten: { name: "Vera Verkäuferin", email: "mieter@example.org", telefon: "+49 170 1234567" },
      hausverwaltung: "Hausverwaltung Huber",
      beraterName: "Berta Beraterin",
      unterlagenLink: "https://drive.example.org/ordner",
      investagonRaw: {
        object_building_year: 1928,
        purchase_price_apartment: 199000,
        rent_apartment_month: 640,
        seller: "Vera Verkäuferin",
        seller_rep: "Viktor Vertreter",
        commission: "Geheime Provision",
        files: [{ filename: "https://tool.investagon.com/datei.pdf", category: "rental_agreement", title: "Mietvertrag Moritz Mieter" }],
      },
    },
  };
}

function wohnungZeile(): Record<string, unknown> {
  return {
    id: WOHNUNG_ID, objekt_id: OBJEKT_ID, we_nr: "WE 03", etage: "2. OG", lage: "links", groesse: 64.5, zimmer: 2,
    miete_gesamt: 640, vk_gesamt: 199000, qm_preis: 3085, rendite: 3.9, vermietet: true, status: "gesetzt",
    reserviert_am: "2026-09-01T09:00:00Z", erstellt_am: "2026-08-01T10:00:00Z",
    kunde_id: "Kunde-Kennung-4711", kunde_name: "Erika Käuferin", reserviert_von: "Nutzer-Kennung-12",
    gesetzt_am: "2026-09-01", gesetzt_bis: "2026-09-10",
    vorgemerkt_kunde_id: "Kunde-Kennung-4711", vorgemerkt_kunde_name: "Vorgemerkt Volker",
    vorgemerkt_berater_name: "Berta Beraterin", vorgemerkt_von: "Nutzer-Kennung-12", vorgemerkt_bis: "2026-09-02",
    meta: {
      hausgeldMonat: 210,
      vermietetSeit: "2019-04-01",
      beraterName: "Berta Beraterin",
      exklusivNutzer: "Nutzer-Kennung-12",
      saData: { name: "Erika Käuferin" },
      mieter: "Moritz Mieter",
      dokumente: [{ id: "m1", name: "Mietvertrag Moritz Mieter", url: "https://tool.investagon.com/datei.pdf", kategorie: "wohnungsunterlagen" }],
      investagonRaw: { seller: "Vera Verkäuferin", rent_apartment_month: 640, commission: "Geheime Provision" },
    },
  };
}

function ohnePersonen(wert: unknown) {
  const json = JSON.stringify(wert);
  for (const p of PERSONEN) expect(json, `„${p}" darf nicht hinaus`).not.toContain(p);
}

describe("Positivliste: keine Personen", () => {
  it("die Spaltenlisten enthalten keine Personenspalte", () => {
    const verboten = /kunde|vorgemerkt|belegung_|erstellt_von|reserviert_von|exklusiv|cloud_ordner|berater|gesetzt_|^meta$/;
    for (const spalte of [...OBJEKT_LISTE_SPALTEN, ...OBJEKT_DETAIL_SPALTEN, ...EINHEIT_SPALTEN]) {
      expect(spalte).not.toMatch(verboten);
    }
  });

  it("ein Objekt verliert Käufer, Vormerkung, Ersteller, Partner, Verkäufer und Provision", () => {
    const aus = detailObjekt(objektZeile());
    ohnePersonen(aus);
    expect(aus).toMatchObject({ titel: "Friesenstraße 5", preis_von: 180000, global_baujahr: 1928, belegung: "reserviert" });
    expect(aus.meta).toMatchObject({ kurzbeschreibung: "Ruhige Lage", hausgeldMonat: 310, ruecklageWeg: 45000, anlageklasse: "Bestand" });
    expect((aus.meta as Record<string, unknown>).investagonRaw).toEqual({
      object_building_year: 1928, purchase_price_apartment: 199000, rent_apartment_month: 640,
    });
  });

  it("eine Einheit zeigt den Zustand, aber nie wer", () => {
    const aus = personasEinheit(wohnungZeile());
    ohnePersonen(aus);
    expect(aus.status).toBe("reserviert");
    expect(aus).toMatchObject({ we_nr: "WE 03", groesse: 64.5, miete_gesamt: 640, reserviert_am: "2026-09-01T09:00:00Z" });
    for (const feld of ["kunde_id", "kunde_name", "reserviert_von", "vorgemerkt_kunde_name", "vorgemerkt_bis", "gesetzt_bis"]) {
      expect(aus).not.toHaveProperty(feld);
    }
    expect(aus.meta).toEqual({ hausgeldMonat: 210, vermietetSeit: "2019-04-01", investagonRaw: { rent_apartment_month: 640 } });
  });

  it("unbekannte meta-Schlüssel fallen weg, statt durchzurutschen", () => {
    expect(personasMeta({ neuesFeldMitName: "Moritz Mieter", eigentuemer: { name: "Erika Käuferin" } })).toEqual({});
  });

  it("Unterlagen: rote, Vertrags- und sonstige Titel bleiben leer, keine Adresse geht hinaus", () => {
    const bezug = { ebene: "objekt" as const };
    const url = "https://tool.investagon.com/datei.pdf";
    const mietvertrag = personasDokument({ name: "Mietvertrag Moritz Mieter", url }, bezug);
    const grundbuch = personasDokument({ name: "Grundbuchauszug Erika Käuferin", url }, bezug);
    const kaufvertrag = personasDokument({ name: "Kaufvertrag Erika Käuferin", url }, bezug);
    const sonstiges = personasDokument({ name: "Scan Rolf Reservierer", url }, bezug);
    const mitMail = personasDokument({ name: "Energieausweis mieter@example.org", url }, bezug);
    const getarnt = personasDokument({ name: "Grundriss Moritz Mieter", url }, bezug, "rental_agreement");
    for (const d of [mietvertrag, grundbuch, kaufvertrag, sonstiges, mitMail, getarnt]) {
      expect(d.titel).toBeNull();
      expect(d.titel_ausgeblendet).toBe(true);
    }
    expect(mietvertrag).toMatchObject({ gruppe: "Mietverhältnis", ampel: "rot", quelle: "investagon", datei_vorhanden: true });
    expect(grundbuch.ampel).toBe("rot");
    expect(getarnt.ampel).toBe("rot");
    ohnePersonen([mietvertrag, grundbuch, kaufvertrag, sonstiges, mitMail, getarnt]);

    const energie = personasDokument({ name: "Energieausweis 2024", url: "", kategorie: "objektunterlagen", typ: "standard", erstellt_am: "2026-08-02" }, bezug);
    expect(energie).toMatchObject({ titel: "Energieausweis 2024", gruppe: "Energie", ampel: "gruen", datei_vorhanden: false, datum: "2026-08-02" });
    expect(Object.keys(energie)).not.toContain("url");
  });

  it("eine frei erfundene Kategorie geht nicht als Text hinaus", () => {
    expect(personasDokument({ name: "Wirtschaftsplan 2025", kategorie: "Erika Käuferin" }, { ebene: "objekt" }).kategorie).toBe("sonstige");
  });

  it("der Ortsfilter nimmt keine Suchmuster und keine Sonderzeichen an", () => {
    expect(ortAus("Magde%burg_,(or)")).toBe("Magdeburgor");
    expect(ortAus("  ")).toBeNull();
    expect(ortAus(42)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Ein falscher Client, der jeden Aufruf mitschreibt                   */
/* ------------------------------------------------------------------ */

function falscherClient(daten: Record<string, Array<Record<string, unknown>>>) {
  const aufrufe: string[] = [];
  const schreibend = { insert: vi.fn(), update: vi.fn(), delete: vi.fn(), upsert: vi.fn() };
  const rpc = vi.fn();

  function abfrage(tabelle: string, spalten: string) {
    let bereich: [number, number] | null = null;
    const ergebnis = () => {
      const alle = daten[tabelle] ?? [];
      const teil = bereich ? alle.slice(bereich[0], bereich[1] + 1) : alle;
      return { data: teil, error: null, count: alle.length };
    };
    const q: Record<string, unknown> = {
      eq: () => q, in: () => q, ilike: () => q, order: () => q,
      range: (von: number, bis: number) => { bereich = [von, bis]; return q; },
      maybeSingle: () => Promise.resolve({ data: (daten[tabelle] ?? [])[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown, fehl?: (e: unknown) => unknown) => Promise.resolve(ergebnis()).then(ok, fehl),
    };
    aufrufe.push(`${tabelle}.select(${spalten})`);
    return q;
  }

  const client = {
    rpc,
    from: (tabelle: string) => ({ select: (spalten: string) => abfrage(tabelle, spalten), ...schreibend }),
  };
  return { client, aufrufe, schreibend, rpc };
}

function beispielDaten() {
  return {
    objekte: [objektZeile()],
    wohnungen: [wohnungZeile()],
    objekt_dokumente: [
      { id: "d1", name: "Grundbuchauszug Erika Käuferin", kategorie: "intern", typ: "custom", erstellt_am: "2026-08-03", url: "https://tool.investagon.com/datei.pdf" },
      { id: "d2", name: "Teilungserklärung", kategorie: "objektunterlagen", typ: "standard", erstellt_am: "2026-08-03", url: "" },
    ],
    wohnungs_dokumente: [
      { id: "w1", wohnung_id: WOHNUNG_ID, name: "Reservierung Erika Käuferin", kategorie: "wohnungsunterlagen", erstellt_am: "2026-09-01", url: "https://x.supabase.co/storage/v1/object/public/objekt-medien/a.pdf" },
    ],
  };
}

async function alleWerkzeugeAufrufen(client: RohClient) {
  const db = nurLesen(client);
  return [
    await objektWerkzeugAufrufen("objekte_liste", { seite: 1, ort: "Magdeburg", nur_sichtbar: true }, db),
    await objektWerkzeugAufrufen("objekt_details", { objekt_id: OBJEKT_ID }, db),
    await objektWerkzeugAufrufen("objekt_dokumente", { objekt_id: OBJEKT_ID }, db),
  ];
}

describe("Kein schreibender Pfad", () => {
  it("alle drei Werkzeuge lesen nur, und nur aus den vier Tabellen", async () => {
    const { client, aufrufe, schreibend, rpc } = falscherClient(beispielDaten());
    await alleWerkzeugeAufrufen(client);
    expect(aufrufe.length).toBeGreaterThan(0);
    for (const a of aufrufe) {
      const tabelle = a.split(".")[0];
      expect(ERLAUBTE_TABELLEN as readonly string[]).toContain(tabelle);
      expect(a).not.toMatch(/\*/);
    }
    for (const f of Object.values(schreibend)) expect(f).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("das Lesegerüst kennt nur select und lehnt fremde Tabellen ab", () => {
    const { client } = falscherClient({});
    const db = nurLesen(client);
    expect(Object.keys(db)).toEqual(["from"]);
    expect(Object.keys(db.from("objekte"))).toEqual(["select"]);
    expect(() => db.from("kontakte" as never)).toThrow();
    expect(() => db.from("user_roles" as never)).toThrow();
  });

  it("die Werkzeuge sind genau diese drei, und keins nimmt Tabelle, Spalte oder SQL entgegen", () => {
    expect(OBJEKT_WERKZEUGE.map((w) => w.name)).toEqual(["objekte_liste", "objekt_details", "objekt_dokumente"]);
    for (const w of OBJEKT_WERKZEUGE) {
      const felder = Object.keys(w.inputSchema.properties);
      expect(felder.every((f) => ["seite", "ort", "nur_sichtbar", "objekt_id"].includes(f))).toBe(true);
    }
  });

  it("im Quelltext steht kein Schreibbefehl und kein RPC", () => {
    const wurzel = path.resolve(__dirname, "../../supabase/functions/kennzahlen-mcp");
    // Seit dem 28.09.2026 unter `_shared/`, weil auch `objekt-lotse` die Positivliste nutzt.
    const modul = readFileSync(path.resolve(__dirname, "../../supabase/functions/_shared/objektdaten.ts"), "utf8");
    expect(modul).not.toMatch(/\.(insert|update|delete|upsert|rpc)\s*\(/);
    const index = readFileSync(path.join(wurzel, "index.ts"), "utf8");
    expect(index).not.toMatch(/\.(insert|update|delete|upsert)\s*\(/);
    // Das einzige RPC ist die vorhandene Lesefunktion der Kennzahlen.
    expect(index.match(/\.rpc\(\s*"([^"]+)"/g)).toEqual(['.rpc("kennzahlen_verlauf"']);
  });

  it("eine ungültige Objektkennung erreicht die Datenbank gar nicht", async () => {
    const { client, aufrufe } = falscherClient(beispielDaten());
    const db = nurLesen(client);
    await expect(objektWerkzeugAufrufen("objekt_details", { objekt_id: "1; drop table objekte" }, db)).rejects.toThrow(/objekt_id/);
    await expect(objektWerkzeugAufrufen("objekte_liste", { seite: -1 }, db)).rejects.toThrow(/seite/);
    expect(aufrufe).toEqual([]);
  });
});

describe("Gesamte Antworten ohne Personen", () => {
  it("Liste, Details und Unterlagen tragen keine Person, aber die Zahlen", async () => {
    const { client } = falscherClient(beispielDaten());
    const [liste, details, dokumente] = await alleWerkzeugeAufrufen(client);
    ohnePersonen([liste, details, dokumente]);

    expect((liste.objekte as Array<Record<string, unknown>>)[0].einheiten).toEqual({ gesamt: 1, frei: 0, reserviert: 1, verkauft: 0 });
    expect(details.einheiten).toMatchObject({ gesamt: 1, weitere_seiten: false });
    expect(dokumente.ampeln).toEqual({ gruen: 1, gelb: 1, rot: 2 });
    const titel = (dokumente.dokumente as Array<Record<string, unknown>>).map((d) => d.titel);
    expect(titel).toContain("Teilungserklärung");
    expect(JSON.stringify(dokumente)).not.toMatch(/https?:\/\//);
    for (const antwort of [liste, details, dokumente]) expect(antwort.abgerufen_am).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
