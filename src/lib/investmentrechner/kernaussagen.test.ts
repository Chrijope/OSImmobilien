import { describe, it, expect } from "vitest";
import { berechneInvestment, standardEingabe } from "./rechenkern";

/**
 * Die fünf Zahlen, die seit dem 21.09.2026 groß auf der ersten Seite stehen.
 *
 * WARUM DIESER TEST WICHTIG IST
 *
 * Christians Excel-Musterberechnung rechnet die Eigenkapitalrendite falsch: Sie
 * setzt im Nenner das Eigenkapital plus EIN Jahr Einzahlungen an, obwohl der
 * Kunde zehn Jahre lang einzahlt. Im durchgerechneten Beispiel kommt sie damit
 * auf 45,8 Prozent statt auf 12,7, also auf das 3,6-fache.
 *
 * Christian hat dazu gesagt: „wichtig ist, dass du es im Investmentrechner
 * absolut korrekt und richtig angibst." Genau das prüft dieser Test. Er hält
 * die Rechnung gegen Werte, die ich unabhängig vom Rechenkern nachgerechnet
 * habe, nicht gegen das, was der Rechenkern gerade liefert.
 */

/**
 * Der Beispielfall aus der Abstimmung: 320.000 Euro Kaufpreis, 8 Prozent
 * Nebenkosten, Kaufpreis voll finanziert, 3,8 Prozent Zins, 2 Prozent
 * Anfangstilgung, 1,5 Prozent Wertsteigerung, zehn Jahre.
 */
const FALL = {
  ...standardEingabe,
  purchasePrice: 320_000,
  equity: 0,
  // Achtung: Saetze stehen in PROZENT, nicht als Dezimalzahl. Mein erster
  // Entwurf setzte 0.038 statt 3.8 und rechnete damit mit 0,038 Prozent Zins.
  // Der Test hat es aufgedeckt, die Tilgung lag bei 5,60 Euro im Monat.
  seniorInterestRate: 3.8,
  seniorRepaymentRate: 2,
  annualValueGrowth: 1.5,
  forecastYears: 10,
  monthlyColdRent: 980,
  annualGrossIncome: 85_000,
  // Zusammen 8 Prozent Nebenkosten, die der Kunde selbst traegt.
  transferTaxRate: 3.5,
  notaryRate: 1.5,
  landRegisterRate: 0.5,
  brokerRate: 2.5,
  otherPurchaseCostRate: 0,
};

describe("Die Bezugsgröße der Eigenkapitalrendite", () => {
  it("rechnet auch ohne eingetragenes Eigenkapital eine Rendite", () => {
    const r = berechneInvestment(FALL);

    /*
      Vorher stand hier ein Strich, weil die Rechnung ein gefülltes Feld
      Eigenkapital verlangte. Zahlt der Kunde monatlich zu, ist genau das sein
      Einsatz, und darauf lässt sich eine Rendite rechnen.
    */
    expect(r.irr).not.toBeNull();
    expect(r.eigenkapitalBasis).toBeGreaterThan(0);
  });

  it("zählt Eigenkapital, Finanzierungsnebenkosten und alle Zuzahlungen als Einsatz", () => {
    const r = berechneInvestment({ ...FALL, equity: 50_000 });
    const zuzahlungen = r.years.reduce((s, j) => s + Math.max(0, -j.cashflowAfterTax), 0);

    // Seit dem 25.09.2026 zahlt der Kunde die Finanzierungsnebenkosten zu Beginn selbst.
    expect(r.finanzierungsnebenkosten).toBeGreaterThan(0);
    expect(r.eigenkapitalBasis).toBeCloseTo(50_000 + r.finanzierungsnebenkosten + zuzahlungen, 0);
  });

  it("liefert eine niedrigere Rendite, je mehr Eigenkapital eingesetzt wird", () => {
    // Die Gegenprobe zur Excel: Mehr eingesetztes Kapital muss die Rendite
    // senken. Die Excel-Formel reagiert darauf kaum, weil ihr Nenner nur ein
    // Jahr Einzahlungen kennt.
    const wenig = berechneInvestment({ ...FALL, equity: 30_000 });
    const viel = berechneInvestment({ ...FALL, equity: 120_000 });

    expect(wenig.irr!).toBeGreaterThan(viel.irr!);
  });
});

