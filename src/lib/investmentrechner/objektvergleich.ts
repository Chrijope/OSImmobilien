import type { InvestmentEingabe, InvestmentErgebnis } from "./rechenkern";
import { formatEuro, formatEuroCent, formatProzent } from "./formatierer";
import { SPRACH_LOCALE, type FormatSprache } from "../sprachFormat";

/*
 * Vergleich zweier Investmentobjekte.
 *
 * Reine Funktionen ohne Seiteneffekte. Der Rechenkern bleibt unangetastet, er
 * wird für jedes Objekt einfach ein zweites Mal aufgerufen. Hier werden nur die
 * fertigen Ergebnisse gegenübergestellt.
 */

/**
 * Felder, die für beide Objekte immer gleich sind.
 *
 * Bereich 01 „Kunde & Einkommen" beschreibt die Person, nicht das Objekt. Ein
 * Vergleich mit zwei verschiedenen Steuerbasen wäre fachlich wertlos. Ebenso
 * gehören Startjahr und Prognosedauer dazu, sonst würden verschieden lange
 * Zeiträume verglichen. Alles andere gehört zum jeweiligen Objekt.
 *
 * Diese Liste ist die einzige Stelle, an der die Regel steht. Wer ein Feld
 * ergänzt, ergänzt es hier.
 */
export const GEMEINSAME_FELDER: readonly (keyof InvestmentEingabe)[] = [
  "clientName",
  "annualGrossIncome",
  "taxClass",
  "jointAssessment",
  "taxableIncomeCustomer",
  "taxableIncomeSpouse",
  "annualTaxableIncomeGrowth",
  "churchTaxRate",
  "includeSolidaritySurcharge",
  "investmentShare",
  "taxCalculationMode",
  "marginalTaxRate",
  "startYear",
  "forecastYears",
];

/** Kennzeichnung eines Objekts im Vergleich: Objekt A, Objekt B. */
export function objektMarke(index: number, sprache: FormatSprache = "de"): string {
  return `${sprache === "en" ? "Property" : "Objekt"} ${String.fromCharCode(65 + index)}`;
}

/** Ein Objekt im Vergleich: die Eingabe und das daraus gerechnete Ergebnis. */
export interface Vergleichsobjekt {
  eingabe: InvestmentEingabe;
  ergebnis: InvestmentErgebnis;
}

/** In welche Richtung eine Kennzahl gelesen wird. */
export type Vergleichsrichtung = "wenigerIstBesser" | "mehrIstBesser" | "ohneWertung";

/** Welches Objekt bei einer Kennzahl günstiger liegt. */
export type Vergleichssieger = "a" | "b" | "gleich";

/** Wie ein Wert in der Oberfläche formatiert wird. */
export type Vergleichseinheit = "euro" | "euroCent" | "prozent";

export interface Vergleichszeile {
  /** Überschrift der Zeilengruppe, etwa „Kauf und Finanzierung". */
  gruppe: string;
  bezeichnung: string;
  /** Kurze Erläuterung unter der Bezeichnung, optional. */
  hinweis?: string;
  einheit: Vergleichseinheit;
  richtung: Vergleichsrichtung;
  wertA: number | null;
  wertB: number | null;
  /** Wert B minus Wert A. null, sobald einer der beiden Werte fehlt. */
  unterschied: number | null;
  besser: Vergleichssieger;
}

/**
 * Kleinster Unterschied, der noch zählt. Er entspricht der Genauigkeit, mit der
 * die Zahl angezeigt wird: Was gleich aussieht, soll auch als Gleichstand
 * gelten, sonst bekäme eine Zeile ein „besser" ohne sichtbaren Grund.
 */
const TOLERANZ: Record<Vergleichseinheit, number> = {
  euro: 0.5,
  euroCent: 0.005,
  prozent: 0.00005,
};

