import { describe, expect, it } from "vitest";
import golden from "./rechenkern.golden.json";
import {
  berechneInvestment,
  einkommensteuerTarif2026,
  grenzsteuersatz,
  RUECKLAGENZUFUEHRUNG_ABZIEHBAR,
  solidaritaetszuschlag,
  type InvestmentEingabe,
  type InvestmentErgebnis,
  type Steuerprofil,
} from "./rechenkern";

/*
 * Die Referenzwerte stammen aus dem Rechenkern der Original-Web-App. Jede
 * Zahl muss auf sechs Nachkommastellen übereinstimmen, Ganzzahlen und
 * Schalter exakt. Weicht etwas ab, wurde die Logik verändert.
 *
 * Zwei bewusste Abweichungen vom Original.
 *
 * 1. Seit dem 07.09.2026 bekommen Möbel keine Wertsteigerung mehr (siehe
 *    propertyValue in rechenkern.ts). In den Fällen „standard" und „manuell"
 *    mit Möbelbetrag wurden deshalb die Felder propertyValue, propertyEquity,
 *    totalWealth und irr neu erzeugt.
 *
 * 2. Seit dem 21.09.2026 wirkt der Miteigentumsanteil auf ALLE Eurobeträge,
 *    nicht mehr nur auf das steuerliche Ergebnis. Vorher blieben Miete,
 *    Kosten, Rate, Immobilienwert und Restschuld auf dem vollen Objekt, und
 *    ein Kunde mit 50 Prozent bekam dadurch einen HÖHEREN monatlichen
 *    Eigenanteil angezeigt als beim Kauf der ganzen Wohnung.
 *
 *    Bei Zusammenveranlagung wird der Anteil jetzt auf 100 Prozent gesetzt,
 *    weil beide Hälften in derselben Steuererklärung landen. Genau diese
 *    Kombination steht im Fall „splitting", er hat sich deshalb am stärksten
 *    verändert: Aus 50 Prozent wurden 100, und damit stehen dort jetzt die
 *    Zahlen des ganzen Objekts.
 *
 *    Alle vier Fälle wurden mit dem geänderten Rechenkern neu erzeugt. Neu
 *    hinzugekommen ist das Feld cumulativeEigenanteil, die ungesaldierte Summe
 *    der Zuzahlungen.
 *
 * 3. Seit dem 25.09.2026 ist `purchasePrice` der Gesamtkaufpreis, die Möbel
 *    sind darin enthalten. In den Eingaben der Fälle „standard" und „manuell"
 *    steht deshalb der alte Kaufpreis plus die Möbel (320.000 + 12.000 und
 *    180.000 + 5.000), genau die Umrechnung alter Speicherstände. Die
 *    Ergebnisse blieben dabei zunächst unverändert.
 *
 * 4. Seit dem 25.09.2026 laufen die Kaufnebenkosten auf den Gesamtkaufpreis,
 *    also auch auf die Möbel. In „standard" und „manuell" steigen dadurch
 *    Nebenkosten, Darlehen und alles, was daran hängt. Die Ergebnisse aller
 *    Fälle wurden mit dem geänderten Rechenkern neu erzeugt; dabei kamen die
 *    Felder der Kalkulationsbasis (kaufpreisGesamt bis nebenkostenMoebel)
 *    dazu. „splitting" und „leer" ohne Möbel blieben in allen alten Feldern
 *    gleich.
 *
 * 5. Seit dem 25.09.2026 schreibt das Gebäude nur die Nebenkosten ab, die auf
 *    es entfallen, und die Möbel ihren Anteil zusätzlich über die
 *    Möbel-Nutzungsdauer. Die Ergebnisse wurden erneut erzeugt. Damit weichen
 *    Fälle mit Möbeln bewusst von der Investagon-Rechnung ab, die die Möbel
 *    ohne Nebenkosten abschreibt.
 *
 * 6. Seit dem 25.09.2026 zählt der Erhaltungsaufwand nicht mehr doppelt: Bei
 *    „Abziehen“ verlässt er die Gebäude-AfA, bei „Aktivieren“ bleibt er nur
 *    einmal darin. Die 15-Prozent-Quote bezieht sich auf das Gebäude ohne den
 *    Aufwand samt Nebenkosten. Betroffen sind alle drei Fälle mit Aufwand,
 *    „standard“ und „manuell“ (abziehen, AfA-Basis ohne den Aufwand) sowie
 *    „splitting“ (aktivieren, die 30.000 Euro kommen nicht mehr ein zweites
 *    Mal obendrauf). Die Ergebnisse wurden erneut erzeugt.
 *
 * 7. Seit dem 25.09.2026 zählen die Möbel im Wert mit ihrem Restbuchwert
 *    statt mit dem vollen Kaufbetrag, und die Rendite ohne Wertzuwachs
 *    verkauft zu genau diesem Wert. In „standard" und „manuell" sinken
 *    dadurch Immobilienwert, Vermögen und Rendite; in „manuell" lässt sich
 *    die Rendite ohne Wertzuwachs jetzt überhaupt rechnen, weil die
 *    Zahlungsreihe ein Vorzeichen wechselt. Ergebnisse erneut erzeugt, neu
 *    sind die Jahresfelder wertzuwachs und moebelRestbuchwert.
 *
 * 8. Seit dem 25.09.2026 ist die Steuerwirkung im manuellen Modus genau
 *    −Ergebnis × Satz, ohne Untergrenze. Vorher kappte max(0, …) die Steuer
 *    nachher bei null, und im ersten Jahr mit Erhaltungsaufwand fiel ein Teil
 *    der Ersparnis weg. Betroffen ist nur der Fall „manuell“: Steuerwirkung,
 *    Cashflow nach Steuern und was daraus folgt. Ergebnisse erneut erzeugt.
 *
 * 9. Seit dem 25.09.2026 gibt es Finanzierungsnebenkosten, Standard 0,2
 *    Prozent der Darlehenssumme. Die Eingaben der vier Fälle nennen den Satz
 *    nicht, sie rechnen deshalb mit dem Standard. Darlehen, Rate und Cashflow
 *    vor Steuern bleiben gleich; es ändern sich Gesamtkosten, die Steuer im
 *    ersten Jahr und alles, was am Einsatz zu Beginn hängt (Rendite,
 *    Eigenkapitalbasis, Faktor je Euro). Ergebnisse erneut erzeugt, neu sind
 *    finanzierungsnebenkosten und das Jahresfeld financingCostDeduction.
 *
 * 10. Seit dem 30.09.2026 laufen alle prozentualen Kaufnebenkosten auf den
 *    Gesamtkaufpreis ohne Erhaltungsaufwand, weil der Aufwand im
 *    Notarvertrag gesondert ausgewiesen ist. Betroffen sind nur die drei
 *    Fälle mit Aufwand, „standard“, „splitting“ und „manuell“: Nebenkosten,
 *    Darlehen, Rate, AfA-Basis und alles, was daran hängt. Ihre Ergebnisse
 *    wurden neu erzeugt, dabei kamen nebenkostenBasis, notarkosten und
 *    grundbuchkosten dazu. „leer“ ohne Aufwand blieb unverändert.
 *
 * 11. Seit dem 30.09.2026 laufen sie außerdem ohne Möbel, und die Möbel
 *    tragen keine Nebenkosten mehr (auch keine anteiligen in der Möbel-AfA).
 *    Der Schalter „Möbel im Notarvertrag gesondert ausgewiesen“ ist weg,
 *    ebenso die Ergebnisfelder grunderwerbsteuerBasis und nebenkostenMoebel.
 *    Betroffen sind nur die Fälle mit Möbeln, „standard“ und „manuell“, ihre
 *    Ergebnisse wurden neu erzeugt. „splitting“ und „leer“ ohne Möbel blieben
 *    in allen Werten gleich; beim Neuerzeugen kamen dort nur die inzwischen
 *    vorhandenen Felder vermoegenStart und reserveContribution dazu.
 */

