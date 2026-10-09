/**
 * Die Zahlen des dritten Deckblatts „Vermögensaufbau & Altersvorsorge“, seit
 * dem 09.10.2026.
 *
 * Für Kunden, die die Wohnung behalten, abbezahlen und später die Miete als
 * Zusatzeinkommen im Ruhestand nutzen wollen. Die Frage lautet: Was zahle ich
 * heute zu, wann ist die Wohnung schuldenfrei, was bringt sie ab Rentenbeginn?
 *
 * Gerechnet wird mit dem Rechenkern selbst, nur über mehr Jahre als die
 * 30 der Oberfläche: bis zum Rentenbeginn und so weit darüber hinaus, dass
 * die Entschuldung sichtbar wird. Steuern, Miete, Kosten und Darlehen folgen
 * also genau denselben Regeln wie auf den anderen Seiten. Neu sind nur Alter,
 * Rentenbeginn und Inflation.
 *
 * Bewusste Vereinfachungen, auf dem Deckblatt genannt:
 * - Das Zusatzeinkommen im Ruhestand ist vor Steuer.
 * - Zins und Tilgung gelten wie heute über die ganze Laufzeit; eine
 *   Anschlussfinanzierung zu anderem Zins rechnet der Rechenkern nicht.
 */
import { berechneInvestment, type InvestmentEingabe, type Jahreswert } from "./rechenkern";

/** So viele Jahre nach dem Rentenbeginn wird noch nach der Entschuldung gesucht. */
const JAHRE_NACH_RENTENBEGINN = 40;
/** Weiter als so viele Jahre bis zum Rentenbeginn rechnet die Seite nicht. */
export const HOECHSTE_JAHRE_BIS_RENTE = 60;

/** Unter einem halben Euro gilt eine Restschuld als getilgt. */
const GETILGT = 0.5;

export type AltersvorsorgeFehlt =
  | { status: "ohneAlter" }
  | { status: "rentenbeginnErreicht" }
  | { status: "zuWeit" };

export interface Altersvorsorge {
  status: "ok";
  alter: number;
  rentenAlter: number;
  jahreBisRente: number;
  /** Kalenderjahr des Rentenbeginns. */
  rentenJahr: number;
  startJahr: number;
  /** Inflation als Faktor, etwa 0,02. */
  inflation: number;
  /** Eigenaufwand nach Steuer im ersten Jahr je Monat; negativ heißt Überschuss. */
  eigenaufwandHeute: number;
  /** Derselbe Eigenaufwand im Schnitt aller Jahre bis zum Rentenbeginn. */
  eigenaufwandSchnitt: number;
  /** Darlehen zu Beginn, alle zusammen. */
  darlehenStart: number;
  /** Ab diesem Jahr ohne Restschuld, mit dem Alter dann. `null`, wenn nicht absehbar. */
  schuldenfrei: { jahr: number; alter: number } | null;
  /** Stand am Ende des letzten Jahres vor dem Rentenbeginn. */
  zumRentenbeginn: {
    wert: number;
    restschuld: number;
    vermoegen: number;
    /** Eigenkapital plus alle Zuzahlungen nach Steuer bis dahin. */
    eingesetzt: number;
    eigenkapital: number;
    zuzahlungen: number;
  };
  /** Erstes Jahr im Ruhestand, alle Beträge je Monat, nominal. */
  ruhestand: {
    /** Miete nach Leerstand, abzüglich nicht umlagefähiger Kosten und Rücklage. */
    mieteNetto: number;
    /** Noch laufende Kreditrate, 0 wenn schuldenfrei. */
    rate: number;
    /** Was im Monat übrig bleibt, vor Steuer: Miete netto minus Rate. */
    zusatz: number;
    /** Derselbe Betrag in heutiger Kaufkraft. */
    zusatzHeute: number;
  };
  /**
   * Nur wenn die Wohnung zum Rentenbeginn noch nicht schuldenfrei ist: das
   * Zusatzeinkommen im ersten Jahr ohne Rate. `null` sonst oder wenn die
   * Entschuldung nicht absehbar ist.
   */
  nachEntschuldung: { jahr: number; zusatz: number; zusatzHeute: number } | null;
}

