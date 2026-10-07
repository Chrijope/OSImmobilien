/**
 * Kennzahlen für die Folie "MOREImmo in Zahlen" der Closing-Präsentation.
 *
 * HIER PFLEGT CHRISTIAN DIE ECHTEN ZAHLEN.
 *
 * Solange `wert` leer ist, zeigt die Folie den Platzhalter aus dem Drehbuch,
 * gedimmt und als Platzhalter erkennbar. Sobald in `wert` etwas steht, ersetzt
 * es den Platzhalter. Das Drehbuch verlangt ausdrücklich: nur Zahlen
 * verwenden, die wirklich belegbar sind, keine aufgeblasenen
 * Marketingmetriken. Deshalb stehen hier bewusst noch keine echten Werte.
 *
 * Beispiel: aus { wert: "", platzhalter: "X Mio. €", ... } wird nach der
 * Pflege { wert: "38 Mio. €", platzhalter: "X Mio. €", ... }.
 */

export interface ClosingKennzahl {
  /** Der belegbare, echte Wert. Leer = Platzhalter wird angezeigt. */
  wert: string;
  /** Platzhalter aus dem Drehbuch, sichtbar bis ein echter Wert gepflegt ist. */
  platzhalter: string;
  /** Beschriftung unter der Zahl. */
  label: string;
}

export const CLOSING_KENNZAHLEN: ClosingKennzahl[] = [
  { wert: "", platzhalter: "12", label: "Vollzeit-Vertriebler" },
  { wert: "", platzhalter: "20 bis 25", label: "Einheiten pro Monat" },
  { wert: "", platzhalter: "X Mio. €", label: "vermitteltes Immobilienvolumen" },
  { wert: "", platzhalter: "X", label: "aktive Produktstandorte" },
  { wert: "", platzhalter: "X", label: "Partner und Kunden" },
];

/**
 * Nur die Kennzahlen, für die ein echter Wert gepflegt ist.
 *
 * Solange diese Liste leer ist, wird die ganze Folie übersprungen, so wie es
 * die Partnerstimmen-Folie bereits handhabt. Vorher stand dort "X Mio. €"
 * unmittelbar über dem Satz "Wir zeigen nur Zahlen, die wir belegen können".
 * Genau dieser Widerspruch beschädigt die Glaubwürdigkeit der Präsentation an
 * ihrer empfindlichsten Stelle, nämlich dort, wo sie Ehrlichkeit behauptet.
 */
export const CLOSING_KENNZAHLEN_GEPFLEGT: ClosingKennzahl[] =
  CLOSING_KENNZAHLEN.filter((k) => k.wert.trim().length > 0);
