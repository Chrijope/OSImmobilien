import { describe, it, expect } from "vitest";
import {
  berechneExpose,
  businessCase,
  laufzeitAusTilgung,
  monatsrechnung,
  monatsuebersicht,
  tilgungAusLaufzeit,
  vermoegensaufbauNachJahren,
  STANDARD_GEBAEUDEANTEIL_PROZENT,
  type ExposeAnnahmen,
  type ExposeObjektdaten,
  type Monatsposten,
} from "@/lib/exposeRechner";
import {
  annahmenAusSelbstauskunft,
  eigenkapitalProzentAusBetrag,
  standardAnnahmen,
  STANDARD_ANNAHMEN,
} from "@/lib/exposeAnnahmen";

/**
 * Nachrechnung der Vorlage (Exposé Söflinger Straße 203, WE 7, Ulm) aus
 * scratchpad/dom/expose.txt: Kaufpreis 246.800, Stellplatz 12.000,
 * Gesamtinvestition 258.800, 0 % Eigenkapital, Zins 4,3 %, Tilgung 1 %,
 * Miete 863, Rücklage 52, Bewirtschaftung 52, Steigerungen 2 %, 42 %
 * Grenzsteuersatz, Sanierung 100.000 mal 7,10 % Miteigentumsanteil.
 *
 * Was die Vorlage belegt: Finanzierung 1.143 = 258.800 mal 5,3 % durch 12,
 * Immobilienwert 309.290 = 258.800 mal 1,02 hoch 9 (2026 bis 2035, also
 * neun Wachstumsjahre unter der Überschrift „10 Jahre"), Restschuld 230.443,
 * einmalige Steuerersparnis 2.982 = 7.100 mal 42 %.
 *
 * Seit dem 30.09.2026 laufen die Kaufnebenkosten auf die Gesamtinvestition
 * ohne den Sanierungsanteil (258.800 − 7.100 = 251.700), und der als
 * Erhaltungsaufwand abgezogene Anteil verlässt die AfA-Grundlage. Die Werte
 * weichen dadurch bewusst weiter von der Vorlage ab, die beides nicht kennt.
 */
const VORLAGE_OBJEKT: ExposeObjektdaten = {
  kaufpreis: 246800,
  stellplatzpreis: 12000,
  wohnflaeche: 65,
  kaltmieteMonat: 863,
  hausgeldGesamtMonat: 250,
  hausgeldNichtUmlegbarMonat: 52,
  ruecklageMonat: 52,
  mietverwaltungMonat: 0,
  bundeslandId: "bw",
  baujahr: 1954,
  sanierungskostenGesamt: 100000,
  miteigentumsanteilProzent: 7.1,
  sanierungFertigstellungJahr: 2027,
};

const VORLAGE_ANNAHMEN: ExposeAnnahmen = {
  ...standardAnnahmen(2026),
  instandhaltungsart: "erhaltungsaufwand",
  instandhaltungJahre: 1,
  grenzsteuersatzManuellProzent: 42,
};

const vorlage = () => berechneExpose(VORLAGE_OBJEKT, VORLAGE_ANNAHMEN);

describe("Standardannahmen", () => {
  it("entsprechen der Vorlage: Zins 4,3, Tilgung 1, Steigerungen 2, AfA 2", () => {
    expect(STANDARD_ANNAHMEN.zinsProzent).toBe(4.3);
    expect(STANDARD_ANNAHMEN.tilgungProzent).toBe(1);
    expect(STANDARD_ANNAHMEN.mietsteigerungProzent).toBe(2);
    expect(STANDARD_ANNAHMEN.kostensteigerungProzent).toBe(2);
    expect(STANDARD_ANNAHMEN.wertsteigerungProzent).toBe(2);
    expect(STANDARD_ANNAHMEN.afaProzent).toBe(2);
    expect(STANDARD_ANNAHMEN.eigenkapitalProzent).toBe(0);
    const a = standardAnnahmen(2026);
    expect(a.startjahr).toBe(2026);
    expect(a.betrachtungsjahr).toBe(2026);
  });
});

describe("Vorlage nachgerechnet", () => {
  it("Kaufpreisblock: Gesamtinvestition 258.800, Darlehen gleich Gesamtinvestition, Eigenkapitaleinsatz gleich Nebenkosten", () => {
    const e = vorlage();
    expect(e.kauf.gesamtinvestition).toBe(258800);
    expect(e.kauf.darlehen).toBe(258800);
    expect(e.kauf.finanzierungsquoteProzent).toBe(100);
    expect(e.kauf.eigenkapitalInvestition).toBe(0);
    expect(e.kauf.eigenkapitaleinsatz).toBeCloseTo(e.kauf.nebenkosten.summe, 6);
  });

  it("Nebenkosten Baden-Württemberg: 5 % Grunderwerbsteuer plus Notar und Grundbuch nach GNotKG (Vorlage 17.380 mit 1,5 % Notarpauschale)", () => {
    const e = vorlage();
    const nk = e.kauf.nebenkosten;
    expect(nk.quelle).toBe("bundesland");
    expect(nk.grunderwerbsteuerProzent).toBeCloseTo(5, 6);
    // Seit dem 30.09.2026 ohne den Sanierungsanteil von 7.100.
    expect(nk.basis).toBeCloseTo(251700, 6);
    expect(nk.grunderwerbsteuer).toBeCloseTo(251700 * 0.05, 6);
    // Gebührentabelle B: Kaufvertrag (Geschäftswert 251.700) und Grundschuld je in der Stufe bis 260.000 (535 Euro je Satz 1,0).
    expect(nk.gebuehren.notarBrutto).toBeCloseTo(2140 * 1.19, 6);
    expect(nk.gebuehren.grundbuchSumme).toBe(1337.5);
    expect(nk.notarGrundbuch).toBeCloseTo(3884.1, 6);
    expect(nk.notarGrundbuchProzent).toBeCloseTo(1.5, 1);
    expect(nk.prozentGesamt).toBeCloseTo(6.5, 1);
    // Die Vorlage kommt auf 17.380, weil sie den Notar mit 1,5 % pauschal ansetzt und die
    // Grunderwerbsteuer nur auf den Kaufpreis ohne Stellplatz rechnet.
    expect(nk.summe).toBeCloseTo(12585 + 3884.1, 6);
  });

  it("Finanzierung 1.143 je Monat = 258.800 mal 5,3 % durch 12", () => {
    const e = vorlage();
    expect(e.finanzierung.monatsrate).toBeCloseTo(1143, 0);
    expect(e.monat.zinsUndTilgung).toBeCloseTo(1143, 0);
    expect(e.monat.ausgaben).toBeCloseTo(1247, 0);
  });

  it("Immobilienwert nach neun Wachstumsjahren 309.290 = 258.800 mal 1,02 hoch 9", () => {
    const h = vermoegensaufbauNachJahren(vorlage(), 9);
    expect(h.immobilienwert).toBeCloseTo(309290, 0);
    expect(h.kaufpreisHeute).toBe(258800);
  });

  it("Restschuld nach neun Jahren mit monatlicher Annuität 230.420 (Vorlage 230.443)", () => {
    const h = vermoegensaufbauNachJahren(vorlage(), 9);
    expect(Math.abs(h.restschuld - 230443)).toBeLessThan(30);
    expect(h.ertragBeiVerkauf).toBeCloseTo(h.immobilienwert - h.restschuld, 6);
  });

  it("Einmalige Steuerersparnis der Sanierung 2.982 = 100.000 mal 7,10 % mal 42 %", () => {
    const e = vorlage();
    expect(e.steuer.sanierungsanteil).toBeCloseTo(7100, 6);
    expect(e.steuer.sanierungAbJahr).toBe(2027);
    expect(e.steuer.einmaligeSteuerersparnisSanierung).toBeCloseTo(2982, 0);
    // Der Erhaltungsaufwand steht im Jahr der Fertigstellung und nur dort.
    expect(e.jahresreihe[0].erhaltungsaufwand).toBe(0);
    expect(e.jahresreihe[1].erhaltungsaufwand).toBeCloseTo(7100, 6);
    expect(e.jahresreihe[2].erhaltungsaufwand).toBe(0);
    // Monatsrechnung und Vermögensaufbau rechnen ohne diesen Einmaleffekt.
    expect(e.jahresreihe[1].steuerwirkung - e.jahresreihe[1].steuerwirkungOhneSanierung).toBeCloseTo(2982, 0);
    expect(e.jahresreihe[1].cashflow).toBeCloseTo(
      e.jahresreihe[1].mieteNetto - e.jahresreihe[1].rate - e.jahresreihe[1].hausgeldNichtUmlegbar
        - e.jahresreihe[1].ruecklage - e.jahresreihe[1].mietverwaltung + e.jahresreihe[1].steuerwirkungOhneSanierung,
      6,
    );
  });

  it("Steuervorteil mit 42 % flach: Verlust aus Miete minus Zinsen, AfA und Bewirtschaftung (Vorlage 199, hier 196)", () => {
    const e = vorlage();
    const j = e.jahresreihe[0];
    // Zinsen des ersten Jahres aus dem monatlichen Plan, AfA 2 % auf 80 % der Anschaffungskosten
    // ohne den Sanierungsanteil, der als Erhaltungsaufwand abgezogen wird (seit dem 30.09.2026).
    expect(e.steuer.afaBasis).toBeCloseTo(e.kauf.anschaffungskosten * 0.8 - 7100, 6);
    expect(j.werbungskosten).toBeCloseTo(j.zinsen + e.steuer.afaJahr + 52 * 12, 6);
    expect(j.ergebnisVermietung).toBeCloseTo(863 * 12 - j.werbungskosten, 6);
    expect(j.steuerwirkung).toBeCloseTo(-j.ergebnisVermietung * 0.42, 6);
    expect(e.monat.steuervorteil).toBeCloseTo(j.steuerwirkung / 12, 6);
    // Mit den Gebühren nach Tabelle statt 2 % Pauschale ist die AfA-Grundlage etwas kleiner. Seit dem
    // 30.09.2026 fehlen ihr zusätzlich der Sanierungsanteil und die Nebenkosten darauf: 196 statt 201.
    expect(Math.round(e.monat.steuervorteil)).toBe(196);
    expect(Math.round(e.monat.eigenanteil)).toBe(188);
  });

  it("Vermögensaufbau: Faktor je Euro und Eigenkapitalrendite folgen den Formeln der Vorlage", () => {
    const e = vorlage();
    const h = vermoegensaufbauNachJahren(e, 10);
    expect(h.vermoegen).toBeCloseTo(h.ertragBeiVerkauf + h.kumCashflow, 6);
    expect(h.faktorJeEuro).toBeCloseTo(h.vermoegen / e.kauf.eigenkapitaleinsatz, 6);
    expect(h.eigenkapitalrenditeProzent).toBeCloseTo((Math.pow(h.faktorJeEuro as number, 1 / 10) - 1) * 100, 6);
    expect(e.vermoegensaufbau.map((v) => v.jahre)).toEqual([10, 20, 30, 40]);
    expect(e.vermoegensaufbau[0]).toEqual(h);
  });
});

