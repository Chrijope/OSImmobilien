import { describe, it, expect } from "vitest";
import { gebuehrTabelleB, notarGrundbuchKosten } from "@/lib/notarGrundbuch";

/**
 * Tabelle B nach § 34 Abs. 2 GNotKG, Werte aus Anlage 2 des Gesetzes.
 * Das Beispiel der Vorlage (Kaufpreis 246.800, Darlehen 258.800) liefert im
 * Grundbuch auf den Euro die 1.338 der Vorlage. Beim Notar zeigt die Vorlage
 * 3.702, das ist genau 1,5 Prozent des Kaufpreises, also eine Pauschale und
 * keine Gebührenrechnung; nach Tabelle sind es 2.547 inklusive Umsatzsteuer.
 */
describe("Tabelle B nach § 34 GNotKG", () => {
  it("trifft die Werte aus Anlage 2 des Gesetzes", () => {
    expect(gebuehrTabelleB(500)).toBe(15);
    expect(gebuehrTabelleB(1000)).toBe(19);
    expect(gebuehrTabelleB(2000)).toBe(27);
    expect(gebuehrTabelleB(10000)).toBe(75);
    expect(gebuehrTabelleB(25000)).toBe(115);
    expect(gebuehrTabelleB(50000)).toBe(165);
    expect(gebuehrTabelleB(200000)).toBe(435);
    expect(gebuehrTabelleB(230000)).toBe(485);
    expect(gebuehrTabelleB(260000)).toBe(535);
    expect(gebuehrTabelleB(290000)).toBe(585);
    expect(gebuehrTabelleB(500000)).toBe(935);
    expect(gebuehrTabelleB(550000)).toBe(1015);
    expect(gebuehrTabelleB(1000000)).toBe(1735);
    expect(gebuehrTabelleB(1100000)).toBe(1895);
    expect(gebuehrTabelleB(2000000)).toBe(3335);
    expect(gebuehrTabelleB(3000000)).toBe(4935);
  });

  it("rechnet mit angefangenen Stufen: 246.800 liegt in der Stufe bis 260.000", () => {
    expect(gebuehrTabelleB(246800)).toBe(535);
    expect(gebuehrTabelleB(200001)).toBe(485);
    expect(gebuehrTabelleB(0)).toBe(15);
    expect(gebuehrTabelleB(Number.NaN)).toBe(15);
  });

  it("setzt die Stufen oberhalb von 3 Millionen nach § 34 Abs. 2 fort", () => {
    expect(gebuehrTabelleB(5000000)).toBe(4935 + 40 * 80);
    expect(gebuehrTabelleB(10000000)).toBe(8135 + 25 * 130);
  });
});

describe("Notar- und Grundbuchkosten", () => {
  it("Vorlage: Grundbuch 1.338 trifft, Notar nach Tabelle 2.547 statt der Pauschale 3.702", () => {
    const k = notarGrundbuchKosten(246800, 258800);
    expect(k.notarBeurkundung).toBe(1070);
    expect(k.notarVollzug).toBe(267.5);
    expect(k.notarBetreuung).toBe(267.5);
    expect(k.notarGrundschuld).toBe(535);
    expect(k.notarNetto).toBe(2140);
    expect(k.notarBrutto).toBeCloseTo(2546.6, 6);
    expect(k.grundbuchVormerkung).toBe(267.5);
    expect(k.grundbuchEigentum).toBe(535);
    expect(k.grundbuchGrundschuld).toBe(535);
    expect(k.grundbuchSumme).toBe(1337.5);
    expect(Math.round(k.grundbuchSumme)).toBe(1338);
    // Die Vorlage nimmt 246.800 mal 1,5 % = 3.702 als Notarpauschale, das ist 45 % über der Tabelle.
    expect(246800 * 0.015).toBe(3702);
    expect(k.summe).toBeCloseTo(3884.1, 6);
  });

  it("Anzeigezeilen: Kaufvertrag, Grundschuld und Grundbuch ergeben die Summe", () => {
    const k = notarGrundbuchKosten(246800, 258800);
    expect(k.zeileNotarKaufvertrag).toBeCloseTo(1605 * 1.19, 6);
    expect(k.zeileGrundschuld).toBeCloseTo(535 * 1.19 + 535, 6);
    expect(k.zeileGrundbuch).toBe(802.5);
    expect(k.zeileNotarKaufvertrag + k.zeileGrundschuld + k.zeileGrundbuch).toBeCloseTo(k.summe, 6);
  });

  it("ohne Darlehen entfallen die Positionen der Grundschuld", () => {
    const k = notarGrundbuchKosten(246800, 0);
    expect(k.notarGrundschuld).toBe(0);
    expect(k.grundbuchGrundschuld).toBe(0);
    expect(k.zeileGrundschuld).toBe(0);
    expect(k.summe).toBeCloseTo(1605 * 1.19 + 802.5, 6);
  });

  it("ohne Kaufpreis ist alles null", () => {
    expect(notarGrundbuchKosten(0, 0).summe).toBe(0);
  });
});
