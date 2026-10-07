import { describe, it, expect } from "vitest";
import {
  istExposeToken,
  oeffentlicheMarktargumente,
  oeffentlicheRohdaten,
  oeffentlicherAnsprechpartner,
  oeffentlicheSanierungenKi,
  oeffentlicheStandortanalyse,
  oeffentlichesMeta,
  oeffentlichesObjekt,
  oeffentlicheWohnung,
} from "../../supabase/functions/_shared/expose-oeffentlich";

/**
 * Wächter über die öffentliche Exposé-Schnittstelle.
 *
 * Die Prüflinge liegen in `supabase/functions/`, dorthin schaut Vitest nicht
 * (`vitest.config` deckt nur `src/**` ab). Diese Datei liegt deshalb hier und
 * liest sie über die Verzeichnisgrenze hinweg ein. Ohne sie wäre die
 * Abdichtung vom 16.09.2026 vollkommen ungeprüft, und genau das war der
 * Zustand, der den Fehler überhaupt erst hat entstehen lassen.
 *
 * WAS AM 16.09.2026 GEFUNDEN WURDE
 *
 * `get-expose` gab die Zeilen unverändert heraus. Im öffentlichen Datenstrom
 * jedes Exposés standen damit die eigene Provision, die Adressen sämtlicher
 * Unterlagen bis hin zu Mietverträgen, und an reservierten Einheiten der Name
 * des Käufers. Die Investagon-Adressen sind ohne Anmeldung abrufbar; nachgemessen
 * kamen 4 MB PDF mit Status 200 zurück.
 */
