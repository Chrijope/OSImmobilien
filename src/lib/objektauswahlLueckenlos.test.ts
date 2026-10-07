import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Jede Angabe, die die Objektauswahl erfasst, kommt beim Kunden an.
 *
 * Das ist die Prüfung, um die es bei diesem Umbau eigentlich geht. Erfassen
 * allein nützt nichts: Zimmer, Etage, Kaltmiete, Rendite, Baujahr und
 * Hausgeld standen schon vorher in der Ablage vorgesehen, sie wurden nur nie
 * beschrieben, und die Anzeige blieb dauerhaft leer.
 *
 * Geprüft wird deshalb der ganze Weg, vom Speichern bis zu den Stellen, die
 * lesen: Objektkachel, Portfolio-Leiste, Steuer-Cockpit, Marktwert und
 * Anlage V.
 */

const investment: Record<string, any> = {};
const metaFelder: Record<string, any> = {};
const updateInvestment = vi.fn();
const objekte: any[] = [];

vi.mock("@/lib/investmentsStore", () => ({
  getInvestmentById: (id: string) => (investment.id === id ? investment : undefined),
  getInvestmentMetaField: (_id: string, key: string, fallback: any) => metaFelder[key] ?? fallback,
  setInvestmentMetaFields: (_id: string, felder: Record<string, any>) => {
    Object.assign(metaFelder, felder);
  },
  updateInvestment: (...args: any[]) => updateInvestment(...args),
  getInvestmentsByKontakt: () => [],
}));

vi.mock("@/lib/objekteStore", () => ({
  getWohnungKurz: (objektId?: string | null, wohnungId?: string | null) => {
    const objekt = objektId
      ? objekte.find((o) => o.id === objektId)
      : objekte.find((o) => o.wohnungen?.some((w: any) => w.id === wohnungId));
    if (!objekt) return null;
    const w = objekt.wohnungen?.find((x: any) => x.id === wohnungId);
    return {
      objektId: objekt.id, titel: objekt.titel || "", adresse: objekt.adresse,
      plz: objekt.plz, ort: objekt.ort,
      weNr: w?.weNr || "", vkGesamt: w?.vkGesamt || 0, groesse: w?.groesse || 0,
      bildUrl: objekt.bildUrl || "",
    };
  },
}));

const {
  speichereObjektDaten, vorhandeneObjektDaten, objektDatenStand, renditeAusMiete,
  kennzahlenLuecken, kennzahlenVollstaendig, objektDatenFehlen,
  BESTANDSWOHNUNG_AKTIV,
} = await import("@/lib/objektDatenPflicht");
const { adaptMoreImmoInvestment } = await import("@/lib/kundePortalInvestment");
const { moreImmoPosition, berechnePortfolioKennzahlen } = await import("@/lib/portalPortfolio");
const { leseAnlageV } = await import("@/lib/eigeneInvestmentBerechnungen");

/** Ein vollständig ausgefülltes Fenster, alle vier Schritte. */
const ALLES = {
  strasse: "Roonstraße 3",
  plz: "95028",
  ort: "Hof",
  weNr: "6",
  kaufpreis: 189000,
  wohnflaeche: 62,
  bildUrl: "https://beispiel.test/objektfotos/investment/inv-1/1.webp",
  objektart: "sanierter_bestand" as const,
  zimmer: 2,
  etage: "2. OG",
  lage: "Südwest",
  baujahr: 1996,
  fertigstellung: "",
  miete: 620,
  hausgeld: 185,
  verkaeufer: {
    name: "Musterbau Projektentwicklung GmbH",
    strasse: "Beispielallee 12",
    plz: "83022",
    ort: "Rosenheim",
    email: "kontakt@beispiel.test",
    telefon: "08031 000000",
    handelsregister: "HRB 12345",
  },
  grundbuch: {
    amtsgericht: "Hof",
    gemarkung: "Hof",
    blatt: "12345",
    flurstueck: "412/7",
    miteigentumsanteil: 2.41,
    wohnungsnummer: "Nr. 6",
  },
  nebenkosten: 22680,
  grundstueckAnteil: 18,
  hausgeldNichtUmlage: 55,
};

