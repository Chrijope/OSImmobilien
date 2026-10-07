import { describe, it, expect } from "vitest";
import type { ObjektData } from "@/lib/objekteStore";
import { berechneExpose } from "@/lib/exposeRechner";
import { eur0 } from "@/lib/objektKennzahlen";
import {
  annahmenVorbelegen, baueExposeInhalt, kaufnebenkostenKachelText, kaufnebenkostenStandard, verwaltungKostenText, bundeslandIdAusName, exposeObjektdatenAus, gehminuten, hatStrassenname, kopfUeberschrift, mikrolageAusAnalyse, mikrolageListen,
  ohneDoppelte, sanierungFertigstellungJahr, sichtbareZeilen, weBezeichnung,
  EXPOSE_ABSCHNITTE, CHANCEN_RISIKEN, NAECHSTE_SCHRITTE, RECHTLICHE_HINWEISE_ENTWURF, ZEITPLAN_STANDARD,
} from "@/lib/exposeInhalt";
import { OBJEKT_TEXTE_SCHEMA } from "@/lib/objektTexteKi";
import { KATEGORIEN } from "@/lib/umgebung";

/**
 * Aufbau des Exposé-Inhalts aus Objekt und Wohnung: die Struktur, die Seite
 * (E3) und PDF (E4) gemeinsam nutzen.
 */

const objekt: ObjektData = {
  id: "o1", titel: "Musterstraße 12", adresse: "Musterstraße 12", plz: "86150", ort: "Augsburg", beschreibung: "", highlights: [],
  bildUrl: "", bilder: [{ id: "b1", url: "https://example.org/a.jpg", alt: "", reihenfolge: 1 }], dokumente: [{ id: "d1", name: "Grundriss WE 7.png", url: "https://example.org/g.png", typ: "custom", kategorie: "objektunterlagen", sichtbar: true }],
  videoUrl: "", videoSichtbar: false, badge: "", groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0, renditeVon: 0, renditeBis: 0,
  sichtbar: true, status: "freigegeben", erstellt_am: "2026-01-01", sanierungskosten: 100000, erhaltungsaufwandJahre: 2,
  afaDaten: { afaModell: "linear", afaSatz: 2.5, restnutzungsdauer: 40, grundstueckAnteil: 20 },
  globalDaten: { gesamtQm: 0, etagen: 4, baujahr: 1962, grundstueckQm: 0, verkaufspreis: 0, qmPreis: 0, rendite: 0, jahresnettomiete: 0, hausgeldMonat: 0, kaufnebenkosten: 0, grundstueckAnteil: 0 } as ObjektData["globalDaten"],
  meta: {
    energieausweis: { art: "Verbrauchsausweis", kennwert: 121, energietraeger: "Gas" },
    sanierungen: [{ jahr: "2024", massnahme: "Heizung", betrag: 40000 }, { jahr: "2099", massnahme: "Fassade", betrag: 60000 }],
    verwaltung: "Hausverwaltung Muster, Augsburg",
  } as ObjektData["meta"],
  wohnungen: [
    { id: "w7", weNr: "WE 7", etage: "2. OG", lage: "rechts", groesse: 61.4, zimmer: 3, mieteGesamt: 790, vkGesamt: 232000, qmPreis: 0, rendite: 0, vermietet: true, status: "frei", stellplatzPreis: 9500, stellplatzMiete: 40, hausgeldNichtUmlagefaehigEuro: 45, sanierungAnteilProzent: 7.1, mietgarantieMonate: 24 },
  ],
} as ObjektData;
const w = objekt.wohnungen[0];
const heute = new Date(2026, 8, 2);

describe("Feste Inhalte", () => {
  it("hat elf Abschnitte, sechs Schritte, elf Themen und einen gekennzeichneten Rechtsentwurf", () => {
    expect(EXPOSE_ABSCHNITTE).toHaveLength(11);
    expect(EXPOSE_ABSCHNITTE.map((a) => a.id)).not.toContain("naechste-schritte");
    expect(NAECHSTE_SCHRITTE.map((s) => s.titel)).toEqual(["Beratung", "Reservierung", "Finanzierung", "Notar", "Übergabe", "Verwaltung"]);
    expect(CHANCEN_RISIKEN.map((t) => t.id)).toEqual(["mietausfall", "zins", "instandhaltung", "wertentwicklung", "steuerrecht", "liquiditaet", "standort", "bautraeger", "verwaltung", "wiederverkauf", "persoenlich"]);
    for (const t of CHANCEN_RISIKEN) { expect(t.chance.length).toBeGreaterThan(40); expect(t.risiko.length).toBeGreaterThan(40); }
    expect(RECHTLICHE_HINWEISE_ENTWURF.some((h) => h.titel === "Modellrechnung ohne Gewähr")).toBe(true);
  });
});

