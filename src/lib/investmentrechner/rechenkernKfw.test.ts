import { describe, expect, it } from "vitest";
import { berechneInvestment, standardEingabe, type InvestmentEingabe } from "./rechenkern";
import { rechenwege, werteAus } from "./kennzahlErklaerungen";

/*
 * KfW-Darlehen im Rechenkern, seit dem 07.10.2026.
 *
 * Beispiel: Kaufpreis 405.000 Euro, Kaufnebenkosten 5 Prozent (20.250 Euro)
 * als Eigenkapital. Bank 255.000 Euro zu 3,8 Prozent mit 2 Prozent Tilgung,
 * KfW 150.000 Euro zu 2,1 Prozent, 3 Jahre tilgungsfrei, 30 Jahre Laufzeit,
 * 10 Jahre Zinsbindung. Die Erwartungen rechnet der Test selbst mit den
 * Formeln nach, nicht mit dem Rechenkern.
 */
const OHNE_KFW: InvestmentEingabe = {
  ...standardEingabe,
  taxableIncomeCustomer: 80000,
  purchasePrice: 405000,
  equity: 20250,
  seniorInterestRate: 3.8,
  seniorRepaymentRate: 2,
  monthlyColdRent: 1350,
  monthlyOperatingCosts: 60,
  forecastYears: 30,
};

const BEISPIEL: InvestmentEingabe = {
  ...OHNE_KFW,
  kfwEnabled: true,
  kfwProgram: "KfW 297/298 Klimafreundlicher Neubau",
  kfwLoanAmount: 150000,
  kfwInterestRate: 2.1,
  kfwFixedRateYears: 10,
  kfwTermYears: 30,
  kfwGracePeriodYears: 3,
};

const BANK_RATE_MONAT = (255000 * (0.038 + 0.02)) / 12; // 1.232,50 €
const KFW_ZINS_MONAT = (150000 * 0.021) / 12; // 262,50 €
const i = 0.021 / 12;
/** Monatliche Annuität: K · i / (1 − (1 + i)^−n). */
const annuitaet = (k: number, n: number) => (k * i) / (1 - (1 + i) ** -n);
const KFW_ANNUITAET = annuitaet(150000, 27 * 12);
/** Restschuld einer Monatsannuität nach m Monaten: K·q^m − A·(q^m − 1)/i. */
const restMonatlich = (k: number, a: number, m: number) => k * (1 + i) ** m - (a * ((1 + i) ** m - 1)) / i;
/** Bank: Jahresrate R, Zins auf den Jahresanfang, wie der Rechenkern seit jeher. */
const restBankNachJahren = (n: number) => {
  const q = 1.038;
  return 255000 * q ** n - 14790 * ((q ** n - 1) / (q - 1));
};