type Fallname = "standard" | "splitting" | "manuell" | "leer";
const faelle: Fallname[] = ["standard", "splitting", "manuell", "leer"];

interface GoldenFall {
  input: InvestmentEingabe;
  result: InvestmentErgebnis;
}

const referenz = golden as unknown as Record<Fallname, GoldenFall> & {
  tarif: {
    zvE: number;
    grund: number;
    splitting: number;
    soliGrund: number;
    soliSplitting: number;
    grenzGrund: number;
    grenzGesamt: number;
  }[];
};

function erwarteSteuerprofil(ist: Steuerprofil, soll: Steuerprofil, kontext: string) {
  for (const feld of Object.keys(soll) as (keyof Steuerprofil)[]) {
    expect(ist[feld], `${kontext}.${feld}`).toBeCloseTo(soll[feld], 6);
  }
}

describe("Investmentrechner Rechenkern gegen Referenzwerte", () => {
  for (const fall of faelle) {
    it(`Fall „${fall}" reproduziert alle Ergebnisfelder`, () => {
      const { input, result: soll } = referenz[fall];
      const ist = berechneInvestment(input);

      // Skalare Ergebnisfelder
      for (const [feld, sollWert] of Object.entries(soll)) {
        if (feld === "years" || feld === "taxProfile") continue;
        const istWert = ist[feld as keyof InvestmentErgebnis];
        if (sollWert === null) {
          expect(istWert, feld).toBeNull();
        } else if (typeof sollWert === "boolean") {
          expect(istWert, feld).toBe(sollWert);
        } else if (typeof sollWert === "number") {
          expect(istWert, feld).toBeCloseTo(sollWert, 6);
        } else {
          throw new Error(`Unerwarteter Feldtyp in ${feld}`);
        }
      }
      erwarteSteuerprofil(ist.taxProfile, soll.taxProfile, "taxProfile");

      // IRR: null oder Zahl, nie undefined
      expect(ist.irr === null || typeof ist.irr === "number").toBe(true);
      expect(
        ist.irrWithoutAppreciation === null || typeof ist.irrWithoutAppreciation === "number",
      ).toBe(true);

      // Jahreswerte
      expect(ist.years).toHaveLength(soll.years.length);
      soll.years.forEach((sollJahr, index) => {
        const istJahr = ist.years[index];
        for (const [feld, sollWert] of Object.entries(sollJahr)) {
          if (feld === "taxBefore" || feld === "taxAfter") {
            erwarteSteuerprofil(
              istJahr[feld],
              sollWert as Steuerprofil,
              `years[${index}].${feld}`,
            );
          } else if (feld === "index" || feld === "year") {
            expect(istJahr[feld], `years[${index}].${feld}`).toBe(sollWert);
          } else {
            expect(
              istJahr[feld as keyof typeof istJahr] as number,
              `years[${index}].${feld}`,
            ).toBeCloseTo(sollWert as number, 6);
          }
        }
      });
    });
  }

  it("Einkommensteuertarif 2026, Soli und Grenzsteuersätze stimmen mit der Tabelle überein", () => {
    for (const zeile of referenz.tarif) {
      expect(einkommensteuerTarif2026(zeile.zvE), `Grund ${zeile.zvE}`).toBe(zeile.grund);
      expect(einkommensteuerTarif2026(zeile.zvE, true), `Splitting ${zeile.zvE}`).toBe(
        zeile.splitting,
      );
      expect(
        solidaritaetszuschlag(einkommensteuerTarif2026(zeile.zvE)),
        `Soli Grund ${zeile.zvE}`,
      ).toBeCloseTo(zeile.soliGrund, 6);
      expect(
        solidaritaetszuschlag(einkommensteuerTarif2026(zeile.zvE, true), true),
        `Soli Splitting ${zeile.zvE}`,
      ).toBeCloseTo(zeile.soliSplitting, 6);
      expect(
        grenzsteuersatz(zeile.zvE, false, 0, false, false),
        `Grenzsteuersatz ESt ${zeile.zvE}`,
      ).toBeCloseTo(zeile.grenzGrund, 6);
      expect(
        grenzsteuersatz(zeile.zvE, false, 9, true, true),
        `Grenzsteuersatz gesamt ${zeile.zvE}`,
      ).toBeCloseTo(zeile.grenzGesamt, 6);
    }
  });
});

