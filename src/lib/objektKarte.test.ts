import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { objektKarteDaten, zusammengefuehrteObjektDaten } from "@/lib/objektKarte";
import type { ObjektKarteQuelle } from "@/lib/objektKarte";

/**
 * Eine Darstellung für alle Fälle.
 *
 * Die Karte „Objektauswahl“ hatte zwei Gesichter: Bild und graue Kacheln bei
 * einer Wohnung aus dem eigenen Bestand, eine Liste mit Zeilen bei einem von
 * Hand eingetragenen Objekt. Geprüft wird deshalb, dass beide Quellen
 * dieselben Angaben liefern, dass eine fehlende Angabe keine leere Kachel
 * erzeugt und dass die wenigen Angaben, die es nur in einem der Fälle gibt,
 * die Karte nicht halb leer aussehen lassen.
 */

/** Ein von Hand eingetragenes Objekt, wie es am Investment liegt. */
const HANDEINTRAG: ObjektKarteQuelle = {
  investment: {
    strasse: "Roonstraße 3", plz: "95028", ort: "Hof", weNr: "6",
    kaufpreis: 189000, wohnflaeche: 52, zimmer: 2, etage: "2. OG",
    baujahr: 1976, miete: 620, hausgeld: 185,
    verkaeufer: { name: "Musterbau GmbH", ort: "Hof" },
  },
  erstelltAm: "2026-08-01T09:00:00.000Z",
  reserviert: true,
};

/** Dieselbe Wohnung, aber aus dem eigenen Bestand. */
const BESTAND: ObjektKarteQuelle = {
  investment: {},
  wohnung: {
    weNr: "6", groesse: 52, zimmer: 2, mieteGesamt: 620, vkGesamt: 189000,
    rendite: 3.94, etage: "2. OG", hausgeldMonat: 185,
    reserviertAm: "2026-08-14T10:00:00.000Z",
  },
  objekt: {
    titel: "Wohnpark Roonstraße", adresse: "Roonstraße 3", plz: "95028", ort: "Hof",
    bildUrl: "https://example.test/haus.jpg", badge: "Denkmal",
    globalDaten: { baujahr: 1976 },
    verkaeuferDaten: { name: "Musterbau GmbH", ort: "Hof" },
  },
  reserviert: true,
};

/** Die Beschriftungen der grauen Kacheln, in ihrer Reihenfolge. */
const kachelNamen = (q: ObjektKarteQuelle) => objektKarteDaten(q).kacheln.map((k) => k.name);
const kachel = (q: ObjektKarteQuelle, name: string) =>
  objektKarteDaten(q).kacheln.find((k) => k.name === name);

