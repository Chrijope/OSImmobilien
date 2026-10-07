/**
 * Annahmen des Exposé-Rechners: Typen, Standardwerte, Reglergrenzen und die
 * Herkunft jedes Werts.
 *
 * Die Zahlen sind bewusst an einer Stelle gesammelt, damit sich der Rechner
 * (exposeRechner.ts), die Exposé-Seite und das PDF nicht in verschiedenen
 * Vorgaben verlaufen. Wer einen Standardwert ändert, ändert ihn überall.
 *
 * Herkunft der Werte, in dieser Reihenfolge (Konzept Abschnitt 7):
 *   1. Selbstauskunft des Kunden: zu versteuerndes Einkommen (angegeben,
 *      sonst Brutto mal 0,7, steuerHelper.zvEFuerRechnungAusSA), Familienstand (Splitting) und
 *      Eigenkapital (Summe der Vermögenswerte, finanzierbarkeitUtils).
 *   2. Objekt: Kaufpreis, Stellplatz, Miete, Hausgeld, AfA, Nebenkosten je
 *      Bundesland. Diese Werte stehen in ExposeObjektdaten, nicht hier.
 *   3. Vorgabe des Vertriebspartners: alles Übrige, mit den Standardwerten
 *      unten als Ausgangspunkt. Der Kunde darf sie im Exposé verschieben,
 *      solange der Vertriebspartner sie nicht sperrt.
 */

import { getVerheiratetFromSA, zvEFuerRechnungAusSA } from "@/lib/steuerHelper";
import { calculateFinanzierbarkeitFromSaData } from "@/lib/finanzierbarkeitUtils";

/**
 * Wie eine Sanierung steuerlich behandelt wird.
 *   keine              kein Sanierungsanteil in der Rechnung
 *   erhaltungsaufwand  sofort abziehbar, wahlweise auf 2 bis 5 Jahre verteilt
 *                      (§ 82b EStDV), Ersparnis wird gesondert ausgewiesen
 *   werkvertrag        Herstellungskosten, erhöhen nur die AfA-Grundlage
 *                      (§ 6 Abs. 1 Nr. 1a EStG, anschaffungsnahe Kosten)
 */
export type Instandhaltungsart = "keine" | "erhaltungsaufwand" | "werkvertrag";

/**
 * Wie die Tilgung des Bankdarlehens bestimmt wird.
 *   tilgung   die anfängliche Tilgung in Prozent wird vorgegeben
 *   laufzeit  die gewünschte Laufzeit bis zur Volltilgung wird vorgegeben,
 *             die Tilgung folgt daraus
 */
export type Tilgungsmodus = "tilgung" | "laufzeit";

/**
 * Was ein zweites Darlehen ersetzt.
 *   bankdarlehen  ein Teil des Bankdarlehens, etwa ein KfW-Darlehen
 *   eigenkapital  das Eigenkapital samt Nebenkosten, etwa ein Privatdarlehen
 *                 als Eigenkapitalersatz
 */
export type ZweitesDarlehenErsetzt = "bankdarlehen" | "eigenkapital";

