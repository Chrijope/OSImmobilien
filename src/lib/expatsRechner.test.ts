/**
 * Tests des schlanken Steuerrechners.
 *
 * Die Erwartungswerte sind von Hand nachgerechnet, nicht aus dem Code
 * uebernommen. Der Rechenweg steht jeweils im Kommentar darueber, damit ein
 * spaeterer Leser pruefen kann, ob der Test recht hat und nicht nur, ob der
 * Code sich selbst treu bleibt.
 *
 * Gerechnet wird durchgehend mit dem Tarif 2026 aus `einkommensteuer.ts`,
 * ohne Solidaritaetszuschlag, so wie es die Annahmen vorsehen.
 */
import { describe, it, expect } from "vitest";
import { berechneExpats, steuervorteilAusAbzug, EXPATS_ANNAHMEN } from "./expatsRechner";
import { SOLLZINS, TILGUNG_ANFANG } from "@/lib/finanzierung";

/** 50.000 Euro Eigenkapital, 100.000 Euro Jahresbrutto, ledig, Tarif 2026. */
const fall = () =>
  berechneExpats({ eigenkapital: 50000, jahresbrutto: 100000, verheiratet: false, jahr: 2026 });

describe("expatsRechner: das Objekt aus den Annahmen", () => {
  it("leitet Volumen, Gebaeude und Darlehen aus dem Eigenkapital her", () => {
    const r = fall();
    // 50.000 mal 13 = 650.000. Davon 70 Prozent Gebaeude = 455.000.
    // Das Eigenkapital steckt im Kaufpreis, Darlehen also 650.000 - 50.000.
    expect(r.objektvolumen).toBe(650000);
    expect(r.gebaeudewert).toBeCloseTo(455000, 6);
    expect(r.darlehen).toBe(600000);
    // 92,3 Prozent Fremdkapital, die Warnung aus dem Kopf der Rechendatei.
    expect(r.fremdkapitalAnteil).toBeCloseTo(0.923, 3);
  });

  it("rechnet Miete, Rate, Zins, Abschreibung und Sanierungsaufwand", () => {
    const r = fall();
    // 4,5 Prozent von 650.000 = 29.250 im Jahr, also 2.437,50 im Monat.
    expect(r.mieteJahr).toBeCloseTo(29250, 6);
    expect(r.mieteMonat).toBeCloseTo(2437.5, 6);
    // Zins 4,0 plus Tilgung 1,5 Prozent auf 600.000 = 33.000 im Jahr.
    // Beide Saetze kommen seit dem 17.09.2026 aus `finanzierung.ts`, damit
    // dieser Rechner nicht wieder einen eigenen Zins fuehrt.
    expect(EXPATS_ANNAHMEN.zins).toBe(SOLLZINS);
    expect(EXPATS_ANNAHMEN.tilgung).toBe(TILGUNG_ANFANG);
    expect(r.rateJahr).toBeCloseTo(33000, 6);
    expect(r.rateMonat).toBeCloseTo(2750, 6);
    // Zinsanteil im ersten Jahr: 4,0 Prozent von 600.000 = 24.000.
    expect(r.zinsenJahr).toBeCloseTo(24000, 6);
    // 3,2 Prozent von 455.000 = 14.560.
    expect(r.afaJahr).toBeCloseTo(14560, 6);
    // 15 Prozent von 455.000 = 68.250.
    expect(r.sanierungsaufwand).toBeCloseTo(68250, 6);
  });
});

