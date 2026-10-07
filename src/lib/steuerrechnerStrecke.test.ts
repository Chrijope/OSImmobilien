/**
 * Die Strecke des Steuerrechners und der Jahresverlauf.
 *
 * Zwei Dinge werden hier festgehalten:
 *
 *   1. Die Strecke fragt nichts, was sie nicht auswertet, und laesst nichts
 *      weg, was der Rechenkern braucht.
 *   2. Der Jahresverlauf ist KEINE zweite Rechnung. Seine Endwerte muessen
 *      genau die sein, die `berechne` liefert. Sobald sie auseinanderlaufen,
 *      zeigen Ergebnisseite und PDF andere Zahlen als der Kern.
 */
import { describe, expect, it } from "vitest";
import { KAUFNEBENKOSTEN_HOECHSTSATZ } from "@/lib/grunderwerbsteuer";
import {
  BETRACHTUNG_JAHRE,
  berechne,
  jahresverlauf,
} from "@/lib/steuerRechner";
import {
  EINKOMMEN_MAX,
  EINKOMMEN_MIN,
  begrenzeEinkommen,
  brauchtPartnereinkommen,
  partnereinkommen,
  schritte,
  schrittBeantwortet,
  standardAntworten,
  zuEingaben,
  type SteuerAntworten,
} from "@/lib/steuerrechnerStrecke";

const ledig: SteuerAntworten = { ...standardAntworten(), jahresbrutto: 85000 };
const verheiratet: SteuerAntworten = { ...ledig, steuerklasse: "III" };

describe("Der Regler hat keine Sackgasse", () => {
  it("beginnt genau dort, wo die Untergrenze liegt", () => {
    // Genau das ist der Unterschied zur Vorlage: Dort laesst sich ein Wert
    // einstellen, der danach kein Ergebnis bekommt. Wenn der Regler erst bei
    // der Untergrenze anfaengt, kann dieser Zustand gar nicht entstehen.
    expect(begrenzeEinkommen(EINKOMMEN_MIN - 20000)).toBe(EINKOMMEN_MIN);
    expect(begrenzeEinkommen(EINKOMMEN_MAX + 50000)).toBe(EINKOMMEN_MAX);
  });

  it("liefert an beiden Enden des Reglers ein Ergebnis", () => {
    for (const brutto of [EINKOMMEN_MIN, 70000, EINKOMMEN_MAX]) {
      const r = berechne(zuEingaben({ ...ledig, jahresbrutto: brutto }));
      expect(r.vorher.summe).toBeGreaterThan(0);
      expect(r.ersparnisJahr).toBeGreaterThan(0);
      expect(r.klasse.preis).toBeGreaterThan(0);
    }
  });

  it("bietet unterhalb von 70.000 Euro den guenstigeren Einstieg an, statt zu blockieren", () => {
    expect(berechne(zuEingaben({ ...ledig, jahresbrutto: 45000 })).klasse.id).toBe("bestand");
    expect(berechne(zuEingaben({ ...ledig, jahresbrutto: 85000 })).klasse.id).toBe("neubau");
  });
});