describe("Objektdaten für den Rechner", () => {
  it("liest Kaufpreis, Stellplatz, Miete mit Stellplatz, Bundesland, Gebäudeanteil und Sanierung", () => {
    const d = exposeObjektdatenAus(objekt, w, heute);
    expect(d).toMatchObject({ kaufpreis: 232000, stellplatzpreis: 9500, kaltmieteMonat: 830, wohnflaeche: 61.4, bundeslandId: "by", baujahr: 1962, gebaeudeanteilProzent: 80, sanierungskostenGesamt: 100000, miteigentumsanteilProzent: 7.1, mietgarantieJahre: 2 });
    expect(d.hausgeldNichtUmlegbarMonat).toBe(45);
    expect(d.sanierungFertigstellungJahr).toBe(2099);
  });

  it("kennt die Bundesland-Kürzel und die Fertigstellung nur in der Zukunft", () => {
    expect(bundeslandIdAusName("Bayern")).toBe("by");
    expect(bundeslandIdAusName("Baden-Württemberg")).toBe("bw");
    expect(bundeslandIdAusName("Nirgendwo")).toBeNull();
    expect(bundeslandIdAusName(undefined)).toBeNull();
    expect(sanierungFertigstellungJahr([{ jahr: "2020", massnahme: "" }], 2026)).toBeNull();
    expect(sanierungFertigstellungJahr([{ jahr: "2026", massnahme: "" }, { jahr: "2027", massnahme: "" }], 2026)).toBe(2027);
  });

  it("belegt Annahmen vor: AfA aus dem Objekt, Sanierung als Erhaltungsaufwand, Selbstauskunft des Kunden", () => {
    const ohne = annahmenVorbelegen(objekt, w, null, heute);
    expect(ohne.annahmen.afaProzent).toBe(2.5);
    expect(ohne.annahmen.instandhaltungsart).toBe("erhaltungsaufwand");
    expect(ohne.annahmen.instandhaltungJahre).toBe(2);
    expect(ohne.ausObjekt).toEqual(["afaProzent", "instandhaltungsart", "instandhaltungJahre"]);
    expect(ohne.ausSelbstauskunft).toEqual([]);
    expect(ohne.annahmen.startjahr).toBe(2026);

    const mit = annahmenVorbelegen(objekt, w, { person1: { einkommenBruttoJahr: 100000, familienstand: "verheiratet" } }, heute);
    expect(mit.annahmen.zvE).toBe(70000);
    expect(mit.annahmen.verheiratet).toBe(true);
    expect(mit.ausSelbstauskunft).toContain("zvE");
    expect(mit.ausSelbstauskunft).toContain("verheiratet");
  });
});

describe("Mikrolage", () => {
  it("rechnet Gehminuten mit 80 Metern je Minute, mindestens eine", () => {
    expect(gehminuten(0)).toBe(1);
    expect(gehminuten(159)).toBe(2);
    expect(gehminuten(298)).toBe(4);
    expect(gehminuten(622)).toBe(8);
  });

  it("sortiert die Messung in Einkaufen, Freizeit und Infrastruktur, je Kategorie höchstens zwei Orte", () => {
    const kat = (key: string) => KATEGORIEN.find((k) => k.key === key)!;
    const ort = (name: string, entfernung: number) => ({ id: name, name, address: "", lat: 0, lng: 0, entfernung });
    const listen = mikrolageListen([
      { kategorie: kat("supermarket"), orte: [ort("REWE", 159), ort("Edeka", 622), ort("Aldi", 900)] },
      { kategorie: kat("park"), orte: [ort("Stadtpark", 700)] },
      { kategorie: kat("transit"), orte: [ort("Königstraße", 157)] },
      { kategorie: kat("school"), orte: [] },
    ]);
    expect(listen.map((l) => l.gruppe.id)).toEqual(["einkaufen", "freizeit", "infrastruktur"]);
    expect(listen[0].eintraege.map((e) => e.name)).toEqual(["REWE", "Edeka"]);
    expect(listen[0].eintraege[0]).toMatchObject({ art: "Supermarkt", entfernungMeter: 159, gehminuten: 2 });
    expect(listen[1].eintraege[0].name).toBe("Stadtpark");
    expect(listen[2].eintraege.map((e) => e.name)).toEqual(["Königstraße"]);
  });
});

