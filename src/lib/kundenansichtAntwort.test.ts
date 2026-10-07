import { describe, it, expect } from "vitest";
import {
  ablageFuer, alleUnterlagen, auswahlLesen, baueAntwort, findeDokument, INVESTMENT_KUNDE_SPALTE, kundeAusInvestment, kundenStruktur,
  KUNDENLINK_SPALTEN, KUNDENLINK_SPALTEN_MIT_AUSWAHL, linkPruefen, pruefeAnfrage, vorschauErlaubt, wohnungsAuswahl, type KundenansichtAntwort,
} from "../../supabase/functions/get-kundenansicht/antwort.ts";

/**
 * Die Regeln von `get-kundenansicht` (Bauplan Kundenansicht vom 23.09.2026).
 *
 * Geprüft wird vor allem, was NICHT hinausgeht: Eine vergiftete Zeile trägt
 * überall Werte mit „GIFT“, Provision, Käufernamen, Vormerkungen,
 * Sammelordner und Ablageadressen. Nichts davon darf in der Antwort stehen.
 */

const TOKEN = "a".repeat(64);
const JETZT = new Date("2026-09-23T12:00:00Z");
const SPAETER = "2026-09-23T13:00:00Z";
const FRUEHER = "2026-09-23T11:00:00Z";

/** Eine Einheit, frei und im Angebot, mit Rohdaten aus Investagon. */
function einheit(id: string, weNr: string, weiteres: Record<string, unknown> = {}, meta: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id, objekt_id: "o1", we_nr: weNr, etage: "1. OG", lage: "links", groesse: 55, zimmer: 2,
    miete_gesamt: 700, vk_gesamt: 210000, qm_preis: 3818, rendite: 4, vermietet: true, status: "frei",
    kunde_id: null, kunde_name: null,
    meta: { investagonRaw: { visibility: 1, active: 1 }, ...meta },
    ...weiteres,
  };
}

function objekt(weiteres: Record<string, unknown> = {}, meta: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "o1", titel: "Parkstraße 8", adresse: "Parkstraße 8", plz: "86150", ort: "Augsburg", sichtbar: true,
    global_objekt: false, global_baujahr: 1965, global_verkaufspreis: 1_900_000, global_jahresnettomiete: 90_000,
    meta: { kurzbeschreibung: "Gepflegtes Haus.", ...meta },
    ...weiteres,
  };
}

describe("Anfrage lesen", () => {
  it("erkennt den Kundenlink am Schlüssel und die Vorschau an der Objektkennung", () => {
    expect(pruefeAnfrage({ aktion: "laden", token: TOKEN, aufruf: true })).toEqual({
      aktion: "laden", zugang: { art: "link", token: TOKEN }, wohnungId: null, aufruf: true,
    });
    expect(pruefeAnfrage({ objektId: "o1", wohnungId: "w7", investmentId: "inv1" })).toEqual({
      aktion: "laden", zugang: { art: "vorschau", objektId: "o1", investmentId: "inv1", auswahl: null }, wohnungId: "w7", aufruf: false,
    });
  });

  it("weist kaputte Schlüssel, Kennungen und Dateiverweise ab", () => {
    expect(pruefeAnfrage({ token: "abc" })).toBeNull();
    expect(pruefeAnfrage({ objektId: "../../etc" })).toBeNull();
    expect(pruefeAnfrage({ objektId: "o1", investmentId: "a b" })).toBeNull();
    expect(pruefeAnfrage({ aktion: "loeschen", token: TOKEN })).toBeNull();
    expect(pruefeAnfrage({ aktion: "datei", token: TOKEN })).toBeNull();
    expect(pruefeAnfrage({ aktion: "datei", token: TOKEN, dokument: { bereich: "wohnung", id: "d1" } })).toBeNull();
    expect(pruefeAnfrage({ aktion: "datei", token: TOKEN, dokument: { bereich: "objekt", id: "d1", wohnungId: "w1" } })).toEqual({
      aktion: "datei", zugang: { art: "link", token: TOKEN }, wohnungId: null, dokument: { bereich: "objekt", wohnungId: null, id: "d1" },
    });
  });
});