describe("Möbel und Wertentwicklung", () => {
  // Die Möbel stecken im Gesamtkaufpreis, deshalb steigt er mit ihnen.
  // Ohne Finanzierungsnebenkosten, damit Gesamtkosten und Darlehen nur vom Kaufpreis abhängen.
  const ohneMoebel: InvestmentEingabe = {
    ...referenz.standard.input,
    purchasePrice: 320000,
    furniturePrice: 0,
    financingCostRate: 0,
  };
  const mitMoebeln: InvestmentEingabe = { ...ohneMoebel, purchasePrice: 332000, furniturePrice: 12000 };

  it("Möbel bekommen keine Wertsteigerung, sie zählen mit ihrem Restbuchwert", () => {
    const ohne = berechneInvestment(ohneMoebel).years;
    const mit = berechneInvestment(mitMoebeln).years;
    mit.forEach((jahr, index) => {
      // Der Objektwert liegt Jahr für Jahr genau um den Restbuchwert der
      // Möbel höher. Seit dem 25.09.2026 sinkt er mit der Möbel-AfA, vorher
      // blieb er beim vollen Kaufbetrag stehen.
      expect(jahr.propertyValue - ohne[index].propertyValue, `Jahr ${jahr.year}`).toBeCloseTo(jahr.moebelRestbuchwert, 6);
      expect(jahr.moebelRestbuchwert, `Jahr ${jahr.year}`).toBeCloseTo(12000 * (1 - (index + 1) / 10), 6);
    });
  });

  it("ohne Wertsteigerung ist der Objektwert Immobilienanteil plus Möbel-Restbuchwert", () => {
    const ergebnis = berechneInvestment({ ...mitMoebeln, annualValueGrowth: 0 });
    for (const jahr of ergebnis.years) {
      expect(jahr.wertzuwachs, `Jahr ${jahr.year}`).toBeCloseTo(0, 6);
      expect(jahr.propertyValue, `Jahr ${jahr.year}`).toBeCloseTo(320000 + jahr.moebelRestbuchwert, 6);
    }
    // Nach zehn Jahren sind die Möbel abgeschrieben.
    expect(ergebnis.years[9].propertyValue).toBeCloseTo(320000, 6);
  });

  it("zählt die Möbel nicht doppelt: Gesamtkosten sind Kaufpreis plus Nebenkosten", () => {
    const ergebnis = berechneInvestment(mitMoebeln);
    expect(ergebnis.totalInvestment).toBeCloseTo(mitMoebeln.purchasePrice + ergebnis.purchaseCosts, 6);
  });

  it("lässt Gesamtkosten, Darlehen und Möbel-AfA unverändert", () => {
    // Nur die Wertentwicklung ist betroffen. Der Möbelbetrag gehört weiter
    // zu den Gesamtkosten, zum Bankdarlehen und zur Möbel-AfA. Seit dem
    // 30.09.2026 tragen die Möbel keine Nebenkosten mehr (vom 25. bis
    // 30.09.2026 waren es 8,57 %), die Differenz ist genau der Möbelbetrag.
    const ohne = berechneInvestment(ohneMoebel);
    const mit = berechneInvestment(mitMoebeln);
    expect(mit.purchaseCosts).toBeCloseTo(ohne.purchaseCosts, 6);
    expect(mit.totalInvestment - ohne.totalInvestment).toBeCloseTo(12000, 6);
    expect(mit.seniorLoanAmount - ohne.seniorLoanAmount).toBeCloseTo(12000, 6);
    expect(mit.years[0].furnitureDepreciation).toBeCloseTo(12000 / 10, 6);
    expect(ohne.years[0].furnitureDepreciation).toBe(0);
  });
});