describe("Kaufpreisblock und Nebenkosten", () => {
  const objekt: ExposeObjektdaten = { kaufpreis: 232000, stellplatzpreis: 9500, kaltmieteMonat: 790, bundeslandId: "by" };

  it("Bayern: 3,5 % Grunderwerbsteuer plus 3.884 Notar und Grundbuch nach Tabelle von 241.500 sind 12.337 (Mockup mit 2 % Pauschale: 13.282)", () => {
    const e = berechneExpose(objekt, standardAnnahmen(2026));
    expect(e.kauf.gesamtinvestition).toBe(241500);
    expect(e.kauf.nebenkosten.grunderwerbsteuer).toBeCloseTo(241500 * 0.035, 6);
    expect(e.kauf.nebenkosten.notarGrundbuch).toBeCloseTo(3884.1, 6);
    expect(e.kauf.nebenkosten.prozentGesamt).toBeCloseTo(5.108, 3);
    expect(e.kauf.nebenkosten.summe).toBeCloseTo(12336.6, 6);
    expect(e.kauf.nebenkosten.bundeslandName).toBe("Bayern");
  });

  it("Grundschuld nur auf das Bankdarlehen: mit Eigenkapital sinken Notar und Grundbuch", () => {
    const voll = berechneExpose(objekt, standardAnnahmen(2026));
    const ek = berechneExpose(objekt, { ...standardAnnahmen(2026), eigenkapitalProzent: 20 });
    expect(ek.kauf.nebenkosten.gebuehren.grundschuldbetrag).toBeCloseTo(241500 * 0.8, 6);
    expect(ek.kauf.nebenkosten.notarGrundbuch).toBeLessThan(voll.kauf.nebenkosten.notarGrundbuch);
    const bar = berechneExpose(objekt, { ...standardAnnahmen(2026), eigenkapitalProzent: 100 });
    expect(bar.kauf.nebenkosten.gebuehren.zeileGrundschuld).toBe(0);
  });

  it("Makler erhöht Nebenkosten und Eigenkapitaleinsatz, nicht das Darlehen", () => {
    const ohne = berechneExpose(objekt, standardAnnahmen(2026));
    const mit = berechneExpose(objekt, { ...standardAnnahmen(2026), maklerProzent: 3.57 });
    expect(mit.kauf.nebenkosten.makler).toBeCloseTo(241500 * 0.0357, 6);
    expect(mit.kauf.nebenkosten.summe - ohne.kauf.nebenkosten.summe).toBeCloseTo(mit.kauf.nebenkosten.makler, 6);
    expect(mit.kauf.eigenkapitaleinsatz - ohne.kauf.eigenkapitaleinsatz).toBeCloseTo(mit.kauf.nebenkosten.makler, 6);
    expect(mit.kauf.darlehen).toBe(ohne.kauf.darlehen);
  });

  it("am Objekt gepflegter Prozentsatz geht vor dem Bundesland, Gebühren nach Tabelle, der Rest ist Grunderwerbsteuer", () => {
    const e = berechneExpose({ ...objekt, kaufnebenkostenProzent: 6.5 }, standardAnnahmen(2026));
    expect(e.kauf.nebenkosten.quelle).toBe("manuell");
    expect(e.kauf.nebenkosten.prozentGesamt).toBeCloseTo(6.5, 6);
    expect(e.kauf.nebenkosten.summe).toBeCloseTo(241500 * 0.065, 6);
    expect(e.kauf.nebenkosten.notarGrundbuch).toBeCloseTo(3884.1, 6);
    expect(e.kauf.nebenkosten.grunderwerbsteuer).toBeCloseTo(241500 * 0.065 - 3884.1, 6);
  });

  it("ohne Bundesland gilt der Mittelwert mit Hinweis", () => {
    const e = berechneExpose({ ...objekt, bundeslandId: null }, standardAnnahmen(2026));
    expect(e.kauf.nebenkosten.quelle).toBe("mittelwert");
    expect(e.kauf.nebenkosten.grunderwerbsteuerProzent).toBeGreaterThan(3.5);
    expect(e.kauf.nebenkosten.grunderwerbsteuerProzent).toBeLessThan(6.5);
    expect(e.hinweise.some((h) => h.includes("Bundesland unbekannt"))).toBe(true);
  });

  it("Preisanpassung minus 5 % verschiebt Kaufpreis, Gesamtinvestition, Nebenkosten und Darlehen", () => {
    const e = berechneExpose(objekt, { ...standardAnnahmen(2026), preisanpassungProzent: -5 });
    expect(e.kauf.kaufpreis).toBe(232000);
    expect(e.kauf.kaufpreisAngepasst).toBeCloseTo(220400, 6);
    expect(e.kauf.gesamtinvestition).toBeCloseTo(229900, 6);
    // 229.900 liegt in der Gebührenstufe bis 230.000 (485 Euro je Satz 1,0), eine Stufe unter 241.500.
    expect(e.kauf.nebenkosten.grunderwerbsteuer).toBeCloseTo(229900 * 0.035, 6);
    expect(e.kauf.nebenkosten.notarGrundbuch).toBeCloseTo(1940 * 1.19 + 1212.5, 6);
    expect(e.kauf.darlehen).toBeCloseTo(229900, 6);
  });

  it("Rendite ist Jahreskaltmiete der Wohnung durch Kaufpreis der Wohnung, ohne Stellplatz (M20, 04.10.2026)", () => {
    const e = berechneExpose(objekt, standardAnnahmen(2026));
    expect(e.kennzahlen.jahreskaltmiete).toBe(790 * 12);
    expect(e.kennzahlen.mietrenditeProzent).toBeCloseTo((790 * 12) / 232000 * 100, 6);
    expect(e.kennzahlen.mietrenditeProzent).toBeCloseTo(4.09, 2);
    // Die Vorlage teilte durch Wohnung plus Stellplatz (4,0 %), jetzt nur durch die Wohnung.
    expect(vorlage().kennzahlen.mietrenditeProzent).toBeCloseTo((863 * 12) / 246800 * 100, 6);
  });

  it("die Stellplatzmiete zählt für die Mietrendite nicht mit", () => {
    const e = berechneExpose({ ...objekt, kaltmieteMonat: 850, stellplatzMieteMonat: 60 }, standardAnnahmen(2026));
    expect(e.kennzahlen.jahreskaltmiete).toBe(850 * 12);
    expect(e.kennzahlen.mietrenditeProzent).toBeCloseTo((790 * 12) / 232000 * 100, 6);
  });

  it("Kennzahlen je Quadratmeter und umlegbares Hausgeld", () => {
    const e = berechneExpose(
      { ...objekt, wohnflaeche: 61.4, hausgeldGesamtMonat: 185, hausgeldNichtUmlegbarMonat: 45, ruecklageMonat: 45 },
      standardAnnahmen(2026),
    );
    expect(e.kennzahlen.preisJeQm).toBeCloseTo(232000 / 61.4, 6);
    expect(e.kennzahlen.mieteJeQm).toBeCloseTo(790 / 61.4, 6);
    expect(e.kennzahlen.hausgeldUmlegbarMonat).toBeCloseTo(95, 6);
    const ohneFlaeche = berechneExpose(objekt, standardAnnahmen(2026));
    expect(ohneFlaeche.kennzahlen.preisJeQm).toBeNull();
  });
});