describe("Beide Fälle ergeben dieselbe Karte", () => {
  /*
    Die Eckdatenzeile "280.000,00 € · 62 m² · 2 Zimmer" ist im September 2026
    entfallen: Alle drei Angaben stehen in der Liste darunter, der Kaufpreis in
    seiner eigenen Zeile, Fläche und Zimmer in der Zeile "Wohnung". Geprüft
    wird deshalb nur noch, dass beide Fälle dieselbe Liste ergeben.
  */
  it("zeigt dieselben Angaben", () => {
    const a = objektKarteDaten(BESTAND);
    const b = objektKarteDaten(HANDEINTRAG);
    // Der Titel bleibt verschieden: aus dem Bestand kommt der Name des
    // Objekts, beim Handeintrag steht dort die Adresse. Gleich sein müssen
    // die gerechneten Größen und die Einheit.
    expect(a.einheit).toBe(b.einheit);
    expect(a.preisJeQm).toBe(b.preisJeQm);
    expect(a.rendite).toBe(b.rendite);
    expect(a.ortszeile).toBe(b.ortszeile);
  });

  /*
   * Die sechs Objektkacheln sind weg. Vier davon standen wortgleich in der
   * Liste unter der Karte, doppelt gesagt ist nicht deutlicher. Übrig bleiben
   * nur die Zahlen aus der Berechnung des Vorgangs, und die füllt heute
   * nichts.
   */
  it("zeigt über der Liste keine Objektkacheln mehr", () => {
    expect(kachelNamen(BESTAND)).toEqual([]);
    expect(kachelNamen(HANDEINTRAG)).toEqual([]);
  });

  it("rechnet die Rendite in beiden Fällen gleich, statt sie abzuschreiben", () => {
    // 620 mal zwölf durch 189.000 sind 3,94 Prozent.
    expect(objektKarteDaten(HANDEINTRAG).rendite).toBe("3,94 %");
    expect(objektKarteDaten(BESTAND).rendite).toBe("3,94 %");
  });

  /*
   * Preis je m² und Hausgeld standen nur in den Kacheln. Ohne diese beiden
   * Prüfungen wären sie mit den Kacheln ersatzlos aus der Karte verschwunden.
   */
  it("reicht den Preis je m² weiter, er steht jetzt in der Liste", () => {
    // 189.000 durch 52 sind rund 3.635 Euro.
    expect(objektKarteDaten(HANDEINTRAG).preisJeQm).toContain("3.635");
    expect(objektKarteDaten(BESTAND).preisJeQm).toContain("3.635");
  });

  it("behält das Hausgeld in den Angaben für die Liste", () => {
    expect(zusammengefuehrteObjektDaten(HANDEINTRAG).hausgeld).toBe(185);
    expect(zusammengefuehrteObjektDaten(BESTAND).hausgeld).toBe(185);
  });

  it("nennt die Einheit unmissverständlich", () => {
    // Vorher stand hier "06 WE reserviert", das las sich wie sechs Einheiten.
    expect(objektKarteDaten(BESTAND).einheit).toBe("WE 6");
    expect(objektKarteDaten(HANDEINTRAG).einheit).toBe("WE 6");
  });

  it("sagt bei einem alten Texteintrag nicht zweimal WE", () => {
    // Der Platzhalter im Fenster hieß jahrelang "z. B. WE 6", entsprechend
    // steht in Altvorgängen "WE 14". Angezeigt wird es weiter, nur einmal.
    expect(objektKarteDaten({ investment: { weNr: "WE 14" } }).einheit).toBe("WE 14");
    expect(objektKarteDaten({ investment: { weNr: "2. OG links" } }).einheit).toBe("WE 2. OG links");
    expect(objektKarteDaten({ investment: { weNr: "" } }).einheit).toBe("");
  });

  it("füllt die Übersicht darunter auch aus dem Bestand", () => {
    const d = zusammengefuehrteObjektDaten(BESTAND);
    expect(d.strasse).toBe("Roonstraße 3");
    expect(d.ort).toBe("Hof");
    expect(d.weNr).toBe("6");
    expect(d.kaufpreis).toBe(189000);
    expect(d.wohnflaeche).toBe(52);
    expect(d.baujahr).toBe(1976);
    expect(d.verkaeufer?.name).toBe("Musterbau GmbH");
  });
});

describe("Was fehlt, erzeugt keine leere Kachel", () => {
  it("lässt Rendite und Preis je m² leer, wenn ihre Grundlagen fehlen", () => {
    const nurPflicht: ObjektKarteQuelle = {
      investment: { strasse: "Musterweg 9", plz: "12345", ort: "Andernorts", weNr: "2", kaufpreis: 210000 },
    };
    expect(objektKarteDaten(nurPflicht).rendite).toBe("");
    expect(objektKarteDaten(nurPflicht).preisJeQm).toBe("");
  });

  it("zeigt den Preis je m² erst, wenn Preis und Fläche beide dastehen", () => {
    expect(objektKarteDaten({ investment: { kaufpreis: 200000 } }).preisJeQm).toBe("");
    expect(objektKarteDaten({ investment: { wohnflaeche: 50 } }).preisJeQm).toBe("");
    expect(objektKarteDaten({ investment: { kaufpreis: 200000, wohnflaeche: 50 } }).preisJeQm)
      .toContain("4.000");
  });

  it("hält eine Null nicht für einen Wert", () => {
    const nullen: ObjektKarteQuelle = {
      investment: { kaufpreis: 0, wohnflaeche: 0, zimmer: 0, miete: 0, hausgeld: 0 },
    };
    expect(objektKarteDaten(nullen).preisJeQm).toBe("");
    expect(objektKarteDaten(nullen).rendite).toBe("");
    expect(kachelNamen(nullen)).toEqual([]);
  });
});