/*
 * Das Referenzbeispiel vom 25.09.2026: Kaufpreis 250.000, davon Möbel 8.000,
 * Gebäudeanteil 80 %, Nebenkosten 5 % (3,5 + 1,0 + 0,5), AfA 2 %, Möbel über
 * zehn Jahre, kein Erhaltungsaufwand, keine Rücklage, Anteil 100 %.
 */
const referenzbeispiel: InvestmentEingabe = {
  ...referenz.standard.input,
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
  // Die Referenzbeispiele prüfen Kaufpreis und Nebenkosten, die Finanzierungsnebenkosten haben eigene Tests.
  financingCostRate: 0,
};

describe("Referenzbeispiel: Aufteilung des Kaufpreises", () => {
  it("teilt nur den Immobilienanteil in Boden und Gebäude, genau einmal", () => {
    const r = berechneInvestment(referenzbeispiel);
    expect(r.kaufpreisGesamt).toBeCloseTo(250000, 6);
    expect(r.moebelAnteil).toBeCloseTo(8000, 6);
    expect(r.immobilienanteil).toBeCloseTo(242000, 6);
    expect(r.grundstuecksanteil).toBeCloseTo(48400, 6);
    expect(r.gebaeudeanteilKaufpreis).toBeCloseTo(193600, 6);
    // Boden, Gebäude und Möbel ergeben zusammen wieder den Kaufpreis.
    expect(r.grundstuecksanteil + r.gebaeudeanteilKaufpreis + r.moebelAnteil).toBeCloseTo(250000, 6);
  });
});

/*
 * Seit dem 30.09.2026 tragen die Möbel keine Kaufnebenkosten: 5 % auf
 * 250.000 − 8.000 = 242.000. Vorher 12.500 Euro, davon 400 auf die Möbel.
 */
describe("Referenzbeispiel: Kaufnebenkosten", () => {
  it("rechnet alle Nebenkosten auf den Kaufpreis ohne Möbel", () => {
    const r = berechneInvestment(referenzbeispiel);
    expect(r.nebenkostenBasis).toBeCloseTo(242000, 6);
    expect(r.grunderwerbsteuer).toBeCloseTo(8470, 6);
    expect(r.purchaseCosts).toBeCloseTo(12100, 6);
    expect(r.purchaseCostRate).toBeCloseTo(0.05, 10);
    expect(r.totalInvestment).toBeCloseTo(262100, 6);
  });

  it("verteilt die Nebenkosten nur auf Gebäude und Boden", () => {
    const r = berechneInvestment(referenzbeispiel);
    expect(r.nebenkostenGebaeude).toBeCloseTo(9680, 6);
    expect(r.nebenkostenGrundstueck).toBeCloseTo(2420, 6);
    expect(r.nebenkostenGebaeude + r.nebenkostenGrundstueck).toBeCloseTo(r.purchaseCosts, 6);
  });

  it("liest einen alten Stand mit dem entfernten Schalter, ohne dass er etwas bewirkt", () => {
    const alt = { ...referenzbeispiel, furnitureSeparatedInContract: true } as InvestmentEingabe;
    expect(berechneInvestment(alt).purchaseCosts).toBeCloseTo(12100, 6);
  });
});

describe("Referenzbeispiel: Abschreibung", () => {
  it("schreibt das Gebäude mit seinem Anteil samt anteiliger Nebenkosten ab", () => {
    const r = berechneInvestment(referenzbeispiel);
    expect(r.depreciationBasis).toBeCloseTo(203280, 6);
    expect(r.years[0].buildingDepreciation).toBeCloseTo(4065.6, 6);
  });

  it("schreibt die Möbel ohne Nebenkosten über die Nutzungsdauer ab", () => {
    const r = berechneInvestment(referenzbeispiel);
    expect(r.moebelAfaBasis).toBeCloseTo(8000, 6);
    expect(r.years[0].furnitureDepreciation).toBeCloseTo(800, 6);
    expect(r.years[9].furnitureDepreciation).toBeCloseTo(800, 6);
  });

  it("rechnet degressive AfA und Sonder-AfA auf dieselbe neue Basis", () => {
    const degressiv = berechneInvestment({ ...referenzbeispiel, depreciationMethod: "declining", buildingDepreciationRate: 5 });
    expect(degressiv.years[0].buildingDepreciation).toBeCloseTo(203280 * 0.05, 6);
    expect(degressiv.years[1].buildingDepreciation).toBeCloseTo(203280 * 0.95 * 0.05, 6);
    const sonder = berechneInvestment({ ...referenzbeispiel, specialDepreciationRate: 5, specialDepreciationYears: 4 });
    expect(sonder.years[0].specialDepreciation).toBeCloseTo(203280 * 0.05, 6);
  });
});

