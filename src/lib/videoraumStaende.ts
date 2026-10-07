/**
 * Ton und Kamera der anderen im Raum.
 *
 * Eine abgeschaltete Kamera sieht auf der Leitung genauso aus wie eine
 * Leitung, die gerade nichts liefert: schwarz. Deshalb sagt es jeder
 * ausdruecklich, siehe `RegieBefehl` mit den Arten "tonstand" und "bildstand".
 *
 * Das Merken selbst ist eine reine Rechnung ohne Browser und steht deshalb
 * hier. Zwei Stellen brauchen es: die Gespraechsansicht, die die Meldungen
 * auch beantwortet, und der Zusammenhang oberhalb der Seiten, der die Kacheln
 * im schwebenden Fenster und in der Leiste versorgt, wenn die Ansicht gerade
 * gar nicht auf dem Bildschirm steht.
 */

export interface Stand {
  tonAn: boolean;
  bildAn: boolean;
}

/**
 * Was gilt, solange niemand etwas gemeldet hat. Der haeufigere Fall soll nicht
 * mit einem falschen Hinweis beginnen.
 */
export const STAND_AN: Stand = { tonAn: true, bildAn: true };

/** Eine Sammlung von Staenden, nach der Kennung der Gegenstelle. */
export type Staende = Record<string, Stand>;

/**
 * Eine Meldung uebernehmen. Gibt die alte Sammlung unveraendert zurueck, wenn
 * sich nichts aendert: Sonst zeichnete React bei jeder eingehenden Meldung neu,
 * auch wenn sie nur bestaetigt, was ohnehin schon gilt.
 */
export function uebernehmeStand(
  bisher: Staende,
  von: string,
  art: "tonstand" | "bildstand",
  an: boolean,
): Staende {
  const alt = bisher[von] ?? STAND_AN;
  const neu = art === "tonstand" ? { ...alt, tonAn: an } : { ...alt, bildAn: an };
  if (bisher[von] && alt.tonAn === neu.tonAn && alt.bildAn === neu.bildAn) return bisher;
  return { ...bisher, [von]: neu };
}

/**
 * Wer weg ist, hinterlaesst keinen Stand. Sonst stuende beim naechsten
 * Teilnehmer mit derselben Kennung ein alter Hinweis.
 */
export function entferneAbwesende(bisher: Staende, vorhandene: readonly string[]): Staende {
  const uebrig = Object.keys(bisher).filter((k) => vorhandene.includes(k));
  if (uebrig.length === Object.keys(bisher).length) return bisher;
  return Object.fromEntries(uebrig.map((k) => [k, bisher[k]]));
}