/** Nur die fünf Pflichtangaben, wie es ein eiliger Vertriebspartner tut. */
const NUR_PFLICHT = {
  strasse: "Roonstraße 3",
  plz: "95028",
  ort: "Hof",
  weNr: "6",
  kaufpreis: 189000,
};

/** Die Zeile aus `investments`, wie das Kundenportal sie liest. */
const zeile = () => ({
  id: "inv-1",
  objekt: investment.objektTitel || "Roonstraße 3, 95028 Hof",
  wohnung: "6",
  kaufpreis: Number(metaFelder.kaufpreis) || 0,
  kaufdatum: null,
});

beforeEach(() => {
  updateInvestment.mockClear();
  for (const k of Object.keys(metaFelder)) delete metaFelder[k];
  for (const k of Object.keys(investment)) delete investment[k];
  objekte.length = 0;
  Object.assign(investment, { id: "inv-1", kontaktId: "k-1", pipelineStufe: "beratungsgespraech" });
});

describe("Fall 1: Objekt von Hand eingetragen, alle vier Schritte", () => {
  beforeEach(() => speichereObjektDaten("inv-1", ALLES));

  it("legt die Kennzahlen dort ab, wo die Objektkachel sie liest", () => {
    const v = metaFelder.rvVirtualWohnung;
    expect(v.objAdresse).toBe("Roonstraße 3");
    expect(v.objPlz).toBe("95028");
    expect(v.objOrt).toBe("Hof");
    expect(v.weNr).toBe("6");
    expect(v.kaufpreis).toBe(189000);
    expect(v.groesse).toBe(62);
    expect(v.zimmer).toBe(2);
    expect(v.etage).toBe("2. OG");
    expect(v.lage).toBe("Südwest");
    expect(v.baujahr).toBe(1996);
    expect(v.miete).toBe(620);
    expect(v.hausgeld).toBe(185);
    expect(v.bildUrl).toContain("objektfotos");
  });

  it("rechnet die Rendite, statt sie tippen zu lassen", () => {
    // 620 mal zwölf durch 189.000 sind 3,94 Prozent.
    expect(metaFelder.rvVirtualWohnung.rendite).toBe(3.94);
    expect(renditeAusMiete(189000, 620)).toBeCloseTo(3.937, 3);
  });

  it("schreibt zusätzlich die Namen, die Steuer-Cockpit und Anlage V lesen", () => {
    expect(metaFelder.baujahr).toBe(1996);
    expect(metaFelder.wohnflaeche).toBe(62);
    expect(metaFelder.jahresnettomiete).toBe(7440);
    expect(metaFelder.hausgeldMonat).toBe(185);
    expect(metaFelder.nebenkosten).toBe(22680);
    expect(metaFelder.grundstueckAnteil).toBe(18);
    expect(metaFelder.hausgeldNichtUmlage).toBe(55);
  });

  it("legt Verkäufer und Grundbuch je in einem eigenen Zweig ab", () => {
    expect(metaFelder.objektVerkaeufer.name).toBe("Musterbau Projektentwicklung GmbH");
    expect(metaFelder.objektVerkaeufer.handelsregister).toBe("HRB 12345");
    expect(metaFelder.objektGrundbuch.amtsgericht).toBe("Hof");
    expect(metaFelder.objektGrundbuch.flurstueck).toBe("412/7");
    expect(metaFelder.objektGrundbuch.miteigentumsanteil).toBe(2.41);
  });

  it("liest alles unverändert wieder zurück", () => {
    const d = vorhandeneObjektDaten("inv-1");
    expect(d.strasse).toBe("Roonstraße 3");
    expect(d.plz).toBe("95028");
    expect(d.weNr).toBe("6");
    expect(d.kaufpreis).toBe(189000);
    expect(d.wohnflaeche).toBe(62);
    expect(d.zimmer).toBe(2);
    expect(d.etage).toBe("2. OG");
    expect(d.lage).toBe("Südwest");
    expect(d.baujahr).toBe(1996);
    expect(d.miete).toBe(620);
    expect(d.hausgeld).toBe(185);
    expect(d.verkaeufer?.name).toBe("Musterbau Projektentwicklung GmbH");
    expect(d.grundbuch?.blatt).toBe("12345");
    expect(d.nebenkosten).toBe(22680);
    expect(d.grundstueckAnteil).toBe(18);
    expect(d.hausgeldNichtUmlage).toBe(55);
  });
});

