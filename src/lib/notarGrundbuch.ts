/**
 * Notar- und Grundbuchkosten beim Wohnungskauf nach dem Gerichts- und
 * Notarkostengesetz (GNotKG), statt der bisherigen Pauschale von 2 Prozent.
 *
 * Quelle der Gebührenstufen: § 34 Abs. 2 GNotKG, Tabelle B (Fassung seit dem
 * 1. Januar 2021), nachgelesen unter gesetze-im-internet.de/gnotkg/__34.html.
 * Anlage 2 des Gesetzes druckt die Tabelle bis 3 Millionen Euro aus; die
 * Stufen darüber stehen ebenfalls in § 34 Abs. 2.
 *
 * Gebührensätze aus dem Kostenverzeichnis (Anlage 1 GNotKG):
 *   Notar
 *     Beurkundung des Kaufvertrags     KV 21100   2,0 auf den Kaufpreis
 *     Vollzug                          KV 22110   0,5 auf den Kaufpreis
 *     Betreuung                        KV 22200   0,5 auf den Kaufpreis
 *     Beurkundung der Grundschuld      KV 21200   1,0 auf den Darlehensbetrag
 *     dazu 19 Prozent Umsatzsteuer auf alle Notargebühren
 *   Grundbuchamt (ohne Umsatzsteuer)
 *     Auflassungsvormerkung            KV 14150   0,5 auf den Kaufpreis
 *     Eigentumsumschreibung            KV 14110   1,0 auf den Kaufpreis
 *     Eintragung der Grundschuld       KV 14121   1,0 auf den Darlehensbetrag
 *
 * Auslagen des Notars (Dokumentenpauschale, Post) und Kosten für Löschungen
 * alter Rechte sind nicht enthalten, sie liegen meist unter 100 Euro.
 */

/** Umsatzsteuer auf Notargebühren in Prozent. */
export const NOTAR_UMSATZSTEUER_PROZENT = 19;

/** Gebühr bei einem Geschäftswert bis 500 Euro. */
const GEBUEHR_BASIS = 15;
const WERT_BASIS = 500;

/**
 * Stufen nach § 34 Abs. 2 GNotKG: Für jeden angefangenen Schritt oberhalb
 * der vorigen Grenze bis zur Grenze `bis` erhöht sich die Gebühr um `plus`.
 */
const STUFEN_TABELLE_B: Array<{ bis: number; schritt: number; plus: number }> = [
  { bis: 2_000, schritt: 500, plus: 4 },
  { bis: 10_000, schritt: 1_000, plus: 6 },
  { bis: 25_000, schritt: 3_000, plus: 8 },
  { bis: 50_000, schritt: 5_000, plus: 10 },
  { bis: 200_000, schritt: 15_000, plus: 27 },
  { bis: 500_000, schritt: 30_000, plus: 50 },
  { bis: 5_000_000, schritt: 50_000, plus: 80 },
  { bis: 10_000_000, schritt: 200_000, plus: 130 },
  { bis: 20_000_000, schritt: 250_000, plus: 150 },
  { bis: 30_000_000, schritt: 500_000, plus: 280 },
  { bis: Number.POSITIVE_INFINITY, schritt: 1_000_000, plus: 120 },
];

/** Einfache Gebühr (Satz 1,0) nach Tabelle B für einen Geschäftswert in Euro. */
export function gebuehrTabelleB(geschaeftswert: number): number {
  const wert = Number.isFinite(geschaeftswert) ? Math.max(0, geschaeftswert) : 0;
  let gebuehr = GEBUEHR_BASIS;
  let grenze = WERT_BASIS;
  for (const stufe of STUFEN_TABELLE_B) {
    if (wert <= grenze) break;
    const bisHier = Math.min(wert, stufe.bis);
    gebuehr += Math.ceil((bisHier - grenze) / stufe.schritt) * stufe.plus;
    grenze = stufe.bis;
  }
  return gebuehr;
}

export interface NotarGrundbuchKosten {
  /** Geschäftswert des Kaufvertrags, in der Regel der Gesamtkaufpreis. */
  geschaeftswertKauf: number;
  /** Betrag der Grundschuld, in der Regel das Bankdarlehen. */
  grundschuldbetrag: number;
  notarBeurkundung: number;
  notarVollzug: number;
  notarBetreuung: number;
  notarGrundschuld: number;
  notarNetto: number;
  notarUmsatzsteuer: number;
  notarBrutto: number;
  grundbuchVormerkung: number;
  grundbuchEigentum: number;
  grundbuchGrundschuld: number;
  grundbuchSumme: number;
  /** Anzeige: Notar für den Kaufvertrag (Beurkundung, Vollzug, Betreuung) inklusive Umsatzsteuer. */
  zeileNotarKaufvertrag: number;
  /** Anzeige: alles rund um die Grundschuld, Notar inklusive Umsatzsteuer plus Grundbucheintragung. */
  zeileGrundschuld: number;
  /** Anzeige: Grundbuch für Vormerkung und Eigentumsumschreibung. */
  zeileGrundbuch: number;
  /** Notar brutto plus Grundbuch. */
  summe: number;
}

/**
 * Notar- und Grundbuchkosten für einen Kauf. Ohne Darlehen entfallen die
 * Positionen der Grundschuld.
 */
export function notarGrundbuchKosten(kaufpreis: number, darlehen: number): NotarGrundbuchKosten {
  const kauf = Number.isFinite(kaufpreis) ? Math.max(0, kaufpreis) : 0;
  const grundschuld = Number.isFinite(darlehen) ? Math.max(0, darlehen) : 0;
  const gebuehrKauf = kauf > 0 ? gebuehrTabelleB(kauf) : 0;
  const gebuehrGrundschuld = grundschuld > 0 ? gebuehrTabelleB(grundschuld) : 0;

  const notarBeurkundung = 2 * gebuehrKauf;
  const notarVollzug = 0.5 * gebuehrKauf;
  const notarBetreuung = 0.5 * gebuehrKauf;
  const notarGrundschuld = 1 * gebuehrGrundschuld;
  const notarNetto = notarBeurkundung + notarVollzug + notarBetreuung + notarGrundschuld;
  const ust = NOTAR_UMSATZSTEUER_PROZENT / 100;
  const notarUmsatzsteuer = notarNetto * ust;
  const notarBrutto = notarNetto + notarUmsatzsteuer;

  const grundbuchVormerkung = 0.5 * gebuehrKauf;
  const grundbuchEigentum = 1 * gebuehrKauf;
  const grundbuchGrundschuld = 1 * gebuehrGrundschuld;
  const grundbuchSumme = grundbuchVormerkung + grundbuchEigentum + grundbuchGrundschuld;

  return {
    geschaeftswertKauf: kauf,
    grundschuldbetrag: grundschuld,
    notarBeurkundung,
    notarVollzug,
    notarBetreuung,
    notarGrundschuld,
    notarNetto,
    notarUmsatzsteuer,
    notarBrutto,
    grundbuchVormerkung,
    grundbuchEigentum,
    grundbuchGrundschuld,
    grundbuchSumme,
    zeileNotarKaufvertrag: (notarBeurkundung + notarVollzug + notarBetreuung) * (1 + ust),
    zeileGrundschuld: notarGrundschuld * (1 + ust) + grundbuchGrundschuld,
    zeileGrundbuch: grundbuchVormerkung + grundbuchEigentum,
    summe: notarBrutto + grundbuchSumme,
  };
}