describe("Link und Vorschau", () => {
  const zeile = { id: "l1", objekt_id: "o1", wohnung_id: null, kontakt_id: "k1", erstellt_von: "u1", gueltig_bis: SPAETER, aufrufe: 0 };

  it("öffnet nur Zeilen der Art Objektübersicht", () => {
    expect(linkPruefen({ ...zeile, art: "objektuebersicht" }, JETZT.getTime())).toBe("gueltig");
    expect(linkPruefen({ ...zeile, art: "expose" }, JETZT.getTime())).toBe("unbekannt");
    // Vor der Migration hat die Zeile keine Art: Das ist immer ein Exposé.
    expect(linkPruefen({ ...zeile }, JETZT.getTime())).toBe("unbekannt");
    expect(linkPruefen(null, JETZT.getTime())).toBe("unbekannt");
  });

  it("behandelt abgelaufen und zurückgezogen gleich", () => {
    expect(linkPruefen({ ...zeile, art: "objektuebersicht", gueltig_bis: FRUEHER }, JETZT.getTime())).toBe("abgelaufen");
    expect(linkPruefen({ ...zeile, art: "objektuebersicht", zurueckgezogen_am: FRUEHER }, JETZT.getTime())).toBe("abgelaufen");
  });

  it("liest Art und Einstieg mit", () => {
    expect(KUNDENLINK_SPALTEN).toMatch(/\bart\b/);
    expect(KUNDENLINK_SPALTEN).toMatch(/\beinstieg_wohnung_id\b/);
  });

  // Seit dem 05.10.2026 (Christians Go) auch Vertriebsleitung und Vertriebspartner.
  it("lässt die Vorschau Admin, Inhaber, Vertriebsleitung und Vertriebspartner sehen", () => {
    expect(vorschauErlaubt(["admin"])).toBe(true);
    expect(vorschauErlaubt(["vertriebspartner", "inhaber"])).toBe(true);
    expect(vorschauErlaubt(["vertriebspartner"])).toBe(true);
    expect(vorschauErlaubt(["vertriebsleiter"])).toBe(true);
    expect(vorschauErlaubt(["objektpartner", "kunde"])).toBe(false);
    expect(vorschauErlaubt(["finanzierungspartner", "tippgeber", "backoffice"])).toBe(false);
    expect(vorschauErlaubt([])).toBe(false);
    expect(vorschauErlaubt(null)).toBe(false);
  });

  it("gibt den Kundenbezug der Vorschau nur nach der Zugriffsprüfung auf den Kunden", async () => {
    const { readFileSync } = await import("node:fs");
    const quelle = readFileSync("supabase/functions/get-kundenansicht/index.ts", "utf8");
    const pruefung = quelle.indexOf("await pruefeKontaktZugriff(");
    expect(pruefung).toBeGreaterThan(quelle.indexOf("kundeAusInvestment(inv)"));
    expect(quelle.slice(pruefung, pruefung + 400)).toContain("else kontaktId = null;");
    expect(quelle).not.toContain('from("kontakte").select("zustaendig_id")');
  });

  it("liest den Kunden eines Investments aus `kunde_id`, nicht aus `kontakt_id`", () => {
    expect(INVESTMENT_KUNDE_SPALTE).toBe("kunde_id");
    expect(kundeAusInvestment({ kunde_id: "k1" })).toBe("k1");
    expect(kundeAusInvestment({ kontakt_id: "k1" })).toBeNull();
    expect(kundeAusInvestment(null)).toBeNull();
  });
});