/*
 * Seit dem 30.09.2026 laufen die Kaufnebenkosten auf den Kaufpreis der
 * Immobilie, hier 250.000 − 20.000 Aufwand − 8.000 Möbel = 222.000. Die
 * Nebenkosten sinken damit auf 11.100 Euro, davon 8.880 auf das Gebäude und
 * 2.220 auf den Boden, die Möbel tragen nichts.
 */
describe("Referenzbeispiel: Erhaltungsaufwand 20.000 Euro", () => {
  const mitAufwand = { ...referenzbeispiel, rehabExpense: 20000, rehabDistributionYears: 1 };

  it("nimmt ihn bei „Abziehen“ aus der Gebäude-AfA und zieht ihn einmal ab", () => {
    const r = berechneInvestment({ ...mitAufwand, rehabMode: "expense" });
    // 193.600 Gebäude minus 20.000 Aufwand plus 8.880 Nebenkosten.
    expect(r.depreciationBasis).toBeCloseTo(182480, 6);
    expect(r.years[0].buildingDepreciation).toBeCloseTo(3649.6, 6);
    expect(r.years[0].rehabDeduction).toBeCloseTo(20000, 6);
    // Der Boden bleibt, wie er ist.
    expect(r.grundstuecksanteil).toBeCloseTo(48400, 6);
    expect(r.nebenkostenGebaeude).toBeCloseTo(8880, 6);
    expect(r.nebenkostenGrundstueck).toBeCloseTo(2220, 6);
    // Aufwand und Möbel stecken im Kaufpreis, tragen aber keine Nebenkosten.
    expect(r.purchaseCosts).toBeCloseTo(11100, 6);
    expect(r.totalInvestment).toBeCloseTo(261100, 6);
  });

  it("lässt ihn bei „Aktivieren“ einmal in der Gebäude-AfA", () => {
    const r = berechneInvestment({ ...mitAufwand, rehabMode: "capitalize" });
    // Die Nebenkostenbasis hängt nicht an der steuerlichen Behandlung.
    expect(r.purchaseCosts).toBeCloseTo(11100, 6);
    expect(r.depreciationBasis).toBeCloseTo(202480, 6);
    expect(r.years[0].rehabDeduction).toBe(0);
  });

  it("prüft die 15 Prozent auf das Gebäude ohne den Aufwand", () => {
    const r = berechneInvestment({ ...mitAufwand, rehabMode: "expense" });
    expect(r.immediateDeductionRatio).toBeCloseTo(20000 / 182480, 10);
    expect(r.simpleThresholdExceeded).toBe(false);
    const viel = berechneInvestment({ ...mitAufwand, rehabExpense: 40000, rehabMode: "expense" });
    // Nebenkosten 5 % auf 202.000, davon 8.080 auf das Gebäude.
    expect(viel.immediateDeductionRatio).toBeCloseTo(40000 / 161680, 10);
    expect(viel.simpleThresholdExceeded).toBe(true);
  });

  it("deckelt einen Aufwand über dem Gebäudeteil, bevor die Nebenkosten gerechnet werden", () => {
    const r = berechneInvestment({ ...mitAufwand, rehabExpense: 999999, rehabMode: "expense" });
    expect(r.erhaltungsaufwand).toBeCloseTo(193600, 6);
    // Basis 250.000 − 193.600 − 8.000 = 48.400, Nebenkosten 2.420, davon 1.936 aufs Gebäude.
    expect(r.nebenkostenBasis).toBeCloseTo(48400, 6);
    expect(r.purchaseCosts).toBeCloseTo(2420, 6);
    expect(r.depreciationBasis).toBeCloseTo(1936, 6);
  });
});

/*
 * Christians Beispiel vom 30.09.2026: Gesamtkaufpreis 300.000 Euro inklusive
 * 40.000 Euro Erhaltungsaufwand, Bayern 3,5 / 1,0 / 0,5 %, Gebäudeanteil 80 %,
 * AfA 2 %, Finanzierungsnebenkosten 600 Euro (0,2 % auf 300.000 Darlehen).
 */
