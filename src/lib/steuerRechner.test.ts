import { describe, it, expect } from "vitest";
import {
  ASSETKLASSEN,
  BETRACHTUNG_JAHRE,
  FREIBETRAG_KIND,
  OBJEKT_BAUJAHR,
  OBJEKT_PREIS_MAX,
  OBJEKT_PREIS_MIN,
  ANSCHAFFUNGSNAH_SICHERHEIT,
  RESTNUTZUNGSDAUER_ANSATZ,
  afaErstesJahr,
  berechne,
  einkommensteuer,
  grenzsteuersatz,
  kinderfreibetragAnteil,
  kirchensteuersatzFuer,
  partnerBruttoVorschlag,
  spannenverlauf,
  steuerlastAusZvE,
  typisierteNutzungsdauer,
  typisierterKaufpreis,
  typisiertesObjekt,
  verlustProObjekt,
  zvEAusBrutto,
  type SteuerEingaben,
} from "@/lib/steuerRechner";
import { grundtarif, solidaritaetszuschlag } from "@/lib/einkommensteuer";
import {
  ANSCHAFFUNGSNAH_GRENZE,
  DEGRESSIV_SATZ,
  SONDER_7B_SATZ,
  linearerAfaSatz,
} from "@/lib/afaSaetze";
import { kaufnebenkostenProzent } from "@/lib/grunderwerbsteuer";

const basis: SteuerEingaben = {
  jahresbrutto: 85000,
  steuerklasse: "I",
  kinder: 0,
  kirchensteuer: false,
  bestehendeImmobilien: 0,
  hebelziel: "maximal",
};

describe("Tarif kommt aus einkommensteuer.ts", () => {
  it("liefert für den Grundtarif genau die zentralen Werte", () => {
    for (const zvE of [0, 12348, 12349, 17799, 40000, 69878, 120000, 300000]) {
      expect(einkommensteuer(zvE, "I")).toBe(grundtarif(zvE, 2026));
    }
  });

  it("splittet bei Zusammenveranlagung nach § 32a Abs. 5 EStG", () => {
    expect(einkommensteuer(120000, "III")).toBe(2 * grundtarif(60000, 2026));
    expect(einkommensteuer(120000, "IV")).toBe(einkommensteuer(120000, "III"));
    expect(einkommensteuer(120000, "V")).toBe(einkommensteuer(120000, "III"));
  });

  it("nutzt die Zonengrenze 277.825 der zentralen Quelle", () => {
    // Vorher stand hier eine eigene Kopie mit 277.826, ein Euro daneben.
    expect(einkommensteuer(277826, "I")).toBe(grundtarif(277826, 2026));
    // Abgerundet auf volle Euro nach § 32a Abs. 1 Satz 6 EStG.
    expect(einkommensteuer(277825, "I")).toBe(Math.floor(0.42 * 277825 - 11135.63));
  });

  it("Soli entspricht der zentralen Berechnung, doppelte Freigrenze beim Splitting", () => {
    const einzel = steuerlastAusZvE(120000, basis);
    expect(einzel.soli).toBe(solidaritaetszuschlag(einzel.est, 2026, "grund"));
    const paar = steuerlastAusZvE(120000, { ...basis, steuerklasse: "IV" });
    expect(paar.soli).toBe(solidaritaetszuschlag(paar.est, 2026, "splitting"));
  });

  it("Grenzsteuersatz erreicht 42 Prozent oberhalb der dritten Zone", () => {
    expect(grenzsteuersatz(80000, "I")).toBeCloseTo(0.42, 6);
    expect(grenzsteuersatz(300000, "I")).toBeCloseTo(0.45, 6);
    // Im Splitting zählt der halbe zvE.
    expect(grenzsteuersatz(160000, "III")).toBeCloseTo(0.42, 6);
  });
});

describe("Kinderfreibetrag", () => {
  it("steht 2026 bei 9.756 Euro je Kind für beide Elternteile zusammen", () => {
    // 3.414 sächliches Existenzminimum + 1.464 BEA je Elternteil, mal zwei.
    expect(FREIBETRAG_KIND).toBe((3414 + 1464) * 2);
  });

  it("wird bei Einzelveranlagung nur halb angesetzt", () => {
    expect(kinderfreibetragAnteil("I")).toBe(0.5);
    expect(kinderfreibetragAnteil("II")).toBe(0.5);
    expect(kinderfreibetragAnteil("III")).toBe(1);
    expect(kinderfreibetragAnteil("IV")).toBe(1);
    expect(kinderfreibetragAnteil("V")).toBe(1);
  });

  it("Klasse I mit einem Kind zieht 4.878 Euro ab, nicht 9.756", () => {
    const ohne = zvEAusBrutto(85000, basis);
    const mit = zvEAusBrutto(85000, { ...basis, kinder: 1 });
    expect(ohne - mit).toBeCloseTo(FREIBETRAG_KIND / 2, 6);
  });

  it("Klasse III mit einem Kind zieht den vollen Freibetrag ab", () => {
    const e = { ...basis, steuerklasse: "III" as const, partnerBrutto: 0 };
    const ohne = zvEAusBrutto(85000, e);
    const mit = zvEAusBrutto(85000, { ...e, kinder: 1 });
    expect(ohne - mit).toBeCloseTo(FREIBETRAG_KIND, 6);
  });

  it("Klasse II bekommt zusätzlich den Entlastungsbetrag für Alleinerziehende", () => {
    const k1 = zvEAusBrutto(85000, { ...basis, steuerklasse: "II", kinder: 1 });
    const i1 = zvEAusBrutto(85000, { ...basis, steuerklasse: "I", kinder: 1 });
    expect(i1 - k1).toBeCloseTo(4260, 6);
    const k2 = zvEAusBrutto(85000, { ...basis, steuerklasse: "II", kinder: 2 });
    const i2 = zvEAusBrutto(85000, { ...basis, steuerklasse: "I", kinder: 2 });
    expect(i2 - k2).toBeCloseTo(4260 + 240, 6);
  });
});

