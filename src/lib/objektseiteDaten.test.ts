import { describe, it, expect } from "vitest";
import { einheitenImHaus, objektseiteFelder, objektseiteFelderInMeta, objektseiteHandwerte, objektartAbleiten, istWgKonzept, nenntWgKonzept, investagonStand, einzigeEinheit, springtInDieEinheit, zielRouteFuerObjekt } from "@/lib/objektseiteDaten";
import { verwaltungAnzeige } from "@/lib/objektdetailsAnzeige";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

describe("Zielroute beim Klick auf ein Objekt", () => {
  it("führt bei genau einer Einheit direkt auf die Einheiten-Seite", () => {
    expect(zielRouteFuerObjekt({ id: "o1", wohnungen: [{ id: "w1" }] })).toBe("/objekte/o1/einheiten/w1");
    expect(einzigeEinheit([{ id: "w1" }])?.id).toBe("w1");
  });

  it("führt bei mehreren Einheiten auf die Objektseite", () => {
    expect(zielRouteFuerObjekt({ id: "o1", wohnungen: [{ id: "w1" }, { id: "w2" }] })).toBe("/objekte/o1");
    expect(einzigeEinheit([{ id: "w1" }, { id: "w2" }])).toBeUndefined();
  });

  it("führt ohne Einheiten auf die Objektseite", () => {
    expect(zielRouteFuerObjekt({ id: "o1", wohnungen: [] })).toBe("/objekte/o1");
    expect(zielRouteFuerObjekt({ id: "o1" })).toBe("/objekte/o1");
    expect(einzigeEinheit([])).toBeUndefined();
    expect(einzigeEinheit(undefined)).toBeUndefined();
  });
});

describe("Felder der Objektseite im meta-JSON", () => {
  it("liest leere Felder ohne Absturz und fällt bei der Energieklasse auf die Spalte zurück", () => {
    const f = objektseiteFelder({ meta: {}, globalDaten: { energieeffizienzklasse: "D" } as never });
    expect(f.objektart).toBeUndefined();
    expect(f.standortargumente).toEqual([]);
    expect(f.sanierungen).toEqual([]);
    expect(f.energieausweis.klasse).toBe("D");
  });

  it("schreibt und liest dieselben Felder, fremde Schlüssel bleiben stehen", () => {
    const meta = objektseiteFelderInMeta({ anlageklasse: "Eigentumswohnung", investagonSlug: "abc" }, {
      objektart: "sanierter_bestand",
      kurzbeschreibung: "  Mehrfamilienhaus von 1962.  ",
      standortargumente: ["Wachsende Stadt", " ", "Anbindung"],
      energieausweis: { art: "Verbrauchsausweis", kennwert: 121, klasse: "D", energietraeger: "Gas", gueltigBis: "2034" },
      gemeinschaftseigentum: "5 Etagen, kein Aufzug",
      sanierungen: [{ jahr: "2023", massnahme: "Dach", betrag: 80000 }, { jahr: "", massnahme: "" }],
      verwaltung: "Hausverwaltung Beispiel GmbH",
    });
    expect(meta.anlageklasse).toBe("Eigentumswohnung");
    expect(meta.investagonSlug).toBe("abc");
    const f = objektseiteFelder({ meta });
    expect(f.objektart).toBe("sanierter_bestand");
    expect(f.kurzbeschreibung).toBe("Mehrfamilienhaus von 1962.");
    expect(f.standortargumente).toEqual(["Wachsende Stadt", "Anbindung"]);
    expect(f.energieausweis).toEqual({ art: "Verbrauchsausweis", kennwert: 121, klasse: "D", energietraeger: "Gas", gueltigBis: "2034" });
    expect(f.sanierungen).toEqual([{ jahr: "2023", massnahme: "Dach", betrag: 80000 }]);
    expect(f.verwaltung).toBe("Hausverwaltung Beispiel GmbH");
  });

  it("entfernt geleerte Felder statt leere Zeichenketten zu speichern", () => {
    const meta = objektseiteFelderInMeta({ kurzbeschreibung: "alt", objektart: "neubau" }, {
      kurzbeschreibung: "", standortargumente: [], energieausweis: {}, sanierungen: [],
    });
    expect(meta).not.toHaveProperty("kurzbeschreibung");
    expect(meta).not.toHaveProperty("objektart");
    expect(meta).not.toHaveProperty("energieausweis");
  });

  it("pflegt „Einheiten im Haus“ als ganze Zahl in meta.einheitenImHaus", () => {
    const meta = objektseiteFelderInMeta({}, { standortargumente: [], energieausweis: {}, sanierungen: [], einheitenImHaus: 14 });
    expect(meta.einheitenImHaus).toBe(14);
    expect(einheitenImHaus({ meta })).toBe(14);
    expect(objektseiteHandwerte({ meta }).einheitenImHaus).toBe(14);
    // Geleert heißt entfernt, nicht 0.
    expect(objektseiteFelderInMeta(meta, { standortargumente: [], energieausweis: {}, sanierungen: [] })).not.toHaveProperty("einheitenImHaus");
  });

  it("nimmt für „Einheiten im Haus“ nur eine positive ganze Zahl", () => {
    expect(einheitenImHaus({ meta: {} })).toBeUndefined();
    expect(einheitenImHaus({ meta: { einheitenImHaus: 0 } })).toBeUndefined();
    expect(einheitenImHaus({ meta: { einheitenImHaus: 2.5 } })).toBeUndefined();
    expect(einheitenImHaus({ meta: { einheitenImHaus: "12" } })).toBe(12);
    expect(einheitenImHaus(null)).toBeUndefined();
  });

  it("ignoriert eine unbekannte Objektart", () => {
    expect(objektseiteFelder({ meta: { objektart: "villa" } }).objektart).toBeUndefined();
  });
});