describe("Öffentliche Schnittstelle: was NICHT hinausgehen darf", () => {
  const rohdaten = {
    extras: [{ id: 1, value: "Dach saniert", weight: 0 }],
    tags: ["5. Energieeffizienzklasse: C"],
    object_building_year: 1940,
    heating_type: "district_heating",
    // Alles ab hier ist intern:
    commission: 8.403,
    selling_price_commission: false,
    transaction_broker_rate: 2.5,
    initial_investment_extra_1y_manual: 48698.37,
    pricehubble_stats_json: "{...}",
    m3_interest_rate: 3.2,
    files: [
      { id: 1, category: "layout", title: "WE18 Grundriss", filename: "https://tool.investagon.com/a.jpg" },
      { id: 2, category: "energy_certificate", title: "Energieausweis", filename: "https://tool.investagon.com/b.pdf" },
      { id: 3, category: "rental_agreement", title: "Mietvertrag Scholtz", filename: "https://tool.investagon.com/c.pdf" },
      { id: 4, category: "land_register", title: "Grundbuchauszug", filename: "https://tool.investagon.com/d.pdf" },
      { id: 5, category: "settlements", title: "Betriebskostenabrechnung", filename: "https://tool.investagon.com/e.pdf" },
      { id: 6, category: "economic_plan", title: "Wirtschaftsplan", filename: "https://tool.investagon.com/f.pdf" },
    ],
  };

  it("hält die Provision zurück", () => {
    const raus = oeffentlicheRohdaten(rohdaten);
    expect(raus).not.toHaveProperty("commission");
    expect(raus).not.toHaveProperty("selling_price_commission");
    expect(raus).not.toHaveProperty("transaction_broker_rate");
  });

  /*
   * Der schwerste der drei Funde. Ein Mietvertrag nennt den Mieter, ein
   * Grundbuchauszug den Eigentümer. Das sind personenbezogene Daten Dritter.
   */
  /*
   * Seit dem 23.09.2026 auch Grundriss und Energieausweis nicht mehr: Die
   * Liste trägt Originaladressen bei Investagon, und die sind ohne Anmeldung
   * abrufbar. Den Grundriss bekommt der Kundenlink als befristete Kopie aus
   * dem eigenen Speicher (`exposeUnterlagen.test.ts`).
   */
  it("gibt aus investagonRaw keine einzige Datei heraus, auch nicht Grundriss und Energieausweis", () => {
    const raus = oeffentlicheRohdaten(rohdaten);
    expect(raus).not.toHaveProperty("files");
    const alsText = JSON.stringify(raus);
    for (const verboten of ["investagon.com", "Grundriss", "Energieausweis", "Mietvertrag", "Grundbuch", "Betriebskosten", "Wirtschaftsplan"]) {
      expect(alsText).not.toContain(verboten);
    }
    // Auch über das ganze meta von Objekt und Einheit nicht.
    const meta = JSON.stringify([oeffentlichesMeta({ investagonRaw: rohdaten }), oeffentlicheWohnung({ id: "w1", meta: { investagonRaw: rohdaten } })]);
    expect(meta).not.toContain("investagon.com");
    expect(meta).not.toContain("files");
  });

  it("gibt vom Energieausweis nur die fünf schlichten Angaben heraus, keine Datei und keine fremde Adresse", () => {
    const vergiftet = {
      art: "Verbrauchsausweis", kennwert: 112.4, klasse: "D", energietraeger: "Gas", gueltigBis: "2031-05-01",
      datei: "https://tool.investagon.com/files/ea.pdf",
      url: "https://ordner.example/energieausweis.pdf",
      pfad: "/investagon-dokument/o1/ea.pdf",
      aussteller: { name: "Ing.-Büro Muster", telefon: "0821 1234" },
    };
    expect(oeffentlichesMeta({ energieausweis: vergiftet }).energieausweis).toEqual({
      art: "Verbrauchsausweis", kennwert: 112.4, klasse: "D", energietraeger: "Gas", gueltigBis: "2031-05-01",
    });
    // Ein Objekt unter einem erlaubten Namen bleibt ebenfalls drin.
    expect(oeffentlichesMeta({ energieausweis: { klasse: { url: "https://ordner.example/x" } } })).not.toHaveProperty("energieausweis");
    expect(oeffentlichesMeta({ energieausweis: "https://ordner.example/ea.pdf" })).not.toHaveProperty("energieausweis");
  });

  it("lässt die harmlosen Angaben durch", () => {
    const raus = oeffentlicheRohdaten(rohdaten);
    expect(raus?.extras).toBeDefined();
    expect(raus?.tags).toBeDefined();
    expect(raus?.object_building_year).toBe(1940);
    expect(raus?.heating_type).toBe("district_heating");
  });

  it("hält Finanzierungs- und Marktdatenfelder zurück", () => {
    const raus = oeffentlicheRohdaten(rohdaten);
    expect(raus).not.toHaveProperty("pricehubble_stats_json");
    expect(raus).not.toHaveProperty("m3_interest_rate");
    expect(raus).not.toHaveProperty("initial_investment_extra_1y_manual");
  });

  /*
   * Wer eine Wohnung gekauft hat, geht niemanden etwas an, der zufällig einen
   * Exposé-Link besitzt. Der Zustand „reserviert“ reicht dem Interessenten.
   */
  it("gibt weder Käufernamen noch Reservierungsdaten heraus", () => {
    const zeile = oeffentlicheWohnung({
      id: "w1", we_nr: "WE 18", groesse: 61.5, status: "reserviert",
      kunde_id: "k-4711", kunde_name: "Otto Hans", reserviert_am: "2026-09-01",
      gesetzt_am: "2026-08-20", gesetzt_bis: "2026-09-20",
    });
    expect(zeile).not.toHaveProperty("kunde_id");
    expect(zeile).not.toHaveProperty("kunde_name");
    expect(zeile).not.toHaveProperty("reserviert_am");
    expect(zeile).not.toHaveProperty("gesetzt_am");
    expect(JSON.stringify(zeile)).not.toContain("Otto Hans");
    // Der Zustand selbst bleibt sichtbar, den braucht das Exposé.
    expect(zeile.status).toBe("reserviert");
  });

  it("gibt keine internen Spalten des Objekts heraus", () => {
    const zeile = oeffentlichesObjekt({
      id: "o1", titel: "Musterstraße 1", adresse: "Musterstraße 1", sichtbar: true,
      erstellt_von: "user-4711", exklusiv_partner: ["Partner A"], cloud_ordner_url: "https://intern/ordner",
    });
    expect(zeile).not.toHaveProperty("erstellt_von");
    expect(zeile).not.toHaveProperty("exklusiv_partner");
    expect(zeile).not.toHaveProperty("cloud_ordner_url");
    expect(zeile.titel).toBe("Musterstraße 1");
  });

  /*
   * Die Kernregel der Positivliste: Ein neues, unbekanntes Feld geht NICHT
   * heraus. Eine Sperrliste müsste bei jedem neuen Feld nachgezogen werden,
   * und wer sie vergisst, merkt nichts davon.
   */
  it("lässt ein unbekanntes neues Feld nicht durch", () => {
    expect(oeffentlichesObjekt({ id: "o1", irgendwas_neues_internes: "geheim" }))
      .not.toHaveProperty("irgendwas_neues_internes");
    expect(oeffentlicheWohnung({ id: "w1", neue_interne_spalte: 42 }))
      .not.toHaveProperty("neue_interne_spalte");
    expect(oeffentlicheRohdaten({ extras: [], voellig_neues_feld: "geheim" }))
      .not.toHaveProperty("voellig_neues_feld");
  });

  it("lässt die gepflegten Objektangaben durch", () => {
    const meta = oeffentlichesMeta({
      kurzbeschreibung: "Saniertes Mehrfamilienhaus",
      standortargumente: ["Nahe Innenstadt"],
      energieausweis: { art: "Verbrauchsausweis", klasse: "C" },
      gemeinschaftseigentum: "Dach 2023 saniert",
      sanierungen: [{ jahr: "2023", massnahme: "Dach" }],
      verwaltung: "WEG Musterverwaltung",
      investagonRaw: rohdaten,
    });
    expect(meta.kurzbeschreibung).toBe("Saniertes Mehrfamilienhaus");
    expect(meta.verwaltung).toBe("WEG Musterverwaltung");
    expect(meta.investagonRaw).toBeDefined();
    expect(JSON.stringify(meta)).not.toContain("8.403");
  });

  it("kommt mit fehlenden und falsch getypten Daten zurecht", () => {
    expect(() => oeffentlichesObjekt({})).not.toThrow();
    expect(oeffentlichesMeta(null)).toEqual({});
    expect(oeffentlichesMeta("kein Objekt")).toEqual({});
    expect(oeffentlicheRohdaten(undefined)).toBeUndefined();
    expect(oeffentlicheRohdaten([1, 2, 3])).toBeUndefined();
    expect(oeffentlicheRohdaten({ files: "keine Liste" })).toBeUndefined();
  });
});