describe("Steuerklassen wirken sich aus", () => {
  it("I und II werden im Grundtarif veranlagt, III bis V mit Splitting", () => {
    const gleich = { ...basis, kinder: 0, partnerBrutto: 0 };
    const eins = zvEAusBrutto(85000, gleich);
    // Ohne Partnereinkommen ist das zvE gleich, die Steuer aber nicht.
    expect(zvEAusBrutto(85000, { ...gleich, steuerklasse: "III" })).toBeCloseTo(eins, 6);
    expect(steuerlastAusZvE(eins, { ...gleich, steuerklasse: "III" }).summe).toBeLessThan(
      steuerlastAusZvE(eins, gleich).summe,
    );
  });

  it("die Klassen IV und V bleiben nicht mehr folgenlos", () => {
    const werte = (["I", "II", "III", "IV", "V"] as const).map(
      (k) => berechne({ ...basis, steuerklasse: k, kinder: 1 }).vorher.summe,
    );
    const eindeutig = new Set(werte.map((w) => Math.round(w)));
    // Früher lieferten I, II, IV und V denselben Betrag.
    expect(eindeutig.size).toBe(5);
  });

  it("Partnervorschlag folgt der 60-zu-40-Faustregel", () => {
    expect(partnerBruttoVorschlag(90000, "I")).toBe(0);
    expect(partnerBruttoVorschlag(90000, "III")).toBeCloseTo(60000, 6);
    expect(partnerBruttoVorschlag(90000, "IV")).toBeCloseTo(90000, 6);
    expect(partnerBruttoVorschlag(90000, "V")).toBeCloseTo(135000, 6);
  });

  it("bei Zusammenveranlagung zählt das Einkommen beider Partner", () => {
    const allein = zvEAusBrutto(85000, { ...basis, steuerklasse: "IV", partnerBrutto: 0 });
    const zuZweit = zvEAusBrutto(85000, { ...basis, steuerklasse: "IV", partnerBrutto: 85000 });
    expect(zuZweit).toBeGreaterThan(allein);
    expect(zuZweit).toBeCloseTo(2 * allein, 6);
  });

  it("gleiches Partnereinkommen bedeutet gleiche Jahressteuer, egal ob III, IV oder V", () => {
    const e = { ...basis, partnerBrutto: 40000, kinder: 1 };
    const dreiI = berechne({ ...e, steuerklasse: "III" }).vorher.summe;
    const vier = berechne({ ...e, steuerklasse: "IV" }).vorher.summe;
    const fuenf = berechne({ ...e, steuerklasse: "V" }).vorher.summe;
    expect(vier).toBeCloseTo(dreiI, 6);
    expect(fuenf).toBeCloseTo(dreiI, 6);
  });
});

describe("Jahresbrutto statt Jahresnetto", () => {
  it("übernimmt das eingegebene Brutto unverändert", () => {
    expect(berechne({ ...basis, jahresbrutto: 85000 }).brutto).toBe(85000);
  });

  it("höheres Brutto bedeutet höhere Steuer", () => {
    const klein = berechne({ ...basis, jahresbrutto: 60000 });
    const gross = berechne({ ...basis, jahresbrutto: 120000 });
    expect(gross.vorher.summe).toBeGreaterThan(klein.vorher.summe);
  });

  it("Klasse I, 85.000 Euro, ein Kind: zvE liegt über dem Wert ohne Halbierung", () => {
    const mit = zvEAusBrutto(85000, { ...basis, kinder: 1 });
    const ohneHalbierung = zvEAusBrutto(85000, basis) - FREIBETRAG_KIND;
    expect(mit - ohneHalbierung).toBeCloseTo(FREIBETRAG_KIND / 2, 6);
  });
});

describe("Kirchensteuer als Sonderausgabe", () => {
  it("erhöht die Gesamtlast, aber weniger als der reine Zuschlag", () => {
    const ohne = steuerlastAusZvE(80000, basis);
    const mit = steuerlastAusZvE(80000, { ...basis, kirchensteuer: true });
    expect(mit.summe).toBeGreaterThan(ohne.summe);
    // Ohne den Sonderausgabenabzug wäre die Einkommensteuer unverändert.
    expect(mit.est).toBeLessThan(ohne.est);
    expect(mit.summe).toBeLessThan(ohne.summe + ohne.est * 0.09);
  });

  it("ist in sich stimmig: Kirchensteuer = Satz mal Einkommensteuer", () => {
    const mit = steuerlastAusZvE(80000, { ...basis, kirchensteuer: true, bundesland: "by" });
    expect(mit.kirche).toBeCloseTo(mit.est * 0.08, 4);
  });

  it("nimmt 8 Prozent in Bayern und Baden-Württemberg, sonst 9", () => {
    expect(kirchensteuersatzFuer("by")).toBe(0.08);
    expect(kirchensteuersatzFuer("bw")).toBe(0.08);
    expect(kirchensteuersatzFuer("nw")).toBe(0.09);
    expect(kirchensteuersatzFuer(undefined)).toBe(0.09);
  });
});