describe("Objektart ableiten", () => {
  it("erkennt WG, KfW 40, Neubau und sanierten Bestand aus den vorhandenen Angaben", () => {
    expect(objektartAbleiten({ meta: { anlageklasse: "WG-Wohnung" }, titel: "x" })).toBe("wg_coliving");
    expect(objektartAbleiten({ meta: {}, titel: "KFW 40 QNG Neubau Waldachtal" })).toBe("kfw40");
    expect(objektartAbleiten({ meta: {}, titel: "Neubau", globalDaten: { zustand: "Neubau" } as never })).toBe("neubau");
    expect(objektartAbleiten({ meta: {}, titel: "Haus", globalDaten: { zustand: "Kernsanierung" } as never })).toBe("sanierter_bestand");
    expect(objektartAbleiten({ meta: {}, titel: "Haus" })).toBeUndefined();
  });

  it("nimmt „wg“ in der Anlageklasse nur als eigenes Wort", () => {
    expect(objektartAbleiten({ meta: { anlageklasse: "Bewegungsraum" }, titel: "x" })).toBeUndefined();
    expect(objektartAbleiten({ meta: { anlageklasse: "Co-Living" }, titel: "x" })).toBe("wg_coliving");
  });
});

describe("nenntWgKonzept und istWgKonzept", () => {
  it("erkennt WG als eigenes Wort und Co-Living in allen Schreibweisen", () => {
    for (const t of ["WG-Wohnung", "4er WG", "WG", "wg_zimmer", "Co-Living", "Coliving", "co living", "Wohngemeinschaft", "Zimmervermietung", "13. Landsbergerstraße 22a (Co-Living)"]) {
      expect(nenntWgKonzept(t), t).toBe(true);
    }
  });

  it("trifft keine Wörter, die „wg“ nur enthalten, und nicht die WEG", () => {
    for (const t of ["Bewegung", "Zwangsversteigerung", "WEG-Verwaltung", "Kwg", "Eco-Living", "Standard-Vermietung", "", undefined]) {
      expect(nenntWgKonzept(t), String(t)).toBe(false);
    }
  });

  it("erkennt das Konzept an Anlageklasse, Mietmodell, Badge und Titel", () => {
    expect(istWgKonzept({ meta: { anlageklasse: "WG-Wohnung" } })).toBe(true);
    expect(istWgKonzept({ meta: { investagonRaw: { tags: ["2. Mietmodell: WG-Vermietung"] } } })).toBe(true);
    expect(istWgKonzept({ meta: {}, badge: "Co-Living" })).toBe(true);
    expect(istWgKonzept({ meta: {}, titel: "13. Landsbergerstraße 22a, 82210 Germering (Co-Living)" })).toBe(true);
    // Das Mietmodell steht manchmal nur an den Einheiten.
    expect(istWgKonzept({ meta: {}, wohnungen: [{ investagonRaw: { tags: ["2. Mietmodell: Zimmervermietung"] } }] })).toBe(true);
  });

  it("sagt nein bei einer gewöhnlichen Eigentumswohnung", () => {
    expect(istWgKonzept({
      meta: { anlageklasse: "Eigentumswohnung", investagonRaw: { tags: ["2. Mietmodell: Standard-Vermietung"] } },
      titel: "12. Nürnberg, Breitscheidstraße 18 (Standard-Modell)",
    })).toBe(false);
    expect(istWgKonzept({})).toBe(false);
  });

  it("lässt die gepflegte Objektart entscheiden, in beide Richtungen", () => {
    expect(istWgKonzept({ meta: { objektart: "wg_coliving" }, titel: "Haus" })).toBe(true);
    // Festgelegt als Bestand: Der Titel mit „WG“ macht es nicht mehr zur WG.
    expect(istWgKonzept({ meta: { objektart: "sanierter_bestand", anlageklasse: "WG-Wohnung" }, titel: "WG-Haus" })).toBe(false);
  });
});

