import { describe, expect, it } from "vitest";
import golden from "./rechenkern.golden.json";
import { berechneInvestment, type InvestmentEingabe } from "./rechenkern";
import { rechenweg, rechenwege, werteAus, type Rechenweg, type RechenwegSchluessel } from "./kennzahlErklaerungen";
import { KENNZAHL_TEXTE } from "./kennzahlTexte";

/*
 * Die Rechenwege unter den Kennzahlen.
 *
 * Geprüft wird dreierlei:
 *
 * 1. Jede Zeile geht auf. Wertet man ihre Glieder ungerundet aus, kommt genau
 *    das Ergebnis des Rechenkerns heraus, das auch die Kachel zeigt.
 * 2. Mit den angezeigten, gerundeten Werten geht sie entweder genau auf und
 *    trägt „=“, oder sie trägt „≈“. Nie steht ein „=“ vor einer Zahl, auf die
 *    man beim Nachrechnen nicht kommt.
 * 3. Am Referenzbeispiel aus rechenkern.test.ts stehen die Zeilen wörtlich so,
 *    wie Christian sie am 25.09.2026 beschrieben hat.
 */

const basis = (golden as unknown as { standard: { input: InvestmentEingabe } }).standard.input;

/**
 * Das Referenzbeispiel aus rechenkern.test.ts (Kaufpreis 250.000 €, davon
 * Möbel 8.000 €, Nebenkosten 5 %, Gebäudeanteil 80 %), dazu Miete 900 €,
 * nicht umlagefähige Kosten 50 € und so viel Eigenkapital, dass das Darlehen
 * genau 250.000 € beträgt. Das ergibt die Rate 1.145,83 € aus Christians
 * Beispiel.
 */
const referenz: InvestmentEingabe = {
  ...basis,
  purchasePrice: 250000,
  furniturePrice: 8000,
  buildingShare: 80,
  transferTaxRate: 3.5,
  notaryRate: 1,
  landRegisterRate: 0.5,
  brokerRate: 0,
  otherPurchaseCostRate: 0,
  depreciationMethod: "linear",
  buildingDepreciationRate: 2,
  specialDepreciationRate: 0,
  furnitureDepreciationYears: 10,
  rehabExpense: 0,
  investmentShare: 100,
  jointAssessment: false,
  monthlyColdRent: 900,
  monthlyOperatingCosts: 50,
  vacancyRate: 0,
  // In Höhe der Kaufnebenkosten (seit dem 30.09.2026 5 % auf 242.000 ohne Möbel), das Darlehen bleibt 250.000.
  equity: 12100,
};

/** Varianten, die jeden Zweig der Rechenwege einmal durchlaufen. */
const varianten: [string, InvestmentEingabe][] = [
  ["Referenzbeispiel", referenz],
  ["positiver Cashflow", { ...referenz, monthlyColdRent: 1400 }],
  ["Nachrang, Leerstand, Rücklage", { ...referenz, juniorLoanAmount: 20000, vacancyRate: 2, maintenanceReserve: 3000 }],
  ["Anteil 50 Prozent", { ...referenz, investmentShare: 50 }],
  // Seit dem Investagon-Abgleich vom 25.09.2026: Die Zuführung zur Rücklage zählt im Cashflow und in der Nettorendite.
  ["Zuführung Rücklage", { ...referenz, monthlyReserveContribution: 90 }],
  ["manueller Steuersatz", { ...referenz, taxCalculationMode: "manual", marginalTaxRate: 42 }],
  ["Erhaltungsaufwand abziehen", { ...referenz, rehabExpense: 20000, rehabMode: "expense", rehabDistributionYears: 2 }],
  ["Erhaltungsaufwand aktivieren", { ...referenz, rehabExpense: 20000, rehabMode: "capitalize" }],
  ["Wertverlust", { ...referenz, annualValueGrowth: -1 }],
  ["Vollfinanzierung", { ...referenz, equity: 0 }],
  ["Zeitraum 20 Jahre", { ...referenz, forecastYears: 20 }],
  ["ein Jahr", { ...referenz, forecastYears: 1 }],
  ["Standardfall der Golden-Datei", basis],
];

/** Leerzeichen vereinheitlichen: Intl setzt ein geschütztes Leerzeichen vor „€“ und „%“. */
const glatt = (text: string) => text.replace(/\u00a0|\u202f/g, " ");

function alle(eingabe: InvestmentEingabe): [RechenwegSchluessel, Rechenweg][] {
  const wege = rechenwege(eingabe, berechneInvestment(eingabe));
  return (Object.entries(wege) as [RechenwegSchluessel, Rechenweg | null][]).filter(
    (eintrag): eintrag is [RechenwegSchluessel, Rechenweg] => eintrag[1] !== null,
  );
}