describe("Exposé-Inhalt", () => {
  it("baut alle Abschnitte mit Kennzahlen, Chips, Energieskala, Grundriss und Kontakt", () => {
    const inhalt = baueExposeInhalt({ objekt, wohnung: w, heute, kundeName: "Anna Muster", ersteller: { name: "Max Mustermann", rolle: "Vertriebspartner" } });
    expect(inhalt.kopf).toMatchObject({ titel: "Wohnung 7", weNr: "WE 7", adresse: "Musterstraße 12, 86150 Augsburg", kundeName: "Anna Muster", erstellerName: "Max Mustermann" });
    expect(inhalt.start.kennzahlen.map((k) => k.label)).toEqual(["Kaufpreis", "Wohnfläche", "Zimmer", "Kaltmiete je Monat", "Mietrendite"]);
    expect(inhalt.start.kennzahlen[0].wert).toContain("241.500");
    expect(inhalt.start.chips).toContain("Energieeffizienz Klasse D");
    expect(inhalt.start.chips).toContain("Stellplatz inklusive");
    // 2,5 % linear ist ein Regelsatz, also keine „erhöhte“ Abschreibung.
    expect(inhalt.start.chips).toContain("Abschreibung 2,50 %");
    expect(inhalt.objektdaten.energie).toMatchObject({ klasse: "D", kennwert: 121, art: "Verbrauchsausweis", baujahr: 1962 });
    expect(inhalt.objektdaten.fehlendePflichtangaben).toEqual([]);
    expect(inhalt.objektdaten.sanierungen).toHaveLength(2);
    expect(inhalt.objektdaten.zeilen.find((z) => z.label === "Lage im Gebäude")?.wert).toBe("2. OG rechts");
    expect(inhalt.grundriss.dokumente[0]).toMatchObject({ name: "Grundriss WE 7.png", istBild: true });
    expect(inhalt.verwaltung.name).toBe("Hausverwaltung Muster");
    expect(inhalt.verwaltung.leistungen).toEqual([]);
    expect(inhalt.zeitplan.length).toBeGreaterThanOrEqual(6);
    expect(inhalt.rechtliches.entwurf).toBe(true);
    expect(inhalt.rechtliches.energieausweis.find((k) => k.label === "Effizienzklasse")?.wert).toBe("D");
    expect(inhalt.kontakt.vertrieb?.name).toBe("Max Mustermann");
    expect(inhalt.kontakt.firma).toContain("OS Immobilien");
    expect(inhalt.standort.kennzahlen).toEqual([]);
    expect(inhalt.wirtschaftlichkeit.objektdaten.kaufpreis).toBe(232000);
  });

  it("nennt fehlende Pflichtangaben zum Energieausweis", () => {
    const leer = { ...objekt, meta: {}, globalDaten: undefined } as ObjektData;
    const inhalt = baueExposeInhalt({ objekt: leer, wohnung: w, heute });
    expect(inhalt.objektdaten.fehlendePflichtangaben).toEqual(["Art des Energieausweises", "Endenergiekennwert", "Wesentlicher Energieträger", "Baujahr", "Effizienzklasse"]);
    expect(inhalt.objektdaten.energie.klasse).toBeUndefined();
  });

  it("übernimmt Einwohner, Entwicklung und Arbeitgeber aus dem Standort, aber nicht dessen Highlights als Argumente", () => {
    const standort = { id: "augsburg", ags: "09761", name: "Augsburg", bundesland: "Bayern", lat: 0, lng: 0, einwohner: 301000, einwohner_trend_5j_pct: 3.1, arbeitslosenquote_pct: 5, kaufkraftindex: 100, bip_pro_kopf_eur: 0, kaufpreis_qm_wohnung_eur: 0, kaufpreis_qm_haus_eur: 0, miete_qm_eur: 12.8, leerstand_pct: 2.4, uni_stadt: true, oepnv_score: 4 as const, top_arbeitgeber: [{ name: "MAN", branche: "Industrie", mitarbeiter: 4000 }], highlights: ["Uni-Stadt"], quellen: [] };
    const inhalt = baueExposeInhalt({ objekt, wohnung: w, heute, standort });
    expect(inhalt.start.einwohner).toBe(301000);
    expect(inhalt.start.wachstumProzent).toBe(3.1);
    expect(inhalt.standort.kennzahlen.map((k) => k.label)).toEqual(["Einwohner", "Entwicklung in fünf Jahren", "Leerstandsquote", "Angebotsmiete je m²"]);
    expect(inhalt.standort.arbeitgeber[0].name).toBe("MAN");
    // Bis zum 23.09.2026 standen ohne gepflegte Argumente die Highlights des
    // Standorts da, also andere Sätze als auf der Objektseite. Das entfällt.
    expect(inhalt.standort.argumente).toEqual([]);
  });
});