describe("Finanzierung und Tilgungsplan", () => {
  it("0 % Eigenkapital: Darlehen gleich Gesamtinvestition, Eigenkapitaleinsatz gleich Nebenkosten", () => {
    const e = berechneExpose(VORLAGE_OBJEKT, { ...VORLAGE_ANNAHMEN, eigenkapitalProzent: 0 });
    expect(e.kauf.darlehen).toBe(e.kauf.gesamtinvestition);
    expect(e.kauf.eigenkapitaleinsatz).toBeCloseTo(e.kauf.nebenkosten.summe, 6);
  });

  it("100 % Eigenkapital: kein Darlehen, keine Rate, keine Zinsen, Eigenkapitalrendite trotzdem bestimmbar", () => {
    const e = berechneExpose(VORLAGE_OBJEKT, { ...VORLAGE_ANNAHMEN, eigenkapitalProzent: 100 });
    expect(e.kauf.darlehen).toBe(0);
    expect(e.kauf.eigenkapitaleinsatz).toBeCloseTo(e.kauf.gesamtinvestition + e.kauf.nebenkosten.summe, 6);
    expect(e.finanzierung.monatsrate).toBe(0);
    expect(e.finanzierung.volltilgungImJahr).toBeNull();
    expect(e.jahresreihe[0].zinsen).toBe(0);
    expect(e.jahresreihe[0].restschuldEnde).toBe(0);
    expect(e.monat.zinsUndTilgung).toBe(0);
    // Ohne Zinsen bleibt aus der Vermietung ein Überschuss, die Steuer wird zur Mehrsteuer.
    expect(e.jahresreihe[0].ergebnisVermietung).toBeGreaterThan(0);
    expect(e.jahresreihe[0].steuerwirkung).toBeLessThan(0);
    const h = vermoegensaufbauNachJahren(e, 10);
    expect(h.restschuld).toBe(0);
    expect(h.eigenkapitalrenditeProzent).not.toBeNull();
    expect(h.eigenkapitalrenditeProzent as number).toBeGreaterThan(0);
  });

  it("20 % Eigenkapital senkt Darlehen und Rate", () => {
    const e = berechneExpose(VORLAGE_OBJEKT, { ...VORLAGE_ANNAHMEN, eigenkapitalProzent: 20 });
    expect(e.kauf.darlehen).toBeCloseTo(258800 * 0.8, 6);
    expect(e.kauf.eigenkapitalInvestition).toBeCloseTo(258800 * 0.2, 6);
    expect(e.finanzierung.monatsrate).toBeCloseTo((258800 * 0.8 * 0.053) / 12, 6);
  });

  it("Tilgungsplan: Zinsen sinken, Tilgung steigt, Tilgungssumme plus Restschuld ergibt das Darlehen", () => {
    const e = vorlage();
    const plan = e.finanzierung.tilgungsplan;
    expect(plan).toHaveLength(40);
    expect(plan[0].kalenderjahr).toBe(2026);
    // Bis zur Volltilgung sinken die Zinsen und steigt die Tilgung, das letzte Jahr tilgt nur den Rest.
    for (let i = 1; i < plan.length && plan[i].restschuldEnde > 0; i++) {
      expect(plan[i].zinsen).toBeLessThan(plan[i - 1].zinsen);
      expect(plan[i].tilgung).toBeGreaterThan(plan[i - 1].tilgung);
    }
    expect(e.finanzierung.volltilgungImJahr).toBe(2026 + plan.findIndex((z) => z.restschuldEnde === 0));
    const tilgungSumme = plan.reduce((s, z) => s + z.tilgung, 0);
    expect(tilgungSumme + plan[plan.length - 1].restschuldEnde).toBeCloseTo(258800, 4);
    expect(plan[0].rate).toBeCloseTo(e.finanzierung.jahresannuitaet, 6);
  });

  it("Volltilgung: Zins 0 und Tilgung 10 % tilgen in zehn Jahren, danach keine Rate mehr", () => {
    const e = berechneExpose(VORLAGE_OBJEKT, { ...VORLAGE_ANNAHMEN, zinsProzent: 0, tilgungProzent: 10, haltedauerJahre: 15 });
    expect(e.finanzierung.volltilgungImJahr).toBe(2035);
    expect(e.jahresreihe[9].restschuldEnde).toBeCloseTo(0, 6);
    expect(e.jahresreihe[10].rate).toBe(0);
    expect(e.vermoegensaufbau.map((v) => v.jahre)).toEqual([10]);
  });

  it("Haltedauer wird auf 1 bis 60 Jahre begrenzt", () => {
    expect(berechneExpose(VORLAGE_OBJEKT, { ...VORLAGE_ANNAHMEN, haltedauerJahre: 0 }).jahresreihe).toHaveLength(1);
    expect(berechneExpose(VORLAGE_OBJEKT, { ...VORLAGE_ANNAHMEN, haltedauerJahre: 99 }).jahresreihe).toHaveLength(60);
  });

  it("Tilgungsmodus: Zins 4,3 und Tilgung 1 laufen rund 39 Jahre, die Laufzeit wird mitgeliefert", () => {
    const e = vorlage();
    expect(e.finanzierung.tilgungsmodus).toBe("tilgung");
    expect(e.finanzierung.laufzeitJahre).toBeCloseTo(38.85, 1);
    expect(laufzeitAusTilgung(4.3, 1)).toBeCloseTo(38.85, 1);
    expect(laufzeitAusTilgung(0, 5)).toBe(20);
    expect(laufzeitAusTilgung(4.3, 0)).toBeNull();
    expect(e.finanzierung.bankdarlehen).toBe(258800);
    expect(e.finanzierung.bankMonatsrate).toBeCloseTo(e.finanzierung.monatsrate, 6);
    expect(e.finanzierung.zweitesDarlehen).toBeNull();
  });

  it("Laufzeitmodus: 30 Jahre bei 4,3 % ergeben 1,64 % Tilgung und Volltilgung im dreißigsten Jahr", () => {
    const e = berechneExpose(VORLAGE_OBJEKT, { ...VORLAGE_ANNAHMEN, tilgungsmodus: "laufzeit", laufzeitJahre: 30, tilgungProzent: 1 });
    expect(e.finanzierung.tilgungsmodus).toBe("laufzeit");
    expect(e.finanzierung.laufzeitJahre).toBe(30);
    expect(e.finanzierung.tilgungProzent).toBeCloseTo(tilgungAusLaufzeit(4.3, 30), 6);
    expect(e.finanzierung.tilgungProzent).toBeCloseTo(1.64, 2);
    expect(e.finanzierung.volltilgungImJahr).toBe(2055);
    expect(e.jahresreihe[28].restschuldEnde).toBeGreaterThan(0);
    expect(e.jahresreihe[29].restschuldEnde).toBe(0);
    expect(e.finanzierung.monatsrate).toBeGreaterThan(vorlage().finanzierung.monatsrate);
    expect(tilgungAusLaufzeit(0, 25)).toBe(4);
  });

  it("Zweites Darlehen als Teil des Bankdarlehens (KfW): eigene Rate, Summe der Restschulden, Zinsen beider Darlehen abziehbar", () => {
    const ohne = vorlage();
    const mit = berechneExpose(VORLAGE_OBJEKT, {
      ...VORLAGE_ANNAHMEN, zweitesDarlehenAktiv: true, zweitesDarlehenBetrag: 50000, zweitesDarlehenZinsProzent: 2, zweitesDarlehenTilgungProzent: 3,
    });
    expect(mit.kauf.darlehen).toBe(258800);
    expect(mit.kauf.eigenkapitaleinsatz).toBeCloseTo(ohne.kauf.eigenkapitaleinsatz, 6);
    expect(mit.finanzierung.bankdarlehen).toBe(208800);
    expect(mit.finanzierung.zweitesDarlehen?.betrag).toBe(50000);
    expect(mit.finanzierung.zweitesDarlehen?.monatsrate).toBeCloseTo((50000 * 0.05) / 12, 6);
    expect(mit.finanzierung.bankMonatsrate).toBeCloseTo((208800 * 0.053) / 12, 6);
    expect(mit.finanzierung.monatsrate).toBeCloseTo(mit.finanzierung.bankMonatsrate + (mit.finanzierung.zweitesDarlehen?.monatsrate ?? 0), 6);
    // Das günstigere zweite Darlehen tilgt schneller: geringere Rate und geringere Restschuld nach zehn Jahren.
    expect(mit.finanzierung.monatsrate).toBeLessThan(ohne.finanzierung.monatsrate);
    expect(mit.jahresreihe[9].restschuldEnde).toBeLessThan(ohne.jahresreihe[9].restschuldEnde);
    expect(mit.jahresreihe[0].zinsen).toBeCloseTo(
      (mit.finanzierung.tilgungsplan[0].zinsen), 6,
    );
    expect(mit.jahresreihe[0].zinsen).toBeLessThan(ohne.jahresreihe[0].zinsen);
    // Der Betrag ist auf das Bankdarlehen begrenzt.
    const zuViel = berechneExpose(VORLAGE_OBJEKT, { ...VORLAGE_ANNAHMEN, zweitesDarlehenAktiv: true, zweitesDarlehenBetrag: 999999 });
    expect(zuViel.finanzierung.zweitesDarlehen?.betrag).toBe(258800);
    expect(zuViel.finanzierung.bankdarlehen).toBe(0);
    expect(zuViel.hinweise.some((h) => h.includes("begrenzt"))).toBe(true);
    // Ausgeschaltet oder ohne Betrag bleibt alles wie ohne.
    expect(berechneExpose(VORLAGE_OBJEKT, { ...VORLAGE_ANNAHMEN, zweitesDarlehenAktiv: false, zweitesDarlehenBetrag: 50000 }).finanzierung.zweitesDarlehen).toBeNull();
  });

  it("Zweites Darlehen als Eigenkapitalersatz: finanziert die Nebenkosten, Finanzierungsquote über 100 %", () => {
    const e = berechneExpose(VORLAGE_OBJEKT, {
      ...VORLAGE_ANNAHMEN, zweitesDarlehenAktiv: true, zweitesDarlehenBetrag: 50000, zweitesDarlehenErsetzt: "eigenkapital",
    });
    const nebenkosten = e.kauf.nebenkosten.summe;
    expect(e.finanzierung.zweitesDarlehen?.betrag).toBeCloseTo(nebenkosten, 6);
    expect(e.kauf.eigenkapitaleinsatz).toBe(0);
    expect(e.kauf.darlehen).toBeCloseTo(258800 + nebenkosten, 6);
    expect(e.finanzierung.bankdarlehen).toBe(258800);
    expect(e.kauf.finanzierungsquoteProzent).toBeGreaterThan(100);
    const h = vermoegensaufbauNachJahren(e, 10);
    expect(h.eigenkapitalrenditeProzent).toBeNull();
  });
});