/** Was im Ruhestand je Monat bleibt, vor Steuer. */
function mieteNettoMonat(jahr: Jahreswert): number {
  return (jahr.effectiveRent - jahr.operatingCosts - jahr.reserveContribution) / 12;
}

export function altersvorsorge(eingabe: InvestmentEingabe): Altersvorsorge | AltersvorsorgeFehlt {
  const alter = Math.round(eingabe.clientAge);
  const rentenAlter = Math.round(eingabe.retirementAge);
  if (!(alter > 0)) return { status: "ohneAlter" };
  const jahreBisRente = rentenAlter - alter;
  if (jahreBisRente < 1) return { status: "rentenbeginnErreicht" };
  if (jahreBisRente > HOECHSTE_JAHRE_BIS_RENTE) return { status: "zuWeit" };

  const jahreGesamt = jahreBisRente + JAHRE_NACH_RENTENBEGINN;
  const ergebnis = berechneInvestment({ ...eingabe, forecastYears: jahreGesamt }, jahreGesamt);
  const jahre = ergebnis.years;
  const startJahr = jahre[0].year;
  const inflation = Math.max(0, eingabe.inflationRate) / 100;
  // Ein Betrag in n Jahren, ausgedrückt in heutiger Kaufkraft.
  const heute = (betrag: number, nJahre: number) => betrag / (1 + inflation) ** nJahre;

  const ansparen = jahre.slice(0, jahreBisRente);
  const vorRente = ansparen[ansparen.length - 1];
  const erstesRentenjahr = jahre[jahreBisRente];

  // Index des Jahres, an dessen Ende die Restschuld getilgt ist; -1 ohne Darlehen.
  const darlehenStart = ergebnis.totalDebt;
  const getilgtIndex = darlehenStart < GETILGT ? -1 : jahre.findIndex((j) => j.remainingDebt < GETILGT);
  const schuldenfrei =
    getilgtIndex === -1 && darlehenStart >= GETILGT
      ? null
      : { jahr: startJahr + getilgtIndex + 1, alter: alter + getilgtIndex + 1 };

  const zusatz = erstesRentenjahr.cashflowBeforeTax / 12;
  const freiAbIndex = getilgtIndex + 1;
  const nachEntschuldung =
    schuldenfrei && freiAbIndex > jahreBisRente && jahre[freiAbIndex]
      ? {
          jahr: schuldenfrei.jahr,
          zusatz: mieteNettoMonat(jahre[freiAbIndex]),
          zusatzHeute: heute(mieteNettoMonat(jahre[freiAbIndex]), freiAbIndex),
        }
      : null;

  const eigenkapital = Math.max(0, eingabe.equity);
  const zuzahlungen = vorRente.cumulativeEigenanteil;

  return {
    status: "ok",
    alter,
    rentenAlter,
    jahreBisRente,
    rentenJahr: startJahr + jahreBisRente,
    startJahr,
    inflation,
    eigenaufwandHeute: -jahre[0].cashflowAfterTax / 12,
    eigenaufwandSchnitt: -vorRente.cumulativeCashflowAfterTax / (jahreBisRente * 12),
    darlehenStart,
    schuldenfrei,
    zumRentenbeginn: {
      wert: vorRente.propertyValue,
      restschuld: vorRente.remainingDebt,
      vermoegen: vorRente.propertyEquity,
      eingesetzt: eigenkapital + zuzahlungen,
      eigenkapital,
      zuzahlungen,
    },
    ruhestand: {
      mieteNetto: mieteNettoMonat(erstesRentenjahr),
      rate: erstesRentenjahr.debtService / 12,
      zusatz,
      zusatzHeute: heute(zusatz, jahreBisRente),
    },
    nachEntschuldung,
  };
}
