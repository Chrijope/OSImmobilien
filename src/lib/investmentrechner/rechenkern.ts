/**
 * Rechenkern des Investmentrechners.
 *
 * Eins zu eins aus der Web-App „OS Immobilien Investmentrechner" übernommen.
 * Die Feldnamen im Eingabe- und Ergebnisobjekt sind bewusst die englischen
 * Originalnamen, damit die Referenzwerte in rechenkern.golden.json direkt
 * vergleichbar bleiben. Nur die Funktionsnamen sind deutsch.
 *
 * Alle Funktionen sind rein: keine Seiteneffekte, kein Datenzugriff.
 */

import { nebenkostenBasis } from "../kaufnebenkosten";
import {
  ANSCHAFFUNGSNAH_GRENZE,
  linearerAfaSatz,
  SONDER_7B_JAHRE,
  SONDER_7B_SATZ,
  sonderabschreibung7b,
} from "../afaSaetze";

export type Steuerklasse = "I" | "II" | "III" | "IV" | "V" | "VI";
export type Steuerberechnungsmodus = "tariff" | "manual";
export type AfaMethode = "linear" | "declining";
export type Erhaltungsaufwandmodus = "expense" | "capitalize";
/** Tilgungszuschuss des KfW-Darlehens: in Prozent des Darlehens oder als Betrag. */
export type KfwZuschussArt = "percent" | "euro";
/**
 * Sanierungsfall, seit dem 22.10.2026 (Christian):
 * - `nachKauf`: Die Sanierung wird nach dem Erwerb für den Käufer umgesetzt.
 *   Erhaltungsaufwand beim Käufer, mit der 15-Prozent-Prüfung nach § 6 Abs. 1
 *   Nr. 1a EStG. Nicht in der Basis der Kaufnebenkosten; das gilt nur bei
 *   einem eigenständigen, nicht mit dem Kauf verknüpften Sanierungsvertrag.
 * - `durchVerkaeufer`: Der Verkäufer saniert vor dem Verkauf. Der Anteil ist
 *   Anschaffungskosten (Gebäude, AfA) und trägt Kaufnebenkosten.
 */
export type Sanierungsfall = "nachKauf" | "durchVerkaeufer";
/**
 * Wie ein Darlehensbetrag eingegeben ist, seit dem 23.10.2026 (Christian):
 * in Prozent des Kaufpreises oder in Euro. Die Oberfläche zeigt beides und
 * merkt sich, worin zuletzt getippt wurde; das bleibt beim Ändern des
 * Kaufpreises fest.
 */
export type Darlehensbetragsart = "percent" | "euro";

export interface InvestmentEingabe {
  clientName: string;
  annualGrossIncome: number;
  taxClass: Steuerklasse;
  jointAssessment: boolean;
  taxableIncomeCustomer: number;
  taxableIncomeSpouse: number;
  /* Die frühere „zvE-Entwicklung“ ist seit dem 23.10.2026 weg: Das Einkommen bleibt konstant. */
  churchTaxRate: number;
  includeSolidaritySurcharge: boolean;
  investmentShare: number;
  taxCalculationMode: Steuerberechnungsmodus;
  marginalTaxRate: number;
  propertyTitle: string;
  address: string;
  propertyType: string;
  area: number;
  rooms: number;
  constructionYear: number;
  purchasePrice: number;
  /*
    Der frühere Schalter `furnitureSeparatedInContract` („Möbel im
    Notarvertrag gesondert ausgewiesen“) ist seit dem 30.09.2026 weg: Möbel
    tragen jetzt immer keine Kaufnebenkosten, er steuerte nur noch die
    Grunderwerbsteuer-Basis. Gespeicherte Stände mit dem Feld lesen sich
    weiter, `eingabeAusJson` übernimmt nur bekannte Felder.
  */
  furniturePrice: number;
  /**
   * Davon Anteil an der Instandhaltungsrücklage, den der Käufer mit dem
   * Kaufpreis übernimmt. Keine Abschreibung, keine Werbungskosten, aber
   * grunderwerbsteuerpflichtig.
   */
  maintenanceReserve: number;
  /**
   * Davon Kaufpreis für Stellplatz oder Garage, seit dem 22.10.2026. Er steckt
   * im Kaufpreis wie die Möbel und wird wie die Wohnung gerechnet (Grund und
   * Boden, Gebäude, Kaufnebenkosten). Er trennt nur den Ausweis: Rendite und
   * Kaufpreisfaktor gibt es für die Wohnung allein und für das Paket.
   */
  garagePrice: number;
  transferTaxRate: number;
  notaryRate: number;
  landRegisterRate: number;
  brokerRate: number;
  otherPurchaseCostRate: number;
  /**
   * All-inclusive-Modell, seit dem 09.10.2026: Der Kaufpreis wird um die
   * Kaufnebenkosten erhöht, dafür fallen keine gesonderten an. Die Sätze
   * oben bleiben die Grundlage, aus ihnen entsteht der Aufschlag. Gespeicherte
   * Stände ohne das Feld bekommen den Standard, also aus.
   */
  allInclusive: boolean;
  /*
    Finanzierung, seit dem 23.10.2026 (Christian): Eingegeben wird, wie
    finanziert wird. Bankdarlehen und Nachrangdarlehen haben je einen Betrag
    (in Prozent des Kaufpreises oder in Euro, siehe `Darlehensbetragsart`),
    Zins, anfängliche Tilgung und Zinsbindung. Das Eigenkapital ist kein
    Eingabefeld mehr, es ergibt sich als Rest: Kaufpreis und
    Kaufnebenkosten minus alle Darlehen (`InvestmentErgebnis.eigenkapital`).
    Vorher war es umgekehrt, das Eigenkapital wurde eingetragen und das
    Bankdarlehen war der Rest.

    Nach der Zinsbindung läuft jedes Darlehen mit demselben Zins und derselben
    Rate weiter. Anschlusszins, neue Tilgung, Umschuldungskosten, weitere
    Anschlussfinanzierungen, Sondertilgungen und Finanzierungsnebenkosten
    sind entfallen; gespeicherte Stände rechnen ohne sie, siehe
    `mitNeuerFinanzierung` in investmentBerechnungenStore.ts.
  */
  seniorLoanMode: Darlehensbetragsart;
  /** Betrag des Bankdarlehens, je nach `seniorLoanMode` in Prozent des Kaufpreises oder in Euro. */
  seniorLoanValue: number;
  juniorLoanMode: Darlehensbetragsart;
  /** Betrag des Nachrangdarlehens, wie beim Bankdarlehen. 0 heißt keines. */
  juniorLoanValue: number;
  seniorInterestRate: number;
  seniorRepaymentRate: number;
  juniorInterestRate: number;
  juniorRepaymentRate: number;
  /** Zinsbindung des Nachrangdarlehens in Jahren, seit dem 23.10.2026. Danach derselbe Zins und dieselbe Rate. */
  juniorFixedRateYears: number;
  /** Zinsbindung des Bankdarlehens in Jahren. Danach derselbe Zins und dieselbe Rate. */
  seniorFixedRateYears: number;
  /** Tilgungsart des Bankdarlehens, seit dem 22.10.2026. Standard: Annuität aus dem Tilgungssatz. */
  seniorRepaymentType: Tilgungsart;
  /** Laufzeit in Jahren bei Volltilgung oder endfälligem Darlehen. */
  seniorTermYears: number;
  /** Tilgungsfreie Anlaufjahre des Bankdarlehens. */
  seniorGracePeriodYears: number;
  /*
    Zweites Bankdarlehen, seit dem 11.10.2026, in Euro, 0 heißt keines. Es
    kommt seit dem 23.10.2026 zu Bank- und Nachrangdarlehen hinzu und mindert
    das Eigenkapital.
  */
  secondLoanAmount: number;
  secondInterestRate: number;
  secondRepaymentRate: number;
  secondFixedRateYears: number;
  secondRepaymentType: Tilgungsart;
  secondTermYears: number;
  secondGracePeriodYears: number;
  /*
    KfW-Darlehen, seit dem 07.10.2026, als drittes Darlehen neben Bank und
    Nachrang (siehe `kfwTilgungsplan`). Ohne Schalter rechnet nichts davon,
    gespeicherte Stände ohne die Felder bekommen die Standardwerte, also aus.
  */
  kfwEnabled: boolean;
  /** Nur Beschriftung, etwa „KfW 261 Sanierung“. Konditionen sind nicht hinterlegt. */
  kfwProgram: string;
  kfwLoanAmount: number;
  kfwInterestRate: number;
  /** Zinsbindung in Jahren. Danach gilt `kfwFollowUpRate`, ohne ihn derselbe Zins. */
  kfwFixedRateYears: number;
  /** Anschlusszins nach der KfW-Zinsbindung, seit dem 11.10.2026. 0: derselbe Zins. */
  kfwFollowUpRate: number;
  /** Gesamtlaufzeit in Jahren, das Darlehen ist danach voll getilgt. */
  kfwTermYears: number;
  /** Tilgungsfreie Anlaufjahre, 0 bis 5, immer kürzer als die Laufzeit. */
  kfwGracePeriodYears: number;
  kfwGrantMode: KfwZuschussArt;
  /** Tilgungszuschuss, je nach `kfwGrantMode` in Prozent oder Euro. 0 heißt keiner. */
  kfwGrantValue: number;
  /**
   * Gutschrift des Zuschusses am Ende dieses Jahres, laut Zusage. Pflicht,
   * sobald ein Zuschuss eingetragen ist: 0 heißt, der Zuschuss wird nicht
   * gerechnet (Prüfung vom 07.10.2026, vorher galt 0 als Ende der Anlaufzeit).
   */
  kfwGrantYear: number;
  monthlyColdRent: number;
  /**
   * Garagen- bzw. Stellplatzmiete je Monat, seit dem 19.10.2026 (Christian).
   * Sie zählt in allen Berechnungen zur Kaltmiete dazu, nur die Miete pro m²
   * bleibt bei der Wohnung. Gespeicherte Stände ohne das Feld haben 0.
   */
  monthlyGarageRent: number;
  monthlyOperatingCosts: number;
  /**
   * Zuführung zur Instandhaltungsrücklage je Monat, seit dem 25.09.2026 ein
   * eigenes Feld. Sie zählt im Cashflow, aber nicht in den Werbungskosten,
   * siehe `RUECKLAGENZUFUEHRUNG_ABZIEHBAR`.
   */
  monthlyReserveContribution: number;
  /**
   * Die Rücklage folgt der Wohnfläche (1 Euro je m² und Monat), seit dem
   * 23.10.2026 (Christian). Aus, sobald ein Wert von Hand, aus den Unterlagen
   * oder aus der Objektanlage kommt; siehe `mitRuecklagenVorgabe`.
   */
  monthlyReserveContributionAuto: boolean;
  /*
    Hausgeld in ganzer Höhe, seit dem 22.10.2026 (Christian), ohne Rücklage
    seit dem 28.10.2026: gesamt, davon
    umlagefähig (zahlt der Mieter, nur Anzeige) und nicht umlagefähig. Der
    nicht umlagefähige Teil rechnet mit: Er kommt zu `monthlyOperatingCosts`
    (weitere Kosten des Eigentümers) dazu. Die Rücklage steht in
    `monthlyReserveContribution`; siehe `hausgeldAufstellung`. 0 heißt leer.
  */
  housingFeeTotal: number;
  housingFeeRecoverable: number;
  housingFeeNonRecoverable: number;
  vacancyRate: number;
  annualRentGrowth: number;
  annualCostGrowth: number;
  annualValueGrowth: number;
  /* Die Verkaufskosten am Ende (`saleCostRate`) sind seit dem 23.10.2026 weg. */
  buildingShare: number;
  depreciationMethod: AfaMethode;
  buildingDepreciationRate: number;
  specialDepreciationRate: number;
  specialDepreciationYears: number;
  furnitureDepreciationYears: number;
  rehabExpense: number;
  rehabMode: Erhaltungsaufwandmodus;
  /**
   * Wann saniert wird, seit dem 22.10.2026 (Christian): nach dem Kauf für den
   * Käufer (Standard) oder vom Verkäufer vor dem Verkauf. Siehe `Sanierungsfall`.
   */
  rehabScenario: Sanierungsfall;
  /**
   * Umsatzsteuersatz im Sanierungsanteil in Prozent, seit dem 22.10.2026.
   * `rehabExpense` ist brutto; die 15-Prozent-Prüfung rechnet netto. 0, wenn
   * der Anteil keine Umsatzsteuer enthält (etwa umsatzsteuerfreier Kaufpreis).
   */
  rehabVatRate: number;
  rehabDistributionYears: number;
  startYear: number;
  /**
   * Monat des Übergangs von Nutzen und Lasten im Startjahr, 1 bis 12, seit dem
   * 22.10.2026. Das erste Jahr zählt nur ab diesem Monat: Miete, Kosten,
   * Zinsen, Gebäude- und Möbel-AfA zeitanteilig. 1 heißt ganzes Jahr.
   */
  acquisitionMonth: number;
  forecastYears: number;
  /*
    Altersvorsorge, seit dem 09.10.2026, nur für das Deckblatt
    „Vermögensaufbau & Altersvorsorge“ (siehe altersvorsorge.ts). Der
    Rechenkern selbst liest sie nicht. 0 beim Alter heißt: nicht eingetragen.
  */
  clientAge: number;
  retirementAge: number;
  inflationRate: number;
  /*
    Unterlagen fürs Bankgespräch, seit dem 11.10.2026 (siehe
    bankunterlagen.ts). Der Rechenkern liest sie nicht, sie reisen nur mit der
    gespeicherten Berechnung. Leere Listen heißen: nicht ausgefüllt.
  */
  haushalt: Haushaltsrechnung;
  vermoegen: Vermoegensaufstellung;
  /** Haushalt und Vermögen auch als eigene Seite in der Berechnung, nicht nur in der Analyse. */
  bankunterlagenInBerechnung: boolean;
  /**
   * Schalter „Bankgespräch & Bankunterlagen“ oben im Rechner, seit dem
   * 11.10.2026 statt der eigenen Seite „Investmentkalkulation Plus“. Aus heißt:
   * der Rechner wie vorher. Gespeicherte Stände ohne das Feld sind aus.
   */
  bankgespraechAktiv: boolean;
  /**
   * Aus welcher Selbstauskunft Haushalt und Vermögen zuletzt übernommen
   * wurden (Kunde, Investment, Stand). Leer: noch nie. Daran erkennt der
   * Rechner eine neuere Selbstauskunft oder einen anderen Kunden.
   */
  bankunterlagenStand: string;
  /**
   * Welche Bedeutung die Eingabe hat, für gespeicherte Stände. Ab Version 2
   * (25.09.2026) ist `purchasePrice` der Gesamtkaufpreis samt Möbeln; bis
   * dahin war es der Preis ohne Möbel. Gerechnet wird damit nichts, siehe
   * `eingabeAusJson` in investmentBerechnungenStore.ts.
   */
  eingabeVersion: number;
}

/** Eine Zeile der Haushaltsrechnung oder Vermögensaufstellung. */
export interface Bankunterlagenposten {
  bezeichnung: string;
  /** Haushalt: Euro je Monat. Vermögen: Euro. */
  betrag: number;
  /** Nur Vermögenswerte: als Sicherheit verpfändet. */
  verpfaendet?: boolean;
  /** Herkunftssatz, etwa „Aus der Selbstauskunft“. Fehlt, sobald jemand den Betrag ändert. */
  herkunft?: string;
}

export interface Haushaltsrechnung {
  einkuenfte: Bankunterlagenposten[];
  ausgaben: Bankunterlagenposten[];
}

export interface Vermoegensaufstellung {
  werte: Bankunterlagenposten[];
  verbindlichkeiten: Bankunterlagenposten[];
}