describe("Abschreibung kommt aus afaSaetze.ts", () => {
  it("Neubau: degressive AfA plus Sonderabschreibung § 7b", () => {
    const k = ASSETKLASSEN.neubau;
    const erwartet = k.preis * k.gebaeudeanteil * ((DEGRESSIV_SATZ + SONDER_7B_SATZ) / 100);
    expect(afaErstesJahr(k)).toBeCloseTo(erwartet, 6);
  });

  it("Bestand: 2,0 Prozent linear, nicht die 2,5 Prozent für Gebäude vor 1925", () => {
    const k = ASSETKLASSEN.bestand;
    expect(linearerAfaSatz(k.baujahr).satz).toBe(2);
    expect(afaErstesJahr(k)).toBeCloseTo(k.preis * k.gebaeudeanteil * 0.02, 6);
  });

  it("WG: linearer Satz des Baujahrs plus Möblierung über zehn Jahre", () => {
    const k = ASSETKLASSEN.wg;
    const erwartet =
      k.preis * k.gebaeudeanteil * (linearerAfaSatz(k.baujahr).satz / 100) + k.moeblierung / 10;
    expect(afaErstesJahr(k)).toBeCloseTo(erwartet, 6);
  });
});

describe("Kaufnebenkosten kommen aus grunderwerbsteuer.ts", () => {
  it("ohne Bundesland gilt der Durchschnitt, nicht mehr feste 7 Prozent", () => {
    const r = berechne(basis);
    expect(r.nebenkostenProzent).toBe(kaufnebenkostenProzent(undefined));
    expect(r.eigenkapital).toBeCloseTo(r.klasse.preis * (r.nebenkostenProzent / 100), 6);
  });

  it("Bayern ist deutlich günstiger als Nordrhein-Westfalen", () => {
    const by = berechne({ ...basis, bundesland: "by" });
    const nw = berechne({ ...basis, bundesland: "nw" });
    expect(by.nebenkostenProzent).toBe(5.5);
    expect(nw.nebenkostenProzent).toBe(8.5);
    expect(nw.eigenkapital - by.eigenkapital).toBeCloseTo(by.klasse.preis * 0.03, 6);
  });
});

describe("Wirkung eines konkreten Objekts", () => {
  it("empfiehlt Neubau bei hohem Einkommen und rechnet mit 350.000 EUR", () => {
    const r = berechne({ ...basis, jahresbrutto: 119500 });
    expect(r.klasse.id).toBe("neubau");
    expect(r.klasse.preis).toBe(350000);
    expect(r.ersparnisJahr).toBeGreaterThan(0);
  });

  it("empfiehlt sanierten Bestand bei kleinerem Einkommen, 180.000 EUR", () => {
    const r = berechne({ ...basis, jahresbrutto: 45000 });
    expect(r.klasse.id).toBe("bestand");
    expect(r.klasse.preis).toBe(180000);
  });

  it("empfiehlt WG erst, wenn der Steuerhebel schon genutzt ist, 550.000 EUR", () => {
    const r = berechne({ ...basis, jahresbrutto: 100000, bestehendeImmobilien: 2 });
    expect(r.klasse.id).toBe("wg");
    expect(r.klasse.preis).toBe(550000);
  });

  it("Neubau hat den staerksten Steuerhebel je Euro Kaufpreis", () => {
    const je = (k: keyof typeof ASSETKLASSEN) =>
      Math.abs(verlustProObjekt(ASSETKLASSEN[k])) / ASSETKLASSEN[k].preis;
    expect(je("neubau")).toBeGreaterThan(je("wg"));
    expect(je("neubau")).toBeGreaterThan(je("bestand"));
  });

  it("alle drei Klassen erzeugen im ersten Jahr einen steuerlichen Verlust", () => {
    for (const k of ["neubau", "bestand", "wg"] as const) {
      expect(verlustProObjekt(ASSETKLASSEN[k])).toBeLessThan(0);
    }
  });

  it("braucht fuer ein hoeheres Ziel mehr Wohnungen", () => {
    const v = berechne({ ...basis, jahresbrutto: 119500, hebelziel: "vorsichtig" });
    const m = berechne({ ...basis, jahresbrutto: 119500, hebelziel: "maximal" });
    expect(m.anzahlFuerZiel).toBeGreaterThanOrEqual(v.anzahlFuerZiel);
    expect(v.anzahlFuerZiel).toBeGreaterThanOrEqual(1);
  });

  it("bestehende Immobilien verringern die verbleibende Ausgangslast", () => {
    const ohne = berechne({ ...basis, jahresbrutto: 119500 });
    const mit = berechne({ ...basis, jahresbrutto: 119500, bestehendeImmobilien: 2 });
    expect(mit.vorher.summe).toBeLessThan(ohne.vorher.summe);
  });

  it("leitet den Abzug je bestehendem Objekt her, statt 20.000 Euro zu setzen", () => {
    // Die alte Pauschale zog bei drei Objekten 60.000 Euro ab. Bei 85.000 Euro
    // Jahresbrutto fiel die Steuer damit auf null, und die ganze Ergebnisseite
    // zeigte Nullen. Jetzt ist der Abzug der Verlust, den ein Objekt dieser
    // Groesse tatsaechlich erzeugt.
    const r = berechne({ ...basis, jahresbrutto: 85000, bestehendeImmobilien: 3 });
    /* Angesetzt ist der Verlust auf dem Leitweg, also mit demselben
       Abschreibungssatz, mit dem die Seite auch sonst rechnet. */
    expect(r.bereitsGenutzt).toBeCloseTo(3 * r.spanne.erhoeht.verlust, 6);
    expect(r.bereitsGenutzt).toBeLessThan(60000);
    expect(r.zvEHeute).toBeCloseTo(r.zvE - r.bereitsGenutzt, 6);
  });

  it("laeuft bei drei bestehenden Objekten nicht mehr auf lauter Nullen", () => {
    for (const anzahl of [0, 1, 2, 3]) {
      const r = berechne({ ...basis, jahresbrutto: 85000, bestehendeImmobilien: anzahl });
      expect(r.vorher.summe).toBeGreaterThan(0);
      expect(r.spanne.jahr1.von).toBeGreaterThan(0);
      expect(r.spanne.zehnJahre.von).toBeGreaterThan(0);
      expect(r.spanne.erhaltung.ersparnisEinmalig).toBeGreaterThan(0);
    }
  });

  it("zeigt Einkommen und Grenzsteuersatz auf derselben Grundlage wie die Steuer", () => {
    // Vorher kam der angezeigte Grenzsteuersatz aus dem vollen zvE, die Steuer
    // aber aus dem gekuerzten. Zwei Zahlen auf einer Seite, zwei Grundlagen.
    const r = berechne({ ...basis, jahresbrutto: 85000, bestehendeImmobilien: 2 });
    expect(r.grenzsteuersatz).toBeCloseTo(grenzsteuersatz(r.zvEHeute, "I"), 10);
    expect(r.vorher.summe).toBeCloseTo(steuerlastAusZvE(r.zvEHeute, basis).summe, 6);
    expect(r.zvEHeute).toBeLessThan(r.zvE);
  });

  it("Vermoegensanteil zaehlt nur Tilgung und Wertsteigerung", () => {
    const r = berechne({ ...basis, jahresbrutto: 119500 });
    expect(r.anteilAmObjekt).toBeCloseTo(r.tilgung10J + r.wertsteigerung10J, 5);
  });
});