function ermittleSieger(
  richtung: Vergleichsrichtung,
  wertA: number | null,
  wertB: number | null,
  einheit: Vergleichseinheit,
): Vergleichssieger {
  if (richtung === "ohneWertung") return "gleich";
  if (wertA === null || wertB === null) return "gleich";
  const unterschied = wertB - wertA;
  if (Math.abs(unterschied) <= TOLERANZ[einheit]) return "gleich";
  const bIstGroesser = unterschied > 0;
  return richtung === "mehrIstBesser" ? (bIstGroesser ? "b" : "a") : bIstGroesser ? "a" : "b";
}

/** Wert einer Vergleichszeile in der Schreibweise, die zur Kennzahl passt. */
export function formatVergleichswert(wert: number | null, einheit: Vergleichseinheit, sprache: FormatSprache = "de"): string {
  if (wert === null) return "-";
  if (einheit === "prozent") return formatProzent(wert, sprache);
  return einheit === "euroCent" ? formatEuroCent(wert, sprache) : formatEuro(wert, sprache);
}

/** Unterschied mit Vorzeichen, damit die Richtung sofort ablesbar ist. */
export function formatUnterschied(wert: number | null, einheit: Vergleichseinheit, sprache: FormatSprache = "de"): string {
  if (wert === null) return "-";
  if (Math.abs(wert) <= TOLERANZ[einheit]) return formatVergleichswert(0, einheit, sprache);
  return `${wert > 0 ? "+" : "-"}${formatVergleichswert(Math.abs(wert), einheit, sprache)}`;
}

/**
 * Die Bezeichnungen der Vergleichszeilen auf Englisch, für den Druck an
 * englischsprachige Kunden. Die Zeilen selbst behalten ihre deutsche
 * Bezeichnung als Schlüssel, die Rechneransicht bleibt Deutsch.
 */
export const VERGLEICH_BEZEICHNUNG_EN: Record<string, string> = {
  Gesamtkosten: "Total costs",
  "Eingesetztes Eigenkapital": "Equity invested",
  "Monatliche Rate": "Monthly instalment",
  Bruttorendite: "Gross rental yield",
  Nettorendite: "Net rental yield",
  "Cashflow nach Steuern p. M.": "Cash flow after tax per month",
  "Steuereffekt Jahr 1": "Tax effect year 1",
  Immobilienwert: "Property value",
  Restschuld: "Remaining debt",
  Gesamtvermögen: "Total wealth",
  "Interner Zinsfuß (IRR) p. a.": "Internal rate of return (IRR) p.a.",
};

/** Die Bezeichnung einer Vergleichszeile in der Sprache des Drucks. */
export function vergleichBezeichnung(bezeichnung: string, sprache: FormatSprache = "de"): string {
  return sprache === "en" ? VERGLEICH_BEZEICHNUNG_EN[bezeichnung] ?? bezeichnung : bezeichnung;
}

/** „ten years“, „one year“ für den englischen Druck. Bis zwanzig als Wort, danach als Zahl. */
const ZAHLWOERTER_EN = [
  "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
];

export function jahreEnglisch(jahre: number): string {
  if (jahre === 1) return "one year";
  return `${ZAHLWOERTER_EN[jahre] ?? String(jahre)} years`;
}

/** Deutsche Zahlwörter für die Prognosedauer, ein bis dreißig Jahre. */
const ZAHLWOERTER = [
  "",
  "ein",
  "zwei",
  "drei",
  "vier",
  "fünf",
  "sechs",
  "sieben",
  "acht",
  "neun",
  "zehn",
  "elf",
  "zwölf",
  "dreizehn",
  "vierzehn",
  "fünfzehn",
  "sechzehn",
  "siebzehn",
  "achtzehn",
  "neunzehn",
  "zwanzig",
  "einundzwanzig",
  "zweiundzwanzig",
  "dreiundzwanzig",
  "vierundzwanzig",
  "fünfundzwanzig",
  "sechsundzwanzig",
  "siebenundzwanzig",
  "achtundzwanzig",
  "neunundzwanzig",
  "dreißig",
];