describe("Christians Beispiel: Kaufnebenkosten ohne Erhaltungsaufwand", () => {
  const beispiel: InvestmentEingabe = {
    ...referenzbeispiel,
    purchasePrice: 300000,
    furniturePrice: 0,
    rehabExpense: 40000,
    rehabMode: "expense",
    rehabDistributionYears: 1,
    financingCostRate: 0.2,
    equity: 13000,
  };
  const r = berechneInvestment(beispiel);

  it("rechnet Grunderwerbsteuer, Notar und Grundbuch auf 260.000 Euro", () => {
    expect(r.kaufpreisGesamt).toBeCloseTo(300000, 6);
    expect(r.nebenkostenBasis).toBeCloseTo(260000, 6);
    expect(r.grunderwerbsteuer).toBeCloseTo(9100, 6);
    expect(r.notarkosten).toBeCloseTo(2600, 6);
    expect(r.grundbuchkosten).toBeCloseTo(1300, 6);
    expect(r.purchaseCosts).toBeCloseTo(13000, 6);
    expect(r.purchaseCostRate).toBeCloseTo(0.05, 10);
  });

  it("kommt auf 313.600 Euro Gesamtkosten", () => {
    expect(r.finanzierungsnebenkosten).toBeCloseTo(600, 6);
    expect(r.totalInvestment).toBeCloseTo(313600, 6);
  });

  it("schreibt das Gebäude ohne den Aufwand ab", () => {
    // 240.000 Gebäude − 40.000 Aufwand + 80 % von 13.000 Nebenkosten.
    expect(r.depreciationBasis).toBeCloseTo(210400, 6);
    expect(r.years[0].buildingDepreciation).toBeCloseTo(4208, 6);
    expect(r.years[0].rehabDeduction).toBeCloseTo(40000, 6);
  });

  it("zieht mit 15.000 Euro Möbeln auch diese ab: 13.250 Euro auf 265.000", () => {
    // Christians Bild vom 30.09.2026: 300.000 inkl. 20.000 Aufwand und 15.000 Möbel.
    const m = berechneInvestment({ ...beispiel, rehabExpense: 20000, furniturePrice: 15000 });
    expect(m.nebenkostenBasis).toBeCloseTo(265000, 6);
    expect(m.grunderwerbsteuer).toBeCloseTo(9275, 6);
    expect(m.notarkosten).toBeCloseTo(2650, 6);
    expect(m.grundbuchkosten).toBeCloseTo(1325, 6);
    expect(m.purchaseCosts).toBeCloseTo(13250, 6);
    // Möbel ohne Nebenkosten, 10 Jahre linear.
    expect(m.moebelAfaBasis).toBeCloseTo(15000, 6);
    expect(m.years[0].furnitureDepreciation).toBeCloseTo(1500, 6);
    // Gebäude 80 % von 285.000 = 228.000, minus 20.000 Aufwand, plus 80 % von 13.250.
    expect(m.depreciationBasis).toBeCloseTo(218600, 6);
    expect(m.nebenkostenGebaeude + m.nebenkostenGrundstueck).toBeCloseTo(13250, 6);
  });

  it("bleibt ohne Erhaltungsaufwand auf den Cent wie vorher", () => {
    const ohne = berechneInvestment({ ...beispiel, rehabExpense: 0 });
    expect(ohne.nebenkostenBasis).toBe(300000);
    expect(ohne.purchaseCosts).toBeCloseTo(15000, 10);
    expect(ohne.grunderwerbsteuer).toBeCloseTo(10500, 10);
    expect(ohne.depreciationBasis).toBeCloseTo(240000 + 12000, 10);
  });
});

describe("Referenzbeispiel: Rücklagenanteil 3.000 Euro", () => {
  const mitRuecklage = { ...referenzbeispiel, maintenanceReserve: 3000 };

  it("nimmt die Rücklage aus der Aufteilung und aus jeder Abschreibung", () => {
    const r = berechneInvestment(mitRuecklage);
    expect(r.ruecklage).toBeCloseTo(3000, 6);
    expect(r.immobilienanteil).toBeCloseTo(239000, 6);
    expect(r.grundstuecksanteil).toBeCloseTo(47800, 6);
    expect(r.gebaeudeanteilKaufpreis).toBeCloseTo(191200, 6);
    // Ihre Nebenkosten gehen an Boden und Gebäude, die Möbel tragen keine.
    expect(r.nebenkostenGebaeude).toBeCloseTo(9680, 6);
    expect(r.nebenkostenGrundstueck).toBeCloseTo(2420, 6);
    expect(r.depreciationBasis).toBeCloseTo(200880, 6);
    expect(r.moebelAfaBasis).toBeCloseTo(8000, 6);
    expect(r.years[0].rehabDeduction).toBe(0);
  });

  it("bleibt grunderwerbsteuerpflichtig und im Gesamtkaufpreis", () => {
    const r = berechneInvestment(mitRuecklage);
    // Basis ohne Möbel, die Rücklage bleibt darin.
    expect(r.nebenkostenBasis).toBeCloseTo(242000, 6);
    expect(r.purchaseCosts).toBeCloseTo(12100, 6);
    expect(r.totalInvestment).toBeCloseTo(262100, 6);
  });

  it("zählt im Wert als Guthaben mit ihrem Betrag, ohne Wertsteigerung", () => {
    // Ohne Möbel, damit nur Immobilienanteil und Rücklage im Wert stehen.
    const ohne = berechneInvestment({ ...mitRuecklage, furniturePrice: 0, annualValueGrowth: 0 });
    for (const jahr of ohne.years) expect(jahr.propertyValue).toBeCloseTo(250000, 6);
    const mitSteigerung = berechneInvestment({ ...mitRuecklage, furniturePrice: 0 });
    const letztes = mitSteigerung.years[9];
    expect(letztes.propertyValue - letztes.wertzuwachs).toBeCloseTo(250000, 6);
    expect(letztes.wertzuwachs).toBeCloseTo(247000 * (1.015 ** 10 - 1), 6);
  });
});