describe("Verkäufer übernimmt die Nebenkosten", () => {
  it("Eigeninvestition 0 bei Vollfinanzierung, Nebenkosten bleiben ausgewiesen, AfA-Grundlage ohne Nebenkosten", () => {
    const e = berechneExpose(VORLAGE_OBJEKT, { ...VORLAGE_ANNAHMEN, nebenkostenTraegtVerkaeufer: true });
    expect(e.kauf.nebenkostenTraegtVerkaeufer).toBe(true);
    expect(e.kauf.nebenkosten.summe).toBeCloseTo(vorlage().kauf.nebenkosten.summe, 6);
    expect(e.kauf.nebenkostenKunde).toBe(0);
    expect(e.kauf.eigenkapitaleinsatz).toBe(0);
    expect(e.kauf.anschaffungskosten).toBe(258800);
    expect(e.steuer.afaBasis).toBeCloseTo(258800 * 0.8 - 7100, 6);
    expect(e.hinweise.some((h) => h.includes("Verkäufer"))).toBe(true);
    const mitEk = berechneExpose(VORLAGE_OBJEKT, { ...VORLAGE_ANNAHMEN, nebenkostenTraegtVerkaeufer: true, eigenkapitalProzent: 10 });
    expect(mitEk.kauf.eigenkapitaleinsatz).toBeCloseTo(25880, 6);
  });
});

describe("Kennzahlen für den Kapitalanleger", () => {
  it("Nettomietrendite zieht nicht umlegbare Kosten ab und teilt durch die Anschaffungskosten", () => {
    const e = vorlage();
    const nichtUmlegbar = (52 + 52) * 12;
    expect(e.kennzahlen.nettomietrenditeProzent).toBeCloseTo(((863 * 12 - nichtUmlegbar) / e.kauf.anschaffungskosten) * 100, 6);
    expect(e.kennzahlen.nettomietrenditeProzent).toBeLessThan(e.kennzahlen.mietrenditeProzent);
  });

  it("Break-even ist das erste Jahr ohne Zuzahlung, null wenn es nie kommt", () => {
    const e = vorlage();
    const erstes = e.jahresreihe.find((j) => j.cashflow >= 0);
    expect(e.kennzahlen.breakEvenJahr).toBe(erstes?.kalenderjahr ?? null);
    expect(e.kennzahlen.breakEvenJahr).toBe(2064);
    const nie = berechneExpose(VORLAGE_OBJEKT, { ...VORLAGE_ANNAHMEN, haltedauerJahre: 5 });
    expect(nie.kennzahlen.breakEvenJahr).toBeNull();
  });

  it("ausstehende Mieterhöhung gilt ab ihrem Monat, im Übergangsjahr anteilig", () => {
    const e = berechneExpose({ ...VORLAGE_OBJEKT, mieterhoehungAb: "2027-04-01", mieterhoehungKaltmieteMonat: 900 }, VORLAGE_ANNAHMEN);
    expect(e.jahresreihe[0].mieteBrutto).toBeCloseTo(863 * 12, 6);
    expect(e.jahresreihe[1].mieteBrutto).toBeCloseTo((863 * 3 + 900 * 9) * 1.02, 6);
    expect(e.jahresreihe[2].mieteBrutto).toBeCloseTo(900 * 12 * 1.02 * 1.02, 6);
    expect(e.hinweise).toContain("Mieterhöhung ab 04/2027 berücksichtigt.");
    // Kennzahlen bleiben bei der heutigen Miete.
    expect(e.kennzahlen.jahreskaltmiete).toBe(863 * 12);
    // Eine Erhöhung vor dem Startjahr steckt schon in der Kaltmiete und wird nicht doppelt gerechnet.
    const alt = berechneExpose({ ...VORLAGE_OBJEKT, mieterhoehungAb: "2020-01-01", mieterhoehungKaltmieteMonat: 900 }, VORLAGE_ANNAHMEN);
    expect(alt.jahresreihe[1].mieteBrutto).toBeCloseTo(863 * 12 * 1.02, 6);
  });
});