describe("KfW-Darlehen: Beispiel aus dem Auftrag", () => {
  const r = berechneInvestment(BEISPIEL);

  it("teilt die Finanzierung: Bank ist der Rest nach Eigenkapital und KfW", () => {
    expect(r.purchaseCosts).toBeCloseTo(20250, 6);
    expect(r.kfwLoanAmount).toBe(150000);
    expect(r.seniorLoanAmount).toBeCloseTo(255000, 6);
    expect(r.totalDebt).toBeCloseTo(405000, 6);
    expect(r.kfwGekuerzt).toBe(false);
  });

  it("Rate in Jahr 1: Bankannuität plus KfW nur Zinsen", () => {
    expect(r.monthlyDebtService).toBeCloseTo(BANK_RATE_MONAT + KFW_ZINS_MONAT, 6);
    expect(r.monthlyDebtService).toBeCloseTo(1495, 6);
    expect(r.years[0].debtService / 12).toBeCloseTo(1495, 6);
    expect(r.years[0].darlehen.kfw.principal).toBe(0);
    expect(r.years[2].darlehen.kfw.principal).toBe(0);
    expect(r.years[2].darlehen.kfw.closingBalance).toBeCloseTo(150000, 6);
  });

  it("Rate in Jahr 4: KfW-Annuität über die restlichen 27 Jahre", () => {
    expect(r.kfwAnnuitaetMonat).toBeCloseTo(KFW_ANNUITAET, 6);
    expect(KFW_ANNUITAET).toBeCloseTo(606.94, 2);
    expect(r.years[3].darlehen.kfw.payment / 12).toBeCloseTo(KFW_ANNUITAET, 6);
    expect(r.years[3].debtService / 12).toBeCloseTo(BANK_RATE_MONAT + KFW_ANNUITAET, 6);
  });

  it("meldet den Ratensprung ab Jahr 4", () => {
    expect(r.rateSprung).toEqual({
      jahr: 4,
      kalenderjahr: BEISPIEL.startYear + 3,
      rateVorher: expect.closeTo(1495, 6),
      rateNachher: expect.closeTo(BANK_RATE_MONAT + KFW_ANNUITAET, 6),
    });
  });

  it("Restschulden nach 10 Jahren, je Darlehen und gesamt", () => {
    const jahr10 = r.years[9];
    const bank = restBankNachJahren(10);
    const kfw = restMonatlich(150000, KFW_ANNUITAET, 84);
    expect(jahr10.darlehen.bank.closingBalance).toBeCloseTo(bank, 4);
    expect(jahr10.darlehen.kfw.closingBalance).toBeCloseTo(kfw, 4);
    expect(jahr10.remainingDebt).toBeCloseTo(bank + kfw, 4);
    expect(r.kfwRestschuldZinsbindung).toBeCloseTo(kfw, 4);
    // Die Zahlen für den Bericht, gerundet.
    expect(Math.round(bank)).toBe(194334);
    expect(Math.round(kfw)).toBe(118861);
  });

  it("Mischzins: nach Betrag gewichtet", () => {
    expect(r.mischzins).toBeCloseTo((255000 * 0.038 + 150000 * 0.021) / 405000, 10);
    expect(r.mischzins * 100).toBeCloseTo(3.1704, 4);
  });

  it("tilgt das KfW-Darlehen bis zum Ende der Laufzeit voll", () => {
    expect(r.years[28].darlehen.kfw.closingBalance).toBeGreaterThan(0);
    expect(r.years[29].darlehen.kfw.closingBalance).toBe(0);
    const getilgt = r.years.reduce((summe, jahr) => summe + jahr.darlehen.kfw.principal, 0);
    expect(getilgt).toBeCloseTo(150000, 4);
  });

  it("Summen je Jahr sind die Summen der Darlehen", () => {
    for (const jahr of r.years) {
      const { bank, nachrang, kfw } = jahr.darlehen;
      expect(jahr.interest).toBeCloseTo(bank.interest + nachrang.interest + kfw.interest, 6);
      expect(jahr.principal).toBeCloseTo(bank.principal + nachrang.principal + kfw.principal, 6);
      expect(jahr.debtService).toBeCloseTo(bank.payment + nachrang.payment + kfw.payment, 6);
      expect(jahr.remainingDebt).toBeCloseTo(bank.closingBalance + nachrang.closingBalance + kfw.closingBalance, 6);
    }
  });

  it("zieht die Zinsen beider Darlehen steuerlich ab", () => {
    const ohne = berechneInvestment(OHNE_KFW);
    const j = r.years[0];
    // Gleiches Objekt, gleiche AfA: Das Ergebnis unterscheidet sich genau um die Zinsen.
    expect(j.buildingDepreciation).toBeCloseTo(ohne.years[0].buildingDepreciation, 6);
    expect(j.taxableResult - ohne.years[0].taxableResult).toBeCloseTo(ohne.years[0].interest - j.interest, 6);
    expect(j.darlehen.kfw.interest).toBeCloseTo(150000 * 0.021, 6);
  });
});