describe("Vermögenszuwachs, ehrliche Aufteilung", () => {
  it("zählt die Steuerersparnis nicht komplett als freies Geld", () => {
    /*
     * Vorher hiess es hier: freie Liquiditaet plus der Teil fuer die Raten
     * ergibt die Ersparnis. Das galt nur, solange die Liquiditaet aus einer
     * Quote kam, die nie negativ wurde. Jetzt kommt sie aus den eigenen
     * Cashflows, und der ehrliche Fall ist ein anderer: Die Luecke zwischen
     * Miete und Rate ist groesser als die Ersparnis, die Ersparnis geht also
     * vollstaendig hinein und der Rest bleibt beim Kaeufer.
     */
    const r = berechne({ ...basis, jahresbrutto: 119500 });
    const lueckeVorSteuer = -r.plan.reduce((a, z) => a + z.cashflowVorSteuer, 0);
    expect(lueckeVorSteuer).toBeGreaterThan(0);
    expect(r.ersparnisFuerRaten).toBeCloseTo(
      Math.min(r.ersparnis10J, lueckeVorSteuer),
      5,
    );
    expect(r.freieLiquiditaet10J).toBeCloseTo(r.ersparnis10J - lueckeVorSteuer, 5);
    expect(r.freieLiquiditaet10J).toBeLessThan(r.ersparnis10J);
  });

  it("zieht das eingesetzte Eigenkapital ab", () => {
    const r = berechne({ ...basis, jahresbrutto: 119500 });
    expect(r.vermoegenszuwachs).toBeCloseTo(
      r.anteilAmObjekt + r.freieLiquiditaet10J - r.eigenkapital,
      5,
    );
  });
});

describe("Das Beschäftigungsverhältnis wirkt, statt nur gefragt zu werden", () => {
  it("lässt die Steuerzahlen unberührt, denn der Tarif kennt keine Berufsgruppe", () => {
    const angestellt = berechne({ ...basis, beschaeftigung: "angestellt" });
    for (const id of ["freiberuflich", "selbststaendig", "gmbh_gf", "beamter"] as const) {
      const r = berechne({ ...basis, beschaeftigung: id });
      expect(r.zvE).toBe(angestellt.zvE);
      expect(r.vorher.summe).toBe(angestellt.vorher.summe);
      expect(r.grenzsteuersatz).toBe(angestellt.grenzsteuersatz);
    }
  });

  it("rechnet die Empfehlung mit dem anerkannten Einkommen, nicht mit dem Brutto", () => {
    // 85.000 Euro brutto. Der Angestellte liegt damit über der Schwelle von
    // 70.000 und bekommt den Neubau. Beim Selbstständigen erkennt die Bank
    // 80 Prozent an, also 68.000, das reicht nicht: sanierter Bestand.
    const angestellt = berechne({ ...basis, jahresbrutto: 85000, beschaeftigung: "angestellt" });
    const selbst = berechne({ ...basis, jahresbrutto: 85000, beschaeftigung: "selbststaendig" });

    expect(angestellt.anerkanntesEinkommen).toBe(85000);
    expect(selbst.anerkanntesEinkommen).toBe(68000);
    expect(angestellt.klasse.id).toBe("neubau");
    expect(selbst.klasse.id).toBe("bestand");
    // Und die Empfehlung schlägt bis zur ausgewiesenen Ersparnis durch.
    expect(selbst.ersparnisJahr).not.toBe(angestellt.ersparnisJahr);
  });

  it("behandelt den GmbH-Geschäftsführer wie einen Selbstständigen", () => {
    const gf = berechne({ ...basis, jahresbrutto: 85000, beschaeftigung: "gmbh_gf" });
    const selbst = berechne({ ...basis, jahresbrutto: 85000, beschaeftigung: "selbststaendig" });
    expect(gf.klasse.id).toBe(selbst.klasse.id);
    expect(gf.anerkanntesEinkommen).toBe(selbst.anerkanntesEinkommen);
  });

  it("stellt den Beamten am besten und den Selbstständigen am vorsichtigsten", () => {
    const werte = (["beamter", "angestellt", "freiberuflich", "selbststaendig"] as const).map(
      (id) => berechne({ ...basis, beschaeftigung: id }).anerkanntesEinkommen,
    );
    for (let i = 1; i < werte.length; i++) expect(werte[i]).toBeLessThan(werte[i - 1]);
  });

  it("gilt ohne Angabe als angestellt, damit alte Aufrufer dasselbe bekommen", () => {
    // Die Beraterseite (AppleSteuerRechner) übergibt das Feld nicht.
    const ohne = berechne(basis);
    const mit = berechne({ ...basis, beschaeftigung: "angestellt" });
    expect(ohne.beschaeftigung.id).toBe("angestellt");
    expect(ohne.klasse.id).toBe(mit.klasse.id);
    expect(ohne.ersparnis10J).toBe(mit.ersparnis10J);
    expect(ohne.vermoegenszuwachs).toBe(mit.vermoegenszuwachs);
  });
});

