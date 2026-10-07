import type { ZweiSprachen } from "@/lib/seitenSprache";

/**
 * Texte der gemeinsamen Buchungsbausteine (`Bausteine.tsx`, `Zeitauswahl.tsx`),
 * Deutsch und Englisch. Plan Kundensprache, Etappe 3 (S3, S4, S5).
 *
 * Die Bausteine stehen auch auf den Bewerberseiten. Dort wird keine Sprache
 * übergeben, es bleibt bei der deutschen Hälfte.
 *
 * Englisch nach dem Glossar (`kundenspracheGlossar.ts`): der Berater heißt
 * „your contact“, nie „advisor“.
 */
export interface BuchungBausteinTexte {
  laedt: string;
  bitteWarten: string;
  optional: string;
  schritteBeschriftung: string;
  zeitzoneHinweis: string;
  freieZeiten: string;
  zeitenLaden: string;
  zeitenFehler: string;
  nichtsFrei: string;
  naechsteWoche: string;
  meldeDich: string;
  wocheZurueck: string;
  wocheVor: string;
  /** Kopf der Wochenansicht, etwa „4. Aug. bis 10. Aug.“. */
  spanne: (von: string, bis: string) => string;
  /** Datums- und Uhrzeitauswahl (`TerminFelder.tsx`). */
  datumPlatzhalter: string;
  uhrzeitPlatzhalter: string;
  monatZurueck: string;
  monatVor: string;
  stunde: string;
  minute: string;
}

export const BUCHUNG_BAUSTEIN_TEXTE: ZweiSprachen<BuchungBausteinTexte> = {
  de: {
    laedt: "Wird geladen",
    bitteWarten: "Bitte warten",
    optional: "optional",
    schritteBeschriftung: "Schritte der Buchung",
    zeitzoneHinweis: "Alle Zeiten in der Zeitzone deines Ansprechpartners",
    freieZeiten: "Freie Zeiten",
    zeitenLaden: "Freie Zeiten werden geladen",
    zeitenFehler: "Die freien Zeiten konnten nicht geladen werden. Bitte versuch es später noch einmal.",
    nichtsFrei: "In diesem Zeitraum ist nichts frei.",
    naechsteWoche: "Bitte schau in der nächsten Woche.",
    meldeDich: "Bitte melde dich bei deinem Ansprechpartner.",
    wocheZurueck: "Eine Woche zurück",
    wocheVor: "Eine Woche vor",
    spanne: (von, bis) => `${von} bis ${bis}`,
    datumPlatzhalter: "TT.MM.JJJJ",
    uhrzeitPlatzhalter: "HH:MM",
    monatZurueck: "Vorheriger Monat",
    monatVor: "Nächster Monat",
    stunde: "Stunde",
    minute: "Minute",
  },
  en: {
    laedt: "Loading",
    bitteWarten: "Please wait",
    optional: "optional",
    schritteBeschriftung: "Booking steps",
    zeitzoneHinweis: "All times are shown in your contact’s time zone",
    freieZeiten: "Available times",
    zeitenLaden: "Loading available times",
    zeitenFehler: "The available times couldn’t be loaded. Please try again later.",
    nichtsFrei: "Nothing is available in this period.",
    naechsteWoche: "Please take a look at the following week.",
    meldeDich: "Please get in touch with your contact.",
    wocheZurueck: "Previous week",
    wocheVor: "Next week",
    spanne: (von, bis) => `${von} to ${bis}`,
    datumPlatzhalter: "DD.MM.YYYY",
    uhrzeitPlatzhalter: "HH:MM",
    monatZurueck: "Previous month",
    monatVor: "Next month",
    stunde: "Hour",
    minute: "Minute",
  },
};