describe("expatsRechner: die Steuer kommt aus einkommensteuer.ts", () => {
  it("trifft die Steuerlast ohne Immobilie, ledig", () => {
    /*
     * 100.000 Euro liegen in der oberen Proportionalzone:
     *   0,42 * 100.000 - 11.135,63 = 30.864,37, abgerundet 30.864 Euro.
     * Ohne Soli, so sehen es die Annahmen vor.
     */
    expect(fall().steuerOhneImmobilie).toBeCloseTo(30864, 2);
  });

  it("trifft die Steuerlast ohne Immobilie, verheiratet", () => {
    /*
     * Splitting: zweimal der Grundtarif auf 50.000 Euro.
     *   z = (50.000 - 17.799) / 10.000 = 3,2201
     *   (173,1 * z + 2.397) * z + 1.034,87 = 10.548,33, abgerundet 10.548.
     * Mal zwei = 21.096 Euro.
     */
    const r = berechneExpats({
      eigenkapital: 50000,
      jahresbrutto: 100000,
      verheiratet: true,
      jahr: 2026,
    });
    expect(r.steuerOhneImmobilie).toBeCloseTo(21096, 2);
  });

  it("misst den Grenzsteuersatz an 1.000 Euro Abzug", () => {
    // Steuer auf 99.000: 0,42 * 99.000 - 11.135,63 = 30.444,37, also 30.444.
    // 30.864 - 30.444 = 420 Euro auf 1.000 Euro Abzug, also 42 Prozent.
    expect(fall().grenzsteuersatz).toBeCloseTo(0.42, 4);
  });
});

describe("expatsRechner: der Steuervorteil", () => {
  it("rechnet das erste Jahr mit Sanierungsabzug von Hand nach", () => {
    const j1 = fall().jahre[0];
    // Abzug = 14.560 Abschreibung + 68.250 Sanierung = 82.810.
    expect(j1.abzug).toBeCloseTo(82810, 6);
    /*
     * Steuer auf 100.000 - 82.810 = 17.190 Euro, erste Progressionszone:
     *   y = (17.190 - 12.348) / 10.000 = 0,4842
     *   (914,51 * y + 1.400) * y = 892,29, abgerundet 892.
     * Ersparnis = 30.864 - 892 = 29.972 Euro.
     */
    expect(j1.steuervorteil).toBeCloseTo(29972, 2);
  });

  it("bleibt unter Grenzsteuersatz mal Abzug, weil die Progression wirkt", () => {
    const j1 = fall().jahre[0];
    // 42 Prozent von 82.810 waeren 34.780 Euro. Wer so rechnet, verspricht
    // rund 4.800 Euro zu viel. Genau dafuer steht die Differenzmethode.
    expect(j1.steuervorteil).toBeLessThan(0.42 * 82810);
    expect(j1.steuervorteil).toBeGreaterThan(0.3 * 82810);
  });

  it("rechnet die Folgejahre mit der Abschreibung allein", () => {
    const r = fall();
    /*
     * Abzug 14.560. Steuer auf 85.440 Euro:
     *   0,42 * 85.440 - 11.135,63 = 24.749,17, abgerundet 24.749.
     * Ersparnis = 30.864 - 24.749 = 6.115 Euro, und zwar in jedem der Jahre
     * zwei bis zehn, weil sich am Abzug nichts mehr aendert.
     */
    for (const j of r.jahre.slice(1)) {
      expect(j.sanierung).toBe(0);
      expect(j.abzug).toBeCloseTo(14560, 6);
      expect(j.steuervorteil).toBeCloseTo(6115, 2);
    }
  });

  it("summiert zehn Jahre und fuehrt die kumulierte Spalte mit", () => {
    const r = fall();
    expect(r.jahre).toHaveLength(EXPATS_ANNAHMEN.jahre);
    // 29.972 + 9 mal 6.115 = 85.007 Euro.
    expect(r.steuervorteilZehnJahre).toBeCloseTo(85007, 2);
    expect(r.steuervorteilJahr1).toBeCloseTo(29972, 2);
    expect(r.jahre[9].kumuliert).toBeCloseTo(85007, 2);
    expect(r.steuervorteilDurchschnittJahr).toBeCloseTo(8500.7, 2);
  });

  it("weist die Rueckflussquote als Anteil der Abzuege aus", () => {
    // Abzuege insgesamt: 82.810 + 9 mal 14.560 = 213.850 Euro.
    // 85.007 / 213.850 = 0,3975.
    expect(fall().rueckflussquote).toBeCloseTo(0.3975, 4);
  });
});