describe("Steuerwirkung", () => {
  it("nach Tarif: Grenzsteuersatz aus einkommensteuer.ts, Differenzmethode statt flachem Satz", () => {
    const e = berechneExpose(VORLAGE_OBJEKT, { ...VORLAGE_ANNAHMEN, grenzsteuersatzManuellProzent: null });
    expect(e.steuer.grenzsteuersatzManuell).toBe(false);
    expect(e.steuer.steuerjahr).toBe(2026);
    expect(e.steuer.grenzsteuersatzProzent).toBeCloseTo(38.6, 1);
    const j = e.jahresreihe[0];
    // Differenzmethode: Ersparnis liegt unter Verlust mal Grenzsatz, weil der Satz nach unten sinkt.
    expect(j.steuerwirkung).toBeGreaterThan(0);
    expect(j.steuerwirkung).toBeLessThan(-j.ergebnisVermietung * 0.386);
    expect(j.steuerwirkung).toBeGreaterThan(-j.ergebnisVermietung * 0.3);
  });

  it("Splitting: verheiratet senkt den Grenzsteuersatz und damit den Steuervorteil", () => {
    const grund = berechneExpose(VORLAGE_OBJEKT, { ...VORLAGE_ANNAHMEN, grenzsteuersatzManuellProzent: null, verheiratet: false });
    const splitting = berechneExpose(VORLAGE_OBJEKT, { ...VORLAGE_ANNAHMEN, grenzsteuersatzManuellProzent: null, verheiratet: true });
    expect(splitting.steuer.veranlagung).toBe("splitting");
    expect(splitting.steuer.grenzsteuersatzProzent).toBeLessThan(grund.steuer.grenzsteuersatzProzent);
    expect(splitting.jahresreihe[0].steuerwirkung).toBeLessThan(grund.jahresreihe[0].steuerwirkung);
    expect(splitting.monat.eigenanteil).toBeGreaterThan(grund.monat.eigenanteil);
  });

  it("ohne Einkommen und ohne manuellen Satz keine Steuerwirkung, mit Hinweis", () => {
    const e = berechneExpose(VORLAGE_OBJEKT, { ...VORLAGE_ANNAHMEN, grenzsteuersatzManuellProzent: null, zvE: 0 });
    expect(e.jahresreihe.every((j) => j.steuerwirkung === 0)).toBe(true);
    expect(e.steuer.einmaligeSteuerersparnisSanierung).toBe(0);
    expect(e.hinweise.some((h) => h.includes("Kein zu versteuerndes Einkommen"))).toBe(true);
  });

  it("AfA: Gebäudeanteil vom Objekt geht vor dem Standardwert", () => {
    const standard = vorlage();
    expect(standard.steuer.gebaeudeanteilAngenommen).toBe(true);
    expect(standard.steuer.gebaeudeanteilProzent).toBe(STANDARD_GEBAEUDEANTEIL_PROZENT);
    const gepflegt = berechneExpose({ ...VORLAGE_OBJEKT, gebaeudeanteilProzent: 70 }, VORLAGE_ANNAHMEN);
    expect(gepflegt.steuer.gebaeudeanteilAngenommen).toBe(false);
    expect(gepflegt.steuer.afaBasis).toBeCloseTo(gepflegt.kauf.anschaffungskosten * 0.7 - 7100, 6);
    expect(gepflegt.steuer.afaJahr).toBeCloseTo(gepflegt.steuer.afaBasis * 0.02, 6);
  });

  it("Sonder-AfA nach § 7b: nur in den ersten vier Jahren, mit Wohnfläche und innerhalb der Grenzen", () => {
    const ohne = berechneExpose(VORLAGE_OBJEKT, { ...VORLAGE_ANNAHMEN, sonderAfa: false });
    const mit = berechneExpose(VORLAGE_OBJEKT, { ...VORLAGE_ANNAHMEN, sonderAfa: true });
    expect(ohne.steuer.sonderAfaAktiv).toBe(false);
    expect(ohne.jahresreihe[0].sonderAfa).toBe(0);
    expect(mit.steuer.sonderAfaAktiv).toBe(true);
    expect(mit.steuer.sonderAfaProzent).toBe(5);
    expect(mit.steuer.sonderAfaJahre).toBe(4);
    expect(mit.steuer.sonderAfaJahr).toBeCloseTo(mit.steuer.sonderAfaBasis * 0.05, 6);
    expect(mit.jahresreihe[3].sonderAfa).toBeCloseTo(mit.steuer.sonderAfaJahr, 6);
    expect(mit.jahresreihe[4].sonderAfa).toBe(0);
    expect(mit.jahresreihe[0].steuerwirkung).toBeGreaterThan(ohne.jahresreihe[0].steuerwirkung);
    expect(mit.jahresreihe[4].steuerwirkung).toBeCloseTo(ohne.jahresreihe[4].steuerwirkung, 6);
  });

  it("Sonder-AfA ohne Wohnfläche wird nicht angesetzt und erklärt", () => {
    const e = berechneExpose({ ...VORLAGE_OBJEKT, wohnflaeche: null }, { ...VORLAGE_ANNAHMEN, sonderAfa: true });
    expect(e.steuer.sonderAfaAktiv).toBe(false);
    expect(e.steuer.sonderAfaHinweis).toContain("nicht angesetzt");
  });

  it("erhöhte AfA auf den Sanierungsanteil mit eigenem Satz und eigener Dauer", () => {
    const e = berechneExpose(
      { ...VORLAGE_OBJEKT, sonderAfaBasis: "sanierungsanteil", sonderAfaProzent: 9, sonderAfaJahre: 8 },
      { ...VORLAGE_ANNAHMEN, sonderAfa: true },
    );
    expect(e.steuer.sonderAfaBasis).toBeCloseTo(7100, 6);
    expect(e.steuer.sonderAfaJahr).toBeCloseTo(639, 6);
    expect(e.jahresreihe[7].sonderAfa).toBeCloseTo(639, 6);
    expect(e.jahresreihe[8].sonderAfa).toBe(0);
  });

  it("Erhaltungsaufwand auf zwei Jahre verteilt", () => {
    const e = berechneExpose(VORLAGE_OBJEKT, { ...VORLAGE_ANNAHMEN, instandhaltungJahre: 2 });
    expect(e.jahresreihe[1].erhaltungsaufwand).toBeCloseTo(3550, 6);
    expect(e.jahresreihe[2].erhaltungsaufwand).toBeCloseTo(3550, 6);
    expect(e.jahresreihe[3].erhaltungsaufwand).toBe(0);
    expect(e.steuer.einmaligeSteuerersparnisSanierung).toBeCloseTo(2982, 0);
  });

  it("Werkvertrag: Sanierungsanteil bleibt einmal in der AfA-Grundlage, keine einmalige Ersparnis", () => {
    const e = berechneExpose(VORLAGE_OBJEKT, { ...VORLAGE_ANNAHMEN, instandhaltungsart: "werkvertrag" });
    // Er steckt schon im Kaufpreis; bis zum 30.09.2026 kam er hier ein zweites Mal obendrauf.
    expect(e.steuer.afaBasis).toBeCloseTo(e.kauf.anschaffungskosten * 0.8, 6);
    expect(e.jahresreihe.every((j) => j.erhaltungsaufwand === 0)).toBe(true);
    expect(e.steuer.einmaligeSteuerersparnisSanierung).toBe(0);
  });

  it("direkter Sanierungsanteil geht vor Kosten mal Miteigentumsanteil", () => {
    const e = berechneExpose({ ...VORLAGE_OBJEKT, sanierungsanteilEuro: 5000 }, VORLAGE_ANNAHMEN);
    expect(e.steuer.sanierungsanteil).toBe(5000);
  });

  it("ohne Lohnsteuerermäßigung kommt die Erstattung im Folgejahr", () => {
    const sofort = vorlage();
    const spaeter = berechneExpose(VORLAGE_OBJEKT, { ...VORLAGE_ANNAHMEN, lohnsteuerermaessigung: false });
    expect(spaeter.jahresreihe[0].steuerwirkungZahlungswirksam).toBe(0);
    expect(spaeter.jahresreihe[1].steuerwirkungZahlungswirksam).toBeCloseTo(sofort.jahresreihe[0].steuerwirkungOhneSanierung, 6);
    expect(spaeter.monat.steuervorteil).toBe(0);
    expect(spaeter.monat.eigenanteil).toBeGreaterThan(sofort.monat.eigenanteil);
  });
});

