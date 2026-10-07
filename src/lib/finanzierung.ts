/**
 * Zins und Tilgung, an EINER Stelle für alle Rechner.
 *
 * Warum diese Datei entstanden ist: Die Annahmen lagen verstreut im Code und
 * sind auseinandergelaufen. Der Steuerrechner rechnete je nach Objektklasse mit
 * 3,4 oder 3,8 Prozent, der EXPATS-Rechner mit 4,4 Prozent, und die anfängliche
 * Tilgung stand nirgends als Zahl, sondern steckte versteckt in einer
 * Zehnjahresquote. Wer eine davon änderte, änderte die anderen nicht mit.
 *
 * Jetzt gibt es zwei Konstanten und einen Tilgungsplan, und jeder Rechner liest
 * daraus. Wer die Annahme ändern will, ändert sie hier einmal.
 */

/**
 * Sollzins der Finanzierung.
 *
 * 4,0 Prozent, festgelegt am 17.09.2026. Es ist ein Mischzins für eine
 * vermietete Eigentumswohnung mit Zehnjahresbindung und ohne Eigenkapital im
 * Kaufpreis. Eine Annahme, keine Zusage: Was jemand tatsächlich bekommt, hängt
 * an Bonität, Objekt und Haus und sagt ihm erst eine konkrete Anfrage.
 */
export const SOLLZINS = 0.04;

/**
 * Anfängliche Tilgung, festgelegt am 17.09.2026.
 *
 * Zins plus anfängliche Tilgung ergeben die Annuität, und die bleibt über die
 * Laufzeit gleich. Weil die Zinsen mit der sinkenden Restschuld fallen, wächst
 * der Tilgungsanteil Jahr für Jahr. Deshalb sind nach zehn Jahren nicht
 * 15 Prozent getilgt, sondern rund 18 Prozent.
 *
 * Wichtig für das Verständnis der Zahlen: Eine höhere Tilgung macht das
 * Ergebnis nicht besser. Jeder Euro mehr Tilgung ist ein Euro mehr, den der
 * Käufer monatlich zuzahlt. Er verschiebt sich nur vom Zahlungsstrom in das
 * Vermögen, er entsteht nicht aus dem Nichts.
 */
export const TILGUNG_ANFANG = 0.015;

/** Die jährliche Annuität, also Zins plus Tilgung auf die Darlehenssumme. */
export function annuitaet(
  darlehen: number,
  zins: number = SOLLZINS,
  tilgungAnfang: number = TILGUNG_ANFANG,
): number {
  return Math.max(0, darlehen) * (zins + tilgungAnfang);
}

/** Ein Jahr des Darlehens. Alle Beträge in Euro. */
export interface FinanzierungsJahr {
  jahr: number;
  /** Restschuld zu Beginn des Jahres. */
  restschuld: number;
  zinsen: number;
  tilgung: number;
  /** Zins plus Tilgung, über die Laufzeit konstant. */
  rate: number;
  /** Restschuld am Ende des Jahres. */
  restschuldEnde: number;
}

/**
 * Der Verlauf eines Annuitätendarlehens, Jahr für Jahr.
 *
 * Bewusst KEINE Näherung über „Anfangstilgung mal Laufzeit“: Der Tilgungsanteil
 * wächst, weil die Zinsen auf eine sinkende Restschuld laufen. Die Näherung
 * wiese den Vermögensaufbau zu klein aus.
 *
 * Die Kappung in der letzten Zeile verhindert eine negative Restschuld, falls
 * jemand die Annahmen so ändert, dass das Darlehen innerhalb des Zeitraums
 * ausläuft.
 */
export function tilgungsplan(
  darlehen: number,
  jahre: number,
  zins: number = SOLLZINS,
  tilgungAnfang: number = TILGUNG_ANFANG,
): FinanzierungsJahr[] {
  const rate = annuitaet(darlehen, zins, tilgungAnfang);
  const zeilen: FinanzierungsJahr[] = [];
  let restschuld = Math.max(0, darlehen);

  for (let jahr = 1; jahr <= jahre; jahr++) {
    const zinsen = restschuld * zins;
    const tilgung = Math.min(Math.max(0, rate - zinsen), restschuld);
    zeilen.push({
      jahr,
      restschuld,
      zinsen,
      tilgung,
      rate: zinsen + tilgung,
      restschuldEnde: restschuld - tilgung,
    });
    restschuld -= tilgung;
  }
  return zeilen;
}

/** Was nach `jahre` Jahren getilgt ist, als Anteil an der Darlehenssumme. */
export function getilgterAnteil(
  jahre: number,
  zins: number = SOLLZINS,
  tilgungAnfang: number = TILGUNG_ANFANG,
): number {
  const plan = tilgungsplan(1, jahre, zins, tilgungAnfang);
  return plan.reduce((s, z) => s + z.tilgung, 0);
}