describe("Fall 1: Was davon im Kundenportal ankommt", () => {
  beforeEach(() => speichereObjektDaten("inv-1", ALLES));

  it("reicht Fläche, Baujahr, Miete und Hausgeld an Steuer-Cockpit und Anlage V", () => {
    const a = adaptMoreImmoInvestment(zeile(), metaFelder, null);
    expect(a.wohnflaeche).toBe(62);
    expect(a.baujahr).toBe(1996);
    expect(a.mieteinnahmen_kalt).toBe(620);
    expect(a.hausgeld).toBe(185);
    expect(a.nebenkosten).toBe(22680);
  });

  it("reicht Adresse, PLZ und Ort für Marktwert und Anlage V durch", () => {
    const a = adaptMoreImmoInvestment(zeile(), metaFelder, null);
    expect(a.adresse).toBe("Roonstraße 3");
    expect(a.plz).toBe("95028");
    expect(a.ort).toBe("Hof");
  });

  it("kennt den Kaufpreis auch dann, wenn die Spalte noch nicht nachgezogen ist", () => {
    const a = adaptMoreImmoInvestment({ ...zeile(), kaufpreis: 0 }, metaFelder, null);
    expect(a.kaufpreis).toBe(189000);
  });

  it("füllt die Rendite in der Portfolio-Leiste", () => {
    const pos = moreImmoPosition({ ...zeile(), meta: metaFelder }, null);
    expect(pos.jahresmiete).toBe(7440);
    const kz = berechnePortfolioKennzahlen([pos]);
    expect(kz.rendite).not.toBeNull();
    expect(kz.rendite).toBeCloseTo(3.937, 3);
  });

  it("gibt der Anlage V den Miteigentumsanteil, statt still 100 Prozent anzusetzen", () => {
    const a = adaptMoreImmoInvestment(zeile(), metaFelder, null);
    const av = leseAnlageV(a as any);
    expect(av.miteigentumsanteilProzent).toBe(2.41);
    expect(av.hausgeldNichtUmlageMonat).toBe(55);
    // Gebäudeanteil ist der Rest zum Grundstücksanteil.
    expect(av.gebaeudeAnteilProzent).toBe(82);
  });
});

describe("Fall 1: Nur die fünf Pflichtangaben", () => {
  beforeEach(() => speichereObjektDaten("inv-1", NUR_PFLICHT as any));

  it("speichert und erfindet nichts dazu", () => {
    const d = vorhandeneObjektDaten("inv-1");
    expect(d.strasse).toBe("Roonstraße 3");
    expect(d.kaufpreis).toBe(189000);
    expect(d.zimmer).toBeUndefined();
    expect(d.baujahr).toBeUndefined();
    expect(d.miete).toBeUndefined();
  });

  it("meldet im Portal keine Rendite statt einer geschätzten", () => {
    const pos = moreImmoPosition({ ...zeile(), meta: metaFelder }, null);
    expect(pos.jahresmiete).toBeNull();
    expect(berechnePortfolioKennzahlen([pos]).rendite).toBeNull();
  });

  it("zählt die Objektkachel als noch nicht gefüllt", () => {
    const stand = objektDatenStand("inv-1");
    expect(stand.portalGefuellt).toBe(0);
    expect(stand.portalGesamt).toBe(8);
  });
});

describe("Eine Angabe lässt sich wieder entfernen", () => {
  it("löscht eine gelöschte Kaltmiete auch in der Ablage", () => {
    speichereObjektDaten("inv-1", ALLES);
    expect(metaFelder.jahresnettomiete).toBe(7440);
    speichereObjektDaten("inv-1", { ...ALLES, miete: 0 } as any);
    expect(metaFelder.rvVirtualWohnung.miete).toBeNull();
    expect(metaFelder.jahresnettomiete).toBeNull();
    expect(vorhandeneObjektDaten("inv-1").miete).toBeUndefined();
  });
});