describe("Jede Rechenweg-Zeile geht rechnerisch auf", () => {
  for (const [name, eingabe] of varianten) {
    it(`ungerundet exakt: ${name}`, () => {
      for (const [schluessel, weg] of alle(eingabe)) {
        const ausgewertet = werteAus(weg.glieder);
        expect(ausgewertet, schluessel).toBeCloseTo(weg.ergebnis, 6);
      }
    });

    it(`gerundet nur mit „=“, wenn es aufgeht: ${name}`, () => {
      for (const [schluessel, weg] of alle(eingabe)) {
        const stellen = weg.einheit === "euro" ? 0 : weg.einheit === "cent" ? 2 : weg.einheit === "prozent1" ? 3 : 4;
        // Halbe Cent vom Nullpunkt weg, so wie Intl.NumberFormat in der Kachel.
        const runde = (wert: number) => Math.sign(wert) * Math.round(Math.abs(wert) * 10 ** stellen);
        const geht = runde(werteAus(weg.glieder, true)) === runde(weg.ergebnis);
        expect(weg.gerundet, schluessel).toBe(!geht);
        expect(weg.text.includes(" = "), schluessel).toBe(geht);
        expect(weg.text.includes(" ≈ "), schluessel).toBe(!geht);
      }
    });

    it(`schreibt Minus als Rechenzeichen, nie als Bindestrich: ${name}`, () => {
      for (const [schluessel, weg] of alle(eingabe)) {
        expect(weg.text, schluessel).not.toMatch(/-\s?\d/);
        expect(weg.text, schluessel).not.toMatch(/[–—]/);
      }
    });
  }

  it("liefert für jede Kachel der ersten Seite einen Rechenweg", () => {
    const wege = rechenwege(referenz, berechneInvestment(referenz));
    for (const [schluessel, weg] of Object.entries(wege)) expect(weg, schluessel).not.toBeNull();
    expect(Object.keys(wege)).toHaveLength(15);
  });
});

describe("Die Zeilen am Referenzbeispiel", () => {
  const ergebnis = berechneInvestment(referenz);
  const wege = rechenwege(referenz, ergebnis);
  const text = (schluessel: RechenwegSchluessel) => glatt(wege[schluessel]?.text ?? "");

  it("Cashflow vor Steuer: Miete minus Rate minus Kosten", () => {
    expect(text("cashflowVorSteuer")).toBe(
      "Miete 900,00 € − Rate 1.145,83 € − nicht umlagefähige Kosten 50,00 € = −295,83 €",
    );
  });

  it("Cashflow nach Steuer: vor Steuer plus Steuereffekt, mit denselben Werten wie die Jahrestabelle", () => {
    const steuerMonat = ergebnis.years[0].taxEffect / 12;
    const nachSteuer = ergebnis.years[0].cashflowAfterTax / 12;
    const cent = (wert: number) =>
      glatt(Math.abs(wert).toLocaleString("de-DE", { style: "currency", currency: "EUR" }));
    expect(steuerMonat).toBeGreaterThan(0);
    expect(text("cashflowNachSteuer")).toBe(
      `−295,83 € + Steuereffekt ${cent(steuerMonat)} = ${nachSteuer < 0 ? "−" : "+"}${cent(nachSteuer)}`,
    );
  });

  it("Bruttorendite: Jahresmiete durch Kaufpreis", () => {
    expect(text("bruttorendite")).toBe("Jahresmiete 10.800 € ÷ Kaufpreis 250.000 € = 4,32 %");
  });

  it("Nettorendite: Klammer um die Differenz, geteilt durch die Gesamtkosten", () => {
    expect(text("nettorendite")).toBe(
      // Gesamtkosten 262.600 €: 262.100 € plus 0,2 % Finanzierungsnebenkosten auf 250.000 € Darlehen.
      "(Jahresmiete 10.800 € − nicht umlagefähige Kosten 600 €) ÷ Gesamtkosten 262.600 € = 3,88 %",
    );
  });

  it("Kreditrate: Darlehen mal Zins plus Tilgung, durch zwölf", () => {
    expect(text("kreditrate")).toBe("Bankdarlehen 250.000 € × (Zins 4,00 % + Tilgung 1,50 %) ÷ 12 = 1.145,83 €");
  });

  it("Kaltmiete: nennt den Leerstand, auch wenn er null ist", () => {
    expect(text("kaltmiete")).toBe("Kaltmiete 900 € × (100,00 % − Leerstand 0,00 %) = 900 €");
  });

  it("Steuereffekt im ersten Jahr: Steuer ohne minus Steuer mit Immobilie", () => {
    expect(text("steuereffektErstesJahr")).toMatch(/^Steuer ohne Immobilie [\d.]+ € − Steuer mit Immobilie [\d.]+ € = \+[\d.]+ €$/);
  });

  it("die übrigen Zeilen nennen ihre Bausteine", () => {
    expect(text("immobilienwert")).toMatch(/^Immobilienanteil 242\.000 € \+ Wertzuwachs [\d.]+ € \+ Möbel-Restbuchwert 0 € = [\d.]+ €$/);
    expect(text("restschuld")).toMatch(/^Darlehen 250\.000 € − Tilgung 10 Jahre [\d.]+ € = [\d.]+ €$/);
    expect(text("immobilieMinusRestschuld")).toMatch(/^Immobilienwert [\d.]+ € − Restschuld [\d.]+ € = [\d.]+ €$/);
    expect(text("selbstEingezahlt")).toMatch(/^Ø [\d.,]+ € im Monat × 120 Monate mit Zuzahlung [=≈] [\d.]+ €$/);
    // Stand zu Beginn seit dem 30.09.2026 genau 0 (Möbel ohne Nebenkosten), das Glied entfällt dann.
    expect(text("vermoegensaufbau")).toMatch(/^Immobilie minus Restschuld 2035 [\d.]+ € ÷ 120 Monate [=≈] [\d.,]+ €$/);
    // Mit 400 € mehr Eigenkapital steht der Anfangsstand wieder als Glied da.
    const mehr = { ...referenz, equity: 12500 };
    expect(glatt(rechenwege(mehr, berechneInvestment(mehr)).vermoegensaufbau?.text ?? "")).toMatch(
      /^\(Immobilie minus Restschuld 2035 [\d.]+ € − Stand zu Beginn 400 €\) ÷ 120 Monate [=≈] [\d.,]+ €$/,
    );
    expect(text("gesamtvermoegen")).toMatch(
      /^Immobilie minus Restschuld 2035 [\d.]+ € − Zuzahlungen nach Steuer 10 Jahre [\d.]+ € [=≈] [\d.]+ €$/,
    );
    expect(text("steuereffektGesamt")).toMatch(/^1\. Jahr [\d.]+ € \+ 2\. bis 10\. Jahr [\d.]+ € [=≈] \+[\d.]+ €$/);
  });
});