describe("Eine WG-Regel für alle Stellen", () => {
  /*
   * Gegenprobe mit Objekten, bei denen die Stellen vor dem 23.09.2026
   * auseinanderliefen: Die Objektart sah nur die Anlageklasse, die
   * Verwaltung dazu Mietmodell, Badge und Titel.
   */
  const vorherWiderspruechlich = [
    { name: "Co-Living im Titel", objekt: { meta: { anlageklasse: "Eigentumswohnung" }, titel: "13. Landsbergerstraße 22a, 82210 Germering (Co-Living)", globalDaten: { zustand: "Kernsanierung" } as never } },
    { name: "Mietmodell an der Einheit", objekt: { meta: { anlageklasse: "Eigentumswohnung" }, titel: "Haus", globalDaten: { zustand: "Bestand" } as never, wohnungen: [{ investagonRaw: { tags: ["2. Mietmodell: WG-Vermietung"] } }] } },
    { name: "Co-Living im Badge", objekt: { meta: {}, titel: "Haus", badge: "Co-Living", globalDaten: { zustand: "Neubau" } as never } },
  ];

  for (const { name, objekt } of vorherWiderspruechlich) {
    it(`sagt überall dasselbe: ${name}`, () => {
      expect(istWgKonzept(objekt)).toBe(true);
      expect(objektartAbleiten(objekt)).toBe("wg_coliving");
      expect(verwaltungAnzeige(objekt).mitSev).toBe(true);
    });
  }

  it("sagt auch beim Nein überall dasselbe", () => {
    const etw = { meta: { anlageklasse: "Eigentumswohnung", investagonRaw: { tags: ["2. Mietmodell: Standard-Vermietung"] } }, titel: "12. Nürnberg (Standard-Modell)", globalDaten: { zustand: "Kernsanierung" } as never };
    expect(istWgKonzept(etw)).toBe(false);
    expect(objektartAbleiten(etw)).toBe("sanierter_bestand");
    expect(verwaltungAnzeige(etw).mitSev).toBe(false);
  });

  it("eine gepflegte Objektart entscheidet für alle Stellen", () => {
    const gepflegt = { meta: { objektart: "sanierter_bestand", anlageklasse: "WG-Wohnung" }, titel: "WG-Haus", globalDaten: { zustand: "Kernsanierung" } as never };
    expect(istWgKonzept(gepflegt)).toBe(false);
    expect(objektartAbleiten(gepflegt)).not.toBe("wg_coliving");
    expect(verwaltungAnzeige(gepflegt).mitSev).toBe(false);
  });

  it("außerhalb von objektseiteDaten erkennt niemand WG selbst", () => {
    // Wer „ist das eine WG?“ fragt, fragt istWgKonzept oder objektartAbleiten.
    const wurzel = process.cwd();
    const funde: string[] = [];
    const lies = (ordner: string) => {
      for (const name of readdirSync(ordner)) {
        const pfad = join(ordner, name);
        if (statSync(pfad).isDirectory()) { lies(pfad); continue; }
        if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name) || / \d\.tsx?$/.test(name)) continue;
        if (pfad.endsWith(join("src", "lib", "objektseiteDaten.ts"))) continue;
        const text = readFileSync(pfad, "utf8");
        if (/nenntWgKonzept\(|includes\(\s*["']wg["']\s*\)/i.test(text)) funde.push(pfad.slice(wurzel.length + 1));
      }
    };
    lies(join(wurzel, "src"));
    expect(funde).toEqual([]);
  });
});

describe("Investagon-Stand", () => {
  it("unterscheidet Investagon-Objekte von Handanlagen", () => {
    expect(investagonStand({ meta: { investagonSlug: "abc", importStand: "2026-09-02" } })).toEqual({ ausInvestagon: true, stand: "2026-09-02" });
    expect(investagonStand({ meta: {} })).toEqual({ ausInvestagon: false, stand: undefined });
  });
});

describe("springtInDieEinheit", () => {
  it("springt bei genau einer Einheit, wie bisher", () => {
    expect(springtInDieEinheit({ wohnungen: [{ id: "w1" }] })).toBe(true);
    expect(zielRouteFuerObjekt({ id: "o1", wohnungen: [{ id: "w1" }] })).toBe("/objekte/o1/einheiten/w1");
  });

  it("springt nicht bei mehreren und nicht ohne Einheiten", () => {
    expect(springtInDieEinheit({ wohnungen: [{ id: "w1" }, { id: "w2" }] })).toBe(false);
    expect(springtInDieEinheit({ wohnungen: [] })).toBe(false);
    expect(springtInDieEinheit({})).toBe(false);
  });

  it("springt bei einer angelegten Einzelwohnung auch dann, wenn spaeter mehr Einheiten daran haengen", () => {
    // Frueher entschied allein die Anzahl. Ein Objekt, das ausdruecklich als
    // Einzelwohnung angelegt wurde, bleibt eine Einzelwohnung.
    expect(springtInDieEinheit({ meta: { einzelwohnung: true }, wohnungen: [{ id: "w1" }, { id: "w2" }] })).toBe(true);
  });

  it("springt bei einem Globalobjekt nie, auch nicht mit nur einer Einheit", () => {
    // Ein Globalobjekt wird als Ganzes verkauft und ueber seine Objektseite
    // reserviert. Entscheidung vom 10.09.2026.
    expect(springtInDieEinheit({ globalObjekt: true, wohnungen: [{ id: "w1" }] })).toBe(false);
    expect(zielRouteFuerObjekt({ id: "o1", globalObjekt: true, wohnungen: [{ id: "w1" }] })).toBe("/objekte/o1");
  });
});

/*
 * Der Rückfall auf Investagon, seit 16.09.2026.
 *
 * Bei einem Objekt aus Investagon pflegt niemand diese Felder, und die
 * Schnittstelle liefert sie nicht unter diesen Namen. Die Objektseite zeigte
 * deshalb „Keine Angabe“, obwohl die Angaben in den Rohdaten stehen.
 */
describe("objektseiteFelder: Rückfall auf die Investagon-Rohdaten", () => {
  const rohdaten = {
    meta: {
      investagonRaw: {
        extras: [
          { id: 2, value: "Kunde bekommt ein Restnutzungsdauergutachten zugestellt.", weight: 2 },
          { id: 1, value: "Dach und Fassade wurden bereits renoviert.", weight: 0 },
        ],
        tags: [
          "4. 360°-Verwaltung: inklusive",
          "5. Energieeffizienzklasse: C",
        ],
        energy_certificate_type: "consumption_certificate",
        energy_efficiency_class: null,
      },
    },
  };

  it("füllt die Kurzbeschreibung aus den Freitexten, nach Gewicht sortiert", () => {
    const f = objektseiteFelder(rohdaten as never);
    expect(f.kurzbeschreibung).toBe(
      "Dach und Fassade wurden bereits renoviert.\n\nKunde bekommt ein Restnutzungsdauergutachten zugestellt.",
    );
  });

  /*
   * Bis zum 23.09.2026 stand hier die Objektbeschreibung, also dieselben
   * Freitexte wie in der Kurzbeschreibung. Das Gemeinschaftseigentum setzt
   * jetzt `gemeinschaftseigentumAnzeige` aus echten Angaben zusammen.
   */
  it("nimmt die Freitexte nicht mehr als Gemeinschaftseigentum", () => {
    expect(objektseiteFelder(rohdaten as never).gemeinschaftseigentum).toBeUndefined();
  });

  it("liest Ausweisart und Klasse, obwohl das Klassenfeld leer ist", () => {
    const f = objektseiteFelder(rohdaten as never);
    expect(f.energieausweis.art).toBe("Verbrauchsausweis");
    expect(f.energieausweis.klasse).toBe("C");
  });

  /*
   * Bis zum 23.09.2026 kam hier „inklusive“ aus dem Merkmal
   * „360°-Verwaltung“, und das Exposé schrieb „Leistungen der Verwaltung,
   * inklusive“. Die Verwaltung setzt jetzt `verwaltungAnzeige` nach Regel.
   */
  it("liefert als Verwaltung nur die Handangabe, nicht das Merkmal", () => {
    expect(objektseiteFelder(rohdaten as never).verwaltung).toBeUndefined();
  });

  /*
   * Die wichtigste Regel: Wer etwas eingetragen hat, hat den Einzelfall
   * angesehen und weiß mehr als die Sammelangabe aus der Schnittstelle.
   */
  it("lässt die Handpflege immer gewinnen", () => {
    const mitPflege = {
      meta: {
        ...rohdaten.meta,
        kurzbeschreibung: "Von Hand geschrieben",
        gemeinschaftseigentum: "Von Hand ergänzt",
        verwaltung: "WEG Musterverwaltung",
        energieausweis: { art: "Bedarfsausweis", klasse: "A" },
      },
    };
    const f = objektseiteFelder(mitPflege as never);
    expect(f.kurzbeschreibung).toBe("Von Hand geschrieben");
    expect(f.gemeinschaftseigentum).toBe("Von Hand ergänzt");
    expect(f.verwaltung).toBe("WEG Musterverwaltung");
    expect(f.energieausweis.art).toBe("Bedarfsausweis");
    expect(f.energieausweis.klasse).toBe("A");
  });

  /*
   * Standortargumente und Sanierungen bleiben bewusst leer. Für die Argumente
   * gibt es in Investagon keine Quelle, und die Sanierungen verlangen Jahr und
   * Betrag je Maßnahme. Beides aus Freitext zu erraten hieße, Zahlen zu
   * erfinden, die später in einem Exposé stehen.
   */
  it("erfindet weder Standortargumente noch Sanierungen", () => {
    const f = objektseiteFelder(rohdaten as never);
    expect(f.standortargumente).toEqual([]);
    expect(f.sanierungen).toEqual([]);
  });

  it("kommt ohne Investagon-Daten unverändert zurecht", () => {
    const f = objektseiteFelder({ meta: {} } as never);
    expect(f.kurzbeschreibung).toBeUndefined();
    expect(f.gemeinschaftseigentum).toBeUndefined();
    expect(f.verwaltung).toBeUndefined();
    expect(f.energieausweis.klasse).toBeUndefined();
  });
});

/*
 * Die Falle beim Speichern.
 *
 * Der Pflegedialog schreibt alle Felder auf einmal zurück. Las er die Anzeige
 * mit ihren Rückfällen, wurde aus dem Investagon-Text und der Energieklasse
 * beim ersten Speichern eine Handangabe, die kein Abgleich mehr überholt.
 */
describe("objektseiteHandwerte: Pflegedialog speichert nichts Abgeleitetes", () => {
  const investagonObjekt = {
    meta: {
      investagonSlug: "abc",
      anlageklasse: "WG-Wohnung",
      investagonRaw: {
        extras: [{ id: 1, value: "Dach und Fassade wurden bereits renoviert.", weight: 0 }],
        tags: ["4. 360°-Verwaltung: inklusive", "5. Energieeffizienzklasse: C"],
        energy_certificate_type: "consumption_certificate",
      },
      objekttexteKi: { sanierungen: [{ jahr: "2024", massnahme: "Dach", beleg: "x" }] },
    },
    globalDaten: { energieeffizienzklasse: "D" },
  };

  it("liest ohne jeden Rückfall", () => {
    const h = objektseiteHandwerte(investagonObjekt as never);
    expect(h.kurzbeschreibung).toBeUndefined();
    expect(h.gemeinschaftseigentum).toBeUndefined();
    expect(h.verwaltung).toBeUndefined();
    expect(h.energieausweis).toEqual({ art: undefined, kennwert: undefined, klasse: undefined, energietraeger: undefined, gueltigBis: undefined });
    expect(h.sanierungen).toEqual([]);
    expect(h.objektart).toBeUndefined();
  });

  it("schreibt beim unveränderten Speichern keinen abgeleiteten Wert nach meta", () => {
    const meta = objektseiteFelderInMeta(investagonObjekt.meta, objektseiteHandwerte(investagonObjekt as never));
    for (const schluessel of ["kurzbeschreibung", "gemeinschaftseigentum", "verwaltung", "energieausweis", "sanierungen", "objektart", "standortargumente"]) {
      expect(meta, schluessel).not.toHaveProperty(schluessel);
    }
    // Fremde Schlüssel bleiben unangetastet.
    expect(meta.investagonRaw).toBe(investagonObjekt.meta.investagonRaw);
    expect(meta.objekttexteKi).toBe(investagonObjekt.meta.objekttexteKi);
  });

  it("behält beim Speichern, was wirklich von Hand gepflegt ist", () => {
    const mitPflege = { ...investagonObjekt, meta: { ...investagonObjekt.meta, verwaltung: "Hausverwaltung Muster", energieausweis: { klasse: "B" } } };
    const meta = objektseiteFelderInMeta(mitPflege.meta, objektseiteHandwerte(mitPflege as never));
    expect(meta.verwaltung).toBe("Hausverwaltung Muster");
    expect(meta.energieausweis).toEqual({ klasse: "B" });
  });
});