describe("Fall 2: Wohnung aus dem eigenen Bestand", () => {
  /*
   * Abgeschaltet, siehe `BESTANDSWOHNUNG_AKTIV`. Die Prüfungen beschreiben
   * beide Zustände, damit sie beim Wiedereinschalten wieder greifen.
   */
  beforeEach(() => {
    Object.assign(investment, { objektId: "obj-1", wohnungId: "wo-1" });
    objekte.push({
      id: "obj-1",
      adresse: "Bestandsstraße 7",
      plz: "54321",
      ort: "Beispielort",
      bildUrl: "https://beispiel.test/bestand.webp",
      wohnungen: [{ id: "wo-1", weNr: "12", vkGesamt: 210000, groesse: 74 }],
    });
  });

  it("gewinnt gegen eine von Hand eingetragene Abschrift", () => {
    speichereObjektDaten("inv-1", ALLES);
    const d = vorhandeneObjektDaten("inv-1");
    if (!BESTANDSWOHNUNG_AKTIV) {
      // Abgeschaltet gewinnt der Handeintrag, denn er ist die einzige Quelle.
      expect(d.strasse).toBe("Roonstraße 3");
      expect(d.weNr).toBe("6");
      expect(d.kaufpreis).toBe(189000);
      return;
    }
    expect(d.strasse).toBe("Bestandsstraße 7");
    expect(d.plz).toBe("54321");
    expect(d.ort).toBe("Beispielort");
    expect(d.weNr).toBe("12");
    expect(d.kaufpreis).toBe(210000);
    expect(d.wohnflaeche).toBe(74);
    expect(d.bildUrl).toBe("https://beispiel.test/bestand.webp");
  });

  it("lässt die Angaben, die der Bestand nicht führt, aus dem Investment stehen", () => {
    speichereObjektDaten("inv-1", ALLES);
    const d = vorhandeneObjektDaten("inv-1");
    expect(d.zimmer).toBe(2);
    expect(d.baujahr).toBe(1996);
    expect(d.grundbuch?.blatt).toBe("12345");
  });
});

describe("Fall 3: Es ist noch nichts eingetragen", () => {
  it("liefert leere Felder und keine Nullwerte, die wie Angaben aussehen", () => {
    const d = vorhandeneObjektDaten("inv-1");
    expect(d.strasse).toBe("");
    expect(d.kaufpreis).toBe(0);
    expect(d.zimmer).toBeUndefined();
    expect(d.verkaeufer?.name).toBeUndefined();
    expect(d.grundbuch?.amtsgericht).toBeUndefined();
  });

  it("zählt in der Übersicht überall null", () => {
    const stand = objektDatenStand("inv-1");
    expect(stand.portalGefuellt).toBe(0);
    expect(stand.reservierungGefuellt).toBe(0);
    expect(stand.notarGefuellt).toBe(0);
  });

  it("stürzt ohne Investment nicht ab", () => {
    expect(() => vorhandeneObjektDaten(null)).not.toThrow();
    expect(() => objektDatenStand(undefined)).not.toThrow();
  });
});

describe("Fall 4: Mehrere Investments", () => {
  it("hält die Angaben zweier Vorgänge auseinander", () => {
    speichereObjektDaten("inv-1", ALLES);
    const erstes = adaptMoreImmoInvestment(zeile(), { ...metaFelder }, null);

    const zweitesMeta = {
      kaufpreis: 310000,
      rvVirtualWohnung: { objAdresse: "Zweitweg 9", objPlz: "99999", objOrt: "Andernorts", groesse: 91, weNr: "7", miete: 900 },
    };
    const zweites = adaptMoreImmoInvestment(
      { id: "inv-2", objekt: "Zweitweg 9", wohnung: "7", kaufpreis: 310000 },
      zweitesMeta, null,
    );

    expect(erstes.adresse).toBe("Roonstraße 3");
    expect(zweites.adresse).toBe("Zweitweg 9");
    expect(erstes.wohnflaeche).toBe(62);
    expect(zweites.wohnflaeche).toBe(91);
    expect(erstes.mieteinnahmen_kalt).toBe(620);
    expect(zweites.mieteinnahmen_kalt).toBe(900);
  });
});