/** „zehn Jahre", „ein Jahr". Für Wendungen wie „über zehn Jahre". */
export function jahreAkkusativ(jahre: number): string {
  if (jahre === 1) return "ein Jahr";
  return `${ZAHLWOERTER[jahre] ?? String(jahre)} Jahre`;
}

/** „zehn Jahren", „einem Jahr". Für Wendungen wie „nach zehn Jahren". */
export function jahreDativ(jahre: number): string {
  if (jahre === 1) return "einem Jahr";
  return `${ZAHLWOERTER[jahre] ?? String(jahre)} Jahren`;
}

/** Betrag auf volle Euro gerundet, mit deutschem Tausenderpunkt und dem Wort Euro. */
function euroWort(betrag: number): string {
  return `${Math.round(Math.abs(betrag)).toLocaleString("de-DE")} Euro`;
}

/**
 * Gegenüberstellung beider Objekte, Zeile für Zeile.
 *
 * Die Richtung ist je Kennzahl festgelegt: Bei Kosten, Rate und Restschuld ist
 * weniger besser, bei Rendite, Cashflow, Steuereffekt, Immobilienwert und
 * Vermögen ist mehr besser. Das eingesetzte Eigenkapital bleibt ohne Wertung,
 * es ist eine Entscheidung des Kunden und keine Eigenschaft des Objekts.
 */
export function vergleicheObjekte(a: Vergleichsobjekt, b: Vergleichsobjekt): Vergleichszeile[] {
  const letztesA = a.ergebnis.years[a.ergebnis.years.length - 1];
  const letztesB = b.ergebnis.years[b.ergebnis.years.length - 1];
  const erstesA = a.ergebnis.years[0];
  const erstesB = b.ergebnis.years[0];
  const laufzeit = Math.min(a.ergebnis.years.length, b.ergebnis.years.length);
  const endgruppe = `Nach ${jahreDativ(laufzeit)}`;

  const rohzeilen: Omit<Vergleichszeile, "unterschied" | "besser">[] = [
    {
      gruppe: "Kauf und Finanzierung",
      bezeichnung: "Gesamtkosten",
      hinweis: "inklusive Kaufnebenkosten",
      einheit: "euro",
      richtung: "wenigerIstBesser",
      wertA: a.ergebnis.totalInvestment,
      wertB: b.ergebnis.totalInvestment,
    },
    {
      gruppe: "Kauf und Finanzierung",
      bezeichnung: "Eingesetztes Eigenkapital",
      einheit: "euro",
      richtung: "ohneWertung",
      wertA: Math.max(0, a.eingabe.equity),
      wertB: Math.max(0, b.eingabe.equity),
    },
    {
      gruppe: "Kauf und Finanzierung",
      bezeichnung: "Monatliche Rate",
      einheit: "euroCent",
      richtung: "wenigerIstBesser",
      wertA: a.ergebnis.monthlyDebtService,
      wertB: b.ergebnis.monthlyDebtService,
    },
    {
      gruppe: "Laufender Ertrag",
      bezeichnung: "Bruttorendite",
      einheit: "prozent",
      richtung: "mehrIstBesser",
      wertA: a.ergebnis.grossYield,
      wertB: b.ergebnis.grossYield,
    },
    {
      gruppe: "Laufender Ertrag",
      bezeichnung: "Nettorendite",
      einheit: "prozent",
      richtung: "mehrIstBesser",
      wertA: a.ergebnis.netYield,
      wertB: b.ergebnis.netYield,
    },
    {
      gruppe: "Laufender Ertrag",
      bezeichnung: "Cashflow nach Steuern p. M.",
      einheit: "euroCent",
      richtung: "mehrIstBesser",
      wertA: erstesA ? erstesA.cashflowAfterTax / 12 : null,
      wertB: erstesB ? erstesB.cashflowAfterTax / 12 : null,
    },
    {
      gruppe: "Laufender Ertrag",
      bezeichnung: "Steuereffekt Jahr 1",
      einheit: "euro",
      richtung: "mehrIstBesser",
      wertA: erstesA ? erstesA.taxEffect : null,
      wertB: erstesB ? erstesB.taxEffect : null,
    },
    {
      gruppe: endgruppe,
      bezeichnung: "Immobilienwert",
      einheit: "euro",
      richtung: "mehrIstBesser",
      wertA: letztesA ? letztesA.propertyValue : null,
      wertB: letztesB ? letztesB.propertyValue : null,
    },
    {
      gruppe: endgruppe,
      bezeichnung: "Restschuld",
      einheit: "euro",
      richtung: "wenigerIstBesser",
      wertA: letztesA ? letztesA.remainingDebt : null,
      wertB: letztesB ? letztesB.remainingDebt : null,
    },
    {
      gruppe: endgruppe,
      bezeichnung: "Gesamtvermögen",
      einheit: "euro",
      richtung: "mehrIstBesser",
      wertA: letztesA ? letztesA.totalWealth : null,
      wertB: letztesB ? letztesB.totalWealth : null,
    },
    {
      gruppe: endgruppe,
      bezeichnung: "Interner Zinsfuß (IRR) p. a.",
      hinweis: "auf Eigenkapital und alle Zuzahlungen",
      einheit: "prozent",
      richtung: "mehrIstBesser",
      wertA: a.ergebnis.irr,
      wertB: b.ergebnis.irr,
    },
  ];

  return rohzeilen.map((zeile) => ({
    ...zeile,
    unterschied: zeile.wertA === null || zeile.wertB === null ? null : zeile.wertB - zeile.wertA,
    besser: ermittleSieger(zeile.richtung, zeile.wertA, zeile.wertB, zeile.einheit),
  }));
}

