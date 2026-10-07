// Vertriebsakademie: neue Aufgabentypen, die noch nicht in der Inhaltsdatei
// hängen.
//
// Die Inhalte in `vertriebsakademieContent.ts` werden gerade getrennt
// überarbeitet. Damit die Komponente schon gebaut und geprüft werden kann,
// steht der Typ hier. Der nächste Schritt hängt ihn an die Union
// `AkademieAufgabe` und schreibt die ersten Aufgaben dazu.

import type { AufgabenPfad } from "@/lib/vertriebsakademieContent";

/** Die Basisfelder, wie sie auch die anderen Aufgabentypen tragen. */
export interface AkademieAufgabeBasisFelder {
  id: string;
  /** Überschrift der Aufgabenkarte. */
  titel: string;
  /** Optionale Aufgabenstellung über dem Inhalt. */
  hinweis?: string;
  pfad?: AufgabenPfad;
  /** Punkte bei richtiger Lösung im ersten Versuch. Default 10. */
  punkte?: number;
  /** Zeitlimit in Sekunden. Ohne Angabe kein Zeitdruck. */
  zeitlimitSek?: number;
}

/**
 * Wisch-Stapel: Aussagen als Kartenstapel, je Karte nach rechts („stimmt")
 * oder links („stimmt nicht") wischen. Gedacht für alle Aufgaben mit genau
 * zwei Zielen: innen oder draußen, umlagefähig oder nicht, echt oder erfunden.
 */
export interface AkademieWahrFalschAufgabe extends AkademieAufgabeBasisFelder {
  typ: "wahrfalsch";
  karten: {
    aussage: string;
    stimmt: boolean;
    /** Auflösung, die nach dem Wischen erscheint. */
    aufloesung: string;
  }[];
}