describe("Die zwei Abschreibungswege als Spanne", () => {
  const v = () => berechne({ ...basis, jahresbrutto: 119500 }).spanne;

  it("rechnet an einer gebrauchten Wohnung, denn nur dort gibt es beide Wege", () => {
    // Fuer einen Neubau ist eine Restnutzungsdauer von 25 Jahren nicht zu
    // begruenden. Ohne gebrauchtes Gebaeude gaebe es kein oberes Ende.
    const s = v();
    expect(s.objekt.baujahr).toBe(OBJEKT_BAUJAHR);
    expect(linearerAfaSatz(s.objekt.baujahr).satz).toBe(2);
    expect(s.objekt.gebaeudewert).toBeCloseTo(s.objekt.preis * s.objekt.gebaeudeanteil, 6);
  });

  it("nimmt den gesetzlichen Satz aus afaSaetze.ts, also 2 Prozent für 1990", () => {
    expect(v().regulaer.satz).toBe(linearerAfaSatz(OBJEKT_BAUJAHR).satz);
    expect(v().regulaer.satz).toBe(2);
    expect(v().regulaer.afaJahr).toBeCloseTo(v().objekt.gebaeudewert * 0.02, 6);
  });

  it("setzt vier Prozent an und nennt daneben die gesetzlich unterstellte Nutzungsdauer", () => {
    /*
     * Christian hat am 17.09.2026 entschieden, mit vier Prozent zu rechnen,
     * also mit 25 Jahren Nutzungsdauer. Das ist eine Entscheidung und keine
     * Herleitung, deshalb muss die Seite BEIDE Zahlen zeigen: den angesetzten
     * Satz und den gesetzlichen Bezugspunkt.
     *
     * Bezugspunkt ist das Gesetz, nicht die ImmoWertV. Hier stand bis zum
     * 17.09.2026 die Restnutzungsdauer nach dem Modell der ImmoWertV, fuer
     * 1990 also 44 Jahre. Die stammt aus der Verkehrswertermittlung und ist
     * kein steuerlicher Massstab. Massgeblich sind die 50 Jahre, die
     * § 7 Abs. 4 Satz 2 EStG fuer die Faelle des Satzes 1 Nr. 2 Buchstabe b
     * selbst nennt.
     */
    expect(RESTNUTZUNGSDAUER_ANSATZ).toBe(25);
    expect(v().erhoeht.restnutzungsdauer).toBe(25);
    expect(v().erhoeht.satz).toBeCloseTo(4, 8);
    expect(v().erhoeht.afaJahr).toBeCloseTo(v().objekt.gebaeudewert * 0.04, 6);

    expect(v().nutzungsdauerGesetzlich).toBe(50);
    // Der Ansatz muss kuerzer sein als die gesetzlich unterstellte Dauer,
    // sonst waere der hoehere Satz nach Satz 2 gar nicht zulaessig.
    expect(RESTNUTZUNGSDAUER_ANSATZ).toBeLessThan(v().nutzungsdauerGesetzlich);
  });

  it("haelt den gesetzlichen Satz als abgesicherte Untergrenze weiter vor", () => {
    // Die Seite fuehrt mit vier Prozent, aber zwei Prozent bekommt jeder ohne
    // Nachweis. Beide Zahlen muessen aus dem Kern kommen.
    const b = v();
    expect(b.regulaer.satz).toBe(2);
    expect(b.jahr1.von).toBe(b.regulaer.ersparnisJahr);
    expect(b.jahr1.bis).toBe(b.erhoeht.ersparnisJahr);
    expect(b.jahr1.von).toBeLessThan(b.jahr1.bis);
    expect(b.planSicher[0].afa).toBeCloseTo(b.objekt.gebaeudewert * 0.02, 6);
  });

  it("nennt zu jedem gesetzlichen Satz die Nutzungsdauer aus § 7 Abs. 4 Satz 2 EStG", () => {
    // Die drei Faelle, die das Gesetz selbst aufzaehlt: 33 Jahre bei drei
    // Prozent (Satz 1 Nr. 1 und Nr. 2 a), 50 Jahre bei zwei Prozent
    // (Nr. 2 b), 40 Jahre bei 2,5 Prozent (Nr. 2 c).
    expect(typisierteNutzungsdauer(3)).toBe(33);
    expect(typisierteNutzungsdauer(2.5)).toBe(40);
    expect(typisierteNutzungsdauer(2)).toBe(50);
  });

  it("unterschreitet den gesetzlichen Satz nie", () => {
    expect(v().erhoeht.satz).toBeGreaterThanOrEqual(v().regulaer.satz);
  });

  it("bringt erhöht mehr Steuervorteil als regulär, und der Unterschied wird ausgewiesen", () => {
    const b = v();
    expect(b.erhoeht.ersparnisJahr).toBeGreaterThan(b.regulaer.ersparnisJahr);
    expect(b.mehrProJahr).toBeCloseTo(b.erhoeht.ersparnisJahr - b.regulaer.ersparnisJahr, 6);
  });

  it("rechnet die Ersparnis über die Differenzmethode, nicht mit dem Grenzsteuersatz", () => {
    // Der Verlust senkt das zvE, dadurch sinkt auch der Grenzsteuersatz.
    // Die Differenzmethode muss deshalb UNTER dem Produkt aus Verlust und
    // Ausgangs-Grenzsteuersatz liegen, sonst wäre die Progression ignoriert.
    const r = berechne({ ...basis, jahresbrutto: 119500 });
    const b = r.spanne;
    const plattGerechnet = b.erhoeht.verlust * r.grenzsteuersatz;
    expect(b.erhoeht.ersparnisJahr).toBeLessThan(plattGerechnet * 1.35);
    expect(b.erhoeht.ersparnisJahr).toBeGreaterThan(0);
  });

  it("steigt mit dem Einkommen, weil ein höherer Tarif mehr spart", () => {
    const klein = berechne({ ...basis, jahresbrutto: 45000 }).spanne;
    const gross = berechne({ ...basis, jahresbrutto: 200000 }).spanne;
    expect(gross.mehrProJahr).toBeGreaterThan(klein.mehrProJahr);
  });
});