/** Die aktuelle Version der Eingabe, siehe `eingabeVersion`. */
export const EINGABE_VERSION = 5;

/** Schlüssel aller Zahlenfelder der Eingabe, für typsichere Setter in der Oberfläche. */
export type ZahlenFeld = {
  [K in keyof InvestmentEingabe]: InvestmentEingabe[K] extends number ? K : never;
}[keyof InvestmentEingabe];

/** Schlüssel aller Textfelder der Eingabe. */
export type TextFeld = {
  [K in keyof InvestmentEingabe]: InvestmentEingabe[K] extends string ? K : never;
}[keyof InvestmentEingabe];

export interface Steuerprofil {
  taxableIncome: number;
  incomeTax: number;
  solidarity: number;
  churchTax: number;
  totalTax: number;
  effectiveRate: number;
}

export interface Annuitaetsjahr {
  interest: number;
  principal: number;
  payment: number;
  closingBalance: number;
}

/** Ein Jahr eines Darlehens in der Jahrestabelle. Der Zuschuss ist keine Tilgung, er mindert nur die Restschuld. */
export interface Darlehensjahr extends Annuitaetsjahr {
  tilgungszuschuss: number;
  /** Sollzins, der in diesem Jahr galt, als Faktor. 0 ohne Darlehen (seit dem 11.10.2026). */
  zinssatz?: number;
}

/** `bank2`: das zweite Bankdarlehen, seit dem 11.10.2026. */
export type Darlehensart = "bank" | "bank2" | "nachrang" | "kfw";

export interface Jahreswert {
  index: number;
  year: number;
  grossRent: number;
  effectiveRent: number;
  /** Summe aller Darlehen, ebenso `principal`, `debtService` und `remainingDebt`. */
  interest: number;
  /** Gezahlte Tilgung, ohne den KfW-Tilgungszuschuss. */
  principal: number;
  debtService: number;
  /** Jedes Darlehen einzeln, seit dem 07.10.2026. Ohne KfW und Nachrang stehen dort Nullen. */
  darlehen: Record<Darlehensart, Darlehensjahr>;
  /** Nicht umlagefähige Kosten, abziehbar. */
  operatingCosts: number;
  /** Zuführung zur Instandhaltungsrücklage, im Cashflow, steuerlich siehe `RUECKLAGENZUFUEHRUNG_ABZIEHBAR`. */
  reserveContribution: number;
  cashflowBeforeTax: number;
  buildingDepreciation: number;
  specialDepreciation: number;
  furnitureDepreciation: number;
  rehabDeduction: number;
  taxableResult: number;
  allocatedTaxableResult: number;
  taxableIncomeBefore: number;
  taxableIncomeAfter: number;
  taxBefore: Steuerprofil;
  taxAfter: Steuerprofil;
  taxEffect: number;
  cashflowAfterTax: number;
  cumulativeCashflowAfterTax: number;
  /** Summe aller Zuzahlungen bis hierher, ohne Gegenrechnung der Ueberschussjahre. */
  cumulativeEigenanteil: number;
  propertyValue: number;
  remainingDebt: number;
  propertyEquity: number;
  totalWealth: number;
  /** Wertsteigerung des Immobilienanteils bis zum Jahresende. Möbel und Rücklage steigen nicht. */
  wertzuwachs: number;
  /** Möbel-AfA-Basis abzüglich aller Möbel-AfA bis zum Jahresende. */
  moebelRestbuchwert: number;
}

export interface InvestmentErgebnis {
  purchaseCostRate: number;
  /** Gesonderte Kaufnebenkosten. Beim All-inclusive-Modell 0, sie stecken dann im Kaufpreis. */
  purchaseCosts: number;
  /** Das All-inclusive-Modell ist an, siehe `InvestmentEingabe.allInclusive`. */
  allInclusive: boolean;
  /**
   * Der Aufschlag auf den Kaufpreis beim All-inclusive-Modell: die Kaufnebenkosten,
   * genau wie im normalen Modell gerechnet. 0 ohne das Modell.
   */
  allInclusiveAufschlag: number;
  /** Gesamtbedarf: Kaufpreis plus Kaufnebenkosten (seit dem 23.10.2026 ohne Finanzierungsnebenkosten). */
  totalInvestment: number;
  seniorLoanAmount: number;
  /** Nachrangdarlehen, anteilig. 0 ohne. */
  juniorLoanAmount: number;
  /**
   * Eigenkapital als Rest: Gesamtbedarf minus alle Darlehen, mindestens 0,
   * seit dem 23.10.2026. Wie jeder Euro des Objekts anteilig.
   */
  eigenkapital: number;
  /** Darlehen über dem Gesamtbedarf, sonst 0. Die Oberfläche weist darauf hin. */
  ueberfinanzierung: number;
  /**
   * Wann welche Zinsbindung endet, für die Jahresübersicht. Nur Darlehen mit
   * Betrag und Zinsbindung. `jahrIndex` ist die Zeile der Jahrestabelle (ab
   * 0), `restschuld` die Restschuld am Ende der Zinsbindung.
   */
  zinsbindungen: Zinsbindungsende[];
  /** KfW-Darlehen, anteilig und auf den Finanzierungsbedarf gedeckelt. 0 ohne Schalter. */
  kfwLoanAmount: number;
  /** Zweites Bankdarlehen, anteilig und auf den Rest des Finanzierungsbedarfs gedeckelt. */
  secondLoanAmount: number;
  /** Restschuld des Bankdarlehens am Ende seiner Zinsbindung, auch jenseits der Prognose. 0 ohne Zinsbindung. */
  bankRestschuldZinsbindung: number;
  /** Was zu finanzieren ist: Kaufpreis und Kaufnebenkosten, gleich `totalInvestment`. */
  finanzierungsbedarf: number;
  /** Tilgungszuschuss laut Eingabe in Euro (Prozent schon umgerechnet), vor jeder Kürzung. */
  kfwTilgungszuschussNominal: number;
  /**
   * Was davon tatsächlich gutgeschrieben wird: höchstens die Restschuld im
   * Gutschriftmonat, 0 ohne Gutschriftjahr oder nach der vollen Tilgung.
   */
  kfwTilgungszuschuss: number;
  /** Ein Zuschuss ist eingetragen, aber kein Gutschriftjahr: Er wird nicht gerechnet. */
  kfwZuschussOhneJahr: boolean;
  /** Restschuld des KfW-Darlehens am Ende seiner Zinsbindung, auch wenn die Prognose kürzer ist. */
  kfwRestschuldZinsbindung: number;
  /** Die gerechneten tilgungsfreien Jahre: höchstens fünf und kürzer als die Laufzeit. */
  kfwAnlaufJahre: number;
  /** Rate des KfW-Darlehens je Monat nach den tilgungsfreien Jahren (Annuität). */
  kfwAnnuitaetMonat: number;
  /**
   * Mischzins: Sollzins aller Darlehen, gewichtet mit ihrem Anfangsbetrag,
   * als Faktor. 0 ohne Darlehen.
   */
  mischzins: number;
  /**
   * Die Gesamtrate springt, weil die tilgungsfreie Zeit der KfW endet. `jahr`
   * zählt ab 1, Raten je Monat. `null` ohne tilgungsfreie Jahre.
   */
  rateSprung: { jahr: number; kalenderjahr: number; rateVorher: number; rateNachher: number } | null;
  /**
   * Der gerechnete Miteigentumsanteil als Faktor. Seit dem 22.10.2026 auch
   * bei Zusammenveranlagung die Eingabe. Für Grenzen je m² der ganzen Wohnung.
   */
  anteil: number;
  /**
   * Anteil des ersten Jahres ab dem Übergang von Nutzen und Lasten, 1 bei
   * Januar, 1/12 bei Dezember. Monatswerte des ersten Jahres teilen durch
   * `12 × ersterJahresanteil` Monate statt durch 12.
   */
  ersterJahresanteil: number;
  /** Davon Stellplatz oder Garage im Kaufpreis, anteilig. 0 ohne. */
  garagenpreis: number;
  /** Ausgewiesener Kaufpreis ohne Stellplatz: die Wohnung allein, beim All-inclusive-Modell samt ihrem Teil des Aufschlags. */
  kaufpreisWohnung: number;
  /** Bruttorendite nur der Wohnung: Jahreskaltmiete der Wohnung durch ihren Kaufpreis. */
  grossYieldWohnung: number;
  /** Nettorendite nur der Wohnung, auf ihren Teil der Gesamtkosten. */
  netYieldWohnung: number;
  /** Kaufpreisfaktor gesamt (Wohnung und Stellplatz): Kaufpreis durch Jahreskaltmiete. `null` ohne Miete. */
  kaufpreisfaktor: number | null;
  /** Kaufpreisfaktor nur der Wohnung. `null` ohne Wohnungsmiete. */
  kaufpreisfaktorWohnung: number | null;
  /**
   * Sonder-AfA nach § 7b EStG, seit dem 22.10.2026 mit eigener Prüfung:
   * Baukostenobergrenze 5.200 Euro je m², Bemessungsgrundlage höchstens
   * 4.000 Euro je m² Wohnfläche, 5 Prozent in vier Jahren.
   */
  sonderAfa: {
    /** Eine Sonder-AfA ist eingetragen. */
    beantragt: boolean;
    /** Sie wird gerechnet. */
    zulaessig: boolean;
    hinweis: string;
    /** Bemessungsgrundlage, anteilig. */
    bemessungsgrundlage: number;
    /** Anschaffungskosten des Gebäudes je m² Wohnfläche. 0 ohne Fläche. */
    baukostenJeQm: number;
    /** Gerechneter Satz in Prozent und Dauer in Jahren, nach der Deckelung. */
    satz: number;
    jahre: number;
  };
  /** Sanierungsfall, siehe `Sanierungsfall`. */
  sanierungsfall: Sanierungsfall;
  /** Erhaltungsaufwand ohne Umsatzsteuer, die Grundlage der 15-Prozent-Prüfung. */
  erhaltungsaufwandNetto: number;
  /** 15 Prozent der Gebäude-Anschaffungskosten ohne den Aufwand, die Grenze nach § 6 Abs. 1 Nr. 1a EStG in Euro. */
  fuenfzehnProzentGrenze: number;
  /** Die Grenze ist im Fall „nach dem Kauf“ überschritten: Der Aufwand wird als anschaffungsnaher Herstellungsaufwand aktiviert. */
  anschaffungsnah: boolean;
  /** Der Aufwand geht in die Gebäude-AfA statt in den Sofortabzug, aus welchem Grund auch immer. */
  sanierungAktiviert: boolean;
  /**
   * Manueller Steuersatz ohne Steuerlast: Ein Verlust bringt keine Erstattung,
   * weil vor dem Kauf keine Steuer gezahlt wird (seit dem 22.10.2026).
   */
  erstattungBegrenzt: boolean;
  totalDebt: number;
  monthlyDebtService: number;
  grossYield: number;
  netYield: number;
  effectiveAnnualRent: number;
  depreciationBasis: number;
  immediateDeductionRatio: number;
  simpleThresholdExceeded: boolean;
  combinedTaxableIncome: number;
  taxProfile: Steuerprofil;
  marginalIncomeTaxRate: number;
  marginalTotalTaxRate: number;
  cumulativeTaxEffect: number;
  irr: number | null;
  irrWithoutAppreciation: number | null;
  /**
   * Was der Kunde ueber die ganze Laufzeit einsetzt: Eigenkapital plus die
   * Summe aller monatlichen Zuzahlungen.
   */
  eigenkapitalBasis: number;
  /** Was der Kunde im ersten Jahr monatlich selbst zuzahlt, positiv. */
  eigenanteilMonat: number;
  /** Zuwachs an Eigenkapital in der Immobilie je Monat, mit Wertzuwachs. */
  vermoegensaufbauMonat: number;
  /**
   * Immobilie minus Darlehen zu Beginn, mindestens null: der Stand, von dem
   * aus der Vermögensaufbau zählt. Seit dem 25.09.2026 als eigenes Feld, damit
   * der Rechenweg unter der Kachel ihn zeigen kann, statt ihn nachzurechnen.
   */
  vermoegenStart: number;
  /** Davon der harte Teil: die gezahlte Tilgung je Monat, ohne KfW-Tilgungszuschuss. */
  tilgungMonat: number;
  /** Summe der gezahlten Tilgung im Prognosezeitraum, alle Darlehen, ohne Zuschuss. */
  getilgtGesamt: number;
  /** Im Prognosezeitraum gutgeschriebener KfW-Tilgungszuschuss. Er steckt im Vermögensaufbau, nicht in der Tilgung. */
  tilgungszuschussPrognose: number;
  /** Was aus jedem eingesetzten Euro wird, ueber die ganze Laufzeit. */
  faktorJeEuro: number;
  /*
    Die Kalkulationsbasis, seit dem 25.09.2026 als eigene Felder. Alle Beträge
    sind der Anteil dieses Kunden, also schon mit dem Miteigentumsanteil
    gerechnet. Die Oberfläche liest sie, statt selbst zu rechnen.
  */
  /** Gesamtkaufpreis, beim All-inclusive-Modell samt `allInclusiveAufschlag`. */
  kaufpreisGesamt: number;
  /** Davon Möbel/Inventar, gedeckelt auf den Kaufpreis. */
  moebelAnteil: number;
  /** Davon Erhaltungsaufwand. */
  erhaltungsaufwand: number;
  /** Davon Anteil an der Instandhaltungsrücklage, ein Guthaben ohne Abschreibung. */
  ruecklage: number;
  /** Kaufpreis ohne Möbel und Rücklage: das, was in Grund und Boden und Gebäude aufgeteilt wird. */
  immobilienanteil: number;
  /** Grund und Boden, der Teil des Immobilienanteils ohne Abschreibung. */
  grundstuecksanteil: number;
  /** Gebäude (Wohnung), der Rest des Immobilienanteils. */
  gebaeudeanteilKaufpreis: number;
  /**
   * Worauf alle prozentualen Kaufnebenkosten laufen, auch die
   * Grunderwerbsteuer: der Kaufpreis der Immobilie, also Gesamtkaufpreis ohne
   * Erhaltungsaufwand und ohne Möbel (seit dem 30.09.2026, siehe
   * `nebenkostenBasis` in kaufnebenkosten.ts). Ohne beide ist das der
   * Gesamtkaufpreis.
   */
  nebenkostenBasis: number;
  grunderwerbsteuer: number;
  /** Notar und Grundbuch als Beträge, damit die Oberfläche sie zeigt, statt nachzurechnen. */
  notarkosten: number;
  grundbuchkosten: number;
  /**
   * Die Kaufnebenkosten, nach dem Gebäudeanteil geteilt. Zusammen ergeben sie
   * `purchaseCosts`, beim All-inclusive-Modell den Aufschlag; dort sind auch
   * Grunderwerbsteuer, Notar und Grundbuch die Bestandteile des Aufschlags.
   * Die Möbel tragen seit dem 30.09.2026 keine mehr.
   */
  nebenkostenGrundstueck: number;
  nebenkostenGebaeude: number;
  /** Der Möbelanteil, verteilt über die Möbel-Nutzungsdauer. Ohne Nebenkosten. */
  moebelAfaBasis: number;
  years: Jahreswert[];
}