describe("Die Übersicht in der Objektauswahl zählt ehrlich", () => {
  it("meldet nach allen vier Schritten alles vollständig", () => {
    speichereObjektDaten("inv-1", ALLES);
    const stand = objektDatenStand("inv-1");
    expect(stand.portalGefuellt).toBe(stand.portalGesamt);
    expect(stand.reservierungGefuellt).toBe(stand.reservierungGesamt);
    expect(stand.notarGefuellt).toBe(stand.notarGesamt);
  });

  it("zählt den Verkäufer für die Reservierung mit, sobald er steht", () => {
    speichereObjektDaten("inv-1", { ...NUR_PFLICHT, verkaeufer: ALLES.verkaeufer } as any);
    const stand = objektDatenStand("inv-1");
    expect(stand.reservierungGefuellt).toBe(stand.reservierungGesamt);
    // Ohne Grundbuch fehlen dem Notarbogen weiterhin vier Angaben.
    expect(stand.notarGesamt - stand.notarGefuellt).toBe(4);
  });
});

// ── Was sich nur am Quelltext festhalten lässt ──

const portal = readFileSync(resolve(process.cwd(), "src/pages/KundeInvestments.tsx"), "utf8");
const cockpit = readFileSync(resolve(process.cwd(), "src/components/kunde/SteuerCockpitCard.tsx"), "utf8");

describe("Die Objektkachel im Portal zeigt die neuen Angaben", () => {
  it("kennt Etage und Lage", () => {
    expect(portal).toContain("virt.etage");
    expect(portal).toContain("virt.lage");
  });

  it("kennt Baujahr und Hausgeld", () => {
    expect(portal).toContain("virt.baujahr");
    expect(portal).toContain("virt.hausgeld");
  });

  it("rechnet die Rendite, statt eine gespeicherte zu zeigen", () => {
    expect(portal).toContain("renditeAusMiete(Number(virt.kaufpreis)");
    expect(portal).not.toContain("virt.rendite ?");
  });
});

describe("Die Namen, unter denen das Steuer-Cockpit liest, stimmen noch", () => {
  /*
   * Diese Karte liest den Datensatz von oben, nicht aus `rvVirtualWohnung`.
   * Deshalb schreibt `speichereObjektDaten` dieselben Angaben zusätzlich unter
   * genau diesen Namen. Wird einer davon dort umbenannt, fällt es hier auf und
   * nicht erst beim Kunden.
   */
  for (const name of ["invMeta.baujahr", "invMeta.nebenkosten", "invMeta.grundstueckAnteil",
                      "invMeta.jahresnettomiete", "invMeta.hausgeldMonat", "invMeta.hausgeldNichtUmlage"]) {
    it(`liest weiterhin ${name}`, () => {
      expect(cockpit).toContain(name);
    });
  }
});

const kundenDetail = readFileSync(resolve(process.cwd(), "src/pages/KundenDetail.tsx"), "utf8");
const dialog = readFileSync(resolve(process.cwd(), "src/components/kunden/ObjektDatenDialog.tsx"), "utf8");
const rvFormular = readFileSync(resolve(process.cwd(), "src/components/reservierung/ReservierungsForm.tsx"), "utf8");
const reservierungSeite = readFileSync(resolve(process.cwd(), "src/pages/Reservierung.tsx"), "utf8");