describe("Seit dem 23.09.2026", () => {
  it("zeigt den Zeitstrahl kurz wie die Vorlage, ohne Gebührentext und ohne Werkvertrag", () => {
    const inhalt = baueExposeInhalt({ objekt, wohnung: w, heute });
    expect(inhalt.zeitplan.map((z) => [z.nr, z.titel, z.frist])).toEqual([
      [1, "Reservierung", "Mit Anzahlung wirksam"],
      [2, "Finanzierung", "2 bis 6 Wochen"],
      [3, "Beantragung Kaufvertrag beim Notariat", "14-Tage-Frist"],
      [4, "Notartermin", "in ca. 4 bis 6 Wochen"],
      [5, "Kaufpreisfälligkeit", "nach Regelung im Kaufvertrag"],
      [6, "Übergabe an die Verwaltung", ""],
    ]);
    // Hervorgehoben wird, wo gezahlt wird.
    expect(inhalt.zeitplan.filter((z) => z.zahlung).map((z) => z.titel)).toEqual(["Reservierung", "Kaufpreisfälligkeit"]);
    expect(ZEITPLAN_STANDARD).toHaveLength(6);
    for (const z of ZEITPLAN_STANDARD) expect(z.frist).not.toMatch(/[–—]|\d\s?-\s?\d/);
    // Auch bei Sanierungsobjekten nie ein Werkvertrag, und nirgends der Gebührentext.
    const saniert = baueExposeInhalt({ objekt: { ...objekt, meta: { ...objekt.meta, objektart: "sanierter_bestand" } } as ObjektData, wohnung: { ...w, sanierungAnteilBetrag: 8000 }, heute });
    const global = baueExposeInhalt({ objekt: { ...objekt, globalObjekt: true } as ObjektData, wohnung: w, heute });
    for (const i of [inhalt, saniert, global]) expect(JSON.stringify(i.zeitplan)).not.toMatch(/Werkvertrag|Reservierungsgebühr|€/);
  });

  it("lässt einem von Hand gepflegten Zeitplan den Vorrang und hebt dort die Zahlungen hervor", () => {
    const inhalt = baueExposeInhalt({ objekt: { ...objekt, meta: { ...objekt.meta, zeitplan: [{ titel: "Beratung", frist: "heute" }, { titel: "" }, { titel: "Reservierung unterzeichnen", frist: "diese Woche" }] } } as ObjektData, wohnung: w, heute });
    expect(inhalt.zeitplan).toEqual([
      { nr: 1, titel: "Beratung", frist: "heute" },
      { nr: 2, titel: "Reservierung unterzeichnen", frist: "diese Woche", zahlung: true },
    ]);
  });

  it("liest die Mikrolage nur aus einer gemessenen Analyse und sortiert sie in die drei Gruppen", () => {
    const gemessen = {
      schema: 2, objekt_koordinaten: { lat: 48.3, lng: 10.9 }, gemessen_am: "2026-09-20T10:00:00Z",
      mikrolage: {
        einkaufen: [{ name: "Edeka", typ: "Supermarkt", entfernung_m: 640, lat: 48.31, lng: 10.91 }],
        apotheken: [{ name: "Kurhaus-Apotheke", entfernung_m: 410 }],
        freizeit: [{ name: "Kurhauspark", typ: "Park", entfernung_m: 520 }],
        oepnv: [{ name: "Musterstraße", typ: "Bus", entfernung_m: 240, lat: 48.29, lng: 10.89 }],
        schulen: [{ name: "Grundschule", typ: "Grundschule", entfernung_m: 700 }, { name: "", entfernung_m: 5 }, { name: "Ohne Entfernung" }],
      },
    };
    const m = mikrolageAusAnalyse(gemessen)!;
    expect(m.zentrum).toEqual({ lat: 48.3, lng: 10.9 });
    expect(m.listen.map((l) => l.gruppe.titel)).toEqual(["Einkaufen und Versorgen", "Freizeit und Erholung", "Infrastruktur und Bildung"]);
    expect(m.listen[0].eintraege.map((e) => e.name)).toEqual(["Kurhaus-Apotheke", "Edeka"]);
    expect(m.listen[0].eintraege[0]).toMatchObject({ art: "Apotheke", gehminuten: 6 });
    expect(m.listen[0].eintraege[1]).toMatchObject({ lat: 48.31, lng: 10.91 });
    expect(m.listen[2].eintraege.map((e) => e.name)).toEqual(["Musterstraße", "Grundschule"]);
    expect(m.leer).toBe(false);
    // Die alte, erfundene Fassung zählt nicht.
    expect(mikrolageAusAnalyse({ ...gemessen, schema: undefined })).toBeUndefined();
    expect(mikrolageAusAnalyse(undefined)).toBeUndefined();
    const leer = mikrolageAusAnalyse({ schema: 2, objekt_koordinaten: { lat: 1, lng: 2 }, mikrolage: {} })!;
    expect(leer.leer).toBe(true);
    expect(leer.hinweis).toContain("keine Einrichtungen erfasst");
  });

  it("übernimmt aus einer alten, erfundenen Analyse weder Einwohner noch Arbeitgeber", () => {
    const alt = { ...objekt, meta: { ...objekt.meta, standortanalyse: { makrolage: { einwohner: 123456, highlights: ["Erfunden"] }, arbeitgeber: [{ name: "Erfunden AG" }] } } } as ObjektData;
    const inhalt = baueExposeInhalt({ objekt: alt, wohnung: w, heute });
    expect(inhalt.standort.kennzahlen).toEqual([]);
    expect(inhalt.standort.arbeitgeber).toEqual([]);
    expect(inhalt.mikrolage.analyse).toBeUndefined();
  });

  it("hat im Kontakt nur den Vertrieb, sonst Telefon und E-Mail von OS Immobilien", () => {
    const mit = baueExposeInhalt({ objekt, wohnung: w, heute, ersteller: { name: "Max Mustermann", rolle: "Vertriebspartner" } });
    expect(mit.kontakt.vertrieb?.name).toBe("Max Mustermann");
    expect(mit.kontakt).not.toHaveProperty("objektpartner");
    const ohne = baueExposeInhalt({ objekt, wohnung: w, heute });
    expect(ohne.kontakt.vertrieb).toBeUndefined();
    expect(ohne.kontakt.email).toBe("os@os-immobilien.com");
    expect(ohne.kontakt.telefon).toBeTruthy();
  });

  it("zeigt keine leeren Kacheln, keine 0-Euro-Verwaltungskosten und keine „1 Einheit“ bei einer Einzelwohnung", () => {
    const knapp = { ...objekt, meta: { einzelwohnung: true, verwaltungsart: "SEV" }, afaDaten: undefined, globalDaten: undefined } as unknown as ObjektData;
    const einheit = { ...w, mieteGesamt: 0, vkGesamt: 0, stellplatzPreis: 0, verwaltungSevMonat: 0, verwaltungWegMonat: 0 };
    const inhalt = baueExposeInhalt({ objekt: knapp, wohnung: einheit, heute });
    expect(inhalt.start.kennzahlen.map((k) => k.label)).toEqual(["Wohnfläche", "Zimmer"]);
    expect(inhalt.verwaltung.kostenMonat).toBeUndefined();
    expect(inhalt.verwaltung.bezeichnung).toBe("WEG-Verwaltung");
    expect(sichtbareZeilen(inhalt.objektdaten.zeilen).map((z) => z.label)).not.toContain("Einheiten im Haus");
    expect(sichtbareZeilen(inhalt.objektdaten.zeilen).every((z) => z.wert !== "Keine Angabe")).toBe(true);
    expect(inhalt.objektdaten.sanierungen).toEqual([]);
    expect(inhalt.objektdaten.sanierungenOhneListe).toBeTruthy();
    expect(inhalt.kopf.titel).toBe("Wohnung 7");
    expect(baueExposeInhalt({ objekt: knapp, wohnung: { ...einheit, weNr: "" }, heute }).kopf.titel).toBe("Wohnung");
  });

  it("nimmt die herausgelesenen Sanierungen auch aus der gekürzten Fassung des öffentlichen Exposés", () => {
    const oeffentlich = { ...objekt, meta: { objekttexteKi: { sanierungen: [{ jahr: "2024", massnahme: "Dach erneuert" }] } } } as unknown as ObjektData;
    const inhalt = baueExposeInhalt({ objekt: oeffentlich, wohnung: w, heute });
    expect(inhalt.objektdaten.sanierungen).toEqual([{ jahr: "2024", massnahme: "Dach erneuert (Angabe des Bauträgers)" }]);
  });

  it("kennzeichnet automatisch entstandene Texte nicht mehr, auch nicht im öffentlichen Exposé (seit 24.09.2026)", () => {
    const oeffentlich = { ...objekt, meta: { kurzbeschreibung: "Gepflegt klingender Text", standortargumente: ["Lage. Gut."], texteAutomatisch: { kurzbeschreibung: true, standortargumente: true, marktargumente: true } } } as unknown as ObjektData;
    const inhalt = baueExposeInhalt({ objekt: oeffentlich, wohnung: w, heute });
    expect(inhalt.beschreibung).toBe("Gepflegt klingender Text");
    expect(inhalt.standort.argumente).toEqual([{ titel: "Lage", text: "Gut." }]);
    expect(inhalt).not.toHaveProperty("beschreibungHinweis");
    expect(inhalt.standort).not.toHaveProperty("argumenteHinweis");
    expect(inhalt.standort).not.toHaveProperty("marktargumenteHinweis");
    expect(JSON.stringify(inhalt)).not.toContain("Automatisch erstellt");
  });

  it("setzt den Kopf wie die Vorlage: Adresse mit Wohneinheit, nie eine Hausnummer allein", () => {
    const inhalt = baueExposeInhalt({ objekt, wohnung: w, heute });
    expect(inhalt.kopf.ueberschrift).toBe("Musterstraße 12, 86150 Augsburg, WE 7");
    // So kam es zu „9a“: Investagon lieferte keine Straße, übrig blieb die Hausnummer.
    const ohneStrasse = { ...objekt, adresse: "9a", plz: "04177", ort: "Crailsheim" } as ObjektData;
    const kopf = baueExposeInhalt({ objekt: ohneStrasse, wohnung: { ...w, weNr: "6b" }, heute }).kopf;
    expect(kopf.ueberschrift).toBe("04177 Crailsheim, WE 6b");
    expect(kopf.ueberschrift).not.toMatch(/9a/);
    expect(hatStrassenname("9a")).toBe(false);
    expect(hatStrassenname("Söflinger Str. 203")).toBe(true);
    expect(weBezeichnung("WE 7")).toBe("WE 7");
    expect(weBezeichnung("Wohnung 6b")).toBe("WE 6b");
    expect(weBezeichnung("Gewerbe")).toBe("Gewerbe");
    expect(weBezeichnung("")).toBe("");
    // Steht die PLZ schon in der Adresse, kommt der Ort nicht doppelt.
    expect(kopfUeberschrift({ adresse: "Söflinger Str. 203, 89077 Ulm", plz: "89077", ort: "Ulm", titel: "" }, "7")).toBe("Söflinger Str. 203, 89077 Ulm, WE 7");
    // Ohne Straße und Ort bleibt der Name des Objekts.
    expect(kopfUeberschrift({ adresse: "", plz: "", ort: "", titel: "Haus am See" })).toBe("Haus am See");
  });

  it("zeigt in der Ortszeile keinen Begriff doppelt", () => {
    const neubau = { ...objekt, meta: { ...objekt.meta, objektart: "neubau" }, globalDaten: { ...objekt.globalDaten, zustand: "Neubau" } } as ObjektData;
    const inhalt = baueExposeInhalt({ objekt: neubau, wohnung: { ...w, vermietet: false }, heute });
    expect(inhalt.kopf.untertitel).toBe("Neubau · Erstvermietung");
    expect(inhalt.kopf.ortszeile).toEqual(["Augsburg", "Neubau", "Erstvermietung"]);
    expect(ohneDoppelte(["Neubau", " neubau ", "", undefined, "Erstvermietung"])).toEqual(["Neubau", "Erstvermietung"]);
  });

  it("baut die Merkmal-Chips nur aus belegten Angaben, ohne „0“ und ohne Doppelungen", () => {
    // Investagon liefert das Erdgeschoss als Etage „0“; daraus wurde früher ein Chip „0“.
    const inhalt = baueExposeInhalt({ objekt, wohnung: { ...w, etage: "0", lage: "", investagonRaw: { object_balcony: true } }, heute });
    expect(inhalt.start.chips).not.toContain("0");
    expect(inhalt.start.chips.every((c) => /\p{L}{2,}/u.test(c))).toBe(true);
    expect(new Set(inhalt.start.chips).size).toBe(inhalt.start.chips.length);
    expect(inhalt.start.chips[0]).toBe("Balkon");
    const loggia = baueExposeInhalt({ objekt, wohnung: { ...w, investagonRaw: { object_balcony: "Loggia" } }, heute });
    expect(loggia.start.chips).toContain("Loggia");
    const ohne = baueExposeInhalt({ objekt, wohnung: { ...w, investagonRaw: { object_balcony: false } }, heute });
    expect(ohne.start.chips.join()).not.toMatch(/Balkon/);
    // Erhöht heißt die Abschreibung erst über dem höchsten linearen Regelsatz von 3 %.
    const erhoeht = baueExposeInhalt({ objekt: { ...objekt, afaDaten: { ...objekt.afaDaten!, afaModell: "gutachten", afaSatz: 5.5 } } as ObjektData, wohnung: w, heute });
    expect(erhoeht.start.chips).toContain("Erhöhte Abschreibung 5,50 %");
  });

  it("zeigt die Standortargumente wie die Objektseite: gepflegt, sonst die automatisch erzeugten", () => {
    const gepflegt = baueExposeInhalt({ objekt: { ...objekt, meta: { ...objekt.meta, standortargumente: ["Kurze Wege. Supermarkt in 280 m."] } } as ObjektData, wohnung: w, heute });
    expect(gepflegt.standort.argumente).toEqual([{ titel: "Kurze Wege", text: "Supermarkt in 280 m." }]);
    const fuenf = ["Kurze Wege. Supermarkt in 280 m.", "Gute Anbindung. Bus in 150 m.", "Grün vor der Tür. Park in 400 m.", "Schulen nah. Grundschule in 600 m.", "Stabile Nachfrage. Wachsende Stadt."];
    const erzeugt = { ...objekt, meta: { ...objekt.meta, objekttexteKi: { schema: OBJEKT_TEXTE_SCHEMA, kurzbeschreibung: "", standortargumente: fuenf.map((argument) => ({ argument, beleg: "Messung" })), sanierungen: [] } } } as unknown as ObjektData;
    const aus = baueExposeInhalt({ objekt: erzeugt, wohnung: w, heute });
    expect(aus.standort.argumente.map((a) => a.titel)).toEqual(["Kurze Wege", "Gute Anbindung", "Grün vor der Tür", "Schulen nah", "Stabile Nachfrage"]);
    expect(JSON.stringify(aus)).not.toContain("Automatisch erstellt");
    // Die Highlights einer Standortanalyse sind keine Standortargumente.
    const nurHighlights = { ...objekt, meta: { ...objekt.meta, standortanalyse: { schema: 2, objekt_koordinaten: { lat: 1, lng: 2 }, mikrolage: {}, makrolage: { highlights: ["Anderer Satz"] } } } } as unknown as ObjektData;
    expect(baueExposeInhalt({ objekt: nurHighlights, wohnung: w, heute }).standort.argumente).toEqual([]);
  });

  describe("Markt und Standort (seit 23.09.2026)", () => {
    const auto = [
      "Gefragter Arbeitsmarkt. Arbeitslosenquote 3,1 Prozent, Destatis, Stand 07/2026.",
      "Wachsende Stadt. 301.000 Einwohner, Statistisches Landesamt, Stand 12/2025.",
      "Starke Arbeitgeber. Rund 20.000 Beschäftigte bei Premium Aerotec, IHK, Stand 2025.",
    ];
    const stand = (markt: string[]) => ({
      schema: OBJEKT_TEXTE_SCHEMA, kurzbeschreibung: "", standortargumente: [], sanierungen: [],
      marktargumente: markt.map((argument) => ({ argument, beleg: "Markt, interne Zeile" })),
    });

    it("zeigt die automatisch erzeugten Marktargumente ohne Vermerk, geteilt in Titel und Text", () => {
      const erzeugt = { ...objekt, meta: { ...objekt.meta, objekttexteKi: stand(auto) } } as unknown as ObjektData;
      const aus = baueExposeInhalt({ objekt: erzeugt, wohnung: w, heute });
      expect(aus.standort.marktargumente).toEqual([
        { titel: "Gefragter Arbeitsmarkt", text: "Arbeitslosenquote 3,1 Prozent, Destatis, Stand 07/2026." },
        { titel: "Wachsende Stadt", text: "301.000 Einwohner, Statistisches Landesamt, Stand 12/2025." },
        { titel: "Starke Arbeitgeber", text: "Rund 20.000 Beschäftigte bei Premium Aerotec, IHK, Stand 2025." },
      ]);
      expect(JSON.stringify(aus)).not.toContain("Automatisch erstellt");
      // Der Beleg ist für die Objektseite, nicht für das Exposé.
      expect(JSON.stringify(aus.standort)).not.toContain("interne Zeile");
    });

    it("nimmt das gepflegte Feld vor den automatisch erzeugten, und höchstens drei", () => {
      const gepflegt = { ...objekt, meta: { ...objekt.meta, objekttexteKi: stand(auto), marktargumente: ["Von Hand. Eigene Zahl, Quelle, Stand 2026.", "Zwei. B.", "Drei. C.", "Vier. D."] } } as unknown as ObjektData;
      const aus = baueExposeInhalt({ objekt: gepflegt, wohnung: w, heute });
      expect(aus.standort.marktargumente.map((a) => a.titel)).toEqual(["Von Hand", "Zwei", "Drei"]);
      // Wortgleich mit dem Lauf: dieselben Argumente, ebenfalls ohne Vermerk.
      const wortgleich = { ...objekt, meta: { ...objekt.meta, objekttexteKi: stand(auto), marktargumente: auto } } as unknown as ObjektData;
      const ausWortgleich = baueExposeInhalt({ objekt: wortgleich, wohnung: w, heute });
      expect(ausWortgleich.standort.marktargumente).toHaveLength(3);
      expect(JSON.stringify(ausWortgleich)).not.toContain("Automatisch erstellt");
    });

    it("lässt den Block ohne Marktargumente weg", () => {
      expect(baueExposeInhalt({ objekt, wohnung: w, heute }).standort.marktargumente).toEqual([]);
      const leer = { ...objekt, meta: { ...objekt.meta, objekttexteKi: stand([]), marktargumente: ["  "] } } as unknown as ObjektData;
      const aus = baueExposeInhalt({ objekt: leer, wohnung: w, heute });
      expect(aus.standort.marktargumente).toEqual([]);
    });

    it("zeigt sie im öffentlichen Exposé ohne Vermerk, trotz Kennzeichen aus get-expose", () => {
      const oeffentlich = { ...objekt, meta: { marktargumente: auto, texteAutomatisch: { kurzbeschreibung: false, standortargumente: false, marktargumente: true } } } as unknown as ObjektData;
      const aus = baueExposeInhalt({ objekt: oeffentlich, wohnung: w, heute });
      expect(aus.standort.marktargumente).toHaveLength(3);
      expect(JSON.stringify(aus)).not.toContain("Automatisch erstellt");
    });
  });

  it("hakt in den nächsten Schritten die Beratung als erledigt ab", () => {
    expect(NAECHSTE_SCHRITTE.filter((s) => s.erledigt).map((s) => s.titel)).toEqual(["Beratung"]);
    expect(baueExposeInhalt({ objekt, wohnung: w, heute }).naechsteSchritte[0].erledigt).toBe(true);
  });
});