/**
 * Sachliche Einordnung in einem Satz, allein aus den Zahlen erzeugt.
 *
 * Betrachtet werden zwei Größen: die monatliche Belastung im ersten Jahr
 * (Cashflow nach Steuern) und das Gesamtvermögen am Ende der Prognose. Der Satz
 * benennt nur, wer wo wie viel besser liegt. Es wird bewusst keine Empfehlung
 * ausgesprochen, das wäre Anlageberatung.
 */
export function einordnung(a: Vergleichsobjekt, b: Vergleichsobjekt, sprache: FormatSprache = "de"): string {
  const erstesA = a.ergebnis.years[0];
  const erstesB = b.ergebnis.years[0];
  const letztesA = a.ergebnis.years[a.ergebnis.years.length - 1];
  const letztesB = b.ergebnis.years[b.ergebnis.years.length - 1];
  if (!erstesA || !erstesB || !letztesA || !letztesB) {
    return sprache === "en" ? "Forecast values are still missing for the assessment." : "Für die Einordnung fehlen noch Prognosewerte.";
  }
  if (sprache === "en") return einordnungEnglisch(a, b);

  const laufzeit = Math.min(a.ergebnis.years.length, b.ergebnis.years.length);
  const monatA = erstesA.cashflowAfterTax / 12;
  const monatB = erstesB.cashflowAfterTax / 12;
  const vermoegenA = letztesA.totalWealth;
  const vermoegenB = letztesB.totalWealth;

  const monatSieger = ermittleSieger("mehrIstBesser", monatA, monatB, "euroCent");
  const vermoegenSieger = ermittleSieger("mehrIstBesser", vermoegenA, vermoegenB, "euro");

  // Bei zwei Überschüssen wäre „belastet weniger" falsch, dann trägt das Objekt
  // monatlich etwas ein. Der Satz passt sich deshalb an das Vorzeichen an.
  const beideImPlus = monatA >= 0 && monatB >= 0;
  const monatBetrag = euroWort(monatB - monatA);
  const vermoegenBetrag = euroWort(vermoegenB - vermoegenA);
  const monatName = monatSieger === "a" ? "Objekt A" : "Objekt B";
  const vermoegenName = vermoegenSieger === "a" ? "Objekt A" : "Objekt B";
  const monatVerb = beideImPlus ? `bringt monatlich ${monatBetrag} mehr ein` : `belastet monatlich ${monatBetrag} weniger`;
  const vermoegenVerb = `baut über ${jahreAkkusativ(laufzeit)} ${vermoegenBetrag} mehr Vermögen auf`;

  if (monatSieger === "gleich" && vermoegenSieger === "gleich") {
    return `Beide Objekte belasten monatlich gleich viel und bauen über ${jahreAkkusativ(laufzeit)} dasselbe Vermögen auf.`;
  }
  if (monatSieger === "gleich") {
    return `Beide Objekte belasten monatlich gleich viel, ${vermoegenName} ${vermoegenVerb}.`;
  }
  if (vermoegenSieger === "gleich") {
    return `${monatName} ${monatVerb}, beim Vermögen nach ${jahreDativ(laufzeit)} liegen beide gleich.`;
  }
  if (monatSieger === vermoegenSieger) {
    return `${monatName} ${monatVerb} und ${vermoegenVerb}.`;
  }
  return `${monatName} ${monatVerb}, ${vermoegenName} ${vermoegenVerb}.`;
}