/*
 * Seit dem 23.09.2026 gehen drei Dinge zusätzlich hinaus, jedes gekürzt:
 * die herausgelesenen Sanierungen, die gemessene Mikrolage und, nur mit
 * Token, der Vertriebspartner des Kunden-Exposés.
 */
describe("Öffentliche Schnittstelle: was seit dem 23.09.2026 gekürzt hinausgeht", () => {
  const ki = {
    schema: 2,
    kurzbeschreibung: "Automatischer Text",
    standortargumente: [{ argument: "Nah am Park", beleg: "Park 300 m" }],
    sanierungen: [
      { jahr: "2024", massnahme: "Dach erneuert", beleg: "Mietvertrag Scholtz, Seite 3: Dach 2024" },
      { jahr: 2019, massnahme: "Heizung getauscht", beleg: "Protokoll" },
      { jahr: "2020", massnahme: "", beleg: "leer" },
    ],
    quellen: ["Mietvertrag Scholtz"],
    beanstandungen: ["Versprechen entfernt"],
    modell: "gemini",
  };

  it("gibt die Sanierungen nur mit Jahr und Maßnahme heraus, ohne Beleg und ohne den Rest des Laufs", () => {
    const raus = oeffentlichesMeta({ objekttexteKi: ki });
    expect(raus.objekttexteKi).toEqual({
      sanierungen: [
        { jahr: "2024", massnahme: "Dach erneuert" },
        { jahr: "2019", massnahme: "Heizung getauscht" },
      ],
    });
    const alsText = JSON.stringify(raus);
    expect(alsText).not.toContain("beleg");
    expect(alsText).not.toContain("Scholtz");
    expect(alsText).not.toContain("Automatischer Text");
    expect(alsText).not.toContain("gemini");
    expect(alsText).not.toContain("beanstandungen");
    expect(oeffentlicheSanierungenKi({ sanierungen: "keine Liste" })).toBeUndefined();
    expect(oeffentlicheSanierungenKi(null)).toBeUndefined();
  });

  it("verrät nur als Wahrheitswert, ob die Texte automatisch entstanden sind", () => {
    const raus = oeffentlichesMeta({ objekttexteKi: ki, kurzbeschreibung: "Automatischer Text", standortargumente: ["Von Hand"] });
    expect(raus.texteAutomatisch).toEqual({ kurzbeschreibung: true, standortargumente: false, marktargumente: false });
    expect(oeffentlichesMeta({ kurzbeschreibung: "Von Hand" }).texteAutomatisch).toBeUndefined();
  });

  it("gibt die Mikrolage nur aus einer gemessenen Analyse heraus und nur mit Name, Art, Entfernung und Lage", () => {
    const gemessen = {
      schema: 2, gemessen_am: "2026-09-20T10:00:00Z", objekt_koordinaten: { lat: 48.3, lng: 10.9 },
      mikrolage: {
        einkaufen: [{ name: "REWE", typ: "Supermarkt", entfernung_m: 300, lat: 48.31, lng: 10.91, osm_id: 4711, telefon: "0821 1" }, { name: "", entfernung_m: 10 }],
        unbekannt: [{ name: "Geheim", entfernung_m: 1 }],
      },
      mikrolage_hinweis: "Entfernungen als Luftlinie.",
      arbeitgeber: [{ name: "Erfunden AG" }],
      makrolage: { einwohner: 999999 },
    };
    const raus = oeffentlicheStandortanalyse(gemessen);
    expect(raus).toEqual({
      schema: 2, gemessen_am: "2026-09-20T10:00:00Z", objekt_koordinaten: { lat: 48.3, lng: 10.9 },
      mikrolage: { einkaufen: [{ name: "REWE", typ: "Supermarkt", entfernung_m: 300, lat: 48.31, lng: 10.91 }] },
      mikrolage_hinweis: "Entfernungen als Luftlinie.",
    });
    // Die alte, erfundene Fassung geht gar nicht hinaus.
    expect(oeffentlicheStandortanalyse({ ...gemessen, schema: undefined })).toBeUndefined();
    expect(oeffentlicheStandortanalyse({ ...gemessen, objekt_koordinaten: { lat: "x" } })).toBeUndefined();
    expect(oeffentlichesMeta({ standortanalyse: gemessen }).standortanalyse).toEqual(raus);
  });

  it("gibt für die Makrolage Hochschulen und Krankenhäuser samt Messfassung heraus, keine Gewerbeflächen", () => {
    const raus = oeffentlicheStandortanalyse({
      schema: 2, messfassung: 2, objekt_koordinaten: { lat: 48.3, lng: 10.9 }, genauigkeit: "ort",
      gemessene_adresse: { adresse: "Geheimweg 1", plz: "86150", ort: "Augsburg" }, lage: { stadtteil: "Innenstadt" },
      mikrolage: {
        hochschulen: [{ name: "Universität Test", typ: "Hochschule", entfernung_m: 2400, osm_id: 1 }],
        kliniken: [{ name: "Klinikum Test", entfernung_m: 4100 }],
        gewerbe: [{ name: "Werk Muster", entfernung_m: 900 }],
      },
    });
    // Seit dem 24.09.2026 geht die Genauigkeit mit (nur der Wert), die gemessene Adresse und die Lage nicht.
    expect(raus).toEqual({
      schema: 2, messfassung: 2, objekt_koordinaten: { lat: 48.3, lng: 10.9 }, genauigkeit: "ort",
      mikrolage: {
        hochschulen: [{ name: "Universität Test", typ: "Hochschule", entfernung_m: 2400 }],
        kliniken: [{ name: "Klinikum Test", entfernung_m: 4100 }],
      },
    });
    // Eine Fassungsnummer, die keine Zahl ist, geht nicht hinaus.
    expect(oeffentlicheStandortanalyse({ schema: 2, messfassung: "2; drop", objekt_koordinaten: { lat: 1, lng: 2 } })).not.toHaveProperty("messfassung");
  });

  it("gibt für die Umgebungspunkte Parks und Behörden frei, höchstens zehn je Liste, und nur bekannte Genauigkeiten", () => {
    const viele = Array.from({ length: 14 }, (_, i) => ({ name: `Halt ${i}`, typ: "Bus", entfernung_m: 100 + i, lat: 48.3, lng: 10.9, osm_id: i }));
    const raus = oeffentlicheStandortanalyse({
      schema: 2, messfassung: 3, objekt_koordinaten: { lat: 48.3, lng: 10.9 }, genauigkeit: "<script>",
      mikrolage: {
        oepnv: viele,
        parks: [{ name: "Stadtpark", typ: "Park", entfernung_m: 400, lat: 48.31, lng: 10.91, betreiber: "Privat Person" }],
        behoerden: [{ name: "Rathaus", typ: "Rathaus", entfernung_m: 900, lat: 48.32, lng: 10.92 }],
        gewerbe: [{ name: "Werk Muster", entfernung_m: 900 }],
        personen: [{ name: "Max Muster", entfernung_m: 10 }],
      },
    }) as { mikrolage: Record<string, unknown[]> } & Record<string, unknown>;
    expect(raus.mikrolage.oepnv).toHaveLength(10);
    expect(raus.mikrolage.parks).toEqual([{ name: "Stadtpark", typ: "Park", entfernung_m: 400, lat: 48.31, lng: 10.91 }]);
    expect(raus.mikrolage.behoerden).toEqual([{ name: "Rathaus", typ: "Rathaus", entfernung_m: 900, lat: 48.32, lng: 10.92 }]);
    expect(Object.keys(raus.mikrolage).sort()).toEqual(["behoerden", "oepnv", "parks"]);
    expect(raus).not.toHaveProperty("genauigkeit");
  });

  it("gibt die Arztpraxen als Teil der Mikrolage heraus (Christian, 24.09.2026 abends)", () => {
    const gemessen = {
      schema: 2, messfassung: 3, objekt_koordinaten: { lat: 48.3, lng: 10.9 },
      mikrolage: {
        aerzte: [{ name: "Praxis am Markt", typ: "Arztpraxis", entfernung_m: 200, lat: 48.31, lng: 10.91 }],
        apotheken: [{ name: "Löwen-Apotheke", typ: "Apotheke", entfernung_m: 250 }],
      },
    };
    const raus = oeffentlicheStandortanalyse(gemessen) as { mikrolage: Record<string, unknown[]> };
    expect(Object.keys(raus.mikrolage).sort()).toEqual(["aerzte", "apotheken"]);
    expect(JSON.stringify(oeffentlichesMeta({ standortanalyse: gemessen }))).toContain("Praxis am Markt");
  });

  it("gibt vom Partner genau Bild, Name, Telefon und E-Mail heraus, sonst nichts", () => {
    const raus = oeffentlicherAnsprechpartner({
      id: "user-4711", name: "Paula Partner", telefon: "+49 89 1", email: "paula@example.com",
      avatar_url: "https://example.org/p.jpg", role: "vertriebspartner", buchungslink: "https://cal.example/p",
      steuer_id: "12345678901", iban: "DE00",
    });
    expect(raus).toEqual({ name: "Paula Partner", telefon: "+49 89 1", email: "paula@example.com", bild: "https://example.org/p.jpg" });
    expect(Object.keys(raus ?? {}).sort()).toEqual(["bild", "email", "name", "telefon"]);
    // Ein Speicherpfad ist keine Bildadresse, leere Felder bleiben weg.
    expect(oeffentlicherAnsprechpartner({ name: "Ohne Bild", avatar_url: "avatars/u1.png", telefon: "" })).toEqual({ name: "Ohne Bild" });
    expect(oeffentlicherAnsprechpartner({ name: "" })).toBeUndefined();
    expect(oeffentlicherAnsprechpartner(null)).toBeUndefined();
  });

  /*
   * Die Marktargumente (seit dem 23.09.2026). Hinaus geht nur der Wortlaut aus
   * `meta.marktargumente`, der Quelle und Stand schon im Satz nennt. Der Beleg
   * aus dem Lauf bleibt drin, ebenso alles in der Liste, was kein Text ist.
   */
  it("gibt von einer vergifteten Zeile nur die Texte der Marktargumente heraus", () => {
    const markt = "Gefragter Arbeitsmarkt. Arbeitslosenquote 3,1 Prozent, Destatis, Stand 07/2026.";
    const zeile = oeffentlichesObjekt({
      id: "o1", titel: "Parkstraße 8",
      meta: {
        marktargumente: [`  ${markt}  `, { argument: "GIFT als Objekt", beleg: "GIFT Beleg im Feld" }, 42, "", null],
        objekttexteKi: {
          ...ki,
          marktargumente: [{ argument: "GIFT automatisch", beleg: "GIFT Tabelle 12411-01-01, interne Zeile" }],
        },
      },
    });
    const meta = zeile.meta as Record<string, unknown>;
    expect(meta.marktargumente).toEqual([markt]);
    const alsText = JSON.stringify(zeile);
    expect(alsText).not.toMatch(/GIFT/);
    expect(alsText).not.toContain("beleg");
    // Der Lauf selbst geht weiter nur als Liste der Sanierungen hinaus.
    expect(Object.keys(meta.objekttexteKi as object)).toEqual(["sanierungen"]);
  });

  it("lässt die Marktargumente weg, wenn keine Texte da sind", () => {
    expect(oeffentlichesMeta({ marktargumente: [] })).not.toHaveProperty("marktargumente");
    expect(oeffentlichesMeta({ marktargumente: "kein Array" })).not.toHaveProperty("marktargumente");
    expect(oeffentlicheMarktargumente([{ argument: "Objekt", beleg: "x" }, "  "])).toBeUndefined();
    expect(oeffentlicheMarktargumente(undefined)).toBeUndefined();
  });

  it("verrät nur als Wahrheitswert, ob die Marktargumente automatisch entstanden sind", () => {
    const auto = [{ argument: "Markt eins. Quelle A, Stand 2025.", beleg: "Markt A" }, { argument: "Markt zwei. Quelle B, Stand 2026.", beleg: "Markt B" }];
    const mitStand = { ...ki, marktargumente: auto };
    const automatisch = oeffentlichesMeta({ objekttexteKi: mitStand, marktargumente: auto.map((a) => a.argument) });
    expect(automatisch.texteAutomatisch).toEqual({ kurzbeschreibung: false, standortargumente: false, marktargumente: true });
    const vonHand = oeffentlichesMeta({ objekttexteKi: mitStand, marktargumente: ["Von Hand geschrieben."] });
    expect(vonHand.texteAutomatisch).toBeUndefined();
    expect(vonHand.marktargumente).toEqual(["Von Hand geschrieben."]);
  });

  it("nimmt als Token nur 32 Byte in Hex an", () => {
    expect(istExposeToken("a".repeat(64))).toBe(true);
    expect(istExposeToken("a".repeat(63))).toBe(false);
    expect(istExposeToken("' or 1=1 --")).toBe(false);
    expect(istExposeToken(null)).toBe(false);
  });
});
