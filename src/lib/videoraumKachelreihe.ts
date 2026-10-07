/**
 * Ob die Kachelreihe waehrend des Bildschirmteilens ausgeklappt ist.
 *
 * Christian am 18.09.2026: „er soll aber am Handy selbst entscheiden, ob er
 * meine Kachel einklappt oder ausgeklappt lässt." Auf einem Telefon teilen
 * sich der geteilte Inhalt und die Kachelreihe eine sehr kleine Flaeche, und
 * wem der Inhalt wichtiger ist, der soll die Reihe wegnehmen koennen.
 *
 * Gemerkt wird die Wahl nur fuer die Dauer des Gespraechs. Ein Gast hat kein
 * Konto, es gibt also nichts, woran sich eine dauerhafte Einstellung haengen
 * liesse; der `sessionStorage` endet mit dem Tab und passt damit genau.
 *
 * Alle Zugriffe liegen in `try`. In einem privaten Fenster und bei
 * gesperrten Seitendaten wirft schon das blosse Lesen, und daran darf der
 * Videoraum nicht scheitern. Faellt der Speicher aus, gilt die Vorgabe:
 * ausgeklappt. Der haeufigere Fall soll nicht mit einer versteckten Kachel
 * beginnen.
 */

const SCHLUESSEL = "videoraum-kachelreihe";
const EINGEKLAPPT = "eingeklappt";

/** Ist die Kachelreihe ausgeklappt? Vorgabe ja. */
export function ladeKachelreihe(): boolean {
  try {
    return sessionStorage.getItem(SCHLUESSEL) !== EINGEKLAPPT;
  } catch {
    return true;
  }
}

/** Die Wahl fuer dieses Gespraech merken. */
export function merkeKachelreihe(ausgeklappt: boolean): void {
  try {
    if (ausgeklappt) sessionStorage.removeItem(SCHLUESSEL);
    else sessionStorage.setItem(SCHLUESSEL, EINGEKLAPPT);
  } catch {
    /* Dann gilt die Wahl eben nur, solange die Ansicht steht. */
  }
}