describe("Es wird nur gefragt, was auch ausgewertet wird", () => {
  it("fragt das Partnereinkommen nur bei Zusammenveranlagung", () => {
    expect(schritte(ledig)).not.toContain("partner");
    expect(schritte(verheiratet)).toContain("partner");
    expect(brauchtPartnereinkommen(ledig)).toBe(false);
  });

  it("wertet das Partnereinkommen dann auch wirklich aus", () => {
    const wenig = berechne(zuEingaben({ ...verheiratet, partnerBrutto: 10000 }));
    const viel = berechne(zuEingaben({ ...verheiratet, partnerBrutto: 90000 }));
    expect(viel.vorher.summe).toBeGreaterThan(wenig.vorher.summe);
  });

  it("nimmt ohne Eingabe den Vorschlag der Steuerklasse", () => {
    expect(partnereinkommen({ ...verheiratet, partnerBrutto: null })).toBe(
      Math.round((85000 * 2) / 3),
    );
    expect(partnereinkommen({ ...ledig, partnerBrutto: null })).toBe(0);
  });

  it("fragt das Beschaeftigungsverhaeltnis und laesst es nicht vorbelegt durchrutschen", () => {
    expect(schritte(ledig)).toContain("beschaeftigung");
    expect(standardAntworten().beschaeftigung).toBeNull();
    expect(schrittBeantwortet("beschaeftigung", ledig)).toBe(false);
    expect(
      schrittBeantwortet("beschaeftigung", { ...ledig, beschaeftigung: "beamter" }),
    ).toBe(true);
  });

  it("wertet das Beschaeftigungsverhaeltnis in der Empfehlung aus", () => {
    // Bei 85.000 Euro liegt die Schwelle zum Neubau bei 70.000 anerkanntem
    // Einkommen. Der Angestellte reisst sie, der Selbststaendige mit
    // 80 Prozent Anerkennung (68.000) nicht.
    const angestellt = berechne(zuEingaben({ ...ledig, beschaeftigung: "angestellt" }));
    const selbst = berechne(zuEingaben({ ...ledig, beschaeftigung: "selbststaendig" }));
    expect(angestellt.klasse.id).toBe("neubau");
    expect(selbst.klasse.id).toBe("bestand");
    // Die Steuerlast selbst bleibt gleich, nur die Empfehlung aendert sich.
    expect(selbst.vorher.summe).toBe(angestellt.vorher.summe);
  });

  it("nimmt ohne Antwort den Angestellten, damit der Kern immer rechnen kann", () => {
    expect(zuEingaben({ ...ledig, beschaeftigung: null }).beschaeftigung).toBe("angestellt");
  });

  it("gibt die letzte Frage erst nach einer Antwort frei", () => {
    expect(schrittBeantwortet("zeitpunkt", ledig)).toBe(false);
    expect(schrittBeantwortet("zeitpunkt", { ...ledig, startzeitpunkt: "sofort" })).toBe(true);
  });

  it("wertet jede weitere Frage aus, keine ist Zierde", () => {
    const grund = berechne(zuEingaben(ledig));
    expect(berechne(zuEingaben({ ...ledig, kinder: 2 })).vorher.summe).toBeLessThan(grund.vorher.summe);
    expect(berechne(zuEingaben({ ...ledig, kirchensteuer: true })).vorher.summe).toBeGreaterThan(grund.vorher.summe);
    /* Der Wohnsitz wirkt ueber die Kirchensteuer, nicht mehr ueber die
       Kaufnebenkosten: In Bayern sind es 8 Prozent Kirchensteuer, sonst 9. */
    const mitKirche = { ...ledig, kirchensteuer: true };
    expect(berechne(zuEingaben({ ...mitKirche, bundesland: "by" })).vorher.summe).toBeLessThan(
      berechne(zuEingaben({ ...mitKirche, bundesland: "nw" })).vorher.summe,
    );
    expect(berechne(zuEingaben({ ...ledig, bestehendeImmobilien: 2 })).vorher.summe).toBeLessThan(grund.vorher.summe);
    expect(berechne(zuEingaben({ ...ledig, hebelziel: "vorsichtig" })).anzahlFuerZiel).toBeLessThanOrEqual(
      grund.anzahlFuerZiel,
    );
  });
});

/**
 * Am Bundesland hingen zwei Dinge, die nicht dasselbe Bundesland meinen.
 *
 * Die Kirchensteuer richtet sich nach dem WOHNSITZ, die Grunderwerbsteuer nach
 * der LAGE der Immobilie. Ein Feld konnte nie beides richtig beantworten. Die
 * Strecke fragt deshalb nur noch den Wohnsitz und setzt die Kaufnebenkosten
 * fest mit dem Hoechstsatz an.
 */
describe("Wohnsitz und Lage der Immobilie sind zweierlei", () => {
  it("rechnet die Kaufnebenkosten immer mit dem Hoechstsatz, unabhaengig vom Wohnsitz", () => {
    expect(KAUFNEBENKOSTEN_HOECHSTSATZ).toBe(8.5);
    for (const bundesland of ["", "by", "nw", "hh"]) {
      const r = berechne(zuEingaben({ ...ledig, bundesland }));
      expect(r.nebenkostenProzent).toBe(KAUFNEBENKOSTEN_HOECHSTSATZ);
      expect(r.eigenkapital).toBeCloseTo(r.klasse.preis * (KAUFNEBENKOSTEN_HOECHSTSATZ / 100), 6);
    }
  });

  it("nimmt ohne Wohnsitz den ungueltigeren Kirchensteuersatz von 9 Prozent", () => {
    const ohne = berechne(zuEingaben({ ...ledig, kirchensteuer: true, bundesland: "" }));
    const bayern = berechne(zuEingaben({ ...ledig, kirchensteuer: true, bundesland: "by" }));
    const hessen = berechne(zuEingaben({ ...ledig, kirchensteuer: true, bundesland: "he" }));
    expect(ohne.vorher.kirche).toBeCloseTo(hessen.vorher.kirche, 6);
    expect(ohne.vorher.kirche).toBeGreaterThan(bayern.vorher.kirche);
  });

  it("verlangt den Wohnsitz nur, wenn er ueber die Kirchensteuer wirklich etwas aendert", () => {
    expect(schrittBeantwortet("wohnort", ledig)).toBe(true);
    expect(schrittBeantwortet("wohnort", { ...ledig, kirchensteuer: true })).toBe(false);
    expect(
      schrittBeantwortet("wohnort", { ...ledig, kirchensteuer: true, bundesland: "hh" }),
    ).toBe(true);
  });
});