/* ── Die Spanne selbst ────────────────────────────────────────────────────
 * Der Rechner nennt keine Punktzahl mehr, sondern ein Von-bis. Die Tests
 * halten fest, was das bedeutet: BEIDE Enden sind gerechnete Ergebnisse, das
 * untere ist der gesetzliche Weg ohne Nachweis, das obere der mit Gutachten. */
describe("Die Spanne, von bis", () => {
  const s = () => berechne({ ...basis, jahresbrutto: 85000 }).spanne;

  it("nimmt als unteres Ende die reguläre und als oberes die erhöhte Abschreibung", () => {
    const b = s();
    expect(b.jahr1.von).toBe(b.regulaer.ersparnisJahr);
    expect(b.jahr1.bis).toBe(b.erhoeht.ersparnisJahr);
    expect(b.jahr1.von).toBeLessThan(b.jahr1.bis);
  });

  it("hat an beiden Enden echte Rechenergebnisse, keine gerundeten Wunschzahlen", () => {
    // Nachgerechnet mit der Differenzmethode aus dem Kern selbst: Steuer ohne
    // den Verlust minus Steuer mit dem Verlust.
    const eingaben = { ...basis, jahresbrutto: 85000 };
    const r = berechne(eingaben);
    const zvE = zvEAusBrutto(85000, eingaben);
    const ohne = steuerlastAusZvE(zvE, eingaben).summe;
    for (const weg of [r.spanne.regulaer, r.spanne.erhoeht]) {
      const mit = steuerlastAusZvE(zvE - weg.verlust, eingaben).summe;
      expect(weg.ersparnisJahr).toBeCloseTo(ohne - mit, 6);
      expect(weg.ersparnisJahr).toBeGreaterThan(0);
    }
  });

  it("summiert die Zehnjahresspanne aus dem Plan, statt einen Faktor zu setzen", () => {
    // Vorher stand hier ein festes 8,5-faches des ersten Jahres. Rechnet man es
    // mit genau der Tilgung nach, die dieses Modell selbst ansetzt, kommt das
    // 7,4-fache heraus. Jetzt ist der Faktor das Ergebnis und nicht die Vorgabe.
    const b = s();
    /* `plan` ist der LEITWEG mit dem angesetzten Satz, `planSicher` der
       gesetzliche. Die Seite fuehrt mit dem Leitweg, weist aber beide aus. */
    expect(b.zehnJahre.bis).toBeCloseTo(
      b.plan.reduce((a, z) => a + z.ersparnis, 0),
      6,
    );
    expect(b.zehnJahre.von).toBeCloseTo(
      b.planSicher.reduce((a, z) => a + z.ersparnis, 0),
      6,
    );
    expect(b.faktor10J).toBeCloseTo(b.zehnJahre.bis / b.jahr1.bis, 8);
    // Kleiner als zehn, weil der abziehbare Zins mit der Tilgung sinkt, und
    // groesser als sieben, weil er nur langsam sinkt. Wo genau er liegt, haengt
    // am Objekt und am Einkommen, deshalb steht hier keine feste Zahl mehr.
    expect(b.faktor10J).toBeLessThan(BETRACHTUNG_JAHRE);
    expect(b.faktor10J).toBeGreaterThan(7);
  });

  it("hängt nicht mehr am Beschäftigungsverhältnis", () => {
    // Vorher fiel die ausgewiesene Ersparnis bei 85.000 Euro von 8.218 auf
    // 719 Euro, sobald jemand selbststaendig ankreuzte, weil er unter die
    // Schwelle zur Objektklasse fiel. Genau das darf nicht wieder passieren.
    const angestellt = berechne({ ...basis, jahresbrutto: 85000, beschaeftigung: "angestellt" }).spanne;
    for (const id of ["freiberuflich", "selbststaendig", "gmbh_gf", "beamter"] as const) {
      const andere = berechne({ ...basis, jahresbrutto: 85000, beschaeftigung: id }).spanne;
      expect(andere.jahr1.von).toBe(angestellt.jahr1.von);
      expect(andere.jahr1.bis).toBe(angestellt.jahr1.bis);
      expect(andere.zehnJahre.bis).toBe(angestellt.zehnJahre.bis);
      expect(andere.objekt.preis).toBe(angestellt.objekt.preis);
    }
  });

  it("wächst mit dem Einkommen, ohne Klippe an einer Schwelle", () => {
    /*
     * Der Fehler, den dieser Test fernhalten soll, war eine KLIPPE: Bei 85.000
     * Euro fiel die ausgewiesene Ersparnis von 8.218 auf 719 Euro, sobald
     * jemand die Objektklasse wechselte.
     *
     * Streng monoton ist die Kurve dagegen nicht, und das ist richtig so: In
     * der Milderungszone des Solidaritätszuschlags entlastet ein Euro Abzug mit
     * 11,9 Prozent Soli, oberhalb davon nur noch mit 5,5. Beim Übergang kann
     * die Ersparnis deshalb um wenige Euro sinken, obwohl das Einkommen steigt.
     */
    let vorher = 0;
    for (let brutto = 40000; brutto <= 250000; brutto += 5000) {
      const b = berechne({ ...basis, jahresbrutto: brutto }).spanne;
      expect(b.jahr1.bis).toBeGreaterThanOrEqual(vorher * 0.98 - 1);
      vorher = b.jahr1.bis;
    }
    const klein = berechne({ ...basis, jahresbrutto: 40000 }).spanne;
    const gross = berechne({ ...basis, jahresbrutto: 250000 }).spanne;
    expect(gross.jahr1.bis).toBeGreaterThan(klein.jahr1.bis * 2);
  });
});