describe("Jahresreihe und Monatsrechnung", () => {
  it("Leerstand 10 % mindert die Miete und erhöht den Eigenanteil", () => {
    const ohne = vorlage();
    const mit = berechneExpose(VORLAGE_OBJEKT, { ...VORLAGE_ANNAHMEN, leerstandProzent: 10 });
    expect(mit.jahresreihe[0].leerstand).toBeCloseTo(863 * 12 * 0.1, 6);
    expect(mit.jahresreihe[0].mieteNetto).toBeCloseTo(863 * 12 * 0.9, 6);
    expect(mit.monat.leerstand).toBeCloseTo(86.3, 6);
    expect(mit.monat.eigenanteil).toBeGreaterThan(ohne.monat.eigenanteil);
    expect(mit.monat.eigenanteil - ohne.monat.eigenanteil).toBeLessThan(86.3);
  });

  it("Mietgarantie setzt den Leerstand in den garantierten Jahren aus", () => {
    const e = berechneExpose({ ...VORLAGE_OBJEKT, mietgarantieJahre: 2 }, { ...VORLAGE_ANNAHMEN, leerstandProzent: 10 });
    expect(e.jahresreihe[0].leerstand).toBe(0);
    expect(e.jahresreihe[1].leerstand).toBe(0);
    expect(e.jahresreihe[2].leerstand).toBeGreaterThan(0);
  });

  it("Miete und Kosten wachsen mit den Steigerungssätzen, der Wert mit der Wertentwicklung", () => {
    const e = vorlage();
    expect(e.jahresreihe[4].mieteBrutto).toBeCloseTo(863 * 12 * Math.pow(1.02, 4), 6);
    expect(e.jahresreihe[4].ruecklage).toBeCloseTo(52 * 12 * Math.pow(1.02, 4), 6);
    expect(e.jahresreihe[4].immobilienwertEnde).toBeCloseTo(258800 * Math.pow(1.02, 5), 6);
    expect(e.jahresreihe[4].kalenderjahr).toBe(2030);
  });

  it("Betrachtungsjahr wählt die Monatsrechnung, außerhalb der Haltedauer wird begrenzt", () => {
    const e = berechneExpose(VORLAGE_OBJEKT, { ...VORLAGE_ANNAHMEN, betrachtungsjahr: 2030 });
    expect(e.monat.kalenderjahr).toBe(2030);
    expect(e.monat.miete).toBeCloseTo(863 * Math.pow(1.02, 4), 6);
    expect(e.monat.eigenanteil).toBeCloseTo(e.jahresreihe[4].eigenanteilMonat, 6);
    expect(e.monat.eigenanteil).toBeCloseTo(e.monat.ausgaben - e.monat.einnahmen, 6);
    const spaet = berechneExpose(VORLAGE_OBJEKT, { ...VORLAGE_ANNAHMEN, betrachtungsjahr: 2099 });
    expect(spaet.monat.kalenderjahr).toBe(2065);
  });

  it("Mietverwaltung lässt sich aus den Ausgaben nehmen", () => {
    const objekt = { ...VORLAGE_OBJEKT, mietverwaltungMonat: 30 };
    const mit = berechneExpose(objekt, VORLAGE_ANNAHMEN);
    const ohne = berechneExpose(objekt, { ...VORLAGE_ANNAHMEN, mietverwaltungEinrechnen: false });
    expect(mit.monat.mietverwaltung).toBeCloseTo(30, 6);
    expect(ohne.monat.mietverwaltung).toBe(0);
    expect(mit.jahresreihe[0].werbungskosten - ohne.jahresreihe[0].werbungskosten).toBeCloseTo(360, 6);
  });

  it("kumulierter Cashflow ist die Summe der Jahre", () => {
    const e = vorlage();
    let summe = 0;
    for (const j of e.jahresreihe) {
      summe += j.cashflow;
      expect(j.kumCashflow).toBeCloseTo(summe, 6);
    }
  });
});

describe("Vorbelegung aus der Selbstauskunft", () => {
  it("liefert Einkommen, Familienstand und Eigenkapitalanteil mit Herkunft", () => {
    const sa = {
      person1: { familienstand: "Verheiratet", einkommenBruttoJahr: 80000 },
      vermoegenswerte: [{ betrag: "20.000" }, { betrag: 10000 }],
    };
    const v = annahmenAusSelbstauskunft(sa, 258800);
    expect(v.werte.zvE).toBe(56000);
    expect(v.werte.verheiratet).toBe(true);
    expect(v.eigenkapitalEuro).toBe(30000);
    expect(v.werte.eigenkapitalProzent).toBeCloseTo((30000 / 258800) * 100, 6);
    expect(v.herkunft).toEqual(["zvE", "verheiratet", "eigenkapitalProzent"]);
  });

  it("ohne Selbstauskunft bleibt alles bei den Standardwerten", () => {
    const v = annahmenAusSelbstauskunft(null);
    expect(v.werte).toEqual({});
    expect(v.herkunft).toEqual([]);
    expect(eigenkapitalProzentAusBetrag(0, 258800)).toBe(0);
    expect(eigenkapitalProzentAusBetrag(500000, 258800)).toBe(100);
  });
});