export interface ExposeAnnahmen {
  /** Eigenkapitalanteil an der Gesamtinvestition in Prozent. 0 = Vollfinanzierung, Nebenkosten trägt der Kunde immer selbst. */
  eigenkapitalProzent: number;
  /** Sollzins in Prozent je Jahr. */
  zinsProzent: number;
  /** Anfängliche Tilgung in Prozent je Jahr. */
  tilgungProzent: number;
  /** Zu versteuerndes Jahreseinkommen vor der Investition in Euro. */
  zvE: number;
  /** Verheiratet oder eingetragene Lebenspartnerschaft, dann Splittingtarif. */
  verheiratet: boolean;
  /** Lohnsteuerermäßigung nach § 39a EStG: Steuervorteil monatlich statt als Erstattung im Folgejahr. */
  lohnsteuerermaessigung: boolean;
  instandhaltungsart: Instandhaltungsart;
  /** Auf wie viele Jahre der Erhaltungsaufwand verteilt wird, 1 = alles im Jahr der Fertigstellung. */
  instandhaltungJahre: number;
  /** Mietausfall in Prozent der Kaltmiete je Jahr. */
  leerstandProzent: number;
  mietsteigerungProzent: number;
  kostensteigerungProzent: number;
  wertsteigerungProzent: number;
  /** Maklerprovision in Prozent der Gesamtinvestition, 0 wenn provisionsfrei. */
  maklerProzent: number;
  /** Rabatt (negativ) oder Aufschlag (positiv) auf den Kaufpreis in Prozent. */
  preisanpassungProzent: number;
  /** Linearer AfA-Satz in Prozent auf den Gebäudeanteil. */
  afaProzent: number;
  /** Sonder-AfA (§ 7b EStG) oder erhöhte AfA auf den Sanierungsanteil ansetzen. */
  sonderAfa: boolean;
  /** Kosten der Mietverwaltung (Sondereigentumsverwaltung) in die Ausgaben einrechnen. */
  mietverwaltungEinrechnen: boolean;
  /** Kalenderjahr des Kaufs, erstes Jahr der Rechnung. */
  startjahr: number;
  /** Kalenderjahr, für das die Monatsrechnung gezeigt wird. */
  betrachtungsjahr: number;
  /** Länge der Rechnung in Jahren, zugleich Ende des Tilgungsplans. */
  haltedauerJahre: number;
  /**
   * Fester Grenzsteuersatz in Prozent statt der Differenzrechnung nach Tarif.
   * Nur wenn das Einkommen unbekannt ist oder eine Vorlage nachgerechnet
   * werden soll. null oder 0 bedeutet: Tarif aus einkommensteuer.ts.
   */
  grenzsteuersatzManuellProzent?: number | null;
  /** Tilgung vorgeben oder aus der Laufzeit ableiten. Ohne Angabe gilt „tilgung". */
  tilgungsmodus?: Tilgungsmodus;
  /** Gewünschte Laufzeit des Bankdarlehens in Jahren, nur im Modus „laufzeit". */
  laufzeitJahre?: number;
  /** Zweites Darlehen neben dem Bankdarlehen, etwa KfW oder Eigenkapitalersatz. */
  zweitesDarlehenAktiv?: boolean;
  zweitesDarlehenBetrag?: number;
  zweitesDarlehenZinsProzent?: number;
  zweitesDarlehenTilgungProzent?: number;
  zweitesDarlehenErsetzt?: ZweitesDarlehenErsetzt;
  /** Der Verkäufer übernimmt die Kaufnebenkosten: kein Eigenkapital dafür, keine AfA darauf. */
  nebenkostenTraegtVerkaeufer?: boolean;
}

/** Standardwerte wie in der Vorlage: Zins 4,3 %, Tilgung 1 %, Steigerungen 2 %, AfA 2 %. */
export const STANDARD_ANNAHMEN: Omit<ExposeAnnahmen, "startjahr" | "betrachtungsjahr"> = {
  eigenkapitalProzent: 0,
  zinsProzent: 4.3,
  tilgungProzent: 1.0,
  tilgungsmodus: "tilgung",
  laufzeitJahre: 30,
  zweitesDarlehenAktiv: false,
  zweitesDarlehenBetrag: 0,
  zweitesDarlehenZinsProzent: 3.0,
  zweitesDarlehenTilgungProzent: 2.0,
  zweitesDarlehenErsetzt: "bankdarlehen",
  nebenkostenTraegtVerkaeufer: false,
  zvE: 60000,
  verheiratet: false,
  lohnsteuerermaessigung: true,
  instandhaltungsart: "keine",
  instandhaltungJahre: 1,
  leerstandProzent: 0,
  mietsteigerungProzent: 2.0,
  kostensteigerungProzent: 2.0,
  wertsteigerungProzent: 2.0,
  maklerProzent: 0,
  preisanpassungProzent: 0,
  afaProzent: 2.0,
  sonderAfa: false,
  mietverwaltungEinrechnen: true,
  haltedauerJahre: 40,
  grenzsteuersatzManuellProzent: null,
};

/** Reglergrenzen für die Oberfläche, angelehnt an die Vorlage. */
export const ANNAHMEN_GRENZEN = {
  eigenkapitalProzent: { min: 0, max: 100, schritt: 1 },
  zinsProzent: { min: 1, max: 8, schritt: 0.05 },
  tilgungProzent: { min: 0.5, max: 5, schritt: 0.1 },
  zvE: { min: 20000, max: 300000, schritt: 1000 },
  leerstandProzent: { min: 0, max: 10, schritt: 0.5 },
  mietsteigerungProzent: { min: 0, max: 5, schritt: 0.1 },
  kostensteigerungProzent: { min: 0, max: 5, schritt: 0.1 },
  wertsteigerungProzent: { min: 0, max: 5, schritt: 0.1 },
  maklerProzent: { min: 0, max: 7.14, schritt: 0.01 },
  preisanpassungProzent: { min: -20, max: 20, schritt: 0.5 },
  afaProzent: { min: 0, max: 10, schritt: 0.5 },
  instandhaltungJahre: { min: 1, max: 5, schritt: 1 },
  haltedauerJahre: { min: 1, max: 60, schritt: 1 },
  laufzeitJahre: { min: 5, max: 40, schritt: 1 },
  zweitesDarlehenZinsProzent: { min: 0, max: 8, schritt: 0.05 },
  zweitesDarlehenTilgungProzent: { min: 0.5, max: 10, schritt: 0.1 },
} as const;