describe("Steuereffekt über den Betrachtungszeitraum", () => {
  for (const [name, eingabe] of varianten) {
    it(`ist die Summe der Jahreswerte: ${name}`, () => {
      const ergebnis = berechneInvestment(eingabe);
      const summe = ergebnis.years.reduce((gesamt, jahr) => gesamt + jahr.taxEffect, 0);
      const weg = rechenwege(eingabe, ergebnis).steuereffektGesamt;
      expect(ergebnis.cumulativeTaxEffect).toBeCloseTo(summe, 6);
      expect(weg?.ergebnis).toBeCloseTo(summe, 6);
      expect(werteAus(weg?.glieder ?? [])).toBeCloseTo(summe, 6);
    });
  }
});

describe("Vorzeichen und Rundung", () => {
  it("dreht bei einem negativen Glied das Zeichen um und nimmt die Beschriftung für den negativen Fall", () => {
    const weg = rechenweg(
      [
        { wert: 100, einheit: "cent" },
        { zeichen: "+", label: "Steuereffekt", labelNegativ: "Steuermehrbelastung", wert: -20, einheit: "cent" },
      ],
      80,
      "cent",
      "cashflowNachSteuer",
      true,
    );
    expect(glatt(weg.text)).toBe("100,00 € − Steuermehrbelastung 20,00 € = +80,00 €");
  });

  it("setzt „≈“, wenn die gerundeten Glieder nicht genau auf das gerundete Ergebnis kommen", () => {
    // 0,4 + 0,4 ergibt 0,8 und gerundet 1, die gerundeten Glieder aber 0 + 0.
    const weg = rechenweg(
      [
        { label: "a", wert: 0.4, einheit: "euro" },
        { zeichen: "+", label: "b", wert: 0.4, einheit: "euro" },
      ],
      0.8,
      "euro",
      "gesamtvermoegen",
    );
    expect(weg.gerundet).toBe(true);
    expect(glatt(weg.text)).toBe("a 0 € + b 0 € ≈ 1 €");
  });
});

describe("Rechenwege und Glossar aus derselben Quelle", () => {
  it("verweist jede Zeile auf einen vorhandenen Glossareintrag", () => {
    for (const [name, eingabe] of varianten) {
      for (const [schluessel, weg] of alle(eingabe)) {
        expect(KENNZAHL_TEXTE.glossar.eintraege[weg.glossar], `${name}: ${schluessel}`).toBeDefined();
      }
    }
  });
});