/** Standardwerte, mit denen der Rechner startet (Original „ue"). */
export const standardEingabe: InvestmentEingabe = {
  clientName: "",
  annualGrossIncome: 0,
  taxClass: "I",
  jointAssessment: false,
  taxableIncomeCustomer: 0,
  taxableIncomeSpouse: 0,
  churchTaxRate: 0,
  includeSolidaritySurcharge: true,
  investmentShare: 100,
  taxCalculationMode: "tariff",
  marginalTaxRate: 42,
  propertyTitle: "",
  address: "",
  propertyType: "",
  area: 0,
  rooms: 0,
  constructionYear: 0,
  purchasePrice: 0,
  furniturePrice: 0,
  maintenanceReserve: 0,
  garagePrice: 0,
  transferTaxRate: 6.5,
  notaryRate: 1.5,
  landRegisterRate: 0.5,
  brokerRate: 0,
  otherPurchaseCostRate: 0,
  allInclusive: false,
  // Bank 100 Prozent des Kaufpreises: Die Kaufnebenkosten trägt das Eigenkapital, wie bisher die Vorbelegung.
  seniorLoanMode: "percent",
  seniorLoanValue: 100,
  juniorLoanMode: "euro",
  juniorLoanValue: 0,
  seniorInterestRate: 4,
  seniorRepaymentRate: 1.5,
  juniorInterestRate: 6,
  juniorRepaymentRate: 1,
  juniorFixedRateYears: 10,
  seniorFixedRateYears: 10,
  seniorRepaymentType: "annuitaet",
  seniorTermYears: 0,
  seniorGracePeriodYears: 0,
  secondLoanAmount: 0,
  secondInterestRate: 4,
  secondRepaymentRate: 2,
  secondFixedRateYears: 10,
  secondRepaymentType: "annuitaet",
  secondTermYears: 0,
  secondGracePeriodYears: 0,
  kfwEnabled: false,
  kfwProgram: "",
  kfwLoanAmount: 0,
  kfwInterestRate: 2.5,
  kfwFixedRateYears: 10,
  kfwFollowUpRate: 0,
  kfwTermYears: 30,
  kfwGracePeriodYears: 0,
  kfwGrantMode: "percent",
  kfwGrantValue: 0,
  kfwGrantYear: 0,
  monthlyColdRent: 0,
  monthlyGarageRent: 0,
  monthlyOperatingCosts: 0,
  monthlyReserveContribution: 0,
  monthlyReserveContributionAuto: true,
  housingFeeTotal: 0,
  housingFeeRecoverable: 0,
  housingFeeNonRecoverable: 0,
  vacancyRate: 0,
  annualRentGrowth: 2,
  annualCostGrowth: 2,
  annualValueGrowth: 1.5,
  buildingShare: 80,
  depreciationMethod: "linear",
  buildingDepreciationRate: 2,
  specialDepreciationRate: 0,
  specialDepreciationYears: 4,
  furnitureDepreciationYears: 10,
  rehabExpense: 0,
  rehabMode: "expense",
  rehabScenario: "nachKauf",
  rehabVatRate: 19,
  rehabDistributionYears: 1,
  startYear: 2026,
  acquisitionMonth: 1,
  forecastYears: 10,
  clientAge: 0,
  retirementAge: 67,
  inflationRate: 2,
  haushalt: { einkuenfte: [], ausgaben: [] },
  vermoegen: { werte: [], verbindlichkeiten: [] },
  bankunterlagenInBerechnung: false,
  bankgespraechAktiv: false,
  bankunterlagenStand: "",
  eingabeVersion: EINGABE_VERSION,
};

/**
 * Ist die Zuführung zur Instandhaltungsrücklage bei Zahlung als Werbungskosten
 * abziehbar? Die einzige Stelle, an der das entschieden wird.
 *
 * Nein, seit dem 25.09.2026. Nach dem BFH (Urteil vom 14.01.2025, IX R
 * 19/24) sind Zahlungen in die Erhaltungsrücklage erst abziehbar, wenn die
 * Gemeinschaft das Geld tatsächlich für Erhaltung ausgibt, nicht schon bei
 * der Einzahlung. Wann das geschieht, weiß der Rechner nicht, deshalb zieht
 * er die Zuführung gar nicht ab. Im Cashflow zählt sie trotzdem, denn sie
 * verlässt das Konto des Kunden jeden Monat.
 *
 * Das ist eine bewusste Abweichung von Investagon, das die Zuführung mit dem
 * übrigen Hausgeld absetzt. Christian kann sie hier umstellen: `true` rechnet
 * wie Investagon.
 */
export const RUECKLAGENZUFUEHRUNG_ABZIEHBAR = false;

/** Prozentangabe (z. B. 3,5) in einen Faktor (0,035) umrechnen, negative Werte werden zu 0. */
export const prozentAnteil = (wert: number): number => Math.max(0, wert) / 100;

/** NaN und Unendlich auf 0 abfangen, damit leere Eingaben nicht durchschlagen. */
export const endlicheZahl = (wert: number): number => (Number.isFinite(wert) ? wert : 0);

/**
 * Einkommensteuer nach dem Tarif 2026 (§ 32a EStG in der Fassung des
 * Steuerfortentwicklungsgesetzes): Grundfreibetrag 12.348 Euro, erste
 * Progressionszone bis 17.799 Euro, zweite bis 69.878 Euro, Spitzensatz 42 %
 * bis 277.825 Euro, darüber 45 %. Das zvE wird wie im Gesetz auf volle Euro
 * abgerundet, ebenso der Steuerbetrag. Splitting: Steuer auf das halbe
 * Einkommen, verdoppelt.
 */
export function einkommensteuerTarif2026(zvE: number, splitting = false): number {
  const einkommen = Math.max(0, Math.floor(endlicheZahl(zvE)));
  if (splitting) return 2 * einkommensteuerTarif2026(Math.floor(einkommen / 2), false);
  const x = einkommen;
  let steuer = 0;
  if (x <= 12348) steuer = 0;
  else if (x <= 17799) {
    const y = (x - 12348) / 1e4;
    steuer = (914.51 * y + 1400) * y;
  } else if (x <= 69878) {
    const z = (x - 17799) / 1e4;
    steuer = (173.1 * z + 2397) * z + 1034.87;
  } else steuer = x <= 277825 ? 0.42 * x - 11135.63 : 0.45 * x - 19470.38;
  return Math.max(0, Math.floor(steuer));
}

/**
 * Solidaritätszuschlag: 5,5 % der Einkommensteuer, aber wegen der Freigrenze
 * (20.350 Euro, bei Splitting 40.700 Euro) höchstens 11,9 % des Betrags, um
 * den die Steuer die Freigrenze übersteigt (Milderungszone).
 */
export function solidaritaetszuschlag(einkommensteuer: number, splitting = false): number {
  const freigrenze = splitting ? 40700 : 20350;
  const regulaer = Math.max(0, einkommensteuer) * 0.055;
  const milderung = Math.max(0, einkommensteuer - freigrenze) * 0.119;
  return Math.min(regulaer, milderung);
}

/** Vollständiges Steuerprofil für ein zvE: ESt, Soli, Kirchensteuer, Gesamt, effektiver Satz. */
export function steuerprofil(
  zvE: number,
  splitting: boolean,
  kirchensteuersatz: number,
  mitSoli: boolean,
): Steuerprofil {
  const einkommen = Math.max(0, zvE);
  const einkommensteuer = einkommensteuerTarif2026(einkommen, splitting);
  const soli = mitSoli ? solidaritaetszuschlag(einkommensteuer, splitting) : 0;
  const kirchensteuer = einkommensteuer * prozentAnteil(kirchensteuersatz);
  const gesamt = einkommensteuer + soli + kirchensteuer;
  return {
    taxableIncome: einkommen,
    incomeTax: einkommensteuer,
    solidarity: soli,
    churchTax: kirchensteuer,
    totalTax: gesamt,
    effectiveRate: einkommen > 0 ? gesamt / einkommen : 0,
  };
}

/**
 * Grenzsteuersatz als Differenzenquotient über 100 Euro zusätzliches zvE,
 * wahlweise nur auf die Einkommensteuer oder auf die Gesamtbelastung.
 */
export function grenzsteuersatz(
  zvE: number,
  splitting: boolean,
  kirchensteuersatz: number,
  mitSoli: boolean,
  gesamtbelastung: boolean,
): number {
  const basis = steuerprofil(zvE, splitting, kirchensteuersatz, mitSoli);
  const plusHundert = steuerprofil(zvE + 100, splitting, kirchensteuersatz, mitSoli);
  return gesamtbelastung
    ? (plusHundert.totalTax - basis.totalTax) / 100
    : (plusHundert.incomeTax - basis.incomeTax) / 100;
}

/** Ein Jahr Annuitätendarlehen: Zins auf den Restsaldo, Rest der Jahresrate ist Tilgung. */
export function annuitaetsjahr(restsaldo: number, zinssatz: number, jahresrate: number): Annuitaetsjahr {
  if (restsaldo <= 0) return { interest: 0, principal: 0, payment: 0, closingBalance: 0 };
  const zinsen = restsaldo * zinssatz;
  const tilgungRoh = Math.max(0, jahresrate - zinsen);
  const tilgung = Math.min(restsaldo, tilgungRoh);
  return {
    interest: zinsen,
    principal: tilgung,
    payment: zinsen + tilgung,
    closingBalance: Math.max(0, restsaldo - tilgung),
  };
}

/**
 * Wie ein Bankdarlehen getilgt wird, seit dem 22.10.2026.
 * - `annuitaet`: Rate aus Zins plus anfänglicher Tilgung, wie bisher.
 * - `volltilgung`: Die Laufzeit ist vorgegeben, die Rate tilgt genau in ihr.
 * - `endfaellig`: Nur Zinsen, am Ende der Laufzeit die Schlusszahlung.
 */
export type Tilgungsart = "annuitaet" | "volltilgung" | "endfaellig";

export interface Bankplanparameter {
  betrag: number;
  zinsProzent: number;
  tilgungProzent: number;
  /** Nur für die Restschuld am Ende der Zinsbindung: Zins und Rate bleiben danach. */
  zinsbindungJahre: number;
  tilgungsart?: Tilgungsart;
  /** Laufzeit in Jahren für Volltilgung und endfälliges Darlehen. 0: keine. */
  laufzeitJahre?: number;
  /** Tilgungsfreie Anlaufjahre: nur Zinsen. */
  tilgungsfreiJahre?: number;
  /** Kalenderjahre des Plans, das erste beginnt mit `startMonat`. */
  jahre: number;
  /** Erster Zahlungsmonat im ersten Kalenderjahr (1 bis 12), der Monat des Übergangs von Nutzen und Lasten. */
  startMonat?: number;
}

export interface Bankplan {
  jahre: Darlehensjahr[];
  /** Gezahlte Rate je Monat ab Auszahlung, Zins plus Tilgung. */
  monatsraten: number[];
  /** Rate im ersten Monat. */
  ersteRate: number;
  /** Restschuld am Ende der Zinsbindung, 0 ohne Zinsbindung. */
  restschuldZinsbindung: number;
}

/** Monatsrate eines Annuitätendarlehens, das `rest` in `monate` Monaten voll tilgt. */
function annuitaetMonat(rest: number, zinsMonat: number, monate: number): number {
  if (!(rest > 0) || !(monate > 0)) return 0;
  return zinsMonat > 0 ? (rest * zinsMonat) / (1 - (1 + zinsMonat) ** -monate) : rest / monate;
}

/**
 * Ein Bankdarlehen Monat für Monat, zu Kalenderjahren zusammengefasst.
 *
 * Seit dem 22.10.2026 monatlich wie bei der Bank: Monatszins ist Restschuld
 * mal Sollzins durch 12, die Rate wird am Monatsende gezahlt. Vorher galt der
 * Jahreszins auf die Restschuld zu Jahresbeginn; das übersah, dass die
 * Tilgung jeden Monat die Restschuld senkt, und wies zu viel Zins und zu
 * wenig Tilgung aus (285.000 Euro, 4,8 % und 1,2 %: Jahr 1 jetzt rund
 * 13.603,75 statt 13.680 Euro Zins).
 *
 * Nach der Zinsbindung läuft das Darlehen mit demselben Zins und derselben
 * Rate weiter, seit dem 23.10.2026 ohne Anschlussfinanzierung,
 * Umschuldungskosten und Sondertilgungen (Christian). Die Zinsbindung nennt
 * nur den Zeitpunkt, an dem die Restschuld anzuschließen ist.
 */
export function bankplan(p: Bankplanparameter): Bankplan {
  const startMonat = Math.min(12, Math.max(1, Math.round(endlicheZahl(p.startMonat ?? 1))));
  const laufzeitMonate = Math.max(0, Math.round(endlicheZahl(p.laufzeitJahre ?? 0))) * 12;
  // Volltilgung braucht eine Laufzeit; ohne sie bleibt es bei der Annuität aus dem Tilgungssatz.
  const tilgungsart: Tilgungsart =
    p.tilgungsart === "endfaellig" ? "endfaellig" : p.tilgungsart === "volltilgung" && laufzeitMonate > 0 ? "volltilgung" : "annuitaet";
  const tilgungsfrei = Math.max(0, Math.round(endlicheZahl(p.tilgungsfreiJahre ?? 0))) * 12;
  const bindung = Math.max(0, Math.round(endlicheZahl(p.zinsbindungJahre)));

  let rest = Math.max(0, endlicheZahl(p.betrag));
  const zinsJahr = prozentAnteil(p.zinsProzent);
  // Auch nach einer tilgungsfreien Zeit gilt die Rate auf den vollen Betrag.
  const rate =
    tilgungsart === "endfaellig"
      ? 0
      : tilgungsart === "volltilgung"
        ? annuitaetMonat(rest, zinsJahr / 12, laufzeitMonate - tilgungsfrei)
        : (rest * (zinsJahr + prozentAnteil(p.tilgungProzent))) / 12;

  const leer = (): Darlehensjahr => ({ interest: 0, principal: 0, payment: 0, closingBalance: 0, tilgungszuschuss: 0, zinssatz: 0 });
  const jahre = Array.from({ length: Math.max(0, Math.round(p.jahre)) }, leer);
  const monatsraten: number[] = [];
  let restschuldZinsbindung = 0;
  const monateGesamt = Math.max(0, jahre.length * 12 - (startMonat - 1));
  for (let monat = 1; monat <= monateGesamt; monat += 1) {
    const kalendermonat = monat - 1 + startMonat - 1;
    const index = Math.floor(kalendermonat / 12);
    const jahr = jahre[index];
    const aktiv = rest > 0;
    const zinsen = (rest * zinsJahr) / 12;
    let tilgung = 0;
    if (aktiv && monat > tilgungsfrei) {
      const schlusszahlung = tilgungsart !== "annuitaet" && monat === laufzeitMonate;
      tilgung = schlusszahlung ? rest : Math.min(rest, Math.max(0, rate - zinsen));
    }
    rest -= tilgung;
    if (rest < 0.005) rest = 0;
    monatsraten.push(zinsen + tilgung);
    if (monat === bindung * 12) restschuldZinsbindung = rest;
    jahr.interest += zinsen;
    jahr.principal += tilgung;
    jahr.payment += zinsen + tilgung;
    jahr.closingBalance = rest;
    if (aktiv) jahr.zinssatz = zinsJahr;
  }
  return { jahre, monatsraten, ersteRate: monatsraten[0] ?? 0, restschuldZinsbindung };
}

/** Nur die Jahre des Plans, für Aufrufer, die keine Monate brauchen. */
export function banktilgungsplan(p: Bankplanparameter): Darlehensjahr[] {
  return bankplan(p).jahre;
}

/**
 * Die Planparameter von Bankdarlehen, zweitem Bankdarlehen und
 * Nachrangdarlehen aus der Eingabe, an einer Stelle für Rechenkern,
 * Bankgespräch und ausführliche Berechnung. `jahre` und Startmonat ergänzt
 * der Aufrufer.
 */