describe("Referenzbeispiel: Kennzahlen", () => {
  it("rechnet die Bruttorendite auf den Gesamtkaufpreis und die Nettorendite auf die Gesamtkosten", () => {
    const r = berechneInvestment({ ...referenzbeispiel, monthlyColdRent: 900, monthlyOperatingCosts: 50, vacancyRate: 0 });
    expect(r.grossYield).toBeCloseTo(10800 / 250000, 10);
    expect(r.netYield).toBeCloseTo((10800 - 600) / 262100, 10);
  });

  it("lässt nur den Immobilienanteil an Wert gewinnen", () => {
    const r = berechneInvestment({ ...referenzbeispiel, annualValueGrowth: 1.5 });
    const letztes = r.years[9];
    expect(letztes.wertzuwachs).toBeCloseTo(242000 * (1.015 ** 10 - 1), 6);
    // Die Möbel sind nach zehn Jahren abgeschrieben.
    expect(letztes.moebelRestbuchwert).toBeCloseTo(0, 6);
    expect(letztes.propertyValue).toBeCloseTo(242000 * 1.015 ** 10, 6);
    expect(r.years[0].moebelRestbuchwert).toBeCloseTo(7200, 6);
  });
});

describe("Referenzbeispiel: Anteil am Investment 50 Prozent", () => {
  const halb = berechneInvestment({ ...referenzbeispiel, investmentShare: 50 });

  it("rechnet Kaufpreis, Anteile, Nebenkosten und Gesamtkosten einheitlich zur Hälfte", () => {
    expect(halb.kaufpreisGesamt).toBeCloseTo(125000, 6);
    expect(halb.moebelAnteil).toBeCloseTo(4000, 6);
    expect(halb.grundstuecksanteil).toBeCloseTo(24200, 6);
    expect(halb.gebaeudeanteilKaufpreis).toBeCloseTo(96800, 6);
    expect(halb.purchaseCosts).toBeCloseTo(6050, 6);
    expect(halb.purchaseCostRate).toBeCloseTo(0.05, 10);
    expect(halb.totalInvestment).toBeCloseTo(131050, 6);
    expect(halb.depreciationBasis).toBeCloseTo(101640, 6);
    expect(halb.years[0].furnitureDepreciation).toBeCloseTo(400, 6);
  });

  it("hält den Wertzuwachs anteilig wie den Wert", () => {
    const ganz = berechneInvestment(referenzbeispiel);
    expect(halb.years[9].wertzuwachs).toBeCloseTo(ganz.years[9].wertzuwachs / 2, 6);
    expect(halb.years[9].propertyValue).toBeCloseTo(ganz.years[9].propertyValue / 2, 6);
  });
});

/*
 * Fester Steuersatz, seit dem 25.09.2026 ohne Untergrenze.
 *
 * Vorher rechnete der manuelle Modus max(0, Steuer vorher + Ergebnis × Satz).
 * Ohne eingetragenes Einkommen ist die Steuer vorher 0, und ein Verlust
 * brachte dann stillschweigend keine Ersparnis. Jetzt ist die Steuerwirkung
 * genau −Ergebnis × Satz, wie bei Investagon.
 */
describe("Manueller Steuersatz", () => {
  const manuell: InvestmentEingabe = {
    ...referenzbeispiel,
    taxCalculationMode: "manual",
    marginalTaxRate: 42,
    rehabExpense: 20000,
    rehabMode: "expense",
  };

  it("spart auch ohne Einkommen genau Verlust mal Satz", () => {
    const r = berechneInvestment({ ...manuell, taxableIncomeCustomer: 0 });
    expect(r.years[0].taxableResult).toBeLessThan(0);
    r.years.forEach((jahr) => {
      expect(jahr.taxEffect, `Jahr ${jahr.year}`).toBeCloseTo(-jahr.taxableResult * 0.42, 6);
    });
  });

  it("rechnet mit Einkommen dieselbe Wirkung wie ohne", () => {
    const ohne = berechneInvestment({ ...manuell, taxableIncomeCustomer: 0 });
    const mit = berechneInvestment({ ...manuell, taxableIncomeCustomer: 60000 });
    mit.years.forEach((jahr, index) => {
      expect(jahr.taxEffect, `Jahr ${jahr.year}`).toBeCloseTo(ohne.years[index].taxEffect, 6);
    });
  });

  it("belastet einen Überschuss mit dem Satz", () => {
    const r = berechneInvestment({ ...manuell, rehabExpense: 0, monthlyColdRent: 2000, taxableIncomeCustomer: 0 });
    const jahr = r.years[5];
    expect(jahr.taxableResult).toBeGreaterThan(0);
    expect(jahr.taxEffect).toBeCloseTo(-jahr.taxableResult * 0.42, 6);
  });

  it("lässt den Tarifmodus unverändert: ohne Einkommen keine Ersparnis", () => {
    const r = berechneInvestment({ ...manuell, taxCalculationMode: "tariff", taxableIncomeCustomer: 0 });
    expect(r.years[0].taxEffect).toBeCloseTo(0, 6);
  });
});

/*
 * Finanzierungsnebenkosten, seit dem 25.09.2026. Referenzbeispiel: 250.000
 * Kaufpreis, 12.500 Nebenkosten, 12.500 Eigenkapital, also 250.000 Darlehen.
 */
