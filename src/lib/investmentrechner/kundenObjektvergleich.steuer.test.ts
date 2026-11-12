import { describe, expect, it } from "vitest";
import { einkommensteuerTarif2026 } from "./rechenkern";
import {
  STANDARD_ANNAHMEN, genauGerechnet, grenzsatz, guenstigerpruefung, rechneEinheit, steuerErsparnis, steuerGesamt,
  type VergleichAnnahmen, type VergleichEinheit,
} from "./kundenObjektvergleich";

/*
 * Genaue Steuer (Christian, 09.11.2026): Ersparnis = ESt(zvE) − ESt(zvE + Ergebnis),
 * Tarif 2026, Splitting, Soli und Kirchensteuer; pauschal bleibt wie bisher.
 */
const genau = (zvE: number, splitting: boolean, extra: Partial<VergleichAnnahmen> = {}): VergleichAnnahmen => ({
  ...STANDARD_ANNAHMEN, steuerArt: "einkommen", steuer: 0.28, zvE, splitting, kirchensteuersatz: 0, mitSoli: true, ...extra,
});

// Barfußstraße 9 WE 20: 230.000 €, 52,15 m², 11 €/m², 18 Jahre AfA, Gebäudeanteil 93 %.
const WE20: VergleichEinheit = {
  nr: "20", zimmer: 2, qm: 52.15, lage: "", kpWohnung: 230000, kpListe: 0, garagen: 0, garageKp: 0,
  garageMiete1: 0, garageMieteZiel: 0, garageIstVon: 0, garageIstBis: 0, mieteIst: 392.69, mieteSubQm: 11,
  u: 80.84, n: 52.5, r: 28.1, afaJahre: 18, mieteZielQm: 20,
};
const einzel = (extra: Partial<VergleichAnnahmen> = {}) =>
  genau(59340, true, { zins: 0.045, tilgung: 0.015, gebaeudeanteil: 0.93, kappung: 0.15, verrechnung: "jaehrlich", ...extra });

describe("Differenzmethode", () => {
  it("Ersparnis ist ESt ohne minus ESt mit dem Ergebnis, ein Gewinn kostet Steuer", () => {
    const a = genau(59340, true);
    expect(steuerErsparnis(-10000, a)).toBe(steuerGesamt(59340, a) - steuerGesamt(49340, a));
    expect(steuerErsparnis(5000, a)).toBeLessThan(0);
    expect(steuerErsparnis(0, a)).toBe(0);
  });

  it("pauschal bleibt Verlust × Satz (Einhauser 42 %)", () => {
    const a = { ...STANDARD_ANNAHMEN, steuer: 0.42 };
    expect(genauGerechnet(a)).toBe(false);
    expect(steuerErsparnis(-10000, a)).toBeCloseTo(4200, 10);
    expect(grenzsatz(a)).toBe(0.42);
  });

  it("Soli und Kirchensteuer wirken auf beide Steuerbeträge", () => {
    const ohne = genau(120000, false, { mitSoli: false });
    const mit = genau(120000, false, { kirchensteuersatz: 9 });
    expect(steuerErsparnis(-10000, mit)).toBeGreaterThan(steuerErsparnis(-10000, ohne));
  });
});

describe("Splitting (Beispiel Doppelverdiener)", () => {
  it("zvE 51.538 €: ESt 6.110 €, Grenzsteuersatz 26,73 %", () => {
    const a = genau(51538, true);
    expect(einkommensteuerTarif2026(51538, true)).toBe(6110);
    expect(steuerGesamt(51538, a)).toBe(6110);
    expect(grenzsatz(a)).toBeCloseTo(0.2673, 4);
  });
});

describe("Beispiel Alleinverdiener, WE 20", () => {
  it("Verlust Jahr 1 rund 16.989 €, Ersparnis rund 4.521 € statt 4.757 € pauschal", () => {
    const x = rechneEinheit(WE20, einzel());
    expect(x.jahr.ergebnis).toBeCloseTo(-16989.62, 2);
    expect(Math.abs(x.jahr.ersparnis - 4521)).toBeLessThanOrEqual(2);
    expect(x.satzWirksam).toBeCloseTo(x.jahr.ersparnis / 16989.62, 6);
    expect(grenzsatz(einzel())).toBeCloseTo(0.2808, 4);
    expect(rechneEinheit(WE20, { ...einzel(), steuerArt: "pauschal" }).jahr.ersparnis).toBeCloseTo(4757.0, 0);
  });

  it("Kindergeld ist bei zwei Kindern günstiger als der Kinderfreibetrag", () => {
    expect(guenstigerpruefung(2, einzel())?.kindergeldBesser).toBe(true);
  });

  it("Varianten der Kaufnebenkosten und Sternchen-Jahr", () => {
    const ek = rechneEinheit(WE20, einzel());
    const nr = rechneEinheit(WE20, einzel({ nkFinanzierung: "nachrang" }));
    const kp = rechneEinheit(WE20, einzel({ nkFinanzierung: "darlehen" }));
    expect(ek.ek).toBeCloseTo(19550, 6);
    expect(nr.ek).toBe(0);
    expect(nr.nrBetrag).toBeCloseTo(19550, 6);
    expect(kp.darlehen).toBeCloseTo(249550, 6);
    // Zuzahlung vor Steuer = Rate + nicht umlagefähiges Hausgeld + Rücklage − Miete.
    expect(-ek.monat.vor).toBeCloseTo(1150 + 52.5 + 28.1 - 573.65, 6);
    expect(-kp.monat.vor).toBeCloseTo(249550 * 0.06 / 12 + 52.5 + 28.1 - 573.65, 6);
    expect(-nr.monat.vor).toBeCloseTo(-ek.monat.vor + 19550 * 0.091 / 12, 6);
    // AfA gleich in allen Varianten; die Nebenkosten zählen nur über die AfA.
    expect(kp.afaJahr).toBeCloseTo(ek.afaJahr, 6);
    expect(ek.afaEnde).toBe(18);
    expect(ek.entw[18].wert).toBeGreaterThan(0);
  });
});