describe("Reservierung und Notarbogen lesen aus derselben Quelle", () => {
  /*
   * Bis zum 16.09.2026 reisten die Objektangaben in der Adresszeile mit, und
   * die Kundendaten gleich dazu: Name, Mailadresse, Telefonnummer, Anschrift
   * und Geburtsdatum standen im Klartext darin. Aufgefallen ist das an einem
   * echten Fehlerticket an diesem Tag, in dem die volle Adresse stand und
   * damit für jeden lesbar war, der das Ticket öffnet. Jetzt trägt die
   * Adresse nur noch Kennungen, und die Reservierungsseite schlägt selbst
   * nach.
   */
  it("schreibt keine Kunden- und Objektdaten mehr in die Adresse", () => {
    for (const feld of ["kVorname", "kNachname", "kEmail", "kTelefon", "kGeburtsdatum",
                        "objAdresse", "objPlz", "objOrt", "weNr", "kaufpreis", "vkName"]) {
      expect(kundenDetail).not.toContain(`params.set("${feld}"`);
      expect(kundenDetail).not.toContain(`ergaenze("${feld}"`);
    }
  });

  it("lädt die Reservierungsseite Kunde und Investment aus dem Datenbestand", () => {
    expect(reservierungSeite).toContain("getKontaktById(kundeId)");
    expect(reservierungSeite).toContain("getInvestmentById(investmentId)");
    // Ohne Warten auf den Zwischenspeicher ginge das Formular leer auf.
    expect(reservierungSeite).toContain("useCacheReady");
    // Die Objektangaben liest das Formular selbst aus derselben Quelle.
    expect(rvFormular).toContain("vorhandeneObjektDaten(investmentId)");
  });

  it("füllt den Notar-Aufnahmebogen aus derselben Quelle vor", () => {
    expect(kundenDetail).toContain("vorhandeneObjektDaten(kvInv.id)");
    expect(kundenDetail).toContain("invGb.amtsgericht");
    expect(kundenDetail).toContain("invGb.gemarkung");
    expect(kundenDetail).toContain("invGb.flurstueck");
    expect(kundenDetail).toContain("invVk.handelsregister");
  });

  it("gibt dem Notarbogen mit, um welche Wohnung es geht", () => {
    // Vorher stand dort nur die Adresse, also das Haus. Der Notar wusste
    // nicht, welche der Wohnungen darin gemeint ist.
    expect(kundenDetail).toContain("obj_wohneinheit");
    expect(kundenDetail).toContain("obj_wohnungsnummer");
    expect(kundenDetail).toContain("invGb.wohnungsnummer");
  });

  it("teilt den Verkäufernamen nicht mehr am letzten Leerzeichen", () => {
    // Genau diese beiden Zeilen machten aus „Musterbau Projektentwicklung
    // GmbH“ den Nachnamen „GmbH“.
    expect(kundenDetail).not.toContain("guessedNachname");
    expect(kundenDetail).not.toContain("guessedVorname");
    expect(kundenDetail).toContain("verkaeuferNotarFelder");
  });

  it("schreibt zurück, was in der Reservierung ergänzt wurde", () => {
    expect(rvFormular).toContain("objektVerkaeufer");
    expect(rvFormular).toContain("!hatBestandsWohnung(investmentId)");
  });
});

describe("Firma oder Privatperson bleibt am Investment stehen", () => {
  it("merkt sich eine Firma samt Namen in einem Stück", () => {
    speichereObjektDaten("inv-1", {
      ...NUR_PFLICHT,
      verkaeufer: { art: "firma", name: "Musterbau Projektentwicklung GmbH", vorname: "" },
    } as any);
    const vk = vorhandeneObjektDaten("inv-1").verkaeufer!;
    expect(vk.art).toBe("firma");
    expect(vk.name).toBe("Musterbau Projektentwicklung GmbH");
    expect(vk.vorname).toBeUndefined();
  });

  it("merkt sich eine Privatperson mit getrenntem Vor- und Nachnamen", () => {
    speichereObjektDaten("inv-1", {
      ...NUR_PFLICHT,
      verkaeufer: { art: "person", vorname: "Erika", name: "Mustermann" },
    } as any);
    const vk = vorhandeneObjektDaten("inv-1").verkaeufer!;
    expect(vk.art).toBe("person");
    expect(vk.vorname).toBe("Erika");
    expect(vk.name).toBe("Mustermann");
  });

  it("lässt einen bestehenden Eintrag ohne Wahl stehen, wie er ist", () => {
    // So sieht jeder Vorgang aus, der vor 09/2026 angelegt wurde.
    speichereObjektDaten("inv-1", {
      ...NUR_PFLICHT,
      verkaeufer: { name: "Musterbau Projektentwicklung GmbH" },
    } as any);
    const vk = vorhandeneObjektDaten("inv-1").verkaeufer!;
    expect(vk.name).toBe("Musterbau Projektentwicklung GmbH");
    // Nicht geraten: Die Wahl bleibt offen, bis jemand sie trifft.
    expect(vk.art).toBe("");
  });

  it("übergeht einen Unsinnswert im Datensatz", () => {
    speichereObjektDaten("inv-1", {
      ...NUR_PFLICHT,
      verkaeufer: { art: "GmbH", name: "Musterbau" },
    } as any);
    expect(vorhandeneObjektDaten("inv-1").verkaeufer!.art).toBe("");
  });
});