describe("KfW-Darlehen: Ränder", () => {
  it("ohne Schalter rechnet ein eingetragener Betrag nichts, alles wie ohne KfW", () => {
    const aus = berechneInvestment({ ...BEISPIEL, kfwEnabled: false });
    const ohne = berechneInvestment(OHNE_KFW);
    // Nur das Echo der eingetragenen Anlaufjahre unterscheidet sich, gerechnet wird damit nichts.
    expect(aus.kfwAnlaufJahre).toBe(3);
    expect({ ...aus, kfwAnlaufJahre: 0 }).toEqual(ohne);
    expect(ohne.kfwLoanAmount).toBe(0);
    expect(ohne.rateSprung).toBeNull();
    expect(ohne.mischzins).toBeCloseTo(0.038, 10);
  });

  it("kürzt einen KfW-Betrag über dem Finanzierungsbedarf, die Bank fällt auf null", () => {
    const r = berechneInvestment({ ...BEISPIEL, kfwLoanAmount: 500000 });
    expect(r.kfwGekuerzt).toBe(true);
    expect(r.kfwLoanAmount).toBeCloseTo(405000, 6);
    expect(r.finanzierungsbedarf).toBeCloseTo(405000, 6);
    expect(r.seniorLoanAmount).toBe(0);
    expect(r.totalDebt).toBeCloseTo(405000, 6);
  });

  it("hält die tilgungsfreie Zeit kürzer als die Laufzeit und höchstens fünf Jahre", () => {
    const kurz = berechneInvestment({ ...BEISPIEL, kfwTermYears: 3, kfwGracePeriodYears: 5 });
    expect(kurz.rateSprung?.jahr).toBe(3);
    expect(kurz.years[2].darlehen.kfw.closingBalance).toBe(0);
    const lang = berechneInvestment({ ...BEISPIEL, kfwGracePeriodYears: 9 });
    expect(lang.rateSprung?.jahr).toBe(6);
  });

  it("ohne tilgungsfreie Jahre gibt es keinen Sprung und die Annuität läuft ab Monat 1", () => {
    const r = berechneInvestment({ ...BEISPIEL, kfwGracePeriodYears: 0 });
    expect(r.rateSprung).toBeNull();
    expect(r.monthlyDebtService).toBeCloseTo(BANK_RATE_MONAT + annuitaet(150000, 360), 6);
  });

  it("rechnet mit dem Miteigentumsanteil wie das Nachrangdarlehen", () => {
    const r = berechneInvestment({ ...BEISPIEL, investmentShare: 50, equity: 10125 });
    expect(r.kfwLoanAmount).toBeCloseTo(75000, 6);
    expect(r.seniorLoanAmount).toBeCloseTo(127500, 6);
  });
});

describe("KfW in den Rechenwegen unter den Kacheln", () => {
  it("rechnet die Kreditrate aus Bank und KfW nach", () => {
    for (const eingabe of [BEISPIEL, { ...BEISPIEL, kfwGracePeriodYears: 0 }, { ...BEISPIEL, juniorLoanAmount: 20000 }]) {
      const r = berechneInvestment(eingabe);
      const weg = rechenwege(eingabe, r).kreditrate!;
      expect(werteAus(weg.glieder)).toBeCloseTo(r.monthlyDebtService, 6);
      expect(weg.text).toContain(eingabe.kfwGracePeriodYears > 0 ? "KfW-Darlehen" : "KfW-Rate");
    }
  });

  it("zieht den Tilgungszuschuss in der Restschuld eigens ab", () => {
    const eingabe = { ...BEISPIEL, kfwGrantMode: "euro" as const, kfwGrantValue: 15000, kfwGrantYear: 3 };
    const r = berechneInvestment(eingabe);
    const weg = rechenwege(eingabe, r).restschuld!;
    expect(werteAus(weg.glieder)).toBeCloseTo(r.years[r.years.length - 1].remainingDebt, 4);
    expect(weg.text).toContain("Tilgungszuschuss");
  });
});

