/**
 * Die Erklärung hinter der Quelle „Kalkulation“ im OS Lotsen (Christian,
 * 28.09.2026).
 *
 * Entsteht im Browser aus genau den Zahlen, die der Lotse bekommt
 * (`kalkulationAusRechner`), nicht durch die KI. Die Rechnung folgt dem
 * Rechenkern: Cashflow vor Steuer = Miete − Mietausfall − nicht umlagefähige
 * Kosten − Rücklage − Kreditrate (`rechenkern.ts`, erstes Jahr, je Monat).
 * Die Verwaltung ist keine eigene Zeile, sie steckt in den nicht
 * umlagefähigen Kosten. Fehlt ein Posten, fehlt seine Zeile, es gibt keine 0.
 */
import { KALKULATION_QUELLE, type LotseKalkulation } from "../../supabase/functions/_shared/lotse-regeln";
import { eur, prozent } from "./kalkulatorFormat";

export interface ErklaerungsZeile {
  /** Mit Rechenwort davor, etwa „minus Kreditrate“. */
  text: string;
  /** Mit Vorzeichen, wie er in die Rechnung eingeht. */
  wert: number;
  betrag: string;
}

export interface KalkulationErklaerung {
  rechnung: ErklaerungsZeile[];
  cashflowVorSteuer: ErklaerungsZeile | null;
  nachSteuer: ErklaerungsZeile[];
  eigenanteil: ErklaerungsZeile | null;
  annahmen: Array<{ text: string; wert: string }>;
  hinweise: string[];
}

const zahl = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const euro = (v: number) => eur(v, 2);

/**
 * Welche Kalkulation eine Quelle meint. Nur die festen Bezeichnungen
 * (`KALKULATION_QUELLE`), gleich in Groß- und Kleinschreibung und Leerraum,
 * nie ein Dokument wie „Musterkalkulation.pdf“ (REVIEW-006).
 */
export function kalkulationsQuelle(quelle: string): LotseKalkulation["annahmen"] | null {
  const norm = (t: string) => t.trim().replace(/\s+/g, " ").toLowerCase();
  const q = norm(quelle);
  if (q === norm(KALKULATION_QUELLE.standard)) return "standard";
  if (q === norm(KALKULATION_QUELLE.nutzer)) return "nutzer";
  return null;
}

export function kalkulationErklaerung(k: LotseKalkulation | null): KalkulationErklaerung | null {
  if (!k) return null;
  const zeile = (text: string, wert: unknown, vorzeichen: 1 | -1): ErklaerungsZeile[] =>
    zahl(wert) ? [{ text, wert: vorzeichen * wert, betrag: euro(wert) }] : [];

  const rechnung = [
    ...zeile("Kaltmiete", k.kaltmiete_monat, 1),
    ...zeile("minus Mietausfall durch Leerstand", k.mietausfall_monat, -1),
    ...zeile("minus nicht umlagefähige Kosten", k.nicht_umlagefaehig_monat, -1),
    ...zeile("minus Zuführung zur Instandhaltungsrücklage", k.ruecklage_monat, -1),
    ...zeile("minus Kreditrate", k.rate_monat, -1),
  ];
  const cashflowVorSteuer = zeile("ergibt Cashflow vor Steuer", k.cashflow_vor_steuer_monat, 1)[0] ?? null;

  const nachSteuer = zahl(k.steuereffekt_monat) && zahl(k.cashflow_nach_steuer_monat)
    ? [
      { text: k.steuereffekt_monat >= 0 ? "plus Steuereffekt" : "minus Steuereffekt", wert: k.steuereffekt_monat, betrag: euro(Math.abs(k.steuereffekt_monat)) },
      { text: "ergibt Cashflow nach Steuer", wert: k.cashflow_nach_steuer_monat, betrag: euro(k.cashflow_nach_steuer_monat) },
    ]
    : [];

  // `eigenanteil_monat` ist positiv, wenn zugezahlt wird, negativ bei einem Überschuss. Er ist ein Wert
  // nach Steuer und erscheint nur, wenn auch die Steuerwerte da sind (LOTSE-005).
  const e = k.eigenanteil_monat;
  const eigenanteil = zahl(e) && nachSteuer.length
    ? { text: e >= 0 ? "Eigenanteil im Monat" : "Überschuss im Monat", wert: e, betrag: euro(Math.abs(e)) }
    : null;

  const standard = k.annahmen === "standard";
  const annahmen = [
    ...(zahl(k.kaufpreis) ? [{ text: "Kaufpreis", wert: euro(k.kaufpreis) }] : []),
    ...(zahl(k.eigenkapital)
      ? [{ text: standard ? "Eigenkapital, in Höhe der Kaufnebenkosten vorbelegt" : "Eigenkapital", wert: euro(k.eigenkapital) }]
      : []),
    ...(zahl(k.darlehen) ? [{ text: "Darlehen", wert: euro(k.darlehen) }] : []),
    ...(zahl(k.zins_prozent) ? [{ text: "Sollzins", wert: prozent(k.zins_prozent, 2) }] : []),
    ...(zahl(k.tilgung_prozent) ? [{ text: "Tilgung", wert: prozent(k.tilgung_prozent, 2) }] : []),
    ...(zahl(k.eigentumsanteil_prozent) ? [{ text: "Eigentumsanteil", wert: prozent(k.eigentumsanteil_prozent, 0) }] : []),
  ];

  const hinweise = standard
    ? [
      "Die Kosten der Sondereigentumsverwaltung sind in den nicht umlagefähigen Kosten enthalten.",
      "Standardannahmen der Investmentkalkulation, ohne Kundendaten. Die Rechnung eines bestimmten Kunden kann abweichen.",
    ]
    : ["Mit deinen Annahmen aus dem Reiter Investmentkalkulation."];

  if (!rechnung.length && !cashflowVorSteuer && !nachSteuer.length && !eigenanteil && !annahmen.length) return null;
  return { rechnung, cashflowVorSteuer, nachSteuer, eigenanteil, annahmen, hinweise };
}