export function bankplanParameter(
  t: InvestmentEingabe,
  art: "bank" | "bank2" | "nachrang",
  betrag: number,
): Omit<Bankplanparameter, "jahre"> {
  if (art === "nachrang") {
    return { betrag, zinsProzent: t.juniorInterestRate, tilgungProzent: t.juniorRepaymentRate, zinsbindungJahre: t.juniorFixedRateYears };
  }
  if (art === "bank2") {
    return {
      betrag,
      zinsProzent: t.secondInterestRate,
      tilgungProzent: t.secondRepaymentRate,
      zinsbindungJahre: t.secondFixedRateYears,
      tilgungsart: t.secondRepaymentType,
      laufzeitJahre: t.secondTermYears,
      tilgungsfreiJahre: t.secondGracePeriodYears,
    };
  }
  return {
    betrag,
    zinsProzent: t.seniorInterestRate,
    tilgungProzent: t.seniorRepaymentRate,
    zinsbindungJahre: t.seniorFixedRateYears,
    tilgungsart: t.seniorRepaymentType,
    laufzeitJahre: t.seniorTermYears,
    tilgungsfreiJahre: t.seniorGracePeriodYears,
  };
}

/** Ende einer Zinsbindung, siehe `InvestmentErgebnis.zinsbindungen`. */
export interface Zinsbindungsende {
  art: Darlehensart;
  jahre: number;
  /** Zeile der Jahrestabelle ab 0, in der die Zinsbindung endet. */
  jahrIndex: number;
  kalenderjahr: number;
  restschuld: number;
}

/**
 * Ein Darlehensbetrag aus Eingabeart und Wert, für das ganze Objekt: Prozent
 * gelten vom ausgewiesenen Kaufpreis (beim All-inclusive-Modell samt
 * Aufschlag), Euro wie eingetragen. Nie negativ.
 */
export function darlehensbetrag(art: Darlehensbetragsart | undefined, wert: number, kaufpreis: number): number {
  const w = Math.max(0, endlicheZahl(wert));
  return art === "percent" ? (Math.max(0, endlicheZahl(kaufpreis)) * w) / 100 : w;
}

/** Das KfW-Darlehen Monat für Monat, zu Jahren zusammengefasst. */
export interface KfwTilgungsplan {
  jahre: Darlehensjahr[];
  /** Rate je Monat im ersten Monat. */
  ersteRate: number;
  /** Rate je Monat ab dem Ende der tilgungsfreien Zeit, auf den vollen Betrag berechnet. */
  annuitaet: number;
  /** Tatsächlich gezahlte Rate im letzten Monat der Anlaufzeit und im ersten danach. */
  rateVorAnlaufende: number;
  rateNachAnlaufende: number;
  restschuldZinsbindung: number;
  /** Was vom Zuschuss tatsächlich gutgeschrieben wurde: höchstens die Restschuld, 0 nach der Tilgung. */
  zuschussAngerechnet: number;
  /** Jahr (ab 0), in dem der Zuschuss gutgeschrieben wird, oder -1 ohne Gutschrift. */
  zuschussJahr: number;
}

/**
 * Tilgungsplan des KfW-Darlehens, monatlich wie bei der KfW.
 *
 * In den tilgungsfreien Anlaufjahren zahlt der Kunde nur Zinsen. Danach eine
 * gleichbleibende Annuität, berechnet auf den vollen Kreditbetrag über die
 * Restlaufzeit.
 *
 * Der Tilgungszuschuss wird am Ende des Jahres `zuschussNachJahren`
 * gutgeschrieben und mindert nur die Restschuld. Die Annuität bleibt, die
 * Laufzeit verkürzt sich (Merkblatt KfW 261). Ohne Gutschriftjahr (0) wird
 * kein Zuschuss gerechnet: Den Zeitpunkt nennt die Zusage, raten wir ihn,
 * stünde eine Restschuld da, die es nicht gibt (Prüfung vom 07.10.2026).
 *
 * Nach der Zinsbindung rechnet der Plan mit demselben Zins weiter;
 * `restschuldZinsbindung` nennt, was dann anzuschließen ist. Seit dem
 * 11.10.2026 gilt danach der Anschlusszins, falls einer eingetragen ist: Die
 * Rate wird auf die Restschuld über die Restlaufzeit neu bestimmt.
 */
export function kfwTilgungsplan(
  betrag: number,
  zinsProzent: number,
  laufzeitJahre: number,
  anlaufJahre: number,
  zinsbindungJahre: number,
  zuschuss: number,
  zuschussNachJahren: number,
  prognoseJahre: number,
  anschlusszinsProzent = 0,
  /** Erster Zahlungsmonat im ersten Kalenderjahr (seit dem 22.10.2026), die Jahre der Tabelle sind Kalenderjahre. */
  startMonat = 1,
): KfwTilgungsplan {
  const versatz = Math.min(12, Math.max(1, Math.round(startMonat))) - 1;
  let i = prozentAnteil(zinsProzent) / 12;
  const laufzeit = Math.max(1, Math.round(laufzeitJahre)) * 12;
  const anlauf = Math.min(laufzeit - 12, Math.max(0, Math.round(anlaufJahre)) * 12);
  const bindung = Math.max(0, Math.round(zinsbindungJahre)) * 12;
  const zuschussMonat = zuschuss > 0 && zuschussNachJahren >= 1 ? Math.round(zuschussNachJahren) * 12 : -1;
  const leer = (): Darlehensjahr => ({ interest: 0, principal: 0, payment: 0, closingBalance: 0, tilgungszuschuss: 0, zinssatz: 0 });
  const jahre = Array.from({ length: prognoseJahre }, leer);
  const monateMitRate = laufzeit - anlauf;
  const anfang = Math.max(0, betrag);
  // Vor jedem Zuschuss bestimmt und danach unverändert.
  const annuitaet = (basis: number, monate: number) =>
    basis > 0 && monate > 0 ? (i > 0 ? (basis * i) / (1 - (1 + i) ** -monate) : basis / monate) : 0;
  const ersteAnnuitaet = annuitaet(anfang, monateMitRate);
  let rate = ersteAnnuitaet;

  let rest = anfang;
  let ersteRate = 0;
  let rateVorAnlaufende = 0;
  let rateNachAnlaufende = 0;
  let zuschussAngerechnet = 0;
  let restschuldZinsbindung = bindung === 0 ? rest : 0;
  for (let monat = 1; monat <= laufzeit && rest > 0; monat += 1) {
    const zinsen = rest * i;
    const tilgung = monat <= anlauf ? 0 : Math.min(rest, rate - zinsen);
    rest -= tilgung;
    let zuschussJetzt = 0;
    if (monat === zuschussMonat) {
      zuschussJetzt = Math.min(rest, zuschuss);
      rest -= zuschussJetzt;
      zuschussAngerechnet = zuschussJetzt;
    }
    if (rest < 0.005) rest = 0;
    const zahlung = zinsen + tilgung;
    if (monat === 1) ersteRate = zahlung;
    if (monat === anlauf) rateVorAnlaufende = zahlung;
    if (monat === anlauf + 1) rateNachAnlaufende = zahlung;
    if (monat === bindung) restschuldZinsbindung = rest;
    if (monat === bindung && anschlusszinsProzent > 0 && rest > 0) {
      i = prozentAnteil(anschlusszinsProzent) / 12;
      rate = annuitaet(rest, laufzeit - Math.max(monat, anlauf));
    }
    const jahr = jahre[Math.floor((monat - 1 + versatz) / 12)];
    if (!jahr) continue;
    if (!jahr.zinssatz) jahr.zinssatz = prozentAnteil(zinsProzent);
    if (monat > bindung && bindung > 0 && anschlusszinsProzent > 0) jahr.zinssatz = prozentAnteil(anschlusszinsProzent);
    jahr.interest += zinsen;
    jahr.principal += tilgung;
    jahr.payment += zahlung;
    jahr.tilgungszuschuss += zuschussJetzt;
    jahr.closingBalance = rest;
  }
  return {
    jahre,
    ersteRate,
    annuitaet: ersteAnnuitaet,
    rateVorAnlaufende,
    rateNachAnlaufende,
    restschuldZinsbindung,
    zuschussAngerechnet,
    zuschussJahr: zuschussAngerechnet > 0 ? Math.floor((zuschussMonat - 1 + versatz) / 12) : -1,
  };
}

/**
 * Kapitalwert einer Zahlungsreihe bei gegebenem Zinssatz. `zeitpunkte` nennt
 * je Zahlung den Zeitpunkt in Jahren (seit dem 22.10.2026, für ein kurzes
 * erstes Jahr); ohne sie gilt die Stelle in der Reihe als Jahr.
 */
export function kapitalwert(zinssatz: number, zahlungen: number[], zeitpunkte?: readonly number[]): number {
  return zahlungen.reduce((summe, zahlung, periode) => summe + zahlung / (1 + zinssatz) ** (zeitpunkte?.[periode] ?? periode), 0);
}

/**
 * Interner Zinsfuß per Bisektion zwischen -99,9 % und 1000 %. Ohne
 * Vorzeichenwechsel in der Zahlungsreihe gibt es keine Lösung, dann null.
 */
export function internerZinsfuss(zahlungen: number[], zeitpunkte?: readonly number[]): number | null {
  if (!zahlungen.some((z) => z < 0) || !zahlungen.some((z) => z > 0)) return null;
  let untere = -0.999;
  let obere = 10;
  let wertUnten = kapitalwert(untere, zahlungen, zeitpunkte);
  let wertOben = kapitalwert(obere, zahlungen, zeitpunkte);
  if (wertUnten * wertOben > 0) return null;
  for (let schritt = 0; schritt < 180; schritt += 1) {
    const mitte = (untere + obere) / 2;
    const wertMitte = kapitalwert(mitte, zahlungen, zeitpunkte);
    if (Math.abs(wertMitte) < 1e-4) return mitte;
    if (wertUnten * wertMitte <= 0) {
      obere = mitte;
      wertOben = wertMitte;
    } else {
      untere = mitte;
      wertUnten = wertMitte;
    }
  }
  return (untere + obere) / 2;
}

/**
 * Gesamtberechnung: Kaufkosten, Finanzierung, Steuerprofil und Jahresprognose.
 *
 * `hoechstJahre` deckelt die Prognose. Die Oberfläche bleibt bei 30; nur die
 * Altersvorsorge (siehe altersvorsorge.ts) rechnet bis zum Rentenbeginn und
 * darüber hinaus weiter, seit dem 09.10.2026.
 */
