/**
 * Energieeffizienzskala A+ bis H nach GEG Anlage 10 (Endenergie in kWh je m²
 * und Jahr). Die Objektseite und das Exposé zeigen die Skala als Band, das
 * PDF (E4) nutzt dieselben Stufen.
 *
 * Reine Funktionen ohne Oberfläche, damit sie sich ohne Attrappen testen
 * lassen.
 */

export interface Energiestufe {
  klasse: string;
  /** Untergrenze der Stufe in kWh/(m²·a), einschließlich. */
  von: number;
  /** Obergrenze der Stufe, ausschließlich. Für H offen. */
  bis: number | null;
  /** Farbe der Stufe als HSL-Tripel, von Grün nach Rot wie auf dem Energieausweis. */
  farbe: string;
}

export const ENERGIESTUFEN: Energiestufe[] = [
  { klasse: "A+", von: 0, bis: 30, farbe: "hsl(145 60% 36%)" },
  { klasse: "A", von: 30, bis: 50, farbe: "hsl(120 52% 42%)" },
  { klasse: "B", von: 50, bis: 75, farbe: "hsl(90 55% 45%)" },
  { klasse: "C", von: 75, bis: 100, farbe: "hsl(65 65% 46%)" },
  { klasse: "D", von: 100, bis: 130, farbe: "hsl(48 90% 50%)" },
  { klasse: "E", von: 130, bis: 160, farbe: "hsl(36 92% 52%)" },
  { klasse: "F", von: 160, bis: 200, farbe: "hsl(24 90% 52%)" },
  { klasse: "G", von: 200, bis: 250, farbe: "hsl(10 80% 50%)" },
  { klasse: "H", von: 250, bis: null, farbe: "hsl(0 72% 44%)" },
];

/** Oberes Ende des Bands zur Anzeige. Alles darüber liegt in H am rechten Rand. */
export const SKALA_MAXIMUM = 300;

/** Effizienzklasse zu einem Endenergiekennwert, undefined ohne gültige Zahl. */
export function energieklasseAusKennwert(kennwert: number | null | undefined): string | undefined {
  if (typeof kennwert !== "number" || !Number.isFinite(kennwert) || kennwert < 0) return undefined;
  const stufe = ENERGIESTUFEN.find((s) => kennwert >= s.von && (s.bis === null || kennwert < s.bis));
  return stufe?.klasse;
}

/**
 * Eine gepflegte Klasse normalisieren („d", „Klasse D", „A +") und gegen
 * die Skala prüfen. Unbekanntes bleibt undefined.
 */
export function energieklasseNormalisieren(klasse: string | null | undefined): string | undefined {
  if (!klasse) return undefined;
  const k = klasse.replace(/klasse/i, "").replace(/\s+/g, "").toUpperCase();
  return ENERGIESTUFEN.some((s) => s.klasse === k) ? k : undefined;
}

/**
 * Welche Klasse die Skala hervorhebt: die gepflegte Klasse, sonst die aus
 * dem Kennwert berechnete. Weichen beide voneinander ab, gewinnt der
 * Kennwert, weil er die Pflichtangabe aus dem Ausweis ist; der Hinweis sagt
 * das dazu.
 */
export function energieskalaBewerten(eingabe: { klasse?: string | null; kennwert?: number | null }): {
  klasse?: string;
  ausKennwert?: string;
  /** Position des Kennwerts im Band von 0 bis 100 Prozent, undefined ohne Kennwert. */
  positionProzent?: number;
  hinweis?: string;
} {
  const gepflegt = energieklasseNormalisieren(eingabe.klasse);
  const ausKennwert = energieklasseAusKennwert(eingabe.kennwert);
  const positionProzent =
    typeof eingabe.kennwert === "number" && Number.isFinite(eingabe.kennwert) && eingabe.kennwert >= 0
      ? Math.min(100, (eingabe.kennwert / SKALA_MAXIMUM) * 100)
      : undefined;
  let hinweis: string | undefined;
  if (gepflegt && ausKennwert && gepflegt !== ausKennwert) {
    hinweis = `Im Objekt ist Klasse ${gepflegt} gepflegt, der Kennwert ergibt Klasse ${ausKennwert}. Die Skala zeigt den Kennwert.`;
  }
  return { klasse: ausKennwert ?? gepflegt, ausKennwert, positionProzent, hinweis };
}