describe("Bereinigung vom 24.09.2026", () => {
  const mitMeta = (meta: Record<string, unknown>, wohnung: Partial<ObjektData["wohnungen"][number]> = {}): ObjektData => ({
    ...objekt,
    meta: { ...(objekt.meta as Record<string, unknown>), ...meta } as ObjektData["meta"],
    wohnungen: [{ ...w, ...wohnung }],
  });
  const zeile = (o: ObjektData, label: string) => baueExposeInhalt({ objekt: o, wohnung: o.wohnungen[0], heute }).objektdaten.zeilen.find((z) => z.label === label);

  it("zeigt „Einheiten im Haus“ nur aus der Pflege, nie die Zahl der Wohnungen im CRM", () => {
    expect(zeile(mitMeta({}), "Einheiten im Haus")?.wert).toBe("Keine Angabe");
    expect(zeile(mitMeta({ einheitenImHaus: 14 }), "Einheiten im Haus")?.wert).toBe("14");
    // Die Einheiten, die nicht im Angebot sind, zählen nicht mehr mit.
    const mitVielen = { ...mitMeta({}), wohnungenNichtImAngebot: [w, w, w] } as ObjektData;
    expect(zeile(mitVielen, "Einheiten im Haus")?.wert).toBe("Keine Angabe");
  });

  it("lässt die Zeile Stadtteil ohne gepflegten Stadtteil weg, statt den Ort einzusetzen", () => {
    expect(zeile(mitMeta({}), "Stadtteil")).toBeUndefined();
    expect(zeile(mitMeta({}, { stadtteil: "Göggingen" }), "Stadtteil")?.wert).toBe("Göggingen");
  });

  it("schreibt halbe Zimmer mit Komma", () => {
    const o = mitMeta({}, { zimmer: 2.5 });
    const c = baueExposeInhalt({ objekt: o, wohnung: o.wohnungen[0], heute });
    expect(c.start.kennzahlen.find((k) => k.label === "Zimmer")?.wert).toBe("2,5");
    expect(zeile(o, "Zimmer")?.wert).toBe("2,5");
    expect(zeile(mitMeta({}, { zimmer: 3 }), "Zimmer")?.wert).toBe("3");
  });

  it("nennt den SEV-Betrag als Mietverwaltung und die Überschrift wie auf der Objektseite", () => {
    const o = mitMeta({}, { verwaltungSevMonat: 80, verwaltungWegMonat: 25 });
    const v = baueExposeInhalt({ objekt: o, wohnung: o.wohnungen[0], heute }).verwaltung;
    expect(v.bezeichnung).toBe("WEG- und SEV-Verwaltung");
    expect(v.kostenMonat).toBe(80);
    expect(verwaltungKostenText(v)).toMatch(/^Mietverwaltung \(SEV\) 80\s€ je Monat$/);
  });

  it("nennt einen reinen WEG-Betrag als WEG-Verwaltung", () => {
    const o = mitMeta({}, { verwaltungWegMonat: 25 });
    const v = baueExposeInhalt({ objekt: o, wohnung: o.wohnungen[0], heute }).verwaltung;
    expect(v.bezeichnung).toBe("WEG-Verwaltung");
    expect(verwaltungKostenText(v)).toMatch(/^WEG-Verwaltung 25\s€ je Monat$/);
    expect(verwaltungKostenText({ kostenMonat: undefined })).toBe("");
  });

  it("nimmt Dateien aus Investagon nie in die Unterlagenliste des Exposés, auch als Objektunterlage", () => {
    const o = {
      ...objekt,
      dokumente: [
        ...objekt.dokumente,
        { id: "i1", name: "Baubeschreibung", url: "/investagon-dokument/o1/baubeschreibung.pdf", typ: "custom", kategorie: "objektunterlagen", sichtbar: true },
      ],
      wohnungen: [{ ...w, dokumente: [{ id: "i2", name: "Mietvertrag WE 7", url: "/investagon-dokument/o1/we-7-mietvertrag.pdf", kategorie: "wohnungsunterlagen" }] }],
    } as ObjektData;
    const c = baueExposeInhalt({ objekt: o, wohnung: o.wohnungen[0], heute });
    expect(c.dokumente.map((d) => d.name)).not.toContain("Baubeschreibung");
    expect(c.dokumente.map((d) => d.name)).not.toContain("Mietvertrag WE 7");
  });
});