export function berechneInvestment(eingabe: InvestmentEingabe, hoechstJahre = 30): InvestmentErgebnis {
  // Alle Zahlenfelder gegen NaN absichern, Texte und Schalter bleiben unverändert.
  // Fehlende Felder kommen aus der Standardeingabe: Eine Eingabe von vor
  // einem neuen Feld (etwa dem Rücklagenanteil vom 25.09.2026) rechnet sonst
  // mit undefined, und das färbt jede Zahl zu NaN.
  const t = Object.fromEntries(
    Object.entries({ ...standardEingabe, ...eingabe }).map(([schluessel, wert]) => [
      schluessel,
      typeof wert === "number" ? endlicheZahl(wert) : wert,
    ]),
  ) as unknown as InvestmentEingabe;

  /*
    Der Miteigentumsanteil, seit dem 21.09.2026 an einer Stelle statt gar nicht.

    ## Was vorher falsch war

    Der Anteil wirkte im ganzen Rechenkern an genau einer Zeile: Er teilte das
    steuerliche Ergebnis. Miete, Kosten, Rate, Immobilienwert, Restschuld und
    damit auch der Cashflow blieben auf dem vollen Objekt.

    Die Folge war die Umkehrung der Wahrheit: Wer 50 Prozent eingab, bekam einen
    HOEHEREN monatlichen Eigenanteil angezeigt als jemand, der dieselbe Wohnung
    allein kauft. Der Eigenanteil ist die Zuzahlung minus die Steuerersparnis;
    die Zuzahlung blieb voll, die Ersparnis schrumpfte auf die Haelfte.

    ## Warum die Teilung hier oben steht

    Geteilt werden die Eingaben, nicht die Formeln. Damit rechnet alles
    darunter von selbst anteilig, und es gibt keine zwanzig Stellen, an denen
    eine Multiplikation vergessen werden koennte. Genau so ist der Fehler
    entstanden.

    Geteilt wird, was in Euro gemessen wird und zum Objekt gehoert: Kaufpreis,
    Moebel, Miete, Betriebskosten, Nachrangdarlehen und der Erhaltungsaufwand.
    Prozentsaetze bleiben unberuehrt, denn in einem Bruch werden Zaehler und
    Nenner gleichermassen geteilt: Die Bruttorendite eines halben Objekts ist
    dieselbe wie die des ganzen.

    ## Das Eigenkapital bleibt ungeteilt

    Christians Entscheidung vom 21.09.2026. Bringen zwei Partner
    unterschiedlich viel mit, ist der Anteil am Eigenkapital nicht der
    Miteigentumsanteil. Das Feld wird deshalb als Betrag DIESES Kunden gelesen.

    ## Zusammenveranlagung

    Seit dem 22.10.2026 gilt der eingetragene Anteil auch bei
    Zusammenveranlagung. Vorher setzte der Rechenkern ihn dann auf 100
    Prozent. Das war falsch, sobald nur ein Teil des Objekts den beiden
    Ehepartnern gehört, etwa 50 Prozent neben einem Dritten: Die Steuer
    rechnete dann mit dem ganzen Objekt. Wem gehört wie viel, ist eine Frage
    des Eigentums, nicht der Veranlagung. Ehepaare, denen das Objekt
    gemeinsam ganz gehört, tragen 100 ein; die Oberfläche sagt das dazu.
  */
  const anteil = Math.min(1, Math.max(0, prozentAnteil(t.investmentShare)));

  /** Alle Sätze außer der Grunderwerbsteuer: Notar, Grundbuch, Makler, Sonstige. */
  const satzOhneGrunderwerbsteuer =
    prozentAnteil(t.notaryRate) +
    prozentAnteil(t.landRegisterRate) +
    prozentAnteil(t.brokerRate) +
    prozentAnteil(t.otherPurchaseCostRate);
  const summeDerSaetze = prozentAnteil(t.transferTaxRate) + satzOhneGrunderwerbsteuer;
  /*
    Ein Kaufpreis, seit dem 25.09.2026.

    `purchasePrice` ist der Gesamtkaufpreis, so wie er im Kaufvertrag steht.
    Möbel und Erhaltungsaufwand sind darin enthaltene Anteile, keine Beträge
    obendrauf. Vorher waren es zwei Preise, Wohnung und Möbel, und die Möbel
    kamen zu den Gesamtkosten hinzu. Der Investagon-Import speichert aber
    Wohnung plus Möbel als einen Preis, und so doppelte sich der Möbelbetrag,
    sobald ihn jemand zusätzlich eintrug.

    Die Möbel werden auf den Kaufpreis gedeckelt: Mehr Möbel als Kaufpreis
    ist ein Tippfehler, und ein negativer Wohnungsteil rechnete sonst eine
    negative Abschreibung.
  */
  // Ab hier ist jeder Euro der Anteil dieses Kunden, nicht mehr das ganze Objekt.
  const purchasePrice = Math.max(0, t.purchasePrice) * anteil;
  const furniturePrice = Math.min(purchasePrice, Math.max(0, t.furniturePrice) * anteil);
  const wohnungspreis = purchasePrice - furniturePrice;
  /*
    Anteil an der Instandhaltungsrücklage, seit dem 25.09.2026. Er steckt im
    Kaufpreis, ist aber weder Gebäude noch Boden, sondern ein Guthaben bei
    der Eigentümergemeinschaft: keine Abschreibung, keine Werbungskosten.
    Die Grunderwerbsteuer fällt trotzdem darauf an (BFH, II R 49/17), er
    bleibt deshalb in deren Basis. Gedeckelt auf den Kaufpreis ohne Möbel.
  */
  const ruecklage = Math.min(wohnungspreis, Math.max(0, t.maintenanceReserve) * anteil);
  // Wohnung plus Garage: ab hier rechnet alles mit der Gesamtmiete. Getrennt bleiben sie nur im Ausweis der Rendite.
  const mieteWohnungMonat = t.monthlyColdRent * anteil;
  const monthlyColdRent = mieteWohnungMonat + Math.max(0, t.monthlyGarageRent || 0) * anteil;
  // Stellplatz oder Garage im Kaufpreis, gedeckelt wie die Möbel.
  const garagenpreis = Math.min(purchasePrice, Math.max(0, t.garagePrice || 0) * anteil);
  /*
    Nicht umlagefähige Kosten, seit dem 22.10.2026 aus zwei Feldern: dem nicht
    umlagefähigen Hausgeld und den weiteren Kosten des Eigentümers (etwa
    Sondereigentumsverwaltung). Jede der beiden Eingaben ändert den Cashflow.
    Gespeicherte Stände von vorher tragen alles im zweiten Feld und rechnen
    unverändert.
  */
  const monthlyOperatingCosts = (t.monthlyOperatingCosts + Math.max(0, t.housingFeeNonRecoverable || 0)) * anteil;
  const monthlyReserveContribution = Math.max(0, t.monthlyReserveContribution) * anteil;
  const rehabEingabe = Math.max(0, t.rehabExpense) * anteil;
  /*
    Aufteilung des Kaufpreises, genau einmal und nur hier.

    Der Immobilienanteil ist der Kaufpreis ohne Möbel. Nur er wird über den
    Gebäudeanteil in Grund und Boden und Gebäude geteilt; die Möbel bleiben
    außen vor, sie haben ihre eigene Abschreibung. Vorher stand die Teilung
    als Formel direkt in der AfA-Basis und in der 15-Prozent-Prüfung, jeweils
    mit eigenem Ausgangswert.
  */
  // Ohne Möbel und ohne Rücklage: Nur was Grund und Boden oder Gebäude ist.
  const immobilienanteil = wohnungspreis - ruecklage;
  const gebaeudeanteilKaufpreis = immobilienanteil * prozentAnteil(t.buildingShare);
  const grundstuecksanteil = immobilienanteil - gebaeudeanteilKaufpreis;
  /*
    Erhaltungsaufwand, seit dem 25.09.2026 ohne Doppelzählung.

    Er ist Teil des Kaufpreises und steckt damit schon im Gebäudeanteil.
    Vorher wirkte er doppelt: Bei „Abziehen“ als Werbungskosten und zugleich
    über den Kaufpreis in der Gebäude-AfA, bei „Aktivieren“ einmal über den
    Kaufpreis und ein zweites Mal obendrauf.

    Er mindert nur den Gebäudeteil, nicht den Immobilienanteil vor der
    Aufteilung. Renoviert wird das Gebäude, nie der Boden, und der
    Gebäudeanteil aus Kaufvertrag oder Arbeitshilfe des BMF bezieht sich auf
    den Kaufpreis, in dem der Sanierungsanteil steckt. So bleibt der
    Bodenwert derselbe, gleich wie der Aufwand steuerlich behandelt wird.
    Würde er vor der Aufteilung abgezogen, bekäme der Boden einen Teil des
    Abzugs, und das Gebäude schriebe entsprechend zu viel ab. Investagon
    teilt genauso.

    Mehr Aufwand als Gebäudeteil ist ein Eingabefehler; gedeckelt, damit die
    AfA-Basis nicht negativ wird und nicht mehr abgezogen wird, als im Preis
    steckt. Die Deckelung steht seit dem 30.09.2026 vor den Kaufnebenkosten,
    weil der gedeckelte Aufwand deren Basis mindert.
  */
  const rehabExpense = Math.min(rehabEingabe, gebaeudeanteilKaufpreis);

  /*
    Kaufnebenkosten, seit dem 30.09.2026 auf den Kaufpreis der Immobilie:
    Gesamtkaufpreis ohne Erhaltungsaufwand und ohne Möbel.

    Beide sind bei uns gesonderte Leistungen, im Notarvertrag eigens
    ausgewiesen. Sie stecken im Gesamtkaufpreis, aber Grunderwerbsteuer,
    Notar, Grundbuch, Makler und Sonstige laufen nur auf den Rest. Die Regel
    steht in `nebenkostenBasis`, damit alle Rechner dieselbe nehmen. Vom 25.
    bis 30.09.2026 lief alles auf den ganzen Gesamtkaufpreis, danach kurz auf
    den Gesamtkaufpreis ohne Aufwand; die Möbel trugen bis dahin ihren Anteil,
    die Grunderwerbsteuer nur ohne den Schalter „gesondert ausgewiesen“.

    Die Rücklage bleibt in der Basis: Auf sie fällt Grunderwerbsteuer an (BFH,
    II R 49/17).

    `purchaseCostRate` ist damit immer die Summe der Sätze, bezogen auf die
    Basis. Er bleibt als eigenes Feld, weil Anzeige und PDF ihn lesen.
  */
  /*
    Sanierungsfall, seit dem 22.10.2026 (Christian). Nach dem Kauf (Standard)
    bleibt der Aufwand wie bisher außerhalb der Basis der Kaufnebenkosten,
    das trägt nur bei einem eigenständigen, nicht mit dem Kauf verknüpften
    Sanierungsvertrag. Saniert der Verkäufer vor dem Verkauf, kauft der
    Käufer eine sanierte Wohnung: Der Anteil ist Kaufpreis wie jeder andere
    und trägt Grunderwerbsteuer und Kaufnebenkosten.
  */
  const sanierungsfall: Sanierungsfall = t.rehabScenario === "durchVerkaeufer" ? "durchVerkaeufer" : "nachKauf";
  const durchVerkaeufer = sanierungsfall === "durchVerkaeufer";
  const basisNebenkosten = nebenkostenBasis(purchasePrice, durchVerkaeufer ? 0 : rehabExpense, furniturePrice);
  const grunderwerbsteuer = basisNebenkosten * prozentAnteil(t.transferTaxRate);
  const notarkosten = basisNebenkosten * prozentAnteil(t.notaryRate);
  const grundbuchkosten = basisNebenkosten * prozentAnteil(t.landRegisterRate);
  const purchaseCosts = grunderwerbsteuer + basisNebenkosten * satzOhneGrunderwerbsteuer;
  const purchaseCostRate = summeDerSaetze;
  /*
    All-inclusive-Modell, seit dem 09.10.2026 (Vorgabe der Geschäftsführung):
    Der Kaufpreis wird um die Kaufnebenkosten erhöht, gesonderte fallen dafür
    keine an. Gerechnet wird intern genau wie im normalen Modell, nur der
    Ausweis ist ein anderer: Der Aufschlag ist dieselbe Summe auf derselben
    Basis mit denselben Sätzen. Deshalb bleiben Finanzierungsbedarf, Darlehen
    und Gesamtkosten betragsgleich, und der Aufschlag geht wie sonst die
    Nebenkosten nach dem Gebäudeanteil in die AfA-Basis und zum Boden. Die
    Steuer ändert sich also nicht.

    Der Immobilienwert für die Wertentwicklung (`immobilienanteil`,
    `propertyValue`, Wertzuwachs, Vermögen) bleibt auf dem Kaufpreis ohne
    Aufschlag. Sonst stünde der Kunde beim Vermögen besser da als im
    normalen Modell, obwohl er dasselbe kauft.
  */
  const allInclusive = t.allInclusive === true;
  const allInclusiveAufschlag = allInclusive ? purchaseCosts : 0;
  /** Kaufpreis plus Kaufnebenkosten: daraus ergibt sich das Darlehen. */
  const kaufkosten = purchasePrice + purchaseCosts;
  /*
    Finanzierung, seit dem 23.10.2026 (Christian): Alle Darlehen werden
    eingegeben, das Eigenkapital ist der Rest. Prozentangaben gelten vom
    ausgewiesenen Kaufpreis, also beim All-inclusive-Modell samt Aufschlag;
    `purchasePrice` ist hier schon der Anteil dieses Kunden, Euro-Beträge
    werden wie jeder Euro des Objekts anteilig gerechnet.

    Bis zum 23.10.2026 war das Eigenkapital ungeteilt der Betrag dieses
    Kunden und das Bankdarlehen der Rest. Seitdem ist auch das Eigenkapital
    anteilig, denn es folgt aus Darlehen, die zum Objekt gehören.

    Sind die Darlehen höher als Kaufpreis und Nebenkosten, wird trotzdem mit
    ihnen gerechnet, denn so wären sie vereinbart; die Oberfläche sagt es
    (`ueberfinanzierung`). Der Überschuss fließt dem Kunden zu Beginn zu und
    steht so in der Zahlungsreihe.
  */
  const kaufpreisFuerDarlehen = purchasePrice + allInclusiveAufschlag;
  // Prozent vom (schon anteiligen) Kaufpreis, Euro mal Anteil.
  const darlehenAnteilig = (art: Darlehensbetragsart, wert: number) =>
    art === "percent" ? darlehensbetrag(art, wert, kaufpreisFuerDarlehen) : darlehensbetrag(art, wert, 0) * anteil;
  const seniorLoanAmount = darlehenAnteilig(t.seniorLoanMode, t.seniorLoanValue);
  const juniorLoan = darlehenAnteilig(t.juniorLoanMode, t.juniorLoanValue);
  // KfW-Darlehen (seit dem 07.10.2026) und zweites Bankdarlehen in Euro, ohne Deckelung.
  const kfwLoanAmount = t.kfwEnabled ? Math.max(0, t.kfwLoanAmount) * anteil : 0;
  const secondLoanAmount = Math.max(0, t.secondLoanAmount) * anteil;
  const totalDebt = seniorLoanAmount + juniorLoan + kfwLoanAmount + secondLoanAmount;
  const totalInvestment = kaufkosten;
  const finanzierungsbedarf = kaufkosten;
  const eigenkapitalBetrag = Math.max(0, kaufkosten - totalDebt);
  const ueberfinanzierung = Math.max(0, totalDebt - kaufkosten);
  const laufzeit = Math.min(hoechstJahre, Math.max(1, Math.round(t.forecastYears)));
  // Übergang von Nutzen und Lasten: Das erste Jahr zählt ab diesem Monat.
  const startMonat = Math.min(12, Math.max(1, Math.round(t.acquisitionMonth || 1)));
  const ersterJahresanteil = (13 - startMonat) / 12;
  const kfwLaufzeitJahre = Math.max(1, Math.round(t.kfwTermYears));
  const kfwAnlaufJahre = Math.min(5, kfwLaufzeitJahre - 1, Math.max(0, Math.round(t.kfwGracePeriodYears)));
  /*
    Alle Darlehen monatlich, seit dem 22.10.2026 (siehe `bankplan`). Die Pläne
    laufen mindestens bis zum Ende der Zinsbindung und über die tilgungsfreie
    Zeit der KfW hinaus, damit Restschuld und Ratensprung dort bekannt sind;
    die Jahrestabelle nimmt davon nur die Prognosejahre.
  */
  const bindungJahre = (wert: number) => Math.max(0, Math.round(endlicheZahl(wert)));
  const bindungBank = bindungJahre(t.seniorFixedRateYears);
  const planJahre = Math.max(
    laufzeit,
    bindungBank + 1,
    bindungJahre(t.secondFixedRateYears) + 1,
    bindungJahre(t.juniorFixedRateYears) + 1,
    kfwAnlaufJahre + 2,
  );
  const bankMonate = bankplan({ ...bankplanParameter(t, "bank", seniorLoanAmount), jahre: planJahre, startMonat });
  const bankRestschuldZinsbindung = bindungBank >= 1 ? bankMonate.restschuldZinsbindung : 0;
  const zweitesMonate = bankplan({ ...bankplanParameter(t, "bank2", secondLoanAmount), jahre: planJahre, startMonat });
  // Das Nachrangdarlehen: Annuität aus Zins und Tilgung, monatlich, seit dem 23.10.2026 mit Zinsbindung.
  const nachrangMonate = bankplan({ ...bankplanParameter(t, "nachrang", juniorLoan), jahre: planJahre, startMonat });
  const bankplanJahre = bankMonate.jahre;
  const zweitesplan = zweitesMonate.jahre;
  const nachrangplan = nachrangMonate.jahre;
  /*
    Tilgungszuschuss: Prozent vom KfW-Darlehen oder ein Betrag, der anteilig
    gilt wie jeder Euro des Objekts. Gutgeschrieben nur zum Jahr aus der
    Zusage (`kfwGrantYear`), ohne Jahr gar nicht, siehe `kfwTilgungsplan`.
  */
  // Höchstens fünf Anlaufjahre und immer mindestens ein Jahr Tilgung (oben bestimmt).
  const kfwTilgungszuschussNominal =
    kfwLoanAmount > 0
      ? t.kfwGrantMode === "euro" ? Math.max(0, t.kfwGrantValue) * anteil : kfwLoanAmount * prozentAnteil(t.kfwGrantValue)
      : 0;
  const kfw = kfwTilgungsplan(
    kfwLoanAmount,
    t.kfwInterestRate,
    kfwLaufzeitJahre,
    kfwAnlaufJahre,
    t.kfwFixedRateYears,
    kfwTilgungszuschussNominal,
    t.kfwGrantYear,
    laufzeit,
    t.kfwFollowUpRate,
    startMonat,
  );
  const monthlyDebtService = bankMonate.ersteRate + nachrangMonate.ersteRate + zweitesMonate.ersteRate + kfw.ersteRate;
  /*
    Ende jeder Zinsbindung als Zeile der Jahrestabelle, seit dem 23.10.2026.
    Der Plan beginnt im Monat des Übergangs; die Zinsbindung endet nach
    `jahre × 12` Monaten, also im Kalenderjahr dieses letzten Monats.
  */
  const zinsbindungen: Zinsbindungsende[] = (
    [
      ["bank", seniorLoanAmount, t.seniorFixedRateYears, bankMonate.restschuldZinsbindung],
      ["bank2", secondLoanAmount, t.secondFixedRateYears, zweitesMonate.restschuldZinsbindung],
      ["nachrang", juniorLoan, t.juniorFixedRateYears, nachrangMonate.restschuldZinsbindung],
      ["kfw", kfwLoanAmount, t.kfwFixedRateYears, kfw.restschuldZinsbindung],
    ] as [Darlehensart, number, number, number][]
  )
    .filter(([, betrag, jahre]) => betrag > 0 && bindungJahre(jahre) >= 1)
    .map(([art, , jahre, restschuld]) => {
      const jahrIndex = Math.floor((startMonat - 1 + bindungJahre(jahre) * 12 - 1) / 12);
      return { art, jahre: bindungJahre(jahre), jahrIndex, kalenderjahr: Math.round(t.startYear) + jahrIndex, restschuld };
    });
  // Mischzins auf die Anfangsbeträge, nur Darlehen mit Betrag zählen.
  const mischzins =
    totalDebt > 0
      ? (seniorLoanAmount * prozentAnteil(t.seniorInterestRate) +
          juniorLoan * prozentAnteil(t.juniorInterestRate) +
          kfwLoanAmount * prozentAnteil(t.kfwInterestRate) +
          secondLoanAmount * prozentAnteil(t.secondInterestRate)) /
        totalDebt
      : 0;
  /*
    Ende der tilgungsfreien Zeit: Die Annuität beginnt immer mit einem neuen
    Jahr, weil die Anlaufzeit in ganzen Jahren zählt. Verglichen werden die
    tatsächlich gezahlten Raten im letzten Monat davor und im ersten danach,
    aus den Plänen aller Darlehen und unabhängig von der Prognoselänge: Eine
    schon getilgte Bank zahlt dann nichts mehr, ein Zuschuss in der
    Anlaufzeit senkt die Zinsrate davor.
  */
  let rateSprung: InvestmentErgebnis["rateSprung"] = null;
  if (kfwLoanAmount > 0 && kfwAnlaufJahre > 0) {
    const monat = kfwAnlaufJahre * 12;
    const ohneKfw = (index: number) =>
      (bankMonate.monatsraten[index] ?? 0) + (nachrangMonate.monatsraten[index] ?? 0) + (zweitesMonate.monatsraten[index] ?? 0);
    const rateVorher = ohneKfw(monat - 1) + kfw.rateVorAnlaufende;
    const rateNachher = ohneKfw(monat) + kfw.rateNachAnlaufende;
    if (rateNachher > rateVorher + 0.005) {
      // Der erste Monat nach der Anlaufzeit, als Kalenderjahr der Tabelle.
      const index = Math.floor((monat + startMonat - 1) / 12);
      rateSprung = { jahr: index + 1, kalenderjahr: Math.round(t.startYear) + index, rateVorher, rateNachher };
    }
  }
  const effectiveAnnualRent = monthlyColdRent * 12 * (1 - Math.min(1, prozentAnteil(t.vacancyRate)));
  // Für die Nettorendite zählt, was der Eigentümer trägt, also auch die Zuführung zur Rücklage.
  const jahresBetriebskosten = (monthlyOperatingCosts + monthlyReserveContribution) * 12;
  /*
    Bruttorendite auf den ausgewiesenen Kaufpreis, beim All-inclusive-Modell
    also samt Aufschlag: Das ist der Preis, den der Kunde zahlt und im Exposé
    sieht, und Jahresmiete durch diesen Preis lässt sich dort nachrechnen.
    Die Rendite fällt dadurch niedriger aus als im normalen Modell, das ist
    gewollt, sonst wirkte derselbe Kauf nur durch den Ausweis besser.
  */
  const kaufpreisAusgewiesen = purchasePrice + allInclusiveAufschlag;
  const grossYield = kaufpreisAusgewiesen > 0 ? (monthlyColdRent * 12) / kaufpreisAusgewiesen : 0;
  const netYield = totalInvestment > 0 ? (effectiveAnnualRent - jahresBetriebskosten) / totalInvestment : 0;
  /*
    Rendite der Wohnung allein, seit dem 22.10.2026, neben der des Pakets aus
    Wohnung und Stellplatz. Der Stellplatz trägt seinen Kaufpreis und seine
    Miete, die Kosten bleiben bei der Wohnung. Beim All-inclusive-Modell und
    bei den Gesamtkosten zählt der Teil, der dem Preis der Wohnung entspricht.
    Ohne Stellplatz sind beide Werte gleich.
  */
  const wohnungsquote = purchasePrice > 0 ? (purchasePrice - garagenpreis) / purchasePrice : 1;
  const kaufpreisWohnung = kaufpreisAusgewiesen * wohnungsquote;
  const jahresmieteWohnung = mieteWohnungMonat * 12;
  const grossYieldWohnung = kaufpreisWohnung > 0 ? jahresmieteWohnung / kaufpreisWohnung : 0;
  const gesamtkostenWohnung = totalInvestment * wohnungsquote;
  const netYieldWohnung =
    gesamtkostenWohnung > 0
      ? (jahresmieteWohnung * (1 - Math.min(1, prozentAnteil(t.vacancyRate))) - jahresBetriebskosten) / gesamtkostenWohnung
      : 0;
  const kaufpreisfaktor = monthlyColdRent > 0 && kaufpreisAusgewiesen > 0 ? kaufpreisAusgewiesen / (monthlyColdRent * 12) : null;
  const kaufpreisfaktorWohnung = jahresmieteWohnung > 0 && kaufpreisWohnung > 0 ? kaufpreisWohnung / jahresmieteWohnung : null;
  /*
    Die Nebenkosten gehen nach dem Gebäudeanteil an Gebäude und Boden, wie bei
    Investagon. Auf Erhaltungsaufwand und Möbel entfallen seit dem 30.09.2026
    keine Nebenkosten mehr: Sie liegen außerhalb der Basis, also gehört jeder
    Euro Nebenkosten der Immobilie. Die Rücklage bekommt keinen eigenen
    Anteil, sie ist ein Guthaben ohne Abschreibung; ihr Teil geht mit an Boden
    und Gebäude, statt bei einem Posten zu landen, der nie abgeschrieben wird.
  */
  const nebenkostenGebaeude = purchaseCosts * prozentAnteil(t.buildingShare);
  const nebenkostenGrundstueck = purchaseCosts - nebenkostenGebaeude;
  /*
    Abschreibung, seit dem 25.09.2026 auf der aufgeteilten Basis.

    Gebäude: sein Anteil am Immobilienanteil plus die Nebenkosten, die auf ihn
    entfallen. Vorher wurden die gesamten Nebenkosten mit dem Gebäudeanteil
    multipliziert, also auch der Teil, der auf die Möbel entfällt.

    Möbel: der Möbelanteil, verteilt über die Nutzungsdauer. Vom 25. bis
    30.09.2026 kamen seine anteiligen Nebenkosten dazu; seitdem trägt er
    keine mehr (siehe `nebenkostenBasis`).

    Degressive AfA, Sonder-AfA und der Deckel auf das Restvolumen rechnen
    unverändert, nur auf dieser Basis.
  */
  /*
    15-Prozent-Prüfung nach § 6 Abs. 1 Nr. 1a EStG, seit dem 22.10.2026 mit
    Folge statt nur als Hinweis: Übersteigen Instandsetzung und Modernisierung
    in den drei Jahren nach der Anschaffung 15 Prozent der
    Anschaffungskosten des Gebäudes (netto), sind sie anschaffungsnaher
    Herstellungsaufwand. Dann gibt es keinen Sofortabzug, der Aufwand geht in
    die Gebäude-AfA. Der Rechner nimmt an, dass der Aufwand aus dem Kaufpreis
    in diesen drei Jahren anfällt. Bezug ist das Gebäude ohne den Aufwand,
    samt seiner Nebenkosten.

    Im Fall „durch den Verkäufer“ ist der Aufwand ohnehin Anschaffungskosten,
    die Prüfung entfällt dort.
  */
  const gebaeudeOhneAufwand = gebaeudeanteilKaufpreis + nebenkostenGebaeude - rehabExpense;
  /*
    Die Grenze gilt für den Aufwand ohne Umsatzsteuer (§ 6 Abs. 1 Nr. 1a EStG),
    seit dem 22.10.2026 getrennt geführt: `rehabExpense` ist der gezahlte
    Betrag brutto, er steckt so im Kaufpreis, in der Finanzierung und im
    Abzug. Für die Prüfung zählt er netto, geteilt durch 1 plus USt-Satz.
  */
  const rehabUstSatz = Math.min(1, Math.max(0, endlicheZahl(t.rehabVatRate ?? 19) / 100));
  const erhaltungsaufwandNetto = rehabExpense / (1 + rehabUstSatz);
  const immediateDeductionRatio = gebaeudeOhneAufwand > 0 ? erhaltungsaufwandNetto / gebaeudeOhneAufwand : 0;
  const fuenfzehnProzentGrenze = Math.max(0, gebaeudeOhneAufwand) * ANSCHAFFUNGSNAH_GRENZE;
  const anschaffungsnah = !durchVerkaeufer && rehabExpense > 0 && immediateDeductionRatio > ANSCHAFFUNGSNAH_GRENZE;
  const sanierungAktiviert = rehabExpense > 0 && (durchVerkaeufer || anschaffungsnah || t.rehabMode === "capitalize");
  // Bleibt als Name, weil Oberfläche und PDF ihn lesen: Abziehen war gewählt, die Grenze macht daraus Aktivieren.
  const simpleThresholdExceeded = anschaffungsnah && t.rehabMode === "expense";
  const depreciationBasis = gebaeudeanteilKaufpreis + nebenkostenGebaeude - (sanierungAktiviert ? 0 : rehabExpense);
  const moebelAfaBasis = furniturePrice;
  /*
    Möbel-AfA, seit dem 22.10.2026 je Jahr auf den Restbuchwert begrenzt. Eine
    Nutzungsdauer mit Nachkommastelle (7,5 Jahre) schrieb vorher acht volle
    Jahresbeträge ab, also mehr als die Basis.
  */
  const moebelNutzungsdauer = t.furnitureDepreciationYears > 0 ? t.furnitureDepreciationYears : 0;
  const moebelAfaJahr = moebelNutzungsdauer > 0 ? moebelAfaBasis / moebelNutzungsdauer : 0;

  /*
    Sonder-AfA nach § 7b EStG, seit dem 22.10.2026 mit eigener Prüfung (siehe
    `sonderabschreibung7b`): Liegen die Anschaffungskosten des Gebäudes über
    5.200 Euro je m² Wohnfläche, entfällt sie ganz; sonst ist ihre
    Bemessungsgrundlage auf 4.000 Euro je m² gedeckelt. Satz höchstens 5
    Prozent, höchstens vier Jahre (Anschaffungsjahr und drei folgende), nicht
    zeitanteilig. Ohne Wohnfläche lässt sich das nicht prüfen, dann rechnet
    der Rechner keine. Die übrigen Voraussetzungen (Bauantrag, Effizienzhaus
    40 mit QNG, entgeltliche Vermietung zu Wohnzwecken für zehn Jahre) kennt
    er nicht; die Oberfläche nennt sie.
  */
  const sonderSatzEingabe = Math.max(0, t.specialDepreciationRate);
  const sonderJahreEingabe = Math.max(0, Math.round(t.specialDepreciationYears));
  const sonderBeantragt = sonderSatzEingabe > 0 && sonderJahreEingabe > 0;
  const sonderSatz = Math.min(SONDER_7B_SATZ, sonderSatzEingabe);
  const sonderJahre = Math.min(SONDER_7B_JAHRE, sonderJahreEingabe);
  const sonderPruefung = sonderabschreibung7b(anteil > 0 ? depreciationBasis / anteil : 0, t.area);
  const sonderZulaessig = sonderBeantragt && sonderPruefung.moeglich;
  const sonderBemessung = sonderZulaessig ? sonderPruefung.bemessungsgrundlage * anteil : 0;
  const sonderGedeckelt = sonderSatz < sonderSatzEingabe || sonderJahre < sonderJahreEingabe;
  const sonderAfa: InvestmentErgebnis["sonderAfa"] = {
    beantragt: sonderBeantragt,
    zulaessig: sonderZulaessig,
    hinweis: !sonderBeantragt
      ? ""
      : !sonderPruefung.moeglich
        ? `Keine Sonder-AfA: ${sonderPruefung.hinweis}.`
        : `${sonderPruefung.hinweis}.${sonderGedeckelt ? ` Gerechnet mit ${SONDER_7B_SATZ} % in höchstens ${SONDER_7B_JAHRE} Jahren, wie § 7b EStG es zulässt.` : ""}`,
    bemessungsgrundlage: sonderBemessung,
    baukostenJeQm: sonderPruefung.baukostenJeQm,
    satz: sonderZulaessig ? sonderSatz : 0,
    jahre: sonderZulaessig ? sonderJahre : 0,
  };
  /*
    Gesamtnutzungsdauer für die AfA aus dem Restwert: linear aus dem
    eingestellten Satz, degressiv aus dem gesetzlichen linearen Satz nach
    Baujahr (degressive AfA gibt es nur für Neubauten, ohne Baujahr deshalb
    3 Prozent).
  */
  const afaSatz = prozentAnteil(t.buildingDepreciationRate);
  const degressiv = t.depreciationMethod === "declining";
  const linearSatzRestwert = degressiv
    ? prozentAnteil(t.constructionYear > 0 ? linearerAfaSatz(t.constructionYear).satz : 3)
    : afaSatz;
  const nutzungsdauer = linearSatzRestwert > 0 ? 1 / linearSatzRestwert : 0;
  const combinedTaxableIncome = Math.max(
    0,
    t.taxableIncomeCustomer + (t.jointAssessment ? t.taxableIncomeSpouse : 0),
  );
  const taxProfile = steuerprofil(
    combinedTaxableIncome,
    t.jointAssessment,
    t.churchTaxRate,
    t.includeSolidaritySurcharge,
  );
  const marginalIncomeTaxRate = grenzsteuersatz(combinedTaxableIncome, t.jointAssessment, 0, false, false);
  const marginalTotalTaxRate = grenzsteuersatz(
    combinedTaxableIncome,
    t.jointAssessment,
    t.churchTaxRate,
    t.includeSolidaritySurcharge,
    true,
  );

  /*
    Ein steuerlicher Restbuchwert des Gebäudes, seit dem 22.10.2026. Reguläre
    AfA und Sonder-AfA mindern ihn beide. Linear läuft die AfA im
    Begünstigungszeitraum vom Ausgangswert; danach wird der Restwert über die
    Restnutzungsdauer verteilt (§ 7a Abs. 9 EStG). Degressiv rechnet der Satz
    auf den Restbuchwert, also auch nach der Sonder-AfA, und wechselt zur
    linearen AfA aus dem Restwert, sobald die höher ist (§ 7 Abs. 5a Satz 4).
  */
  let buchwert = depreciationBasis;
  let linearJahresbetrag: number | null = null;
  let kumulierterCashflow = 0;
  let kumulierterEigenanteil = 0;
  let moebelRestbuchwert = moebelAfaBasis;
  let erstattungBegrenzt = false;
  const years: Jahreswert[] = [];
  // Mindert der Tilgungszuschuss ab seinem Jahr die AfA-Basis (siehe unten), rechnet die AfA mit dieser.
  let afaBasis = depreciationBasis;
  // Wachstum darf negativ sein (Miet- oder Wertrückgang), seit dem 22.10.2026; nur unter −99 Prozent ist Schluss.
  const wachstum = (prozent: number) => Math.max(-0.99, endlicheZahl(prozent) / 100);
  const mietWachstum = wachstum(t.annualRentGrowth);
  const kostenWachstum = wachstum(t.annualCostGrowth);
  const wertWachstum = wachstum(t.annualValueGrowth);

  for (let i = 0; i < laufzeit; i += 1) {
    // Zeitanteil des Jahres: im ersten Jahr ab dem Übergang, danach ganz.
    const zeitanteil = i === 0 ? ersterJahresanteil : 1;
    // Jahre seit dem Übergang zu Beginn dieses Jahres.
    const vergangen = i === 0 ? 0 : ersterJahresanteil + i - 1;
    const grossRent = monthlyColdRent * 12 * (1 + mietWachstum) ** i * zeitanteil;
    const effectiveRent = grossRent * (1 - Math.min(1, prozentAnteil(t.vacancyRate)));
    const kostenfaktor = (1 + kostenWachstum) ** i * zeitanteil;
    const operatingCosts = monthlyOperatingCosts * 12 * kostenfaktor;
    const reserveContribution = monthlyReserveContribution * 12 * kostenfaktor;
    const senior = bankplanJahre[i];
    const zweitesJahr = zweitesplan[i];
    const junior = nachrangplan[i];
    const kfwJahr = kfw.jahre[i];
    const interest = senior.interest + junior.interest + kfwJahr.interest + zweitesJahr.interest;
    const principal = senior.principal + junior.principal + kfwJahr.principal + zweitesJahr.principal;
    const debtService = senior.payment + junior.payment + kfwJahr.payment + zweitesJahr.payment;
    /*
      Steuer: Die KfW-Zinsen sind Werbungskosten wie die Bankzinsen, sie
      stecken in `interest`. Der Tilgungszuschuss ist ein öffentlicher
      Zuschuss zu den Anschaffungskosten und mindert ab dem Jahr der
      Gutschrift die AfA-Basis des Gebäudes (R 21.5 Abs. 1 und R 7.3 Abs. 4
      EStR). Er ist keine Einnahme und keine Tilgung, die der Kunde zahlt.
    */
    const restnutzungsdauer = Math.max(1, nutzungsdauer - vergangen);
    if (i === kfw.zuschussJahr && kfwJahr.tilgungszuschuss > 0) {
      const minderung = Math.min(afaBasis, kfwJahr.tilgungszuschuss);
      afaBasis -= minderung;
      buchwert = Math.max(0, buchwert - minderung);
      if (linearJahresbetrag !== null) linearJahresbetrag = buchwert / restnutzungsdauer;
    }
    const cashflowBeforeTax = effectiveRent - operatingCosts - reserveContribution - debtService;
    const imBeguenstigungszeitraum = sonderZulaessig && i < sonderJahre;
    // § 7a Abs. 9 EStG: Nach der Sonder-AfA verteilt die lineare AfA den Restwert über die Restnutzungsdauer.
    // Der Begünstigungszeitraum ist gesetzlich vier Jahre, auch wenn weniger Jahre Sonder-AfA eingetragen sind (22.10.2026).
    if (linearJahresbetrag === null && !degressiv && sonderZulaessig && i === SONDER_7B_JAHRE && nutzungsdauer > 0) {
      linearJahresbetrag = buchwert / restnutzungsdauer;
    }
    let afaRoh: number;
    if (linearJahresbetrag !== null) afaRoh = linearJahresbetrag * zeitanteil;
    else if (degressiv) {
      const degressivBetrag = buchwert * afaSatz * zeitanteil;
      const linearBetrag = nutzungsdauer > 0 ? (buchwert / restnutzungsdauer) * zeitanteil : 0;
      if (linearBetrag > degressivBetrag) {
        linearJahresbetrag = buchwert / restnutzungsdauer;
        afaRoh = linearBetrag;
      } else afaRoh = degressivBetrag;
    } else afaRoh = afaBasis * afaSatz * zeitanteil;
    const buildingDepreciation = Math.min(buchwert, Math.max(0, afaRoh));
    buchwert = Math.max(0, buchwert - buildingDepreciation);
    const specialDepreciation = imBeguenstigungszeitraum
      ? Math.min(buchwert, sonderBemessung * prozentAnteil(sonderSatz))
      : 0;
    buchwert = Math.max(0, buchwert - specialDepreciation);
    const furnitureDepreciation = Math.min(moebelRestbuchwert, moebelAfaJahr * zeitanteil);
    moebelRestbuchwert = Math.max(0, moebelRestbuchwert - furnitureDepreciation);
    const rehabDeduction =
      !sanierungAktiviert && i < Math.max(1, t.rehabDistributionYears)
        ? rehabExpense / Math.max(1, t.rehabDistributionYears)
        : 0;
    const taxableResult =
      effectiveRent - operatingCosts - interest - buildingDepreciation - specialDepreciation - furnitureDepreciation - rehabDeduction -
      (RUECKLAGENZUFUEHRUNG_ABZIEHBAR ? reserveContribution : 0);
    /*
      Der Anteil steckt seit dem 21.09.2026 schon in den Eingaben oben. Eine
      zweite Multiplikation hier wuerde ihn quadrieren: Bei 50 Prozent kaeme ein
      Viertel heraus. Der Name bleibt, weil die Tabellen ihn lesen.
    */
    const allocatedTaxableResult = taxableResult;
    // Das Einkommen bleibt über die ganze Laufzeit gleich, seit dem 23.10.2026 ohne Entwicklung.
    const taxableIncomeBefore = combinedTaxableIncome;
    const taxableIncomeAfter = Math.max(0, taxableIncomeBefore + allocatedTaxableResult);
    const taxBefore = steuerprofil(
      taxableIncomeBefore,
      t.jointAssessment,
      t.churchTaxRate,
      t.includeSolidaritySurcharge,
    );
    const taxAfterTarif = steuerprofil(
      taxableIncomeAfter,
      t.jointAssessment,
      t.churchTaxRate,
      t.includeSolidaritySurcharge,
    );
    /*
      Fester Satz: Steuer nachher = Steuer vorher + Ergebnis × Satz, seit dem
      22.10.2026 wieder mit Untergrenze 0. Vom 25.09. bis 22.10.2026 durfte sie
      negativ werden; dann erstattete das Finanzamt rechnerisch Steuer, die
      nie gezahlt wurde. Ohne Steuerlast gibt es keine Erstattung, und die
      Oberfläche sagt es (`erstattungBegrenzt`). Die Bestandteile werden im
      Verhältnis zur Steuer vorher mitgeführt, damit Einkommensteuer, Soli und
      Kirchensteuer zusammen wieder die Gesamtsteuer ergeben.
    */
    const steuerManuellRoh = taxBefore.totalTax + allocatedTaxableResult * prozentAnteil(t.marginalTaxRate);
    const steuerManuell = Math.max(0, steuerManuellRoh);
    if (t.taxCalculationMode !== "tariff" && steuerManuellRoh < -0.005) erstattungBegrenzt = true;
    const verhaeltnis = taxBefore.totalTax > 0 ? steuerManuell / taxBefore.totalTax : 0;
    const taxAfter: Steuerprofil =
      t.taxCalculationMode === "tariff"
        ? taxAfterTarif
        : {
            taxableIncome: taxableIncomeAfter,
            incomeTax: taxBefore.totalTax > 0 ? taxBefore.incomeTax * verhaeltnis : steuerManuell,
            solidarity: taxBefore.totalTax > 0 ? taxBefore.solidarity * verhaeltnis : 0,
            churchTax: taxBefore.totalTax > 0 ? taxBefore.churchTax * verhaeltnis : 0,
            totalTax: steuerManuell,
            effectiveRate: taxableIncomeAfter > 0 ? steuerManuell / taxableIncomeAfter : 0,
          };
    const taxEffect = taxBefore.totalTax - taxAfter.totalTax;
    const cashflowAfterTax = cashflowBeforeTax + taxEffect;
    kumulierterCashflow += cashflowAfterTax;
    kumulierterEigenanteil += Math.max(0, -cashflowAfterTax);
    const remainingDebt = senior.closingBalance + junior.closingBalance + kfwJahr.closingBalance + zweitesJahr.closingBalance;
    /*
      Der Wert am Jahresende, seit dem 25.09.2026 aus drei Teilen.

      Die Wertsteigerung gilt nur für den Immobilienanteil, also Grund und
      Boden und Gebäude. Die Möbel zählen mit ihrem Restbuchwert: Sie verlieren
      an Wert, statt zu steigen, und vorher standen sie nach zehn Jahren noch
      mit dem vollen Kaufbetrag im Vermögen. Die Rücklage zählt als Guthaben
      mit ihrem Betrag.

      `wertzuwachs` ist die reine Steigerung des Immobilienanteils. Diagramme
      und Berechnung lesen sie direkt, statt „Wert minus Kaufpreis“ zu
      rechnen; das ging mit einem Anteil unter 100 Prozent schief, weil der
      Wert anteilig war, der Kaufpreis aber nicht.
    */
    // Seit dem 22.10.2026 ab dem Übergang gezählt, im ersten Jahr also zeitanteilig, und auch negativ.
    const wertzuwachs = immobilienanteil * ((1 + wertWachstum) ** (vergangen + zeitanteil) - 1);
    const propertyValue = immobilienanteil + wertzuwachs + moebelRestbuchwert + ruecklage;
    const propertyEquity = propertyValue - remainingDebt;
    const totalWealth = propertyEquity + kumulierterCashflow;
    years.push({
      index: i,
      year: Math.round(t.startYear) + i,
      grossRent,
      effectiveRent,
      interest,
      principal,
      debtService,
      darlehen: {
        bank: senior,
        bank2: zweitesJahr,
        nachrang: junior,
        kfw: kfwJahr,
      },
      operatingCosts,
      reserveContribution,
      cashflowBeforeTax,
      buildingDepreciation,
      specialDepreciation,
      furnitureDepreciation,
      rehabDeduction,
      taxableResult,
      allocatedTaxableResult,
      taxableIncomeBefore,
      taxableIncomeAfter,
      taxBefore,
      taxAfter,
      taxEffect,
      cashflowAfterTax,
      cumulativeCashflowAfterTax: kumulierterCashflow,
      /*
        Was der Kunde bis einschliesslich dieses Jahres selbst eingezahlt hat,
        OHNE Gegenrechnung. Ueberschussjahre mindern die Summe nicht.

        Die Zeile daneben, `cumulativeCashflowAfterTax`, saldiert. Beide sind
        richtig, aber fuer verschiedene Fragen: "Wie viel Geld muss ich
        aufbringen" gegen "Was bleibt unter dem Strich". Bis zum 21.09.2026
        stand die saldierte Zahl unter der Ueberschrift "Selbst gezahlt", und
        das war die falsche Antwort auf die erste Frage.
      */
      cumulativeEigenanteil: kumulierterEigenanteil,
      propertyValue,
      wertzuwachs,
      moebelRestbuchwert,
      remainingDebt,
      propertyEquity,
      totalWealth,
    });
  }

  /*
    Was der Kunde zu Beginn aus eigener Tasche zahlt: das Eigenkapital. Bei
    einer Überfinanzierung fließt ihm der Überschuss zu, die erste Zahlung
    ist dann positiv. Finanzierungsnebenkosten gibt es seit dem 23.10.2026
    nicht mehr.
  */
  const eigenkapital = eigenkapitalBetrag;
  const startzahlung = -eigenkapitalBetrag + ueberfinanzierung;
  /*
    Zahlungsreihe mit Modellverkauf zum prognostizierten Wert im letzten Jahr,
    seit dem 23.10.2026 ohne Verkaufskosten. Eine Steuer auf den
    Veräußerungsgewinn (Verkauf innerhalb von zehn Jahren, § 23 EStG) rechnet
    das Modell nicht; die Oberfläche nennt diese Grenze.
  */
  const reiheMitWertzuwachs = [
    startzahlung,
    ...years.map((jahr, index) => (index === years.length - 1 ? jahr.cashflowAfterTax + jahr.propertyEquity : jahr.cashflowAfterTax)),
  ];
  // Zahlungsreihe mit Verkauf ohne Wertsteigerung: derselbe Wert, nur ohne den Zuwachs.
  const reiheOhneWertzuwachs = [
    startzahlung,
    ...years.map((jahr, index) =>
      index === years.length - 1 ? jahr.cashflowAfterTax + jahr.propertyValue - jahr.wertzuwachs - jahr.remainingDebt : jahr.cashflowAfterTax,
    ),
  ];
  /*
    Wann sich eine Eigenkapitalrendite ueberhaupt rechnen laesst.
    
    Bis zum 21.09.2026 stand hier `eigenkapital > 0`. Das Feld ist aber
    standardmaessig leer, und bei einer Finanzierung ueber den Kaufpreis hinaus
    bleibt es auch leer. Die Kachel zeigte dann einen Strich, ohne zu sagen
    warum.
    
    Ein interner Zinsfuss braucht kein Eigenkapital, er braucht eine
    Zahlungsreihe mit mindestens einer Aus- und einer Einzahlung. Zahlt der
    Kunde monatlich zu, ist genau das sein Einsatz, und die Rendite darauf ist
    eine sinnvolle Zahl.
    
    Ein erster Anlauf setzte stattdessen die Kaufnebenkosten als Einsatz an.
    Das war falsch: Ist kein Eigenkapital eingetragen, finanziert der Rechner
    auch die Nebenkosten mit, der Kunde zahlt sie also gar nicht aus eigener
    Tasche. Der Test hat es aufgedeckt.
  */
  const rechenbar = (reihe: number[]) =>
    reihe.some((z) => z < 0) && reihe.some((z) => z > 0);
  /*
    Zahlungszeitpunkte in Jahren seit dem Übergang, seit dem 22.10.2026: Der
    Einsatz bei 0, das Ergebnis jedes Jahres an seinem Ende, das erste also
    nach dem Zeitanteil. Vorher galten alle Jahre als gleich lang, und ein Kauf
    im Dezember wies eine viel zu niedrige Jahresrendite aus.
  */
  const zeitpunkte = [0, ...years.map((_, index) => ersterJahresanteil + index)];
  const irr = rechenbar(reiheMitWertzuwachs) ? internerZinsfuss(reiheMitWertzuwachs, zeitpunkte) : null;
  const irrWithoutAppreciation = rechenbar(reiheOhneWertzuwachs)
    ? internerZinsfuss(reiheOhneWertzuwachs, zeitpunkte)
    : null;

  /*
    Die drei Zahlen, die auf der ersten Seite gross stehen.
    
    Sie rechnen nichts Neues, sie fassen zusammen, was oben schon steht, und zwar
    in der Reihenfolge, in der Christian das Gespraech fuehrt: Was zahle ich
    selbst, was wird daraus, was ist das in Prozent.
  */
  // Monate ab dem Übergang: Das erste Jahr hat seit dem 22.10.2026 nur seine Monate.
  const monate = years.length > 0 ? years.length * 12 - (startMonat - 1) : 0;
  const ersterMonat = years.length > 0 ? -years[0].cashflowAfterTax / (12 * ersterJahresanteil) : 0;
  const letztesJahr = years.length > 0 ? years[years.length - 1] : null;

  /*
    Vermoegensaufbau je Monat.
    
    Zaehler ist der Zuwachs an Eigenkapital in der Immobilie, also
    Immobilienwert minus Restschuld am Ende, abzueglich des Standes zu Beginn.
    Bei einer Vollfinanzierung ist der Anfangsstand null, bei eingesetztem
    Eigenkapital nicht; ohne diesen Abzug zaehlten wir das mitgebrachte Geld als
    "aufgebaut".
    
    Die Zahl enthaelt den unterstellten Wertzuwachs. `tilgungMonat` daneben ist
    der harte Teil, der sich zwingend aus dem Tilgungsplan ergibt. Die Oberflaeche
    zeigt beide, sonst steht eine Annahme da, als waere sie eine Tatsache.
  */
  // Der Wert zu Beginn, gemessen wie am Ende: Möbel mit ihrem Buchwert.
  const startEigenkapital = Math.max(0, immobilienanteil + moebelAfaBasis + ruecklage - totalDebt);
  const vermoegenGesamt = letztesJahr ? letztesJahr.propertyEquity - startEigenkapital : 0;
  const vermoegensaufbauMonat = monate > 0 ? vermoegenGesamt / monate : 0;
  // Seit dem 07.10.2026 aus der gezahlten Tilgung summiert: Der KfW-Zuschuss senkt die Restschuld, ist aber keine Tilgung.
  const getilgtGesamt = years.reduce((summe, jahr) => summe + jahr.principal, 0);
  const tilgungszuschussPrognose = years.reduce((summe, jahr) => summe + jahr.darlehen.kfw.tilgungszuschuss, 0);
  const tilgungMonat = monate > 0 ? getilgtGesamt / monate : 0;

  /*
    Was aus jedem eingezahlten Euro wird. Bezug ist alles, was der Kunde
    einsetzt: das Eigenkapital plus die Summe der monatlichen Zuzahlungen ueber
    die ganze Laufzeit. Nur die Jahre zaehlen, in denen er wirklich zuzahlt.
  */
  const summeZuzahlungen = years.reduce(
    (summe, jahr) => summe + Math.max(0, -jahr.cashflowAfterTax),
    0,
  );
  const eingesetztGesamt = eigenkapital + summeZuzahlungen;
  const faktorJeEuro = eingesetztGesamt > 0 ? vermoegenGesamt / eingesetztGesamt : 0;

  return {
    purchaseCostRate,
    purchaseCosts: allInclusive ? 0 : purchaseCosts,
    allInclusive,
    allInclusiveAufschlag,
    totalInvestment,
    seniorLoanAmount,
    juniorLoanAmount: juniorLoan,
    eigenkapital: eigenkapitalBetrag,
    ueberfinanzierung,
    zinsbindungen,
    kfwLoanAmount,
    secondLoanAmount,
    bankRestschuldZinsbindung,
    finanzierungsbedarf,
    kfwTilgungszuschussNominal,
    kfwTilgungszuschuss: kfw.zuschussAngerechnet,
    kfwZuschussOhneJahr: kfwTilgungszuschussNominal > 0 && !(t.kfwGrantYear >= 1),
    kfwRestschuldZinsbindung: kfw.restschuldZinsbindung,
    kfwAnlaufJahre,
    kfwAnnuitaetMonat: kfw.annuitaet,
    mischzins,
    rateSprung,
    anteil,
    ersterJahresanteil,
    garagenpreis,
    kaufpreisWohnung,
    grossYieldWohnung,
    netYieldWohnung,
    kaufpreisfaktor,
    kaufpreisfaktorWohnung,
    sonderAfa,
    sanierungsfall,
    erhaltungsaufwandNetto,
    fuenfzehnProzentGrenze,
    anschaffungsnah,
    sanierungAktiviert,
    erstattungBegrenzt,
    totalDebt,
    monthlyDebtService,
    grossYield,
    netYield,
    effectiveAnnualRent,
    depreciationBasis,
    immediateDeductionRatio,
    simpleThresholdExceeded,
    combinedTaxableIncome,
    taxProfile,
    marginalIncomeTaxRate,
    marginalTotalTaxRate,
    cumulativeTaxEffect: years.reduce((summe, jahr) => summe + jahr.taxEffect, 0),
    irr,
    irrWithoutAppreciation,
    eigenkapitalBasis: eigenkapital + summeZuzahlungen,
    eigenanteilMonat: ersterMonat,
    vermoegensaufbauMonat,
    vermoegenStart: startEigenkapital,
    tilgungMonat,
    getilgtGesamt,
    tilgungszuschussPrognose,
    faktorJeEuro,
    kaufpreisGesamt: kaufpreisAusgewiesen,
    moebelAnteil: furniturePrice,
    erhaltungsaufwand: rehabExpense,
    ruecklage,
    immobilienanteil,
    grundstuecksanteil,
    gebaeudeanteilKaufpreis,
    nebenkostenBasis: basisNebenkosten,
    grunderwerbsteuer,
    notarkosten,
    grundbuchkosten,
    nebenkostenGrundstueck,
    nebenkostenGebaeude,
    moebelAfaBasis,
    years,
  };
}