describe("Die Rendite bleibt in einer Größenordnung, die man verteidigen kann", () => {
  it("liegt im Beispielfall deutlich unter dem, was die Excel ausweist", () => {
    const r = berechneInvestment(FALL);

    // Die Excel kommt für diesen Fall auf rund 46 Prozent. Alles über 25 wäre
    // wieder derselbe Fehler: eine Zahl, die keiner Nachfrage standhält.
    expect(r.irr!).toBeLessThan(0.25);
    expect(r.irr!).toBeGreaterThan(0);
  });

  it("fällt ohne Wertsteigerung deutlich niedriger aus", () => {
    const r = berechneInvestment(FALL);

    // Das ist der Moment im Gespräch, in dem der Regler auf null geht.
    expect(r.irrWithoutAppreciation).not.toBeNull();
    expect(r.irrWithoutAppreciation!).toBeLessThan(r.irr!);
  });
});

describe("Vermögensaufbau je Monat", () => {
  it("zählt nur den Zuwachs, nicht das mitgebrachte Eigenkapital", () => {
    // Wer 100.000 mitbringt, hat sie nicht aufgebaut. Ohne den Abzug des
    // Anfangsstands stünde genau das in der Kachel.
    const ohne = berechneInvestment(FALL);
    const mit = berechneInvestment({ ...FALL, equity: 100_000 });

    const zuwachsOhne = ohne.vermoegensaufbauMonat * FALL.forecastYears * 12;
    const zuwachsMit = mit.vermoegensaufbauMonat * FALL.forecastYears * 12;

    // Der Unterschied darf nicht die vollen 100.000 betragen; er kommt allein
    // aus der kleineren Darlehenssumme.
    expect(Math.abs(zuwachsMit - zuwachsOhne)).toBeLessThan(100_000);
  });

  it("liegt unter der Tilgung, wenn auch die Nebenkosten finanziert sind", () => {
    const r = berechneInvestment({ ...FALL, annualValueGrowth: 0 });

    /*
      Das sieht zunächst falsch aus, ist aber richtig: Ohne Eigenkapital
      finanziert der Rechner auch die Kaufnebenkosten. Die werden mitgetilgt,
      schaffen aber keinen Gegenwert in der Immobilie. Der Vermögensaufbau
      liegt deshalb genau um die Nebenkosten unter der Tilgungssumme.
    */
    const monate = FALL.forecastYears * 12;
    const differenz = (r.tilgungMonat - r.vermoegensaufbauMonat) * monate;

    expect(differenz).toBeGreaterThan(0);
    expect(differenz).toBeCloseTo(r.purchaseCosts, 0);
  });

  it("entspricht der Tilgung, wenn der Kunde die Nebenkosten selbst trägt", () => {
    const r = berechneInvestment({
      ...FALL,
      annualValueGrowth: 0,
      equity: 25_600, // genau die Nebenkosten
    });

    expect(r.vermoegensaufbauMonat).toBeCloseTo(r.tilgungMonat, 0);
  });

  it("wächst, sobald ein Wertzuwachs unterstellt wird", () => {
    const ohne = berechneInvestment({ ...FALL, annualValueGrowth: 0 });
    const mit = berechneInvestment({ ...FALL, annualValueGrowth: 1.5 });

    expect(mit.vermoegensaufbauMonat).toBeGreaterThan(ohne.vermoegensaufbauMonat);
    expect(mit.tilgungMonat).toBeCloseTo(ohne.tilgungMonat, 2);
  });
});

describe("Der Eigenanteil und der Faktor je Euro", () => {
  it("nennt den monatlichen Eigenanteil positiv, nicht als negativen Cashflow", () => {
    const r = berechneInvestment(FALL);

    expect(r.eigenanteilMonat).toBeCloseTo(-r.years[0].cashflowAfterTax / 12, 2);
  });

  it("bezieht den Faktor auf alle Einzahlungen, nicht nur auf ein Jahr", () => {
    const r = berechneInvestment(FALL);

    // Das ist der Kern des Excel-Fehlers. Der Faktor muss zum eingesetzten
    // Kapital über die ganze Laufzeit passen, sonst fällt er viel zu hoch aus.
    const vermoegen = r.faktorJeEuro * r.eigenkapitalBasis;

    expect(vermoegen).toBeCloseTo(r.vermoegensaufbauMonat * FALL.forecastYears * 12, 0);
  });
});

/**
 * Der Miteigentumsanteil.
 *
 * ## Was bis zum 21.09.2026 falsch war
 *
 * Der Anteil wirkte im ganzen Rechenkern an genau einer Zeile: Er teilte das
 * steuerliche Ergebnis. Miete, Kosten, Rate, Immobilienwert und Restschuld
 * blieben auf dem vollen Objekt.
 *
 * Die Folge war die Umkehrung der Wahrheit. Der monatliche Eigenanteil ist die
 * Zuzahlung minus die Steuerersparnis. Die Zuzahlung blieb voll, die Ersparnis
 * schrumpfte auf die Hälfte, also **wuchs** der Eigenanteil. Wer zu zweit
 * kaufte, bekam eine höhere Zahl angezeigt als jemand, der dieselbe Wohnung
 * allein kauft.
 */