describe("Welche Wohnungen der Kunde sieht", () => {
  const wohnungen = [
    einheit("w1", "WE 1"),
    einheit("w2", "WE 2", { status: "reserviert", kunde_id: "fremd", kunde_name: "Fremder Käufer" }),
    einheit("w3", "WE 3", { status: "verkauft", kunde_id: "k9" }),
    einheit("w4", "WE 4", {}, { investagonRaw: { visibility: -1, active: 1 } }),
    einheit("w5", "WE 5", { vorgemerkt_bis: SPAETER, vorgemerkt_kunde_id: "fremd" }),
    einheit("w6", "WE 6", { vorgemerkt_bis: SPAETER, vorgemerkt_kunde_id: "k1" }),
    einheit("w7", "WE 7", { status: "reserviert", kunde_id: "k1" }),
    einheit("w8", "WE 8", { status: "reserviert", kunde_id: "k1" }),
    einheit("w10", "WE 10", {}, { investagonRaw: { visibility: 1, active: 0 } }),
    einheit("w11", "WE 11", { vorgemerkt_bis: FRUEHER, vorgemerkt_kunde_id: "fremd" }),
  ];

  it("zeigt nur freie Wohnungen im Angebot, nie reservierte, verkaufte, offline oder fremd vorgemerkte", () => {
    const a = wohnungsAuswahl({ struktur: "mehrere_einheiten", objekt: objekt(), wohnungen, kontaktId: "k1", einstiegId: "w1", jetzt: JETZT });
    expect(a.sichtbar.map((s) => s.zeile.id)).toEqual(["w1", "w6", "w11"]);
    expect(a.einstieg).toEqual({ wohnungId: "w1", zustand: "frei" });
  });

  it("zeigt die Einstiegswohnung mit „für dich reserviert“, eine andere für ihn reservierte nicht", () => {
    const a = wohnungsAuswahl({ struktur: "mehrere_einheiten", objekt: objekt(), wohnungen, kontaktId: "k1", einstiegId: "w7", jetzt: JETZT });
    expect(a.einstieg).toEqual({ wohnungId: "w7", zustand: "fuer_dich_reserviert" });
    expect(a.sichtbar.find((s) => s.zeile.id === "w7")?.fuerDich).toBe(true);
    expect(a.sichtbar.some((s) => s.zeile.id === "w8")).toBe(false);
  });

  it("meldet eine inzwischen vergebene Einstiegswohnung und zeigt die freien darunter", () => {
    const a = wohnungsAuswahl({ struktur: "mehrere_einheiten", objekt: objekt(), wohnungen, kontaktId: "k1", einstiegId: "w2", jetzt: JETZT });
    expect(a.einstieg).toEqual({ wohnungId: "w2", zustand: "vergeben" });
    expect(a.sichtbar.some((s) => s.zeile.id === "w2")).toBe(false);
    expect(a.sichtbar.length).toBe(3);
    expect(a.nichtsMehrDa).toBe(false);
  });

  it("vergleicht nur Kennungen: ohne Kunden am Link ist keine reservierte Wohnung „für dich“", () => {
    const a = wohnungsAuswahl({ struktur: "mehrere_einheiten", objekt: objekt(), wohnungen, kontaktId: null, einstiegId: "w7", jetzt: JETZT });
    expect(a.einstieg.zustand).toBe("vergeben");
    expect(a.sichtbar.some((s) => s.zeile.id === "w6")).toBe(false);
  });

  it("steigt beim Haus ein, wenn es die Einstiegswohnung nicht mehr gibt", () => {
    const a = wohnungsAuswahl({ struktur: "mehrere_einheiten", objekt: objekt(), wohnungen, kontaktId: "k1", einstiegId: "weg", jetzt: JETZT });
    expect(a.einstieg).toEqual({ wohnungId: null, zustand: "keiner" });
  });

  it("zeigt beim vergebenen Einzelobjekt nichts mehr", () => {
    const e = wohnungsAuswahl({ struktur: "einzelwohnung", objekt: objekt(), wohnungen: [wohnungen[1]], kontaktId: "k1", einstiegId: null, jetzt: JETZT });
    expect(e.nichtsMehrDa).toBe(true);
    const frei = wohnungsAuswahl({ struktur: "einzelwohnung", objekt: objekt(), wohnungen: [wohnungen[0]], kontaktId: "k1", einstiegId: null, jetzt: JETZT });
    expect(frei.einstieg).toEqual({ wohnungId: "w1", zustand: "frei" });
  });

  it("zeigt beim Globalobjekt das Haus, oder nichts, wenn es an einen anderen vergeben ist", () => {
    const g = objekt({ global_objekt: true });
    expect(wohnungsAuswahl({ struktur: "globalobjekt", objekt: g, wohnungen, kontaktId: "k1", einstiegId: null, jetzt: JETZT }).sichtbar).toHaveLength(wohnungen.length);
    const fremd = objekt({ global_objekt: true, belegung: "reserviert", belegung_kunde_id: "fremd" });
    expect(wohnungsAuswahl({ struktur: "globalobjekt", objekt: fremd, wohnungen, kontaktId: "k1", einstiegId: null, jetzt: JETZT }).nichtsMehrDa).toBe(true);
    const fuerIhn = objekt({ global_objekt: true, belegung: "reserviert", belegung_kunde_id: "k1" });
    expect(wohnungsAuswahl({ struktur: "globalobjekt", objekt: fuerIhn, wohnungen, kontaktId: "k1", einstiegId: null, jetzt: JETZT }).einstieg.zustand).toBe("fuer_dich_reserviert");
    const vorgemerkt = objekt({ global_objekt: true, vorgemerkt_bis: SPAETER, vorgemerkt_kunde_id: "fremd" });
    expect(wohnungsAuswahl({ struktur: "globalobjekt", objekt: vorgemerkt, wohnungen, kontaktId: "k1", einstiegId: null, jetzt: JETZT }).nichtsMehrDa).toBe(true);
  });

  it("bestimmt die Art nach Schalter, Einzelwohnung und der Zahl aller Einheiten", () => {
    expect(kundenStruktur(objekt({ global_objekt: true }), 1)).toBe("globalobjekt");
    expect(kundenStruktur(objekt({}, { einzelwohnung: true }), 3)).toBe("einzelwohnung");
    expect(kundenStruktur(objekt(), 1)).toBe("einzelwohnung");
    expect(kundenStruktur(objekt(), 2)).toBe("mehrere_einheiten");
  });
});