/**
 * Eigenkapitalrendite, freigegeben von Christian am 30.09.2026, genau nach
 * seiner Formel:
 *
 *   (Vermögensaufbau im Zeitraum ÷ Jahre) ÷ (Eigenkapital + Zuzahlung vor Steuer je Monat × 12)
 *
 * Keine zweite Wahrheit: Der Vermögensaufbau ist die Kachel „Vermögensaufbau“
 * mal Monate, das Eigenkapital das Eingabefeld, die Zuzahlung der angezeigte
 * „Cashflow vor Steuer pro Monat“ im ersten Jahr. Christian hat am selben Tag
 * den Cashflow vor Steuer statt nach Steuer gewählt: Nach Steuer ist das erste
 * Jahr wegen des Erhaltungsaufwands fast immer ein Überschuss, die Zuzahlung
 * fiele damit ganz aus dem Nenner. Ein Überschuss vor Steuer zählt als 0.
 *
 * `rendite` ist `null`, wenn der Nenner null ist, also weder Eigenkapital
 * noch eine monatliche Zuzahlung vor Steuer. Ein negativer Vermögensaufbau ergibt
 * bewusst eine negative Zahl, sie sagt mehr als ein Satz ohne Zahl.
 */
export interface Eigenkapitalrendite {
  vermoegensaufbau: number;
  jahre: number;
  eigenkapital: number;
  zuzahlungMonat: number;
  nenner: number;
  rendite: number | null;
}