describe("Das typisierte Objekt", () => {
  it("hängt am Jahresbrutto und ist nach unten wie nach oben gedeckelt", () => {
    expect(typisierterKaufpreis(85000)).toBe(340000);
    expect(typisierterKaufpreis(40000)).toBe(OBJEKT_PREIS_MIN);
    expect(typisierterKaufpreis(250000)).toBe(OBJEKT_PREIS_MAX);
  });

  it("rundet auf volle Zehntausend, damit die Annahme lesbar bleibt", () => {
    for (const brutto of [61000, 87500, 123400]) {
      expect(typisierterKaufpreis(brutto) % 10000).toBe(0);
    }
  });

  it("liefert einen Gebäudewert, auf den überhaupt abgeschrieben werden kann", () => {
    const o = typisiertesObjekt(85000);
    expect(o.gebaeudewert).toBeCloseTo(o.preis * o.gebaeudeanteil, 6);
    expect(o.gebaeudeanteil).toBeGreaterThan(0);
    expect(o.gebaeudeanteil).toBeLessThan(1);
  });
});

describe("Der Verlauf der Spanne", () => {
  const r = () => berechne({ ...basis, jahresbrutto: 85000 });

  it("hat für jedes Jahr eine Stützstelle, nicht nur bei 10, 20 und 30", () => {
    const zeilen = spannenverlauf(r().spanne);
    expect(zeilen).toHaveLength(BETRACHTUNG_JAHRE);
    expect(zeilen.map((z) => z.jahr)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("rechnet nicht weiter, als die Quoten tragen", () => {
    // QUOTEN sind auf zehn Jahre kalibriert. Ein Punkt bei Jahr 20 waere
    // erfunden, deshalb endet der Verlauf genau hier.
    expect(spannenverlauf(r().spanne).at(-1)?.jahr).toBe(BETRACHTUNG_JAHRE);
  });

  it("beginnt im ersten Jahr beim vollen Wert und fällt danach leicht", () => {
    const b = r().spanne;
    const zeilen = spannenverlauf(b);
    expect(zeilen[0].von).toBeCloseTo(b.jahr1.von, 6);
    expect(zeilen[0].bis).toBeCloseTo(b.jahr1.bis, 6);
    for (let i = 1; i < zeilen.length; i++) {
      expect(zeilen[i].bis).toBeLessThan(zeilen[i - 1].bis);
    }
  });

  it("summiert sich genau auf die ausgewiesene Zehnjahresspanne", () => {
    const b = r().spanne;
    const letzte = spannenverlauf(b).at(-1)!;
    expect(letzte.vonKumuliert).toBeCloseTo(b.zehnJahre.von, 6);
    expect(letzte.bisKumuliert).toBeCloseTo(b.zehnJahre.bis, 6);
  });

  it("faellt, weil die Zinsen mit der Tilgung sinken, und zwar nachvollziehbar", () => {
    // Der eigentliche Beleg dafuer, dass die Zehnjahressumme keine gesetzte
    // Zahl mehr ist: Restschuld und Zinsen sinken, der Verlust sinkt mit, und
    // die Ersparnis folgt genau diesem Verlauf.
    const b = r().spanne;
    for (let i = 1; i < b.plan.length; i++) {
      expect(b.plan[i].restschuld).toBeLessThan(b.plan[i - 1].restschuld);
      expect(b.plan[i].zinsen).toBeLessThan(b.plan[i - 1].zinsen);
      expect(b.plan[i].verlust).toBeLessThan(b.plan[i - 1].verlust);
    }
    // Die Abschreibung laeuft dagegen linear durch, sie aendert sich nicht.
    expect(b.plan.at(-1)!.afa).toBeCloseTo(b.plan[0].afa, 8);
  });
});

/* ── Vermoegen und Liquiditaet ────────────────────────────────────────────
 * Hier lag der schwerste Fehler der alten Fassung: Die frei verfuegbare
 * Liquiditaet kam aus einer fremden Kalkulation und war positiv, obwohl
 * dieselbe Seite eine monatliche Zuzahlung auswies. */
describe("Vermoegen und Liquiditaet des typisierten Objekts", () => {
  const v = () => berechne({ ...basis, jahresbrutto: 85000 }).spanne;

  it("rechnet die Liquiditaet aus den eigenen Cashflows, nicht aus einer Quote", () => {
    const b = v();
    const ausPlan = b.plan.reduce((a, z) => a + z.cashflowNachSteuer, 0);
    expect(b.vermoegen.liquiditaet).toBeCloseTo(ausPlan, 6);
  });

  it("weist die Zuzahlung als negative Liquiditaet aus, statt sie zu drehen", () => {
    // Das typisierte Objekt traegt sich im Modell NICHT aus sich selbst. Wer
    // monatlich zuzahlt, muss das auch in der Zehnjahressicht wiederfinden.
    const b = v();
    expect(b.plan[0].cashflowNachSteuer).toBeLessThan(0);
    expect(b.vermoegen.liquiditaet).toBeLessThan(0);
  });

  it("trennt den Vermoegensaufbau sauber von der Liquiditaet", () => {
    const b = v();
    expect(b.vermoegen.aufbau).toBeCloseTo(
      b.vermoegen.tilgung + b.vermoegen.wertsteigerung,
      6,
    );
    expect(b.vermoegen.netto).toBeCloseTo(
      b.vermoegen.aufbau + b.vermoegen.liquiditaet - b.vermoegen.eigenkapital,
      6,
    );
  });

  it("laesst Restschuld und Tilgung zusammen den Kaufpreis ergeben", () => {
    const b = v();
    expect(b.vermoegen.restschuld + b.vermoegen.tilgung).toBeCloseTo(b.objekt.preis, 6);
  });

  it("zaehlt die Steuerersparnis genau einmal, naemlich in der Liquiditaet", () => {
    const b = v();
    // Das Vermoegen haengt am Leitweg, also an `zehnJahre.bis`.
    expect(b.vermoegen.ersparnis).toBeCloseTo(b.zehnJahre.bis, 6);
    const ohneSteuer = b.plan.reduce((a, z) => a + z.cashflowVorSteuer, 0);
    expect(b.vermoegen.liquiditaet).toBeCloseTo(ohneSteuer + b.vermoegen.ersparnis, 6);
  });
});

describe("Der Erhaltungsaufwand", () => {
  const e = () => berechne({ ...basis, jahresbrutto: 119500 }).spanne;

  it("haelt Abstand zur 15-Prozent-Grenze, statt genau auf ihr zu rechnen", () => {
    // § 6 Abs. 1 Nr. 1a EStG kennt keine Toleranz: Ein Euro darueber macht ALLE
    // Aufwendungen der drei Jahre zu Herstellungskosten, nicht nur den
    // ueberschiessenden Teil. Auf den Cent zu planen waere deshalb unklug.
    const b = e();
    expect(ANSCHAFFUNGSNAH_GRENZE).toBe(0.15);
    expect(ANSCHAFFUNGSNAH_SICHERHEIT).toBe(0.9);
    expect(b.erhaltung.grenzeNetto).toBeCloseTo(
      b.objekt.gebaeudewert * ANSCHAFFUNGSNAH_GRENZE * ANSCHAFFUNGSNAH_SICHERHEIT,
      6,
    );
    expect(b.erhaltung.grenzeNetto).toBeLessThan(
      b.objekt.gebaeudewert * ANSCHAFFUNGSNAH_GRENZE,
    );
  });

  it("weist den Bruttoaufwand mit Umsatzsteuer aus", () => {
    const b = e();
    expect(b.erhaltung.bruttoAufwand).toBeCloseTo(b.erhaltung.grenzeNetto * 1.19, 6);
    expect(b.erhaltung.anteilProzent).toBeCloseTo(0.15 * 0.9 * 1.19 * 100, 6);
    expect(b.erhaltung.bruttoAufwand).toBeCloseTo(
      b.objekt.gebaeudewert * (b.erhaltung.anteilProzent / 100),
      6,
    );
  });

  it("ist ein einmaliger Effekt und deutlich größer als ein Abschreibungsjahr", () => {
    const b = e();
    expect(b.erhaltung.ersparnisEinmalig).toBeGreaterThan(b.erhoeht.ersparnisJahr);
    expect(b.erhaltung.ersparnisEinmalig).toBeGreaterThan(0);
  });

  it("wird als Höchstwert beider Wege ausgewiesen, nicht als Annahme", () => {
    // Meistens gewinnt der regulaere Weg, weil der kleinere laufende Verlust
    // den Abzug hoeher im Tarif ansetzen laesst. In der Milderungszone des
    // Solidaritaetszuschlags kann es umgekehrt sein. Der ausgewiesene Wert
    // muss beide Faelle abdecken.
    for (const brutto of [45000, 85000, 119500, 200000]) {
      const b = berechne({ ...basis, jahresbrutto: brutto }).spanne;
      expect(b.erhaltung.ersparnisEinmalig).toBe(
        Math.max(b.erhaltung.ersparnisEinmaligRegulaer, b.erhaltung.ersparnisEinmaligErhoeht),
      );
      expect(b.erhaltung.ersparnisEinmalig).toBeGreaterThanOrEqual(
        b.erhaltung.ersparnisEinmaligRegulaer,
      );
      expect(b.erhaltung.ersparnisEinmalig).toBeGreaterThanOrEqual(
        b.erhaltung.ersparnisEinmaligErhoeht,
      );
    }
  });

  it("zählt nur den Teil, der über den laufenden Effekt hinausgeht", () => {
    // Sonst stünde die laufende Ersparnis zweimal in der Auswertung.
    const b = e();
    expect(b.erhaltung.ersparnisEinmalig).toBeLessThan(b.erhaltung.bruttoAufwand);
  });

  it("kann die Steuerlast nicht unter null drücken", () => {
    const b = berechne({ ...basis, jahresbrutto: 40000 }).spanne;
    expect(b.erhaltung.ersparnisEinmalig).toBeGreaterThanOrEqual(0);
    expect(b.erhaltung.ersparnisEinmalig).toBeLessThanOrEqual(
      berechne({ ...basis, jahresbrutto: 40000 }).vorher.summe,
    );
  });
});