describe("Kaufnebenkosten in der Kachel „Gesamtinvestition“", () => {
  it("ist derselbe Betrag wie im Reiter Finanzen, aus berechneExpose", () => {
    const nk = kaufnebenkostenStandard(objekt, w, heute);
    const erwartet = berechneExpose(exposeObjektdatenAus(objekt, w, heute), annahmenVorbelegen(objekt, w, null, heute).annahmen).kauf.nebenkosten.summe;
    expect(nk?.betrag).toBeCloseTo(erwartet, 6);
    // Nicht der pauschale Satz: Notar und Grundbuch nach Gebührentabelle.
    expect(nk?.betrag).not.toBeCloseTo((232000 + 9500) * 0.05, 0);
  });

  it("nennt den Betrag gerundet auf hundert Euro", () => {
    const nk = kaufnebenkostenStandard(objekt, w, heute)!;
    const text = kaufnebenkostenKachelText(objekt, w, heute);
    expect(text).toMatch(/^zuzüglich Kaufnebenkosten rund /);
    expect(text).toContain(eur0(Math.round(nk.betrag / 100) * 100));
  });

  it("sagt ohne Kaufpreis nur, dass Kaufnebenkosten dazukommen", () => {
    const ohne = { ...w, vkGesamt: 0, stellplatzPreis: 0 };
    expect(kaufnebenkostenStandard(objekt, ohne, heute)).toBeNull();
    expect(kaufnebenkostenKachelText(objekt, ohne, heute)).toBe("zuzüglich Kaufnebenkosten");
  });
});
