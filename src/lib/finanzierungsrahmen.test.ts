import { describe, it, expect } from "vitest";
import {
  bankLebenshaltung,
  kreditArt,
  rahmenAusUeberschuss,
  extractAusgaben,
  calculateFinanzierbarkeitFromSaData,
  RAHMEN_PUFFER,
  RAHMEN_ANNUITAET,
} from "./finanzierbarkeitUtils";

/**
 * Der Finanzierungsrahmen lag einmal an sechs Stellen im Code, zwei davon
 * rechneten mit vier statt sechs Prozent Annuitaet. Folge: Der Kunde sah in
 * seinem Portal einen um die Haelfte hoeheren Rahmen als sein Berater in der
 * Kundenakte. Diese Tests halten die Zahlen zusammen.
 */
describe("Finanzierungsrahmen", () => {
  it("rechnet Puffer und Annuitaet wie vereinbart", () => {
    expect(RAHMEN_PUFFER).toBe(0.8);
    expect(RAHMEN_ANNUITAET).toBe(0.06);
    // 1000 Ueberschuss, davon 80 Prozent tragbar, mal 12 Monate, durch 6 Prozent
    expect(rahmenAusUeberschuss(1000).maxDarlehen).toBe(160000);
  });

  it("zaehlt Eigenkapital auf den Rahmen, nicht auf die Rate", () => {
    const r = rahmenAusUeberschuss(1000, 50000);
    expect(r.maxDarlehen).toBe(160000);
    expect(r.empfRahmen).toBe(210000);
  });

  it("setzt die Lebenshaltung auf den Bankansatz an", () => {
    // Eingabe unter der Pauschale wird angehoben
    expect(bankLebenshaltung(400, 4000)).toBe(1200);
    // Eingabe darueber bleibt stehen
    expect(bankLebenshaltung(1800, 4000)).toBe(1800);
    // Ohne Einkommensangabe greift der Mindestbetrag
    expect(bankLebenshaltung(300, 0)).toBe(800);
    // Kleines Einkommen: der Mindestbetrag schlaegt die 30 Prozent
    expect(bankLebenshaltung(0, 1000)).toBe(800);
  });

  it("dichtet einem leeren Haushalt keine Ausgaben an", () => {
    /*
     * Eine gerade erst geoeffnete Selbstauskunft hat weder Einkommen noch
     * Lebenshaltung. Ohne diese Regel bekam sie 800 Euro Ausgaben zugerechnet,
     * bei zwei Personen 1600, und die Uebersicht zeigte ein Minus, obwohl der
     * Kunde noch nichts eingetragen hatte.
     */
    expect(bankLebenshaltung(0, 0)).toBe(0);
    // Sobald etwas bekannt ist, greift die Pauschale wieder
    expect(bankLebenshaltung(0, 3000)).toBe(900);
    expect(bankLebenshaltung(500, 0)).toBe(800);
  });

  it("ordnet Kredite ueberall gleich zu", () => {
    /*
     * Die Zuordnung lag einmal in vier Kopien, eine davon im
     * Selbstauskunfts-PDF mit einer kuerzeren Stichwortliste. Dieselbe
     * Selbstauskunft zeigte deshalb in der Akte andere Zahlen als im PDF.
     */
    expect(kreditArt("Hypothek Sparkasse")).toBe("hypothek");
    expect(kreditArt("Bausparvertrag LBS")).toBe("hypothek");
    expect(kreditArt("Autokredit")).toBe("auto");
    expect(kreditArt("KFZ Leasing")).toBe("auto");
    expect(kreditArt("Kreditkarte")).toBe("privat");
    expect(kreditArt("Ratenkredit")).toBe("privat");
    /*
     * Was keine Regel trifft, bleibt Sonstiges. Genau daran ist der Fall
     * Laube aufgefallen: Eine Marke wie "VW" ist fuer die Automatik kein
     * Auto, und das laesst sich mit Stichwoertern auch nicht loesen. Es gibt
     * zu viele Marken, und morgen kommt eine neue dazu. Deshalb das
     * Auswahlfeld, siehe naechster Test.
     */
    expect(kreditArt("VW")).toBe("sonstige");
    expect(kreditArt("Darlehen Onkel")).toBe("sonstige");
    expect(kreditArt("")).toBe("sonstige");
  });

  it("nimmt die Auswahl des Kunden vor dem Raten", () => {
    // Neuere Selbstauskuenfte tragen ein Auswahlfeld. Ist es gesetzt, wird
    // nicht mehr geraten, auch wenn der Freitext etwas anderes nahelegt.
    expect(kreditArt("VW Bank", "privat")).toBe("privat");
    expect(kreditArt("Hypothek", "auto")).toBe("auto");
    // Unbekannte Werte werden ignoriert, dann greift wieder der Freitext.
    expect(kreditArt("Autokredit", "quatsch")).toBe("auto");
  });

  it("extrahiert die Ausgaben mit der Semantik des Kundenprofils", () => {
    /*
     * Die Extraktion lag in drei Fassungen vor (Kundenprofil, Lib, Portal),
     * die bei Unterhalt, Nebenkosten und KFZ-Kosten abwichen. Kanonisch ist
     * das Kundenprofil: Unterhalt zaehlt immer, Nebenkosten und KFZ-Kosten
     * gibt es nur in der neuen SA-Form mit einkommen-Objekt.
     */
    const altForm = extractAusgaben({ unterhalt: "200", nebenkosten: "300", kfzKosten: "100", miete: "800" });
    expect(altForm.unterhalt).toBe(200);
    expect(altForm.nebenkosten).toBe(0);
    expect(altForm.kfzKosten).toBe(0);
    expect(altForm.miete).toBe(800);

    const neuForm = extractAusgaben({ einkommen: { netto: "3000" }, unterhalt: "200", nebenkosten: "300", kfzKosten: "100", mieteWarm: "900" });
    expect(neuForm.unterhalt).toBe(200);
    expect(neuForm.nebenkosten).toBe(300);
    expect(neuForm.kfzKosten).toBe(100);
    expect(neuForm.miete).toBe(900);
  });

  it("liefert Kundenprofil und Portal denselben Rahmen aus derselben SA", () => {
    /*
     * Kundenprofil (Objektauswahl, aktuelle Finanzierbarkeit) und Portal
     * (Finanzierbarkeits-Karte, Startseite) rufen jetzt dieselbe Funktion.
     * Der Test rechnet die Spanne einmal von Hand nach, damit eine neue
     * Kopie mit eigener Formel sofort auffaellt.
     */
    const sa = {
      einkommen: { netto: "4.000,00" },
      lebenshaltungskosten: "1.000,00",
      mieteWarm: "1.000,00",
      vermoegenswerte: [{ art: "Depot", institut: "ING", betrag: "50.000,00" }],
    };
    const calc = calculateFinanzierbarkeitFromSaData(sa)!;
    // Einnahmen 4000; Ausgaben: Miete 1000 + Lebenshaltung max(1000, 30 %) = 1200
    expect(calc.sumEink).toBe(4000);
    expect(calc.sumAusg).toBe(2200);
    expect(calc.ueberschuss).toBe(1800);
    const rahmen = rahmenAusUeberschuss(1800, 50000);
    expect(calc.maxDarlehen).toBe(rahmen.maxDarlehen);
    expect(calc.empfRahmen).toBe(rahmen.empfRahmen);
    expect(calc.minRahmen).toBe(Math.round(rahmen.maxDarlehen * 0.8 + 50000));
    expect(calc.maxRahmen).toBe(Math.round(rahmen.maxDarlehen * 1.2 + 50000));
    expect(calc.hasPerson2).toBe(false);
  });

  // Der Spiegel dieser Rechnung in `get-objektvorstellung` ist am 23.09.2026
  // entfallen: Die Objektvorstellung ist abgeschaltet, die Function rechnet
  // nichts mehr und gibt nur noch den Partner heraus.
});