export function eigenkapitalrendite(
  result: Pick<InvestmentErgebnis, "years" | "vermoegensaufbauMonat" | "eigenkapital"> & Partial<Pick<InvestmentErgebnis, "ersterJahresanteil">>,
): Eigenkapitalrendite {
  const jahre = result.years.length;
  // Seit dem 22.10.2026 mit zeitanteiligem erstem Jahr: gezählt wird ab dem Übergang.
  const ersterAnteil = result.ersterJahresanteil ?? 1;
  const jahreAbUebergang = jahre > 0 ? jahre - 1 + ersterAnteil : 0;
  const vermoegensaufbau = result.vermoegensaufbauMonat * jahreAbUebergang * 12;
  const eigenkapital = Math.max(0, result.eigenkapital);
  const zuzahlungMonat = Math.max(0, -(result.years[0]?.cashflowBeforeTax ?? 0) / (12 * ersterAnteil));
  const nenner = eigenkapital + zuzahlungMonat * 12;
  // Unter einem Cent ist der Nenner rechnerisch null, die Division gäbe nur Rauschen.
  const rendite = jahre > 0 && nenner >= 0.01 ? vermoegensaufbau / jahreAbUebergang / nenner : null;
  // `jahre` ist die Zeit ab dem Übergang, damit der Rechenweg „÷ Jahre“ genau diese Zahl nennt.
  return { vermoegensaufbau, jahre: jahreAbUebergang, eigenkapital, zuzahlungMonat, nenner, rendite };
}