describe("Wirtschaftlichkeit wie in der Vorlage: Business Case, Monatsübersicht, Vermögensaufbau", () => {
  const summe = (liste: Monatsposten[]) => liste.reduce((s, p) => s + p.betrag, 0);

  /** Restschuld nach n Jahren aus der geschlossenen Annuitätenformel, unabhängig vom Tilgungsplan gerechnet. */
  function restschuldFormel(darlehen: number, zinsProzent: number, tilgungProzent: number, jahre: number): number {
    const i = zinsProzent / 100 / 12;
    const rate = (darlehen * (zinsProzent + tilgungProzent)) / 100 / 12;
    const q = Math.pow(1 + i, jahre * 12);
    return Math.max(0, darlehen * q - (rate * (q - 1)) / i);
  }

  it("Business Case der Vorlage: 100 % Finanzierung, Kaufpreis plus Stellplatz, Eigenkapitaleinsatz gleich Nebenkosten", () => {
    const e = vorlage();
    const bc = businessCase(e);
    expect(bc.finanzierungsquoteProzent).toBe(100);
    expect(bc.darlehen).toBe(258800);
    expect(bc.zeilen.map((z) => z.id)).toEqual(["kaufpreis", "stellplatz", "gesamtinvestition", "nebenkosten", "gesamteigenkapital"]);
    expect(bc.zeilen.filter((z) => z.summe).map((z) => z.id)).toEqual(["gesamtinvestition", "gesamteigenkapital"]);
    const wert = (id: string) => bc.zeilen.find((z) => z.id === id)?.betrag;
    expect(wert("kaufpreis")).toBe(246800);
    expect(wert("stellplatz")).toBe(12000);
    expect(wert("gesamtinvestition")).toBe(258800);
    expect(wert("nebenkosten")).toBeCloseTo(e.kauf.nebenkosten.summe, 6);
    expect(wert("gesamteigenkapital")).toBeCloseTo(e.kauf.nebenkosten.summe, 6);
  });

  it("Business Case mit 5 % Eigenkapital: 95 % Finanzierung und eine eigene Zeile Eigenkapitaleinsatz wie in der Vorlage (12.940)", () => {
    const e = berechneExpose(VORLAGE_OBJEKT, { ...VORLAGE_ANNAHMEN, eigenkapitalProzent: 5 });
    const bc = businessCase(e);
    expect(bc.finanzierungsquoteProzent).toBeCloseTo(95, 6);
    expect(bc.darlehen).toBeCloseTo(245860, 6);
    expect(bc.zeilen.find((z) => z.id === "eigenkapital")?.betrag).toBeCloseTo(12940, 6);
    expect(bc.zeilen.find((z) => z.id === "gesamteigenkapital")?.betrag).toBeCloseTo(e.kauf.nebenkosten.summe + 12940, 6);
  });

  it("Business Case: die Positionen ergeben ihre Summe, auch mit Rabatt, zweitem Darlehen und Nebenkosten beim Verkäufer", () => {
    const faelle: Partial<ExposeAnnahmen>[] = [
      {},
      { eigenkapitalProzent: 20 },
      { preisanpassungProzent: -5 },
      { zweitesDarlehenAktiv: true, zweitesDarlehenBetrag: 10000, zweitesDarlehenErsetzt: "eigenkapital" },
      { eigenkapitalProzent: 10, zweitesDarlehenAktiv: true, zweitesDarlehenBetrag: 50000, zweitesDarlehenErsetzt: "eigenkapital" },
      { eigenkapitalProzent: 10, zweitesDarlehenAktiv: true, zweitesDarlehenBetrag: 30000, zweitesDarlehenErsetzt: "bankdarlehen" },
      { nebenkostenTraegtVerkaeufer: true },
    ];
    for (const fall of faelle) {
      const e = berechneExpose(VORLAGE_OBJEKT, { ...VORLAGE_ANNAHMEN, ...fall });
      const bc = businessCase(e);
      let laufend = 0;
      for (const z of bc.zeilen) {
        if (!z.summe) { laufend += z.betrag; continue; }
        expect(z.betrag).toBeCloseTo(laufend, 6);
        laufend = 0;
      }
      expect(bc.zeilen.at(-1)?.betrag).toBeCloseTo(e.kauf.eigenkapitaleinsatz, 6);
    }
  });

  it("Business Case: Eigenkapitalersatz als eigene Minuszeile, Rabatt als eigene Zeile, Nebenkosten beim Verkäufer mit 0", () => {
    const ersatz = businessCase(berechneExpose(VORLAGE_OBJEKT, {
      ...VORLAGE_ANNAHMEN, zweitesDarlehenAktiv: true, zweitesDarlehenBetrag: 10000, zweitesDarlehenErsetzt: "eigenkapital",
    }));
    expect(ersatz.zeilen.find((z) => z.id === "eigenkapitalersatz")?.betrag).toBe(-10000);
    expect(ersatz.zeilen.some((z) => z.id === "eigenkapital")).toBe(false);
    expect(ersatz.finanzierungsquoteProzent).toBeGreaterThan(100);
    const rabatt = businessCase(berechneExpose(VORLAGE_OBJEKT, { ...VORLAGE_ANNAHMEN, preisanpassungProzent: -5 }));
    expect(rabatt.zeilen.find((z) => z.id === "preisanpassung")?.betrag).toBeCloseTo(-12340, 6);
    const verkaeufer = businessCase(berechneExpose(VORLAGE_OBJEKT, { ...VORLAGE_ANNAHMEN, nebenkostenTraegtVerkaeufer: true }));
    expect(verkaeufer.zeilen.find((z) => z.id === "nebenkosten")?.betrag).toBe(0);
  });

  it("Monatsübersicht der Vorlage: Miete 863, Finanzierung 1.143, Rücklagen und Bewirtschaftung je 52, Eigeninvestition 188 (Vorlage 184)", () => {
    const m = monatsuebersicht(vorlage().monat);
    expect(m.kalenderjahr).toBe(2026);
    expect(m.einnahmen.map((p) => p.id)).toEqual(["miete", "steuervorteil"]);
    expect(m.ausgaben.map((p) => p.id)).toEqual(["finanzierung", "ruecklagen", "bewirtschaftung"]);
    expect(m.einnahmen[0].betrag).toBeCloseTo(863, 6);
    expect(Math.round(m.ausgaben[0].betrag)).toBe(1143);
    expect(m.ausgaben[1].betrag).toBeCloseTo(52, 6);
    expect(m.ausgaben[2].betrag).toBeCloseTo(52, 6);
    expect(Math.round(m.summeAusgaben)).toBe(1247);
    // Bis zum 30.09.2026 183; der Sanierungsanteil wirkt seitdem nicht mehr zusätzlich über die AfA.
    expect(Math.round(m.eigeninvestition)).toBe(188);
    expect(summe(m.einnahmen)).toBeCloseTo(m.summeEinnahmen, 6);
    expect(summe(m.ausgaben)).toBeCloseTo(m.summeAusgaben, 6);
    expect(m.eigeninvestition).toBeCloseTo(m.summeAusgaben - m.summeEinnahmen, 6);
  });

  it("Monatsübersicht ohne getrennte Rücklage: eine Zeile Hausgeld; Mietverwaltung und Mietausfall nur mit Betrag", () => {
    const ohne = monatsuebersicht(berechneExpose({ ...VORLAGE_OBJEKT, ruecklageMonat: 0 }, VORLAGE_ANNAHMEN).monat);
    expect(ohne.ausgaben.map((p) => p.id)).toEqual(["finanzierung", "hausgeld"]);
    expect(ohne.ausgaben[1].betrag).toBeCloseTo(52, 6);
    const mit = monatsuebersicht(berechneExpose({ ...VORLAGE_OBJEKT, mietverwaltungMonat: 30 }, { ...VORLAGE_ANNAHMEN, leerstandProzent: 5 }).monat);
    expect(mit.ausgaben.map((p) => p.id)).toEqual(["finanzierung", "ruecklagen", "bewirtschaftung", "mietverwaltung", "mietausfall"]);
    expect(summe(mit.ausgaben)).toBeCloseTo(mit.summeAusgaben, 6);
  });

  it("Monatsübersicht je Betrachtungsjahr: die Werte des gewählten Jahres geteilt durch zwölf", () => {
    for (const jahr of [2026, 2030, 2035]) {
      const e = berechneExpose(VORLAGE_OBJEKT, { ...VORLAGE_ANNAHMEN, betrachtungsjahr: jahr });
      const zeile = e.jahresreihe[jahr - 2026];
      const m = monatsuebersicht(e.monat);
      expect(m.kalenderjahr).toBe(jahr);
      expect(m.einnahmen[0].betrag).toBeCloseTo(zeile.mieteBrutto / 12, 6);
      expect(m.einnahmen[1].betrag).toBeCloseTo(zeile.steuerwirkungZahlungswirksam / 12, 6);
      expect(m.ausgaben[0].betrag).toBeCloseTo(zeile.rate / 12, 6);
      expect(m.eigeninvestition).toBeCloseTo(-zeile.cashflow / 12, 6);
    }
  });

  it("Lohnsteuerermäßigung (§ 39a EStG): Steuervorteil schon im laufenden Monat, ohne sie erst im Folgejahr", () => {
    const mit = monatsuebersicht(vorlage().monat);
    const ohne2026 = monatsuebersicht(berechneExpose(VORLAGE_OBJEKT, { ...VORLAGE_ANNAHMEN, lohnsteuerermaessigung: false }).monat);
    const ohne2027 = monatsuebersicht(berechneExpose(VORLAGE_OBJEKT, { ...VORLAGE_ANNAHMEN, lohnsteuerermaessigung: false, betrachtungsjahr: 2027 }).monat);
    expect(mit.einnahmen[1].betrag).toBeGreaterThan(0);
    expect(ohne2026.einnahmen[1].betrag).toBe(0);
    expect(ohne2027.einnahmen[1].betrag).toBeCloseTo(mit.einnahmen[1].betrag, 6);
    expect(ohne2026.eigeninvestition).toBeGreaterThan(mit.eigeninvestition);
  });

  it("Restschuld nach 10, 20, 30 und 40 Jahren folgt der Annuitätenformel, nach 40 Jahren ist das Darlehen getilgt", () => {
    const e = vorlage();
    expect(e.vermoegensaufbau.map((h) => h.jahre)).toEqual([10, 20, 30, 40]);
    for (const h of e.vermoegensaufbau) {
      expect(h.restschuld).toBeCloseTo(restschuldFormel(258800, 4.3, 1, h.jahre), 2);
    }
    expect(e.vermoegensaufbau[3].restschuld).toBe(0);
    expect(e.vermoegensaufbau[0].restschuld).toBeGreaterThan(e.vermoegensaufbau[1].restschuld);
  });

  it("Ertrag bei Verkauf, aufgebautes Vermögen und Eigenkapitalrendite je Horizont", () => {
    const e = vorlage();
    for (const h of e.vermoegensaufbau) {
      expect(h.immobilienwert).toBeCloseTo(258800 * Math.pow(1.02, h.jahre), 4);
      expect(h.ertragBeiVerkauf).toBeCloseTo(h.immobilienwert - h.restschuld, 6);
      expect(h.vermoegen).toBeCloseTo(h.ertragBeiVerkauf + e.jahresreihe[h.jahre - 1].kumCashflow, 6);
      expect(h.faktorJeEuro).toBeCloseTo(h.vermoegen / e.kauf.eigenkapitaleinsatz, 6);
      expect(h.eigenkapitalrenditeProzent).toBeCloseTo((Math.pow(h.vermoegen / e.kauf.eigenkapitaleinsatz, 1 / h.jahre) - 1) * 100, 6);
    }
    // Mehr Eigenkapital senkt den Hebel und damit die Eigenkapitalrendite.
    const mitEk = berechneExpose(VORLAGE_OBJEKT, { ...VORLAGE_ANNAHMEN, eigenkapitalProzent: 30 });
    expect(mitEk.vermoegensaufbau[0].eigenkapitalrenditeProzent as number).toBeLessThan(e.vermoegensaufbau[0].eigenkapitalrenditeProzent as number);
  });

  it("Business Case, Monatsübersicht und Vermögensaufbau rechnen mit denselben Zahlen", () => {
    const e = berechneExpose(VORLAGE_OBJEKT, { ...VORLAGE_ANNAHMEN, eigenkapitalProzent: 10 });
    const bc = businessCase(e);
    const gesamtinvestition = bc.zeilen.find((z) => z.id === "gesamtinvestition")?.betrag;
    const gesamteigenkapital = bc.zeilen.find((z) => z.id === "gesamteigenkapital")?.betrag;
    for (const h of e.vermoegensaufbau) {
      // Kasten „Kaufpreis" im Schaubild und Anfangsinvestition kommen aus dem Business Case.
      expect(h.kaufpreisHeute).toBe(gesamtinvestition);
      expect(h.eigenkapitaleinsatz).toBe(gesamteigenkapital);
    }
    // Der Vermögensaufbau zählt die monatlichen Eigeninvestitionen der Monatsübersicht Jahr für Jahr zusammen.
    const zehn = e.vermoegensaufbau[0];
    const eigeninvestitionen = e.jahresreihe.slice(0, 10).reduce((s, j) => s + monatsuebersicht(monatsrechnung(j)).eigeninvestition * 12, 0);
    expect(zehn.kumCashflow).toBeCloseTo(-eigeninvestitionen, 6);
    // „Finanzierung" in der Monatsübersicht ist die Rate auf das Darlehen aus dem Business Case.
    expect(monatsuebersicht(e.monat).ausgaben[0].betrag).toBeCloseTo((bc.darlehen * (4.3 + 1)) / 100 / 12, 6);
  });
});