describe("Positivliste: eine vergiftete Zeile gibt nichts preis", () => {
  const MARKT = "Gefragter Arbeitsmarkt. Arbeitslosenquote 3,1 Prozent, Destatis, Stand 07/2026.";
  const giftObjekt = objekt({
    belegung: "frei", belegung_kunde_id: "GIFT-kunde", belegung_kunde_name: "GIFT Käufer", belegung_von: "GIFT-von",
    vorgemerkt_kunde_id: "GIFT-vm", vorgemerkt_kunde_name: "GIFT Vorgemerkt", vorgemerkt_berater_name: "GIFT Berater",
    erstellt_von: "GIFT-ersteller", exklusiv_partner: ["GIFT-partner"], cloud_ordner_url: "https://GIFT.example/ordner",
    unbekannte_spalte: "GIFT-spalte", bild_url: "http://GIFT.example/unsicher.jpg",
  }, {
    unterlagenLink: "https://GIFT.example/sammelordner",
    dokumente: [{ id: "x", name: "GIFT Mietvertrag", url: "/objekt-dokument/GIFT.pdf" }],
    verkaeuferDaten: { name: "GIFT Verkäufer" },
    investagonSlug: "GIFT-slug",
    importStand: "GIFT-stand",
    anlageklasse: { verschachtelt: "GIFT-objekt-unter-erlaubtem-schluessel" },
    verwaltung: "Hausverwaltung Muster",
    sanierungen: [{ jahr: "2020", massnahme: "Dach", betrag: 12000, beleg: "GIFT Zeile aus dem Mietvertrag" }],
    kalkulation: { hausgeldMonat: 300, provision: "GIFT-provision" },
    investagonRaw: {
      commission: "GIFT-provision", selling_price_commission: "GIFT", transaction_broker_rate: "GIFT",
      files: [{ category: "layout", filename: "https://tool.investagon.com/GIFT.pdf", title: "Grundriss" }],
      active: "GIFT-verkaufsstand", statusName: "GIFT-status", pricehubble_stats_json: "GIFT",
      object_building_year: 1965, tags: ["1. Balkon: ja", { GIFT: "objekt" }],
    },
    objekttexteKi: {
      kurzbeschreibung: "Gepflegtes Haus.", sanierungen: [{ jahr: "2020", massnahme: "Dach", beleg: "GIFT Beleg" }], modell: "GIFT-modell", quellen: ["GIFT"],
      marktargumente: [{ argument: "GIFT automatisch", beleg: "GIFT Beleg zur Marktanalyse" }],
    },
    // Seit dem 23.09.2026: Nur der Wortlaut geht hinaus, kein Beleg und nichts, was kein Text ist.
    marktargumente: [MARKT, { argument: "GIFT als Objekt", beleg: "GIFT Beleg im Feld" }, 7],
    standortanalyse: { schema: 1, einwohner: "GIFT erfunden" },
  });

  const giftWohnung = einheit("w1", "WE 1", {
    kunde_name: "GIFT Käufername", reserviert_von: "GIFT-reserviert-von", reserviert_am: "GIFT",
    vorgemerkt_kunde_name: "GIFT Vorgemerkt", gesetzt_am: "GIFT",
    wohnungs_bilder: [{ id: "b1", url: "https://cdn.example/bild.jpg", alt: "Wohnzimmer", wohnung_id: "GIFT-fk" }, { url: "data:GIFT" }],
    wohnungs_dokumente: [
      { id: "d-miet", name: "Mietvertrag WE 1", url: "/objekt-dokument/GIFT-miete.pdf", kategorie: "wohnungsunterlagen" },
      { id: "d-grundriss", name: "Grundriss WE 1", url: "/objekt-dokument/objekte/o1/wohnungen/w1/grundriss.pdf", kategorie: "wohnungsunterlagen" },
    ],
  }, {
    beraterName: "GIFT Berater", unterlagenLink: "https://GIFT.example/wohnung",
    dokumente: [{ id: "m1", name: "GIFT Grundbuchauszug", url: "/objekt-dokument/GIFT-gb.pdf", kunden_freigabe: "frei", geschwaerzt: true }],
    investagonRaw: { visibility: 1, active: 1, commission: "GIFT-provision", files: [{ filename: "https://tool.investagon.com/GIFT2.pdf" }] },
    exklusivNutzer: ["GIFT"],
    bilder: [{ id: "mb", url: "https://cdn.example/meta.jpg", alt: "Küche" }],
  });

  const antwort = baueAntwort({
    objekt: giftObjekt,
    objektBilder: [{ id: "ob", url: "https://cdn.example/haus.jpg", alt: "Haus", reihenfolge: 0, hochgeladen_von: "GIFT-uploader" }],
    wohnungen: [giftWohnung, einheit("w2", "WE 2")],
    objektDokumente: [
      { id: "od1", name: "Energieausweis", url: "/objekt-dokument/objekte/o1/dokumente/energie.pdf", kategorie: "objektunterlagen", sichtbar: true },
      { id: "od2", name: "Wirtschaftsplan 2026", url: "/objekt-dokument/objekte/o1/dokumente/wp.pdf", kategorie: "objektunterlagen", sichtbar: true },
      { id: "od3", name: "Teilungserklärung", url: "https://tool.investagon.com/GIFT-teilung.pdf", kategorie: "objektunterlagen", sichtbar: true },
      { id: "od4", name: "Interne Kalkulation Exposé", url: "/objekt-dokument/objekte/o1/dokumente/intern.pdf", kategorie: "intern", sichtbar: false },
      { id: "od5", name: "Exposé", url: "/investagon-dokument/o1/expose.pdf", kategorie: "intern", sichtbar: false },
      { id: "od6", name: "Protokoll Eigentümerversammlung", url: "/objekt-dokument/objekte/o1/dokumente/etv.pdf", kategorie: "objektunterlagen", sichtbar: true, kunden_freigabe: "frei" },
    ],
    kontaktId: "k1",
    einstiegId: "w1",
    partner: { name: "Petra Partner", email: "petra@example.org" },
    jetzt: JETZT,
  }) as KundenansichtAntwort;
  const text = JSON.stringify(antwort);

  it("enthält keinen einzigen vergifteten Wert", () => {
    expect(text).not.toMatch(/GIFT/);
  });

  it("gibt keine Ablageadresse, keinen Sammelordner und keine Investagon-Adresse heraus", () => {
    expect(text).not.toMatch(/objekt-dokument|investagon-dokument|storage\/v1|investagon\.com|unterlagenLink|"dokumente":\[\{"id":"x"/);
    expect(text).not.toMatch(/"url":"\/|cloud_ordner|erstellt_von|kunde_id|kunde_name|belegung|vorgemerkt|reserviert_von|beraterName|commission|verkaeuferDaten/);
  });

  it("behält, was Kacheln und Objektdetails brauchen", () => {
    expect(antwort.objekt.titel).toBe("Parkstraße 8");
    expect(antwort.objekt.global_baujahr).toBe(1965);
    expect((antwort.objekt.meta as Record<string, unknown>).verwaltung).toBe("Hausverwaltung Muster");
    expect((antwort.objekt.meta as Record<string, unknown>).sanierungen).toEqual([{ jahr: "2020", massnahme: "Dach", betrag: 12000 }]);
    expect((antwort.objekt.meta as Record<string, unknown>).kalkulation).toEqual({ hausgeldMonat: 300 });
    // Die Marktargumente nur als Texte; ob sie automatisch sind, nur als Wahrheitswert.
    expect((antwort.objekt.meta as Record<string, unknown>).marktargumente).toEqual([MARKT]);
    expect((antwort.objekt.meta as Record<string, unknown>).texteAutomatisch).toEqual({ kurzbeschreibung: true, standortargumente: false, marktargumente: false });
    expect(text).not.toContain("beleg");
    const w1 = antwort.wohnungen.find((w) => w.id === "w1") as Record<string, unknown>;
    expect(w1.vk_gesamt).toBe(210000);
    expect(w1.status).toBe("frei");
    expect(w1.bilder).toEqual([
      { id: "mb", url: "https://cdn.example/meta.jpg", alt: "Küche", reihenfolge: 0 },
      { id: "b1", url: "https://cdn.example/bild.jpg", alt: "Wohnzimmer", reihenfolge: 1 },
    ]);
  });

  it("gibt bei einem Haus mit Wohnungen nicht Preis und Miete des ganzen Hauses heraus", () => {
    expect(antwort.objekt.global_verkaufspreis).toBeUndefined();
    expect(antwort.objekt.global_jahresnettomiete).toBeUndefined();
  });

  it("gibt nur Unterlagen heraus, die die Ampel erlaubt und die im eigenen Speicher liegen", () => {
    const namen = antwort.dokumente.map((d) => `${d.bereich}:${d.name}`).sort();
    expect(namen).toEqual([
      "objekt:Energieausweis",
      "objekt:Exposé",
      "objekt:Protokoll Eigentümerversammlung",
      "wohnung:Grundriss WE 1",
    ]);
    const etv = antwort.dokumente.find((d) => d.id === "od6");
    expect(etv?.kundenFreigabe).toBe("frei");
    expect(antwort.dokumente.find((d) => d.id === "od1")?.endung).toBe("pdf");
    // Mietvertrag der Wohnung und der Grundbuchauszug aus `meta` (dort zählt eine Freigabe nicht) bleiben zurück.
    expect(antwort.zurueckgehalten.filter((z) => z.rot)).toEqual([
      { bereich: "wohnung", wohnungId: "w1", rot: true },
      { bereich: "wohnung", wohnungId: "w1", rot: true },
    ]);
  });
});

describe("Globalobjekt", () => {
  it("gibt Preis und Miete des Hauses heraus, an den Einheiten aber keine Einzelpreise", () => {
    const a = baueAntwort({
      objekt: objekt({ global_objekt: true }),
      objektBilder: [],
      wohnungen: [einheit("w1", "WE 1", {}, { stellplatzPreis: 15000, neueMiete: 750 }), einheit("w2", "WE 2")],
      objektDokumente: [],
      kontaktId: null,
      einstiegId: null,
      partner: undefined,
      jetzt: JETZT,
    }) as KundenansichtAntwort;
    expect(a.struktur).toBe("globalobjekt");
    expect(a.objekt.global_verkaufspreis).toBe(1_900_000);
    for (const w of a.wohnungen) {
      expect(w.vk_gesamt).toBeUndefined();
      expect(w.qm_preis).toBeUndefined();
      expect(w.rendite).toBeUndefined();
      expect(w.miete_gesamt).toBe(700);
      expect((w.meta as Record<string, unknown>).stellplatzPreis).toBeUndefined();
      expect((w.meta as Record<string, unknown>).investagonRaw).toBeUndefined();
    }
    expect((a.wohnungen[0].meta as Record<string, unknown>).neueMiete).toBe(750);
  });

  it("antwortet beim an einen anderen vergebenen Haus nur mit dem Partner", () => {
    const a = baueAntwort({
      objekt: objekt({ global_objekt: true, belegung: "verkauft", belegung_kunde_id: "fremd" }),
      objektBilder: [{ url: "https://cdn.example/haus.jpg" }],
      wohnungen: [einheit("w1", "WE 1")],
      objektDokumente: [],
      kontaktId: "k1",
      einstiegId: null,
      partner: { name: "Petra Partner" },
      jetzt: JETZT,
    });
    expect(a).toEqual({ vergeben: true, struktur: "globalobjekt", ansprechpartner: { name: "Petra Partner" } });
  });
});

describe("Datei: nur aus der geprüften Liste", () => {
  const liste = alleUnterlagen({
    struktur: "mehrere_einheiten",
    objekt: objekt(),
    objektDokumente: [{ id: "od1", name: "Energieausweis", url: "/objekt-dokument/objekte/o1/dokumente/energie.pdf" }],
    sichtbar: [einheit("w1", "WE 1", { wohnungs_dokumente: [{ id: "d1", name: "Grundriss", url: "https://p.supabase.co/storage/v1/object/public/objekt-medien/objekte/o1/wohnungen/w1/wd2_g.pdf" }] })],
  }).dokumente;

  it("findet eine Unterlage nur mit Bereich, Wohnung und Kennung zusammen", () => {
    expect(findeDokument(liste, { bereich: "objekt", wohnungId: null, id: "od1" })?.ablage).toEqual({ eimer: "objekt-dokumente", pfad: "objekte/o1/dokumente/energie.pdf" });
    expect(findeDokument(liste, { bereich: "wohnung", wohnungId: "w1", id: "d1" })?.ablage).toEqual({ eimer: "objekt-medien", pfad: "objekte/o1/wohnungen/w1/wd2_g.pdf" });
    expect(findeDokument(liste, { bereich: "wohnung", wohnungId: "w2", id: "d1" })).toBeUndefined();
    expect(findeDokument(liste, { bereich: "objekt", wohnungId: null, id: "d1" })).toBeUndefined();
  });

  it("kennt nur die Eimer des Objektbereichs und keine Pfade nach oben", () => {
    expect(ablageFuer("/investagon-dokument/o1/a.pdf")).toEqual({ eimer: "investagon-dokumente", pfad: "o1/a.pdf" });
    expect(ablageFuer("/objekt-dokument/../unterlagen/x.pdf")).toBeNull();
    expect(ablageFuer("https://p.supabase.co/storage/v1/object/public/unterlagen/kunde/pass.pdf")).toBeNull();
    expect(ablageFuer("https://tool.investagon.com/a.pdf")).toBeNull();
    expect(ablageFuer("kunde/pass.pdf")).toBeNull();
    expect(ablageFuer("")).toBeNull();
  });
});

/*
 * Wohnungsauswahl am Link (Christian, 05.10.2026): Der Server gibt nur die
 * gewählten Wohnungen heraus. Eine nicht gewählte fehlt in Antwort und
 * Unterlagen, auch wenn sie frei ist und jemand ihre Kennung in die Adresse
 * schreibt (die Seite findet sie dann schlicht nicht in der Antwort).
 */
describe("Wohnungsauswahl am Link", () => {
  const wohnungen = [
    einheit("w1", "WE 1", { wohnungs_dokumente: [{ id: "d1", name: "Grundriss 1", url: "/objekt-dokument/objekte/o1/w1.pdf" }] }),
    einheit("w2", "WE 2", { wohnungs_dokumente: [{ id: "d2", name: "Grundriss 2", url: "/objekt-dokument/objekte/o1/w2.pdf" }] }),
    einheit("w3", "WE 3", { status: "verkauft", kunde_id: "k9" }),
    einheit("w7", "WE 7", { status: "reserviert", kunde_id: "k1" }),
  ];
  const basis = { objekt: objekt(), objektBilder: [], objektDokumente: [], kontaktId: "k1", partner: undefined, jetzt: JETZT };

  it("liest die Spalte mit, und nur eine Liste schränkt ein", () => {
    expect(KUNDENLINK_SPALTEN_MIT_AUSWAHL).toBe(`${KUNDENLINK_SPALTEN}, wohnung_auswahl`);
    expect(auswahlLesen(null)).toBeNull();
    expect(auswahlLesen(undefined)).toBeNull();
    expect(auswahlLesen(["w1", "../x", 5])).toEqual(["w1"]);
    // Was nicht lesbar ist, gibt nichts frei.
    expect(auswahlLesen("w1,w2")).toEqual([]);
  });

  it("gibt eine freie, aber nicht gewählte Wohnung nicht heraus, samt ihren Unterlagen", () => {
    const antwort = baueAntwort({ ...basis, wohnungen, einstiegId: "w1", auswahl: ["w1"] }) as KundenansichtAntwort;
    expect(antwort.wohnungen.map((w) => w.id)).toEqual(["w1"]);
    expect(antwort.dokumente.map((d) => d.id)).toEqual(["d1"]);
    expect(JSON.stringify(antwort)).not.toContain("w2");
    expect(JSON.stringify(antwort)).not.toContain("Grundriss 2");
  });

  it("zeigt ohne Auswahl wie bisher alle freien Wohnungen", () => {
    const antwort = baueAntwort({ ...basis, wohnungen, einstiegId: "w1", auswahl: null }) as KundenansichtAntwort;
    expect(antwort.wohnungen.map((w) => w.id)).toEqual(["w1", "w2"]);
  });

  it("lässt eine gewählte, inzwischen verkaufte Wohnung wie bisher wegfallen", () => {
    const a = wohnungsAuswahl({ struktur: "mehrere_einheiten", objekt: objekt(), wohnungen, kontaktId: "k1", einstiegId: "w3", auswahl: ["w2", "w3"], jetzt: JETZT });
    expect(a.sichtbar.map((s) => s.zeile.id)).toEqual(["w2"]);
    expect(a.einstieg).toEqual({ wohnungId: "w3", zustand: "vergeben" });
  });

  it("zeigt die für ihn reservierte Einstiegswohnung nur, wenn sie gewählt ist", () => {
    const mit = wohnungsAuswahl({ struktur: "mehrere_einheiten", objekt: objekt(), wohnungen, kontaktId: "k1", einstiegId: "w7", auswahl: ["w7"], jetzt: JETZT });
    expect(mit.sichtbar.map((s) => s.zeile.id)).toEqual(["w7"]);
    const ohne = wohnungsAuswahl({ struktur: "mehrere_einheiten", objekt: objekt(), wohnungen, kontaktId: "k1", einstiegId: "w7", auswahl: ["w1"], jetzt: JETZT });
    expect(ohne.sichtbar.map((s) => s.zeile.id)).toEqual(["w1"]);
    expect(ohne.einstieg.zustand).toBe("keiner");
  });

  it("gibt bei einer leeren Liste nichts frei", () => {
    const a = wohnungsAuswahl({ struktur: "mehrere_einheiten", objekt: objekt(), wohnungen, kontaktId: "k1", einstiegId: null, auswahl: [], jetzt: JETZT });
    expect(a.sichtbar).toEqual([]);
  });

  it("schränkt beim Globalobjekt nichts ein, verkauft wird das Haus", () => {
    const g = objekt({ global_objekt: true });
    const a = wohnungsAuswahl({ struktur: "globalobjekt", objekt: g, wohnungen, kontaktId: "k1", einstiegId: null, auswahl: ["w1"], jetzt: JETZT });
    expect(a.sichtbar).toHaveLength(wohnungen.length);
  });

  it("nimmt eine Auswahl nur für die Vorschau aus der Anfrage, nie für den Kundenlink", () => {
    expect(pruefeAnfrage({ token: TOKEN, wohnungAuswahl: ["w1", "w2"] })).toEqual({
      aktion: "laden", zugang: { art: "link", token: TOKEN }, wohnungId: null, aufruf: false,
    });
    expect(pruefeAnfrage({ objektId: "o1", wohnungAuswahl: ["w1", "w2"] })).toEqual({
      aktion: "laden", zugang: { art: "vorschau", objektId: "o1", investmentId: null, auswahl: ["w1", "w2"] }, wohnungId: null, aufruf: false,
    });
    expect(pruefeAnfrage({ objektId: "o1", wohnungAuswahl: "w1" })).toBeNull();
    expect(pruefeAnfrage({ objektId: "o1", wohnungAuswahl: ["../x"] })).toBeNull();
  });
});

describe("get-kundenansicht reicht die Auswahl durch", () => {
  it("liest sie an der Linkzeile, mit Rückfall ohne Spalte, und prüft sie beim Laden und bei jeder Datei", async () => {
    const { readFileSync } = await import("node:fs");
    const quelle = readFileSync("supabase/functions/get-kundenansicht/index.ts", "utf8");
    expect(quelle).toContain("await lesen(KUNDENLINK_SPALTEN_MIT_AUSWAHL)");
    expect(quelle).toContain("if (error && versandSpalteFehlt(error)) ({ data, error } = await lesen(KUNDENLINK_SPALTEN));");
    expect(quelle).toContain("auswahl: auswahlLesen(zeile.wohnung_auswahl)");
    expect(quelle.match(/auswahl: betrachter\.auswahl/g)).toHaveLength(2);
  });
});