describe("expatsRechner: Aufwand und Ersparnis sind zweierlei", () => {
  it("weist die Ersparnis aus dem Sanierungsaufwand deutlich kleiner aus", () => {
    const r = fall();
    /*
     * Steuer auf 100.000 - 68.250 = 31.750 Euro:
     *   z = (31.750 - 17.799) / 10.000 = 1,3951
     *   173,1 * 1,3951 = 241,49, plus 2.397 = 2.638,49
     *   2.638,49 * 1,3951 = 3.680,96, plus 1.034,87 = 4.715,83, also 4.715.
     * Ersparnis = 30.864 - 4.715 = 26.149 Euro, also rund 38 Prozent des
     * Aufwands und nicht der Aufwand selbst.
     */
    expect(r.sanierungErsparnis).toBeCloseTo(26149, 2);
    expect(r.sanierungErsparnis / r.sanierungsaufwand).toBeLessThan(0.45);
  });
});

describe("expatsRechner: Zahlungsstrom", () => {
  it("zieht die nicht umlagefaehigen Kosten ab", () => {
    const r = fall();
    // 0,5 Prozent von 650.000 = 3.250 im Jahr, also 270,83 im Monat.
    expect(r.bewirtschaftungJahr).toBeCloseTo(3250, 6);
    expect(r.bewirtschaftungMonat).toBeCloseTo(270.83, 2);
  });

  it("zeigt die Luecke zwischen Miete, Kosten und Rate vor Steuer", () => {
    const r = fall();
    // 29.250 Miete minus 3.250 Bewirtschaftung minus 33.000 Rate
    // = 7.000 Euro Zuzahlung im Jahr, also 583,33 Euro im Monat.
    //
    // Der Wert ist zweimal SCHLECHTER geworden, beide Male mit Absicht: erst
    // durch die Bewirtschaftungskosten, die die Vorlage nicht kennt, dann
    // durch die Anfangstilgung von 1,5 statt 1,0 Prozent. Die hoehere Tilgung
    // ist kein Verlust, sie steht als Vermoegen auf der anderen Seite.
    expect(r.zahlungsstromVorSteuerMonat).toBeCloseTo(-583.33, 2);
  });

  it("dreht den Zahlungsstrom mit dem durchschnittlichen Steuervorteil", () => {
    const r = fall();
    // 8.500,70 im Jahr sind 708,39 im Monat, abzueglich 583,33 bleiben 125,06.
    // Der Steuervorteil selbst aendert sich durch den Zins NICHT: Dieser
    // Rechner zieht nur Abschreibung und Sanierung ab, keine Schuldzinsen.
    expect(r.steuervorteilMonat).toBeCloseTo(708.39, 2);
    expect(r.zahlungsstromNachSteuerMonat).toBeCloseTo(125.06, 2);
  });

  it("nennt daneben den Dauerzustand ab dem zweiten Jahr", () => {
    const r = fall();
    /*
     * Der Zehnjahresschnitt enthaelt den einmaligen Sanierungsabzug aus Jahr 1
     * und faellt deshalb zu freundlich aus. Ab Jahr 2 wirkt nur noch die
     * Abschreibung: 30.864 minus 24.749 = 6.115 im Jahr, also 509,58 im Monat.
     * Damit bleibt eine echte Zuzahlung von 583,33 minus 509,58 = 73,75 Euro.
     */
    expect(r.steuervorteilAbJahr2).toBeCloseTo(6115, 6);
    expect(r.zahlungsstromNachSteuerMonatAbJahr2).toBeCloseTo(-73.75, 2);
    // Der Dauerzustand ist immer schlechter als der Schnitt, nie besser.
    expect(r.zahlungsstromNachSteuerMonatAbJahr2).toBeLessThan(
      r.zahlungsstromNachSteuerMonat,
    );
  });
});