describe("Angaben, die es nur in einem der beiden Fälle gibt", () => {
  /*
   * Die Nutzungsart gibt es seit 09/2026 in beiden Fällen. Vorher hing sie am
   * Objekt des eigenen Bestands, und beim Handeintrag blieb das Kennzeichen
   * an der Karte deshalb dauerhaft leer.
   */
  it("zeigt die Nutzungsart aus beiden Quellen", () => {
    expect(objektKarteDaten(BESTAND).nutzungsart).toBe("Denkmal");
    expect(objektKarteDaten({
      ...HANDEINTRAG,
      investment: { ...HANDEINTRAG.investment, objektart: "wg_coliving" },
    }).nutzungsart).toBe("WG und Co-Living");
  });

  it("nennt die gewählte Objektart mit derselben Bezeichnung wie die Objektseite", () => {
    const art = (objektart: "sanierter_bestand" | "neubau" | "wg_coliving") =>
      objektKarteDaten({ investment: { objektart } }).nutzungsart;
    expect(art("sanierter_bestand")).toBe("Sanierter Bestand");
    expect(art("neubau")).toBe("Neubau");
    expect(art("wg_coliving")).toBe("WG und Co-Living");
  });

  /*
   * Bestand vor Handeintrag, dieselbe Regel wie bei Preis, Fläche und
   * Adresse: Was am Objekt gepflegt wird, gilt für alle seine Einheiten.
   */
  it("lässt beim Bestand dessen Kennzeichen gewinnen und springt sonst ein", () => {
    const beides: ObjektKarteQuelle = {
      ...BESTAND,
      investment: { objektart: "neubau" },
    };
    expect(objektKarteDaten(beides).nutzungsart).toBe("Denkmal");
    expect(objektKarteDaten({
      ...beides,
      objekt: { ...BESTAND.objekt, badge: "" },
    }).nutzungsart).toBe("Neubau");
  });

  it("bleibt bei einem Vorgang ohne Angabe leer, statt eine Art zu erfinden", () => {
    // Bestehende Investments haben die Angabe nicht. Sie dürfen dadurch nicht
    // als fehlerhaft gelten, das Kennzeichen entfällt einfach.
    expect(objektKarteDaten(HANDEINTRAG).nutzungsart).toBe("");
    expect(objektKarteDaten({ investment: { objektart: "villa" as never } }).nutzungsart).toBe("");
  });

  it("nennt das Reservierungsdatum, wenn es eines gibt, sonst das Anlagedatum", () => {
    // Der Bestand kennt den Tag der Reservierung, der Handeintrag nicht.
    expect(objektKarteDaten(BESTAND).zeitpunkt).toBe("reserviert am 14.08.2026");
    expect(objektKarteDaten(HANDEINTRAG).zeitpunkt).toBe("angelegt am 01.08.2026");
    // Ohne beides bleibt die Zeile weg statt "am –" zu zeigen.
    expect(objektKarteDaten({ investment: {} }).zeitpunkt).toBe("");
  });

  it("erkennt an, ob der Vorgang wirklich reserviert ist", () => {
    expect(objektKarteDaten({ ...HANDEINTRAG, reserviert: true }).zustand).toBe("Reserviert");
    expect(objektKarteDaten({ ...HANDEINTRAG, reserviert: false }).zustand).toBe("Objekt ausgewählt");
  });

  it("meldet, aus welcher Quelle das Objekt kommt", () => {
    expect(objektKarteDaten(BESTAND).ausBestand).toBe(true);
    expect(objektKarteDaten(HANDEINTRAG).ausBestand).toBe(false);
  });
});

describe("Der Bestand hat Vorrang, der Handeintrag springt ein", () => {
  it("nimmt beim Bestand das Objekt und nicht die Abschrift am Investment", () => {
    const gemischt = zusammengefuehrteObjektDaten({
      ...BESTAND,
      investment: { strasse: "Alte Abschrift 1", kaufpreis: 111111, weNr: "99" },
    });
    expect(gemischt.strasse).toBe("Roonstraße 3");
    expect(gemischt.kaufpreis).toBe(189000);
    expect(gemischt.weNr).toBe("6");
  });

  it("füllt aus dem Investment auf, was der Bestand nicht führt", () => {
    const gemischt = zusammengefuehrteObjektDaten({
      ...BESTAND,
      investment: {
        grundbuch: { amtsgericht: "Hof", blatt: "1234" },
        nebenkosten: 21000,
        verkaeufer: { handelsregister: "HRB 4711" },
      },
    });
    expect(gemischt.grundbuch?.amtsgericht).toBe("Hof");
    expect(gemischt.nebenkosten).toBe(21000);
    expect(gemischt.verkaeufer?.handelsregister).toBe("HRB 4711");
    expect(gemischt.verkaeufer?.name).toBe("Musterbau GmbH");
  });

  it("nimmt das Objektbild vor dem am Investment hochgeladenen", () => {
    expect(objektKarteDaten({ ...BESTAND, eigenesBild: "https://example.test/eigenes.jpg" }).bildUrl)
      .toBe("https://example.test/haus.jpg");
    expect(objektKarteDaten({ ...HANDEINTRAG, eigenesBild: "https://example.test/eigenes.jpg" }).bildUrl)
      .toBe("https://example.test/eigenes.jpg");
  });

  it("findet eine Überschrift, auch wenn nur der Titel des Investments dasteht", () => {
    expect(objektKarteDaten(BESTAND).titel).toBe("Wohnpark Roonstraße");
    expect(objektKarteDaten(HANDEINTRAG).titel).toBe("Roonstraße 3");
    expect(objektKarteDaten({ investment: {}, investmentTitel: "Investment 1" }).titel).toBe("Investment 1");
    expect(objektKarteDaten({ investment: {}, kontaktObjekt: "Hof, Roonstraße" }).titel).toBe("Hof, Roonstraße");
    expect(objektKarteDaten({ investment: {} }).titel).toBe("");
  });
});