/**
 * Der Gegenfall zu den Kaufnebenkosten, für den Satz unter der Kachel.
 *
 * Deckt das Eigenkapital die Kaufnebenkosten, rechnet der Kern noch einmal mit
 * Eigenkapital minus Kaufnebenkosten (sie wären mitfinanziert). Sonst mit
 * Eigenkapital gleich Kaufnebenkosten (sie wären selbst gezahlt). Seit dem
 * 23.10.2026 ist das Eigenkapital der Rest der Finanzierung; geändert wird
 * deshalb nur das Bankdarlehen, um genau diesen Betrag. `null` ohne
 * Kaufnebenkosten.
 */
export interface EigenkapitalrenditeNebenkosten {
  /** Das Eigenkapital deckt die Kaufnebenkosten heute. */
  selbstGezahlt: boolean;
  kaufnebenkosten: number;
  vergleich: Eigenkapitalrendite;
  /** Rate im Gegenfall minus Rate heute, je Monat. */
  rateDifferenzMonat: number;
}

export function eigenkapitalrenditeNebenkosten(
  input: InvestmentEingabe,
  result: InvestmentErgebnis,
): EigenkapitalrenditeNebenkosten | null {
  const kaufnebenkosten = result.purchaseCosts;
  if (!(kaufnebenkosten > 0)) return null;
  const eigenkapital = Math.max(0, result.eigenkapital);
  // Ein halber Cent Spielraum: 13.250 € Eigenkapital gegen 13.249,999… € Nebenkosten aus der Prozentrechnung.
  const selbstGezahlt = eigenkapital >= kaufnebenkosten - 0.005;
  /*
    Das Bankdarlehen des Gegenfalls aus dem Ziel-Eigenkapital: Gesamtkosten
    minus Ziel-Eigenkapital minus übrige Darlehen. Nicht vom heutigen, auf 0
    begrenzten Eigenkapital aus gerechnet, sonst bliebe es bei einer
    Überfinanzierung auch im Gegenfall 0 (Codex-Prüfung vom 23.10.2026).
  */
  const zielEigenkapital = selbstGezahlt ? Math.max(0, eigenkapital - kaufnebenkosten) : kaufnebenkosten;
  const uebrigeDarlehen = result.totalDebt - result.seniorLoanAmount;
  const bankNeu = result.totalInvestment - zielEigenkapital - uebrigeDarlehen;
  const vergleichEingabe: InvestmentEingabe = {
    ...input,
    seniorLoanMode: "euro",
    seniorLoanValue: result.anteil > 0 ? Math.max(0, bankNeu) / result.anteil : 0,
  };
  const vergleichErgebnis = berechneInvestment(vergleichEingabe);
  return {
    selbstGezahlt,
    kaufnebenkosten,
    vergleich: eigenkapitalrendite(vergleichErgebnis),
    rateDifferenzMonat: vergleichErgebnis.monthlyDebtService - result.monthlyDebtService,
  };
}

/**
 * Der Kaufpreis des ganzen Objekts, so wie er im Dokument steht: die Eingabe,
 * beim All-inclusive-Modell samt Aufschlag (seit dem 09.10.2026). Das Ergebnis
 * rechnet mit dem Miteigentumsanteil, der Aufschlag wird deshalb auf das ganze
 * Objekt zurückgerechnet. Für die Stellen, die bisher `purchasePrice` zeigten.
 */
export function ausgewiesenerKaufpreis(
  input: Pick<InvestmentEingabe, "purchasePrice">,
  result: Pick<InvestmentErgebnis, "allInclusiveAufschlag" | "anteil">,
): number {
  const aufschlag = result.anteil > 0 ? (result.allInclusiveAufschlag ?? 0) / result.anteil : 0;
  return input.purchasePrice + aufschlag;
}

export interface Hausgeldaufstellung {
  /** Etwas eingetragen? Sonst zeigt die Oberfläche nichts. */
  vorhanden: boolean;
  gesamt: number;
  umlagefaehig: number;
  nichtUmlagefaehig: number;
  ruecklage: number;
  /** Umlagefähig + nicht umlagefähig, ohne Rücklage (Regel seit dem 28.10.2026). */
  summeTeile: number;
  /** Vorauszahlung an die WEG: Hausgeld + Rücklage. */
  vorauszahlung: number;
  /** Gesamt minus Summe der Teile; `null`, wenn kein Gesamtbetrag eingetragen ist. */
  abweichung: number | null;
}

/**
 * Das Hausgeld in ganzer Höhe, seit dem 28.10.2026 (Christian): Hausgeld =
 * umlagefähig + nicht umlagefähig; die Erhaltungsrücklage steht getrennt,
 * Vorauszahlung = Hausgeld + Rücklage. Umlagefähig zahlt der
 * Mieter und belastet den Cashflow nicht; nicht umlagefähig belastet ihn und
 * ist steuerlich abziehbar; die Rücklage belastet ihn, steuerlich zählt sie
 * erst bei Verwendung. Die Rechnung nimmt den nicht umlagefähigen Teil und
 * die Rücklage aus genau diesen Feldern; hier wird aufgeführt und geprüft,
 * ob die Summe stimmt. Ganzes Objekt, ohne Anteil.
 */
export function hausgeldAufstellung(
  t: Pick<InvestmentEingabe, "housingFeeTotal" | "housingFeeRecoverable" | "housingFeeNonRecoverable" | "monthlyReserveContribution">,
): Hausgeldaufstellung {
  const zahl = (wert: number | undefined) => Math.max(0, endlicheZahl(wert ?? 0));
  const gesamt = zahl(t.housingFeeTotal);
  const umlagefaehig = zahl(t.housingFeeRecoverable);
  const nichtUmlagefaehig = zahl(t.housingFeeNonRecoverable);
  const ruecklage = zahl(t.monthlyReserveContribution);
  const summeTeile = umlagefaehig + nichtUmlagefaehig;
  // Gespeicherte Rechnungen vor dem 28.10.2026 trugen die Rücklage im Gesamtbetrag; das ist keine Abweichung.
  const alteSumme = ruecklage > 0 && Math.abs(gesamt - summeTeile - ruecklage) < 0.5;
  const hausgeld = alteSumme ? summeTeile : gesamt;
  return {
    vorhanden: gesamt > 0 || umlagefaehig > 0 || nichtUmlagefaehig > 0,
    gesamt: hausgeld,
    umlagefaehig,
    nichtUmlagefaehig,
    ruecklage,
    summeTeile,
    vorauszahlung: (hausgeld > 0 ? hausgeld : summeTeile) + ruecklage,
    abweichung: hausgeld > 0 ? hausgeld - summeTeile : null,
  };
}

/**
 * Monate des ersten Jahres, seit dem 22.10.2026 ab dem Übergang von Nutzen
 * und Lasten. Monatswerte des ersten Jahres teilen durch diese Zahl statt
 * durch 12, sonst stünde bei einem Kauf im Juli die halbe Miete je Monat da.
 */
export function monateErstesJahr(result: object): number {
  // Bewusst `object`: Aufrufer reichen oft nur einen Ausschnitt des Ergebnisses weiter, ältere Stände ohne das Feld zählen ganz.
  return 12 * ((result as Partial<InvestmentErgebnis>).ersterJahresanteil ?? 1);
}

/**
 * Gibt es einen Stellplatz mit eigenem Preis oder eigener Miete? Dann stehen
 * Rendite und Kaufpreisfaktor überall zweimal da: für die Wohnung allein und
 * für Wohnung und Stellplatz zusammen (seit dem 22.10.2026). Sonst einmal,
 * ohne Zusatz.
 */
export function mitStellplatz(
  result: Partial<Pick<InvestmentErgebnis, "garagenpreis" | "grossYield" | "grossYieldWohnung">>,
): boolean {
  return (result.garagenpreis ?? 0) > 0 || Math.abs((result.grossYieldWohnung ?? result.grossYield ?? 0) - (result.grossYield ?? 0)) > 1e-12;
}

/** Vorgabe der Instandhaltungsrücklage im Hausgeld: Euro je m² Wohnfläche und Monat (Christian, 23.10.2026). */
export const RUECKLAGE_JE_QM_MONAT = 1;

/**
 * Die Rücklage im Hausgeld folgt der Wohnfläche, solange niemand einen Wert
 * gesetzt hat: Fläche mal `RUECKLAGE_JE_QM_MONAT`. `gesetzt` heißt, der Wert
 * kam von Hand, aus den Unterlagen oder aus der Objektanlage (es gibt dafür
 * eine Herkunft); dann bleibt er stehen, und die Vorgabe ist für dieses
 * Objekt aus, bis zum Zurücksetzen.
 */
export function mitRuecklagenVorgabe(eingabe: InvestmentEingabe, gesetzt: boolean): InvestmentEingabe {
  if (eingabe.monthlyReserveContributionAuto === false) return eingabe;
  if (gesetzt) return { ...eingabe, monthlyReserveContributionAuto: false };
  const vorgabe = Math.round(Math.max(0, endlicheZahl(eingabe.area)) * RUECKLAGE_JE_QM_MONAT * 100) / 100;
  return eingabe.monthlyReserveContribution === vorgabe && eingabe.monthlyReserveContributionAuto === true
    ? eingabe
    : { ...eingabe, monthlyReserveContribution: vorgabe, monthlyReserveContributionAuto: true };
}

/**
 * Das Bankdarlehen so setzen, dass ein bestimmtes Eigenkapital übrig bleibt,
 * seit dem 23.10.2026: Bankdarlehen = Gesamtbedarf − Eigenkapital − übrige
 * Darlehen, mindestens 0, in Euro für das ganze Objekt. So rechnen alte
 * Stände mit eingetragenem Eigenkapital weiter (`mitNeuerFinanzierung`).
 * Das Eigenkapital gilt wie früher als Betrag dieses Kunden.
 */
export function mitEigenkapital(eingabe: InvestmentEingabe, eigenkapital: number): InvestmentEingabe {
  const ohneBank: InvestmentEingabe = { ...eingabe, seniorLoanMode: "euro", seniorLoanValue: 0 };
  const r = berechneInvestment(ohneBank);
  if (!(r.anteil > 0)) return ohneBank;
  const bank = Math.max(0, r.totalInvestment - Math.max(0, endlicheZahl(eigenkapital)) - r.totalDebt);
  return { ...ohneBank, seniorLoanValue: bank / r.anteil };
}