describe("Der Jahresverlauf bleibt am Rechenkern", () => {
  it("hat eine Stuetzstelle je Jahr, beginnend bei Jahr 1", () => {
    const zeilen = jahresverlauf(berechne(zuEingaben(ledig)));
    expect(zeilen).toHaveLength(BETRACHTUNG_JAHRE);
    expect(zeilen[0].jahr).toBe(1);
    expect(zeilen[BETRACHTUNG_JAHRE - 1].jahr).toBe(BETRACHTUNG_JAHRE);
  });

  it("summiert sich auf genau die Ersparnis aus berechne", () => {
    for (const brutto of [45000, 85000, 200000]) {
      const r = berechne(zuEingaben({ ...ledig, jahresbrutto: brutto }));
      const zeilen = jahresverlauf(r);
      expect(zeilen[zeilen.length - 1].ersparnisKumuliert).toBeCloseTo(r.ersparnis10J, 6);
    }
  });

  it("endet bei genau dem Vermoegenszuwachs aus berechne", () => {
    const r = berechne(zuEingaben(ledig));
    const letzte = jahresverlauf(r)[BETRACHTUNG_JAHRE - 1];
    expect(letzte.tilgung).toBeCloseTo(r.tilgung10J, 6);
    expect(letzte.wertsteigerung).toBeCloseTo(r.wertsteigerung10J, 6);
    expect(letzte.vermoegen).toBeCloseTo(r.vermoegenszuwachs, 6);
  });

  it("beginnt im Minus, weil die Kaufnebenkosten sofort anfallen", () => {
    const zeilen = jahresverlauf(berechne(zuEingaben(ledig)));
    expect(zeilen[0].vermoegen).toBeLessThan(0);
  });

  it("zeigt beim Neubau den Knick nach dem vierten Jahr", () => {
    // Genau diesen Knick verdeckt die Vorlage, weil sie erst bei Jahr 10 die
    // erste Stuetzstelle setzt. Die Sonderabschreibung nach § 7b laeuft nach
    // vier Jahren aus, ab Jahr 5 faellt die Ersparnis deutlich.
    const r = berechne(zuEingaben(ledig));
    expect(r.klasse.id).toBe("neubau");
    const zeilen = jahresverlauf(r);
    /* Die Sonderabschreibung laeuft nach dem vierten Jahr aus. Der Knick faellt
       jetzt aus der Rechnung heraus, statt als Gewicht hineingelegt zu werden,
       deshalb sind die ersten vier Jahre nicht mehr exakt gleich: Die degressive
       Abschreibung sinkt auch innerhalb dieser vier Jahre schon. */
    for (let i = 1; i < 4; i++) {
      expect(zeilen[i].ersparnis).toBeLessThan(zeilen[i - 1].ersparnis);
      expect(zeilen[i].ersparnis).toBeGreaterThan(zeilen[i - 1].ersparnis * 0.8);
    }
    expect(zeilen[4].ersparnis).toBeLessThan(zeilen[3].ersparnis * 0.75);
  });

  it("rechnet den Zehnjahresfaktor aus, statt ihn zu setzen", () => {
    /*
     * Vorher stand hier eine Pruefung auf `ersparnisGewichte` und
     * `ersparnisFaktor10J`, also auf eine gesetzte 5 beim Neubau und 8,5 sonst.
     * Beide Zahlen waren geraten. Jetzt faellt der Faktor aus der Abschreibung
     * und dem Zinsverlauf heraus, und der Test haelt nur noch fest, dass er
     * zwischen einem und zehn Jahren liegt und zum Plan passt.
     */
    for (const brutto of [45000, 85000, 200000]) {
      const r = berechne(zuEingaben({ ...ledig, jahresbrutto: brutto }));
      const ausPlan = r.plan.reduce((a, z) => a + z.ersparnis, 0);
      expect(r.ersparnis10J).toBeCloseTo(ausPlan, 6);
      const faktor = r.ersparnis10J / r.ersparnisJahr;
      expect(faktor).toBeGreaterThan(1);
      expect(faktor).toBeLessThan(BETRACHTUNG_JAHRE);
    }
  });

  it("weist den Zahlungsstrom aus, statt ihn aus einer fremden Quote zu holen", () => {
    // Derselbe Befund wie auf der Hauptseite: `freieLiquiditaet10J` war eine
    // Quote aus einer fremden Kalkulation und immer positiv, obwohl dasselbe
    // Modell eine monatliche Zuzahlung ergibt.
    const r = berechne(zuEingaben(ledig));
    const ausPlan = r.plan.reduce((a, z) => a + z.cashflowNachSteuer, 0);
    expect(r.freieLiquiditaet10J).toBeCloseTo(ausPlan, 6);
    expect(r.vermoegenszuwachs).toBeCloseTo(
      r.anteilAmObjekt + r.freieLiquiditaet10J - r.eigenkapital,
      6,
    );
  });

  it("die Kopfzahl ist der Normalfall, das erste Jahr der Hoechstwert", () => {
    // Die Ergebnisseite zeigt oben die Zehnjahressumme und darunter den
    // Jahresdurchschnitt als Normalfall. Das erste Jahr steht getrennt als
    // Hoechstwert. Dieses Verhaeltnis muss stimmen, sonst waere die grosse
    // Zahl schoengerechnet.
    const r = berechne(zuEingaben(ledig));
    const schnitt = r.ersparnis10J / BETRACHTUNG_JAHRE;
    expect(schnitt).toBeLessThan(r.ersparnisJahr);
  });
});