describe("Der Dialog verlangt fünf Pflichtangaben, die PLZ neu darunter", () => {
  it("lässt ohne PLZ nicht speichern", () => {
    // Die Wohneinheit ist seit 09/2026 eine reine Zahl, deshalb `weNrIstZahl`
    // statt einer bloßen Prüfung auf „irgendetwas steht drin“.
    expect(dialog).toContain("!!strasse.trim() && !!plz.trim() && !!ort.trim() && weNrIstZahl(weNr) && preis > 0");
  });

  it("führt vier Schritte, von denen die ersten beiden Pflicht sind", () => {
    expect(dialog).toContain('const SCHRITTE = ["Wo liegt sie", "Kennzahlen", "Verkäufer", "Später"]');
    expect(dialog).toContain("Speichern und später ergänzen");
    expect(dialog).toContain("kennzahlenLuecken");
  });

  it("liest Zahlen mit der gemeinsamen Umwandlung, nicht mit Number", () => {
    expect(dialog).toContain("zahlAusText");
    expect(dialog).not.toContain('Number(String(t).replace(/\\./g, "")');
  });
});

describe("Alte Vorgänge ohne PLZ laufen unverändert weiter", () => {
  /*
   * Die PLZ ist Pflicht im Fenster, nicht in der Frage „steht das Objekt
   * fest“. Sonst würde ein Bestandsvorgang ohne PLZ plötzlich wieder als
   * unvollständig gelten, die Liste der freien Wohnungen käme zurück und die
   * Objektkachel verschwände.
   */
  it("hält ein Objekt ohne PLZ weiterhin für gesetzt", () => {
    metaFelder.rvVirtualWohnung = { objAdresse: "Altweg 5", objOrt: "Altstadt", weNr: "1", kaufpreis: 150000 };
    metaFelder.kaufpreis = 150000;
    expect(objektDatenFehlen("inv-1")).toBe(false);
  });
});