describe("Finanzierungsnebenkosten", () => {
  // Eigenkapital in Höhe der Kaufnebenkosten (5 % auf 242.000), damit das Darlehen genau 250.000 ist.
  const basis: InvestmentEingabe = { ...referenzbeispiel, equity: 12100, financingCostRate: 0.2 };
  const ohne = berechneInvestment({ ...basis, financingCostRate: 0 });
  const mit = berechneInvestment(basis);

  it("sind Satz mal Darlehenssumme und stehen in den Gesamtkosten", () => {
    expect(mit.totalDebt).toBeCloseTo(250000, 6);
    expect(mit.finanzierungsnebenkosten).toBeCloseTo(500, 6);
    expect(mit.totalInvestment).toBeCloseTo(262600, 6);
  });

  it("lassen bei gleichem Eigenkapital Darlehen, Rate und Cashflow vor Steuern gleich", () => {
    expect(mit.seniorLoanAmount).toBeCloseTo(ohne.seniorLoanAmount, 6);
    expect(mit.monthlyDebtService).toBeCloseTo(ohne.monthlyDebtService, 6);
    mit.years.forEach((jahr, index) => {
      expect(jahr.cashflowBeforeTax, `Jahr ${jahr.year}`).toBeCloseTo(ohne.years[index].cashflowBeforeTax, 6);
    });
  });

  it("zählen zum Eigenkapitalbedarf", () => {
    expect(mit.financingGap).toBeCloseTo(500, 6);
    // Einsatz = Eigenkapital + Finanzierungsnebenkosten + Zuzahlungen. Die
    // Steuerersparnis im ersten Jahr senkt die Zuzahlung dabei wieder etwas.
    const zuzahlungen = mit.years.reduce((s, j) => s + Math.max(0, -j.cashflowAfterTax), 0);
    expect(mit.eigenkapitalBasis).toBeCloseTo(12100 + 500 + zuzahlungen, 6);
  });

  it("mindern das steuerliche Ergebnis nur im ersten Jahr", () => {
    expect(mit.years[0].financingCostDeduction).toBeCloseTo(500, 6);
    expect(mit.years[0].taxableResult).toBeCloseTo(ohne.years[0].taxableResult - 500, 6);
    expect(mit.years[1].financingCostDeduction).toBe(0);
    expect(mit.years[1].taxableResult).toBeCloseTo(ohne.years[1].taxableResult, 6);
  });

  it("laufen auch auf das Nachrangdarlehen und gelten anteilig", () => {
    const nachrang = berechneInvestment({ ...basis, juniorLoanAmount: 20000 });
    expect(nachrang.totalDebt).toBeCloseTo(250000, 6);
    expect(nachrang.finanzierungsnebenkosten).toBeCloseTo(500, 6);
    const halb = berechneInvestment({ ...basis, investmentShare: 50, equity: 6050 });
    expect(halb.finanzierungsnebenkosten).toBeCloseTo(250, 6);
  });

  it("fallen ohne Darlehen weg", () => {
    const bar = berechneInvestment({ ...basis, equity: 300000 });
    expect(bar.totalDebt).toBe(0);
    expect(bar.finanzierungsnebenkosten).toBe(0);
  });
});

/*
 * Zuführung zur Instandhaltungsrücklage, seit dem 25.09.2026 ein eigenes
 * Feld: im Cashflow ja, in den Werbungskosten nein (BFH IX R 19/24, siehe
 * RUECKLAGENZUFUEHRUNG_ABZIEHBAR).
 */
describe("Zuführung zur Instandhaltungsrücklage", () => {
  const ohne = berechneInvestment({ ...referenzbeispiel, annualCostGrowth: 2 });
  const mit = berechneInvestment({ ...referenzbeispiel, annualCostGrowth: 2, monthlyReserveContribution: 90 });

  it("mindert den Cashflow vor Steuern um die Zuführung, mit der Kostensteigerung", () => {
    mit.years.forEach((jahr, index) => {
      const zufuehrung = 90 * 12 * 1.02 ** index;
      expect(jahr.reserveContribution, `Jahr ${jahr.year}`).toBeCloseTo(zufuehrung, 6);
      expect(jahr.cashflowBeforeTax, `Jahr ${jahr.year}`).toBeCloseTo(ohne.years[index].cashflowBeforeTax - zufuehrung, 6);
    });
  });

  it("lässt das steuerliche Ergebnis unverändert", () => {
    expect(RUECKLAGENZUFUEHRUNG_ABZIEHBAR).toBe(false);
    mit.years.forEach((jahr, index) => {
      expect(jahr.taxableResult, `Jahr ${jahr.year}`).toBeCloseTo(ohne.years[index].taxableResult, 6);
      expect(jahr.operatingCosts, `Jahr ${jahr.year}`).toBeCloseTo(ohne.years[index].operatingCosts, 6);
    });
  });

  it("gilt anteilig wie die übrigen Kosten", () => {
    const halb = berechneInvestment({ ...referenzbeispiel, monthlyReserveContribution: 90, investmentShare: 50 });
    expect(halb.years[0].reserveContribution).toBeCloseTo(540, 6);
  });
});