describe("expatsRechner: Tilgung und Vermoegensaufbau", () => {
  it("rechnet den echten Annuitaetenverlauf statt einer linearen Naeherung", () => {
    const r = fall();
    // Jahr 1: 4,0 Prozent Zinsen auf 600.000 = 24.000, Rate 33.000,
    // also 9.000 Tilgung und 591.000 Restschuld.
    expect(r.jahre[0].zinsen).toBeCloseTo(24000, 6);
    expect(r.jahre[0].tilgung).toBeCloseTo(9000, 6);
    expect(r.jahre[0].restschuld).toBeCloseTo(591000, 6);
    // Jahr 2: 4,0 Prozent auf 591.000 = 23.640, Tilgung also 9.360.
    expect(r.jahre[1].zinsen).toBeCloseTo(23640, 6);
    expect(r.jahre[1].tilgung).toBeCloseTo(9360, 6);
  });

  it("weist nach zehn Jahren 18,0 Prozent des Darlehens als getilgt aus", () => {
    const r = fall();
    /*
     * Geschlossene Form, von Hand:
     *   Restschuld = L*(1+i)^10 - A*((1+i)^10 - 1)/i
     *   (1,04)^10 = 1,4802443
     *   600.000 * 1,4802443 = 888.146,57
     *   33.000 * (0,4802443/0,04) = 33.000 * 12,006107 = 396.201,53
     *   Restschuld = 491.945,04, getilgt also 108.054,96.
     * Die lineare Naeherung "1,5 Prozent mal 10 Jahre" ergaebe nur 90.000 Euro
     * und wuerde den Vermoegensaufbau um rund ein Sechstel zu klein zeigen.
     */
    expect(r.tilgungZehnJahre).toBeCloseTo(108055, 0);
    expect(r.restschuld).toBeCloseTo(491945, 0);
    expect(r.tilgungZehnJahre / r.darlehen).toBeCloseTo(0.18009, 5);
    expect(r.tilgungZehnJahre).toBeGreaterThan(r.darlehen * EXPATS_ANNAHMEN.tilgung * 10);
    // Tilgung plus Restschuld ergibt wieder das Darlehen.
    expect(r.tilgungZehnJahre + r.restschuld).toBeCloseTo(r.darlehen, 6);
    // 108.054,96 auf 120 Monate = 900,46 im Monat.
    expect(r.tilgungMonat).toBeCloseTo(900.46, 2);
  });

  it("summiert die Zinsen ueber zehn Jahre zur Gegenprobe", () => {
    const r = fall();
    // Zehn Annuitaeten von 33.000 = 330.000. Davon 108.054,96 Tilgung,
    // bleiben 221.945,04 Zinsen.
    expect(r.zinsenZehnJahre).toBeCloseTo(221945, 0);
    expect(r.zinsenZehnJahre + r.tilgungZehnJahre).toBeCloseTo(r.rateJahr * 10, 2);
  });
});

describe("expatsRechner: Randfaelle", () => {
  it("liefert bei null Eigenkapital nur Nullen und kein NaN", () => {
    const r = berechneExpats({ eigenkapital: 0, jahresbrutto: 100000, verheiratet: false, jahr: 2026 });
    expect(r.objektvolumen).toBe(0);
    expect(r.darlehen).toBe(0);
    expect(r.fremdkapitalAnteil).toBe(0);
    expect(r.steuervorteilJahr1).toBe(0);
    expect(r.steuervorteilZehnJahre).toBe(0);
    expect(Number.isNaN(r.rueckflussquote)).toBe(false);
    expect(r.rueckflussquote).toBe(0);
  });

  it("verschenkt bei kleinem Einkommen den Abzug, statt Steuer zu erfinden", () => {
    /*
     * 20.000 Euro Brutto tragen einen Abzug von 82.810 Euro nicht. Mehr als
     * die eigene Steuer kann niemand sparen, der Rest ginge real in den
     * Verlustvortrag. Den bildet dieser kurze Rechner bewusst nicht ab, siehe
     * Hinweis auf der Ergebnisseite.
     */
    const r = berechneExpats({ eigenkapital: 50000, jahresbrutto: 20000, verheiratet: false, jahr: 2026 });
    expect(r.steuervorteilJahr1).toBeCloseTo(r.steuerOhneImmobilie, 6);
  });

  it("gibt ohne Abzug auch keinen Vorteil", () => {
    expect(steuervorteilAusAbzug(100000, 0, 2026, false)).toBe(0);
    expect(steuervorteilAusAbzug(100000, -500, 2026, false)).toBe(0);
  });
});