/**
 * Dieselbe Einordnung auf Englisch, für den Druck an englischsprachige
 * Kunden. Gleiche Regeln wie `einordnung`: nur Zahlen, keine Empfehlung.
 * Aufgerufen erst, nachdem `einordnung` die Prognosewerte geprüft hat.
 */
function einordnungEnglisch(a: Vergleichsobjekt, b: Vergleichsobjekt): string {
  const erstesA = a.ergebnis.years[0];
  const erstesB = b.ergebnis.years[0];
  const letztesA = a.ergebnis.years[a.ergebnis.years.length - 1];
  const letztesB = b.ergebnis.years[b.ergebnis.years.length - 1];
  const laufzeit = Math.min(a.ergebnis.years.length, b.ergebnis.years.length);
  const monatA = erstesA.cashflowAfterTax / 12;
  const monatB = erstesB.cashflowAfterTax / 12;
  const vermoegenA = letztesA.totalWealth;
  const vermoegenB = letztesB.totalWealth;
  const monatSieger = ermittleSieger("mehrIstBesser", monatA, monatB, "euroCent");
  const vermoegenSieger = ermittleSieger("mehrIstBesser", vermoegenA, vermoegenB, "euro");
  const beideImPlus = monatA >= 0 && monatB >= 0;
  const euro = (betrag: number) => `€${Math.round(Math.abs(betrag)).toLocaleString(SPRACH_LOCALE.en)}`;
  const monatName = monatSieger === "a" ? "Property A" : "Property B";
  const vermoegenName = vermoegenSieger === "a" ? "Property A" : "Property B";
  const monatVerb = beideImPlus
    ? `brings in ${euro(monatB - monatA)} more each month`
    : `costs ${euro(monatB - monatA)} less each month`;
  const vermoegenVerb = `builds up ${euro(vermoegenB - vermoegenA)} more wealth over ${jahreEnglisch(laufzeit)}`;

  if (monatSieger === "gleich" && vermoegenSieger === "gleich") {
    return `Both properties cost the same each month and build up the same wealth over ${jahreEnglisch(laufzeit)}.`;
  }
  if (monatSieger === "gleich") return `Both properties cost the same each month, ${vermoegenName} ${vermoegenVerb}.`;
  if (vermoegenSieger === "gleich") {
    return `${monatName} ${monatVerb}; after ${jahreEnglisch(laufzeit)} both are level on wealth.`;
  }
  if (monatSieger === vermoegenSieger) return `${monatName} ${monatVerb} and ${vermoegenVerb}.`;
  return `${monatName} ${monatVerb}, ${vermoegenName} ${vermoegenVerb}.`;
}
