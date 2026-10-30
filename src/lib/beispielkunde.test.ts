import { describe, it, expect } from "vitest";
import { BEISPIEL_SA } from "./beispielkunde";
import { investmentFinanzZahlen, extractAusgaben, bankLebenshaltung } from "./finanzierbarkeitUtils";

/**
 * Selbstauskunft gegen Investment, eins zu eins (Christian, 16.10.2026).
 *
 * „Wenn im Kundenprofil bei Investments eine Selbstauskunft ausgefüllt wurde,
 * sollen bei Einkünfte, Ausgaben und Überschussrechnung die Werte immer eins
 * zu eins angezeigt werden.“ Der Finanzblock im Investment holt seine Zahlen
 * aus `investmentFinanzZahlen`; hier wird jede Position der vollständigen
 * Beispiel-Selbstauskunft dagegen geprüft.
 *
 * Bis zum 16.10.2026 wich die Anzeige an zwei Stellen ab:
 *   1. Lebenshaltung zeigte den Bankansatz (30 % vom Netto, mind. 800 €)
 *      statt des eingetragenen Betrags.
 *   2. Bürgschaften, im Formular als verbürgte Gesamtsumme erfragt, standen
 *      als monatliche Ausgabe in der Rechnung.
 */
describe("Selbstauskunft → Investment, eins zu eins", () => {
  const z = investmentFinanzZahlen(BEISPIEL_SA);

  it("zeigt jede Einkunft von Person 1 mit dem eingetragenen Betrag", () => {
    expect(z.eink).toEqual({
      gehalt: 3850.5, selbstaendig: 0, renten: 0, mieteinnahmen: 650,
      zinsen: 12.34, sonstige: 200, kindergeld: 255,
    });
    expect(z.sumEink).toBeCloseTo(4967.84, 2);
  });

  it("zeigt jede Ausgabe von Person 1 mit dem eingetragenen Betrag", () => {
    expect(z.ausg).toEqual({
      miete: 950, lebenshaltung: 700, privateKV: 0,
      zinsTilgung: 610, autokredite: 249, privatkredite: 0, sonstigeKredite: 0,
      unterhalt: 0, versicherungen: 65 + 100 + 45.5,
      nebenkosten: 210, kfzKosten: 180, sonstige: 80,
    });
  });

  it("führt Person 2 getrennt und vollständig", () => {
    expect(z.p2Eink?.gehalt).toBe(2400);
    expect(z.sumEinkP2).toBe(2400);
    expect(z.p2Ausg?.lebenshaltung).toBe(300);
    expect(z.p2Ausg?.privatkredite).toBe(120);
    expect(z.p2Ausg?.versicherungen).toBe(40);
    expect(z.sumAusgP2).toBe(460);
  });

  it("rechnet den Überschuss aus genau diesen Zahlen", () => {
    const ausgP1 = 950 + 700 + 610 + 249 + 210.5 + 210 + 180 + 80;
    expect(z.sumAusg).toBeCloseTo(ausgP1, 2);
    expect(z.sumEinkGes).toBeCloseTo(4967.84 + 2400, 2);
    expect(z.sumAusgGes).toBeCloseTo(ausgP1 + 460, 2);
    expect(z.ueberschuss).toBeCloseTo(4967.84 + 2400 - ausgP1 - 460, 2);
  });

  it("zählt Bürgschaften nicht als Monatsausgabe, nennt sie aber", () => {
    expect(z.buergschaften).toBe(3000);
    expect("buergschaften" in z.ausg).toBe(false);
  });

  it("lässt Person 2 weg, wenn die Selbstauskunft sie nicht führt", () => {
    const ohne = investmentFinanzZahlen({ ...BEISPIEL_SA, person2: false });
    expect(ohne.p2Eink).toBeNull();
    expect(ohne.sumEinkGes).toBeCloseTo(4967.84, 2);
  });

  it("stellt den Bankansatz getrennt daneben, ohne die Kundenwerte zu ändern", () => {
    // Lebenshaltung: P1 hebt die Bank auf 30 % von 3.850,50, P2 auf den Mindestbetrag 1.000.
    const lhBank = bankLebenshaltung(700, 3850.5) + bankLebenshaltung(300, 2400);
    expect(lhBank).toBe(1155 + 1000);
    // Mieteinnahmen setzt der Rahmen nur zu 80 % an: 650 € Kaltmiete zählen 520 €.
    expect(z.bank?.sumEink).toBeCloseTo(z.sumEinkGes - 650 * 0.2, 2);
    expect(z.bank?.ueberschuss).toBeCloseTo(z.ueberschuss - (lhBank - 1000) - 650 * 0.2, 2);
    expect(z.eink.mieteinnahmen).toBe(650);
    expect(extractAusgaben(BEISPIEL_SA).lebenshaltung).toBe(1155);
    expect(z.ausg.lebenshaltung).toBe(700);
  });
});