/*
 * Seit dem 30.09.2026: Kaufnebenkosten ohne Sanierungsanteil und keine
 * Doppelzählung. Der Anteil ist eine gesonderte, im Notarvertrag
 * ausgewiesene Leistung im Kaufpreis. Dieselbe Regel wie im Investmentrechner.
 */
describe("Sanierungsanteil: Nebenkostenbasis und AfA-Grundlage", () => {
  const annahmen: ExposeAnnahmen = { ...VORLAGE_ANNAHMEN, instandhaltungsart: "erhaltungsaufwand", afaProzent: 2 };
  const beispiel: ExposeObjektdaten = {
    ...VORLAGE_OBJEKT,
    kaufpreis: 300000,
    stellplatzpreis: 0,
    kaufnebenkostenProzent: 5,
    sanierungskostenGesamt: 0,
    sanierungsanteilEuro: 40000,
    gebaeudeanteilProzent: 80,
  };

  it("Christians Beispiel: 5 % auf 260.000, AfA-Grundlage ohne den Aufwand", () => {
    const e = berechneExpose(beispiel, annahmen);
    expect(e.kauf.gesamtinvestition).toBe(300000);
    expect(e.kauf.nebenkosten.basis).toBe(260000);
    expect(e.kauf.nebenkosten.summe).toBeCloseTo(13000, 6);
    expect(e.kauf.nebenkosten.prozentGesamt).toBeCloseTo(5, 10);
    // 80 % von 313.000 minus 40.000: genau die AfA-Basis des Investmentrechners.
    expect(e.steuer.afaBasis).toBeCloseTo(210400, 6);
    expect(e.steuer.afaJahr).toBeCloseTo(4208, 6);
    expect(e.jahresreihe[1].erhaltungsaufwand).toBeCloseTo(40000, 6);
  });

  it("zählt den Aufwand nicht doppelt: AfA-Grundlage und Abzug zusammen einmal der Gebäudeteil", () => {
    const abgezogen = berechneExpose(beispiel, annahmen);
    const werkvertrag = berechneExpose(beispiel, { ...annahmen, instandhaltungsart: "werkvertrag" });
    // Werkvertrag: einmal in der AfA-Grundlage, nicht mehr obendrauf.
    expect(werkvertrag.steuer.afaBasis).toBeCloseTo(313000 * 0.8, 6);
    expect(werkvertrag.steuer.afaBasis - abgezogen.steuer.afaBasis).toBeCloseTo(40000, 6);
    expect(werkvertrag.jahresreihe.every((j) => j.erhaltungsaufwand === 0)).toBe(true);
  });

  it("Investagon-Objekt Sigmundstraße 2, 6b: Nebenkosten 16.195, AfA im ersten Jahr 9.540", () => {
    const e = berechneExpose(
      { ...beispiel, kaufpreis: 358900, sanierungsanteilEuro: 35000, gebaeudeanteilProzent: 82 },
      { ...annahmen, afaProzent: 3.5 },
    );
    expect(e.kauf.nebenkosten.summe).toBeCloseTo(16195, 6);
    expect(Math.round(e.steuer.afaJahr)).toBe(9540);
  });

  it("bleibt ohne Sanierungsanteil wie vorher", () => {
    const ohne = berechneExpose({ ...beispiel, sanierungsanteilEuro: 0 }, annahmen);
    expect(ohne.kauf.nebenkosten.basis).toBe(300000);
    expect(ohne.kauf.nebenkosten.summe).toBeCloseTo(15000, 10);
    expect(ohne.steuer.afaBasis).toBeCloseTo(315000 * 0.8, 10);
  });

  it("deckelt einen Anteil über der Gesamtinvestition: Basis und AfA-Grundlage nie negativ", () => {
    const e = berechneExpose({ ...beispiel, sanierungsanteilEuro: 999999 }, annahmen);
    expect(e.kauf.nebenkosten.basis).toBe(0);
    expect(e.steuer.afaBasis).toBe(0);
  });
});

describe("Vorbelegung aus der Selbstauskunft, angegebenes zvE", () => {
  it("nimmt das zvE der Selbstauskunft vor der Schätzung aus dem Brutto", () => {
    const v = annahmenAusSelbstauskunft({ familienstand: "Verheiratet", bruttoJahr: "80.000", zvEJahr: "61.000" });
    expect(v.werte.zvE).toBe(61_000);
    expect(v.werte.verheiratet).toBe(true);
    expect(v.herkunft).toContain("zvE");
  });
});