export type AnnahmenHerkunft = "selbstauskunft" | "vorgabe";

/** Woher ein Wert kommt, bevor der Kunde ihn verschiebt. Für Kennzeichnungen wie „aus deiner Selbstauskunft". */
export const ANNAHMEN_HERKUNFT: Record<keyof ExposeAnnahmen, AnnahmenHerkunft> = {
  eigenkapitalProzent: "selbstauskunft",
  zvE: "selbstauskunft",
  verheiratet: "selbstauskunft",
  zinsProzent: "vorgabe",
  tilgungProzent: "vorgabe",
  lohnsteuerermaessigung: "vorgabe",
  instandhaltungsart: "vorgabe",
  instandhaltungJahre: "vorgabe",
  leerstandProzent: "vorgabe",
  mietsteigerungProzent: "vorgabe",
  kostensteigerungProzent: "vorgabe",
  wertsteigerungProzent: "vorgabe",
  maklerProzent: "vorgabe",
  preisanpassungProzent: "vorgabe",
  afaProzent: "vorgabe",
  sonderAfa: "vorgabe",
  mietverwaltungEinrechnen: "vorgabe",
  startjahr: "vorgabe",
  betrachtungsjahr: "vorgabe",
  haltedauerJahre: "vorgabe",
  grenzsteuersatzManuellProzent: "vorgabe",
  tilgungsmodus: "vorgabe",
  laufzeitJahre: "vorgabe",
  zweitesDarlehenAktiv: "vorgabe",
  zweitesDarlehenBetrag: "vorgabe",
  zweitesDarlehenZinsProzent: "vorgabe",
  zweitesDarlehenTilgungProzent: "vorgabe",
  zweitesDarlehenErsetzt: "vorgabe",
  nebenkostenTraegtVerkaeufer: "vorgabe",
};

/** Vollständige Standardannahmen für ein Startjahr, Betrachtungsjahr = Startjahr. */
export function standardAnnahmen(startjahr: number = new Date().getFullYear()): ExposeAnnahmen {
  return { ...STANDARD_ANNAHMEN, startjahr, betrachtungsjahr: startjahr };
}

/** Eigenkapital in Euro in den Prozentanteil an der Gesamtinvestition umrechnen, begrenzt auf 0 bis 100. */
export function eigenkapitalProzentAusBetrag(betrag: number, gesamtinvestition: number): number {
  if (!(gesamtinvestition > 0) || !(betrag > 0)) return 0;
  return Math.min(100, (betrag / gesamtinvestition) * 100);
}

export interface AnnahmenAusSelbstauskunft {
  werte: Partial<Pick<ExposeAnnahmen, "zvE" | "verheiratet" | "eigenkapitalProzent">>;
  /** Welche Felder tatsächlich aus der Selbstauskunft belegt wurden. */
  herkunft: Array<keyof ExposeAnnahmen>;
  /** Liquides Eigenkapital laut Selbstauskunft in Euro, für die Anzeige. */
  eigenkapitalEuro: number;
}

/**
 * Vorbelegung aus der Selbstauskunft. Liefert nur die Felder, die dort
 * wirklich stehen; alles andere bleibt bei den Standardwerten. Der
 * Eigenkapitalanteil braucht die Gesamtinvestition, ohne sie bleibt er offen.
 */
export function annahmenAusSelbstauskunft(
  saData: unknown,
  gesamtinvestition?: number,
): AnnahmenAusSelbstauskunft {
  const werte: AnnahmenAusSelbstauskunft["werte"] = {};
  const herkunft: Array<keyof ExposeAnnahmen> = [];
  if (!saData) return { werte, herkunft, eigenkapitalEuro: 0 };

  // Dieselbe Regel wie im Investmentrechner: das angegebene zvE vor der Schätzung.
  const zvE = zvEFuerRechnungAusSA(saData);
  if (zvE) {
    werte.zvE = zvE.zvE;
    herkunft.push("zvE");
  }
  werte.verheiratet = getVerheiratetFromSA(saData);
  herkunft.push("verheiratet");

  const finanz = calculateFinanzierbarkeitFromSaData(saData);
  const eigenkapitalEuro = finanz?.eigenkapital ?? 0;
  if (eigenkapitalEuro > 0 && gesamtinvestition && gesamtinvestition > 0) {
    werte.eigenkapitalProzent = eigenkapitalProzentAusBetrag(eigenkapitalEuro, gesamtinvestition);
    herkunft.push("eigenkapitalProzent");
  }
  return { werte, herkunft, eigenkapitalEuro };
}