describe("Die Kennzahlen aus Schritt 2 sind Pflicht", () => {
  it("nennt alle acht, solange nichts eingetragen ist", () => {
    const felder = kennzahlenLuecken({}).map((l) => l.feld);
    expect(felder).toEqual([
      "Nutzungsart", "Wohnfläche", "Zimmer", "Baujahr oder Fertigstellung", "Etage", "Lage",
      "Kaltmiete", "Hausgeld",
    ]);
  });

  it("sagt zu jeder Lücke, was ohne sie leer bleibt", () => {
    for (const l of kennzahlenLuecken({})) expect(l.wofuer.trim()).not.toBe("");
  });

  it("meldet nach allen Angaben nichts mehr", () => {
    expect(kennzahlenLuecken(ALLES)).toEqual([]);
  });

  it("lässt Baujahr und Fertigstellung füreinander einspringen", () => {
    const ohneJahr = { ...ALLES, baujahr: 0, fertigstellung: "" };
    expect(kennzahlenLuecken(ohneJahr).map((l) => l.feld)).toEqual(["Baujahr oder Fertigstellung"]);
    // Neubau: nur die Fertigstellung, kein Baujahr.
    expect(kennzahlenLuecken({ ...ohneJahr, fertigstellung: "Q3 2024" })).toEqual([]);
    // Bestand: nur das Baujahr, keine Fertigstellung.
    expect(kennzahlenLuecken({ ...ohneJahr, baujahr: 1996 })).toEqual([]);
  });

  it("erkennt nur die drei angebotenen Objektarten, nicht irgendeinen Text", () => {
    // KfW 40 bleibt in `OBJEKTARTEN` und ist deshalb ein gültiger Wert, auch
    // wenn das Objektfenster ihn nicht zur Wahl stellt.
    expect(kennzahlenLuecken({ ...ALLES, objektart: "kfw40" })).toEqual([]);
    expect(kennzahlenLuecken({ ...ALLES, objektart: "villa" as never }).map((l) => l.feld))
      .toEqual(["Nutzungsart"]);
    expect(kennzahlenLuecken({ ...ALLES, objektart: undefined }).map((l) => l.feld))
      .toEqual(["Nutzungsart"]);
  });

  it("trägt die Nutzungsart bis in die Ablage und wieder zurück", () => {
    speichereObjektDaten("inv-1", { ...ALLES, objektart: "wg_coliving" });
    expect(metaFelder.rvVirtualWohnung.objektart).toBe("wg_coliving");
    expect(vorhandeneObjektDaten("inv-1").objektart).toBe("wg_coliving");
  });

  it("zählt eine Null nicht als Angabe", () => {
    expect(kennzahlenLuecken({ ...ALLES, hausgeld: 0 }).map((l) => l.feld)).toEqual(["Hausgeld"]);
    expect(kennzahlenLuecken({ ...ALLES, etage: "   " }).map((l) => l.feld)).toEqual(["Etage"]);
  });

  it("liest den Stand eines gespeicherten Investments", () => {
    speichereObjektDaten("inv-1", ALLES);
    expect(kennzahlenVollstaendig("inv-1")).toBe(true);
    speichereObjektDaten("inv-1", { ...ALLES, etage: "", lage: "" });
    expect(kennzahlenVollstaendig("inv-1")).toBe(false);
    expect(kennzahlenLuecken(vorhandeneObjektDaten("inv-1")).map((l) => l.feld))
      .toEqual(["Etage", "Lage"]);
  });

  it("stürzt ohne Investment nicht ab", () => {
    expect(() => kennzahlenVollstaendig(null)).not.toThrow();
  });
});

describe("Bestehende Investments gelten weiterhin als gesetzt", () => {
  /*
   * Der Kern der Umstellung: Die Kennzahlen sind im Fenster Pflicht, aber
   * nicht in der Frage, ob das Objekt feststeht. Sonst fiele jeder laufende
   * Vorgang ohne Etage oder Hausgeld zurück auf "kein Objekt eingetragen",
   * die Liste der freien Wohnungen käme wieder, und die Pipeline ließe ihn
   * nicht mehr weiterziehen.
   */
  it("hält ein Altobjekt ohne jede Kennzahl für vollständig eingetragen", () => {
    speichereObjektDaten("inv-1", NUR_PFLICHT as never);
    expect(objektDatenFehlen("inv-1")).toBe(false);
    expect(kennzahlenVollstaendig("inv-1")).toBe(false);
  });
});

describe("Bei einem Neubau ersetzt die Fertigstellung das Baujahr", () => {
  it("nimmt die Jahreszahl aus der Fertigstellung, wenn das Baujahr leer ist", () => {
    speichereObjektDaten("inv-1", { ...NUR_PFLICHT, fertigstellung: "Q3 2024" } as never);
    expect(metaFelder.baujahr).toBe(2024);
    expect(metaFelder.rvVirtualWohnung.baujahr).toBe(2024);
  });

  it("lässt ein eingetragenes Baujahr in Ruhe", () => {
    speichereObjektDaten("inv-1", { ...NUR_PFLICHT, baujahr: 1996, fertigstellung: "2024" } as never);
    expect(metaFelder.baujahr).toBe(1996);
  });

  it("erfindet aus einer Fertigstellung ohne Jahreszahl nichts", () => {
    speichereObjektDaten("inv-1", { ...NUR_PFLICHT, fertigstellung: "im Frühjahr" } as never);
    expect(metaFelder.baujahr).toBeNull();
  });
});