const HALB = { ...FALL, investmentShare: 50, taxableIncomeCustomer: 60_000, jointAssessment: false };
const GANZ = { ...FALL, investmentShare: 100, taxableIncomeCustomer: 60_000, jointAssessment: false };

describe("Der Anteil wirkt auf alle Eurobeträge", () => {
  it("halbiert die Kreditrate", () => {
    const ganz = berechneInvestment(GANZ);
    const halb = berechneInvestment(HALB);

    expect(halb.monthlyDebtService).toBeCloseTo(ganz.monthlyDebtService / 2, 2);
  });

  it("halbiert den Vermögensaufbau", () => {
    const ganz = berechneInvestment(GANZ);
    const halb = berechneInvestment(HALB);

    expect(halb.vermoegensaufbauMonat).toBeCloseTo(ganz.vermoegensaufbauMonat / 2, 2);
  });

  it("senkt den Eigenanteil, statt ihn zu erhöhen", () => {
    /*
      Der eigentliche Fehler von damals. Etwas weniger als die Hälfte, weil ein
      halber Verlust wegen der Steuerprogression etwas mehr als die halbe
      Ersparnis bringt.
    */
    const ganz = berechneInvestment(GANZ);
    const halb = berechneInvestment(HALB);

    expect(halb.eigenanteilMonat).toBeLessThan(ganz.eigenanteilMonat);
    expect(halb.eigenanteilMonat).toBeLessThan(ganz.eigenanteilMonat / 2);
  });

  it("lässt die Rendite praktisch unverändert", () => {
    // Wer die Hälfte einsetzt und die Hälfte bekommt, hat dieselbe Rendite.
    // Die Güte eines Investments hängt nicht daran, ob man ganz einsteigt.
    const ganz = berechneInvestment(GANZ);
    const halb = berechneInvestment(HALB);

    expect(Math.abs(halb.irr! - ganz.irr!)).toBeLessThan(0.005);
  });

  it("lässt Prozentsätze völlig unberührt", () => {
    // In einem Bruch werden Zähler und Nenner gleichermaßen geteilt.
    const ganz = berechneInvestment(GANZ);
    const halb = berechneInvestment(HALB);

    expect(halb.grossYield).toBeCloseTo(ganz.grossYield, 10);
    expect(halb.netYield).toBeCloseTo(ganz.netYield, 10);
  });
});

describe("Bei Zusammenveranlagung bleibt der Anteil wirkungslos", () => {
  it("rechnet trotz eingetragener 50 Prozent das ganze Objekt", () => {
    /*
      Beide Hälften landen in derselben Steuererklärung, der Anteil ist dort
      steuerlich folgenlos. Wer ihn trotzdem setzt, würde sein Investment
      halbieren, ohne dass sich an der Steuer etwas ändert.

      Die Sperre in der Oberfläche allein genügt nicht: Ein Kunde kann 50
      eingetragen und die Zusammenveranlagung erst danach angehakt haben.
    */
    const mitAnteil = berechneInvestment({ ...FALL, jointAssessment: true, investmentShare: 50 });
    const ohneAnteil = berechneInvestment({ ...FALL, jointAssessment: true, investmentShare: 100 });

    expect(mitAnteil.monthlyDebtService).toBeCloseTo(ohneAnteil.monthlyDebtService, 6);
    expect(mitAnteil.eigenanteilMonat).toBeCloseTo(ohneAnteil.eigenanteilMonat, 6);
  });
});

describe("Selbst eingezahlt, ohne Gegenrechnung", () => {
  it("zählt nur die Zuzahlungen, nicht die Überschussjahre dagegen", () => {
    const r = berechneInvestment(FALL);
    const letztes = r.years[r.years.length - 1];
    const summeZuzahlungen = r.years.reduce((s, j) => s + Math.max(0, -j.cashflowAfterTax), 0);

    expect(letztes.cumulativeEigenanteil).toBeCloseTo(summeZuzahlungen, 6);
  });

  it("ist nie kleiner als der saldierte Wert", () => {
    // Sobald ein Jahr Überschuss bringt, laufen die beiden auseinander, und
    // die ungesaldierte Summe ist die größere. Genau das ist der Grund für die
    // Umstellung: „Selbst eingezahlt" muss die größere Zahl sein.
    const r = berechneInvestment(FALL);
    const letztes = r.years[r.years.length - 1];

    expect(letztes.cumulativeEigenanteil).toBeGreaterThanOrEqual(
      Math.abs(Math.min(0, letztes.cumulativeCashflowAfterTax)),
    );
  });
});