describe("KfW-Tilgungszuschuss (Prüfung vom 07.10.2026)", () => {
  /** Das letzte Jahr, in dem auf das KfW-Darlehen noch gezahlt wird, ab 1 gezählt. */
  const letztesZahljahr = (r: ReturnType<typeof berechneInvestment>) =>
    r.years.reduce((letztes, jahr, index) => (jahr.darlehen.kfw.payment > 0 ? index + 1 : letztes), 0);

  it("Punkt 1: Zuschuss am Ende der Anlaufzeit lässt die Annuität bei 606,94 € und verkürzt die Laufzeit", () => {
    const r = berechneInvestment({ ...BEISPIEL, kfwGrantMode: "percent", kfwGrantValue: 10, kfwGrantYear: 3 });
    expect(r.kfwTilgungszuschuss).toBeCloseTo(15000, 6);
    expect(r.years[2].darlehen.kfw.tilgungszuschuss).toBeCloseTo(15000, 6);
    expect(r.years[2].darlehen.kfw.closingBalance).toBeCloseTo(135000, 6);
    expect(r.kfwAnnuitaetMonat).toBeCloseTo(KFW_ANNUITAET, 6);
    expect(r.kfwAnnuitaetMonat).toBeCloseTo(606.94, 2);
    expect(r.years[3].darlehen.kfw.payment / 12).toBeCloseTo(606.94, 2);
    // Ohne Zuschuss läuft die Rate bis Jahr 30, mit ihm endet sie früher.
    expect(letztesZahljahr(berechneInvestment(BEISPIEL))).toBe(30);
    expect(letztesZahljahr(r)).toBeLessThan(30);
    expect(r.years[29].darlehen.kfw.closingBalance).toBe(0);
  });

  it("Punkt 1: auch ein Zuschuss mitten in der Anlaufzeit ändert die Annuität nicht, nur die Zinsen davor", () => {
    const r = berechneInvestment({ ...BEISPIEL, kfwGrantMode: "euro", kfwGrantValue: 15000, kfwGrantYear: 2 });
    expect(r.kfwAnnuitaetMonat).toBeCloseTo(KFW_ANNUITAET, 6);
    expect(r.years[2].darlehen.kfw.interest).toBeCloseTo(135000 * 0.021, 6);
  });

  it("Punkt 2: ohne Gutschriftjahr wird kein Zuschuss gerechnet, auch nicht vor der ersten Rate", () => {
    for (const anlauf of [0, 3]) {
      const ohneZuschuss = berechneInvestment({ ...BEISPIEL, kfwGracePeriodYears: anlauf });
      const ohneJahr = berechneInvestment({ ...BEISPIEL, kfwGracePeriodYears: anlauf, kfwGrantValue: 10, kfwGrantYear: 0 });
      expect(ohneJahr.kfwZuschussOhneJahr).toBe(true);
      expect(ohneJahr.kfwTilgungszuschussNominal).toBeCloseTo(15000, 6);
      expect(ohneJahr.kfwTilgungszuschuss).toBe(0);
      expect(ohneJahr.years).toEqual(ohneZuschuss.years);
      expect(ohneJahr.monthlyDebtService).toBeCloseTo(ohneZuschuss.monthlyDebtService, 10);
    }
  });

  it("Punkt 3: Tilgung ist nur, was gezahlt wird; der Zuschuss steht daneben und im Vermögensaufbau", () => {
    const ohne = berechneInvestment(BEISPIEL);
    const mit = berechneInvestment({ ...BEISPIEL, kfwGrantMode: "euro", kfwGrantValue: 15000, kfwGrantYear: 3 });
    const letztes = mit.years[mit.years.length - 1];
    expect(mit.getilgtGesamt).toBeCloseTo(mit.years.reduce((summe, jahr) => summe + jahr.principal, 0), 6);
    expect(mit.tilgungMonat).toBeCloseTo(mit.getilgtGesamt / (mit.years.length * 12), 6);
    expect(mit.tilgungszuschussPrognose).toBeCloseTo(15000, 6);
    expect(mit.totalDebt - mit.getilgtGesamt - mit.tilgungszuschussPrognose).toBeCloseTo(letztes.remainingDebt, 4);
    // Ohne Zuschuss bleibt die Tilgung die alte Differenz aus Darlehen und Restschuld.
    expect(ohne.getilgtGesamt).toBeCloseTo(ohne.totalDebt - ohne.years[ohne.years.length - 1].remainingDebt, 6);
    // Nach 30 Jahren sind beide schuldenfrei; nach 10 Jahren steckt der Zuschuss im Vermögensaufbau.
    const zehn = { forecastYears: 10 };
    const aufbauOhne = berechneInvestment({ ...BEISPIEL, ...zehn }).vermoegensaufbauMonat;
    const aufbauMit = berechneInvestment({ ...BEISPIEL, ...zehn, kfwGrantMode: "euro", kfwGrantValue: 15000, kfwGrantYear: 3 }).vermoegensaufbauMonat;
    expect(aufbauMit).toBeGreaterThan(aufbauOhne);
  });

  it("Punkt 4: Ratensprung aus den tatsächlichen Raten, mit Zuschuss in der Anlaufzeit", () => {
    const r = berechneInvestment({ ...BEISPIEL, kfwGrantMode: "euro", kfwGrantValue: 15000, kfwGrantYear: 2 });
    expect(r.rateSprung?.rateVorher).toBeCloseTo(BANK_RATE_MONAT + (135000 * 0.021) / 12, 6);
    expect(r.rateSprung?.rateNachher).toBeCloseTo(BANK_RATE_MONAT + KFW_ANNUITAET, 6);
  });

  it("Punkt 4: eine schon getilgte Bank zahlt beim Ratensprung nichts mehr, gleich wie lang die Prognose ist", () => {
    const eingabe = { ...BEISPIEL, seniorRepaymentRate: 40, kfwGracePeriodYears: 5, kfwTermYears: 30 };
    const lang = berechneInvestment(eingabe);
    const kurz = berechneInvestment({ ...eingabe, forecastYears: 2 });
    expect(lang.years[3].darlehen.bank.closingBalance).toBe(0);
    const kfwAnnuitaet25 = annuitaet(150000, 25 * 12);
    expect(lang.rateSprung).toEqual({
      jahr: 6,
      kalenderjahr: BEISPIEL.startYear + 5,
      rateVorher: expect.closeTo(KFW_ZINS_MONAT, 6),
      rateNachher: expect.closeTo(kfwAnnuitaet25, 6),
    });
    expect(kurz.rateSprung).toEqual(lang.rateSprung);
  });

  it("Punkt 5: zugesagter und angerechneter Zuschuss sind getrennt", () => {
    const zuViel = berechneInvestment({ ...BEISPIEL, kfwGrantMode: "euro", kfwGrantValue: 900000, kfwGrantYear: 3 });
    expect(zuViel.kfwTilgungszuschussNominal).toBe(900000);
    expect(zuViel.kfwTilgungszuschuss).toBeCloseTo(150000, 6);
    expect(zuViel.years[2].darlehen.kfw.closingBalance).toBe(0);
    expect(zuViel.years[3].darlehen.kfw.payment).toBe(0);
    const zuSpaet = berechneInvestment({ ...BEISPIEL, kfwTermYears: 10, kfwGrantValue: 10, kfwGrantYear: 12 });
    expect(zuSpaet.kfwTilgungszuschussNominal).toBeCloseTo(15000, 6);
    expect(zuSpaet.kfwTilgungszuschuss).toBe(0);
  });

  it("mindert ab dem Jahr der Gutschrift die AfA-Basis des Gebäudes", () => {
    const ohne = berechneInvestment(BEISPIEL);
    const mit = berechneInvestment({ ...BEISPIEL, kfwGrantMode: "euro", kfwGrantValue: 15000, kfwGrantYear: 3 });
    expect(mit.years[1].buildingDepreciation).toBeCloseTo(ohne.years[1].buildingDepreciation, 6);
    expect(ohne.years[2].buildingDepreciation - mit.years[2].buildingDepreciation).toBeCloseTo(15000 * 0.02, 6);
  });

  it("kommt er nach der Anlaufzeit, bleibt die Rate und die Laufzeit verkürzt sich", () => {
    const r = berechneInvestment({ ...BEISPIEL, kfwGrantMode: "euro", kfwGrantValue: 15000, kfwGrantYear: 6 });
    expect(r.kfwAnnuitaetMonat).toBeCloseTo(KFW_ANNUITAET, 6);
    expect(r.years[5].darlehen.kfw.tilgungszuschuss).toBeCloseTo(15000, 6);
    expect(r.years[5].darlehen.kfw.closingBalance).toBeCloseTo(restMonatlich(150000, KFW_ANNUITAET, 36) - 15000, 4);
    expect(r.years[27].darlehen.kfw.closingBalance).toBe(0);
  });
});