describe("Die Zahlen aus der Berechnung des Vorgangs", () => {
  it("hängt Zuzahlung und Cashflow an, wenn sie am Investment stehen", () => {
    const mitMeta = { ...HANDEINTRAG, meta: { zuzahlung: 12000, cashflowVorSteuer: -85, cashflowNachSteuer: 42 } };
    expect(kachelNamen(mitMeta)).toContain("Zuzahlung");
    expect(kachel(mitMeta, "CF vor Steuer")?.ton).toBe("schlecht");
    expect(kachel(mitMeta, "CF nach Steuer")?.ton).toBe("gut");
  });

  it("zeigt eine Null beim Cashflow, aber nicht bei einem fehlenden Wert", () => {
    // Null ist beim Cashflow eine Aussage, kein fehlender Wert.
    expect(kachel({ investment: {}, meta: { cashflowVorSteuer: 0 } }, "CF vor Steuer")?.wert)
      .toContain("0,00");
    expect(kachel({ investment: {}, meta: { cashflowVorSteuer: null } }, "CF vor Steuer")).toBeUndefined();
    expect(kachel({ investment: {}, meta: {} }, "CF vor Steuer")).toBeUndefined();
  });
});

/**
 * Zwei Zusagen an der Oberfläche, die sich sonst still zurückdrehen lassen,
 * weil kein Aufruf sie erzwingt. Dieselbe Bauart wie in `objektVerlauf.test.ts`.
 */
describe("Die Karte im Kundenprofil hält sich an die eine Darstellung", () => {
  const karte = readFileSync(
    resolve(process.cwd(), "src/components/kunden/FreieWohnungenCard.tsx"), "utf8",
  );

  it("zeichnet das Objekt nur noch an einer Stelle", () => {
    expect(karte.match(/<ObjektKarteBlock/g) || []).toHaveLength(1);
    expect(karte).toContain("objektKarteDaten({");
  });

  /*
   * Gesucht wird die Aufschrift eines Knopfes, also der Text hinter dem
   * Symbol. Der bloße Wortlaut käme auch in den Erläuterungen darüber vor,
   * und dann prüfte der Test die Kommentare statt die Oberfläche.
   */
  it("hat 'Details ansehen' und 'Kundenansicht' entfernt", () => {
    expect(karte).not.toContain("/> Details ansehen");
    expect(karte).not.toContain("/> Kundenansicht");
  });

  it("behält 'Einheit wechseln' und stellt 'Objektdaten ändern' daneben", () => {
    expect(karte.match(/\/> Einheit wechseln/g) || []).toHaveLength(1);
    expect(karte.match(/\/> Objektdaten ändern/g) || []).toHaveLength(1);
  });

  it("zeigt den Verlauf weiter unter dem aktuellen Objekt", () => {
    expect(karte).toContain("<ObjektVerlaufListe");
    expect(karte).toContain("verlauf={objektVerlauf(inv.id)}");
  });

  /*
   * Die beiden Angaben, die es nur in den weggefallenen Kacheln gab. Ohne
   * diese Prüfung ließe sich die Liste still wieder auf ihren alten Stand
   * zurückdrehen, und beide wären dann spurlos aus der Karte verschwunden.
   */
  it("nennt Preis je m² und Hausgeld in der Liste unter der Karte", () => {
    expect(karte).toContain("je m²");
    expect(karte).toContain('name: "Hausgeld"');
  });
});
