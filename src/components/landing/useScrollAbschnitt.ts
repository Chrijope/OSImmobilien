import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Scrollgesteuerter Abschnitt, gemeinsamer Baustein für die Microseite.
 *
 * Die Hülle ist mehrere Bildschirme hoch, die Bühne darin klebt oben fest.
 * Wie weit man durch die Hülle gescrollt ist, entscheidet, welcher Schritt
 * gerade aktiv ist. Beim Hochscrollen läuft das von selbst rückwärts.
 *
 * Vier Dinge sind bewusst so gebaut:
 *  - Es wird kein Scrollereignis abgefangen, kein preventDefault, keine Sperre.
 *    Die Hülle ist nur ein hoher Kasten. Wer weiterscrollt, kommt weiter, auch
 *    wenn das Skript nie läuft.
 *  - Der Fortschritt wird aus dem Abstand zwischen Bühne und Hülle berechnet,
 *    nicht aus window.scrollY. Beide Werte stammen aus derselben Messung,
 *    deshalb stimmt die Rechnung auch in der internen Vorschau, die einen
 *    eigenen Scrollbereich hat.
 *  - Lässt sich nichts messen (kein Weg, keine Maße, Testumgebung), dann ist
 *    "gesteuert" falsch und die Abschnitte zeigen alles gleichzeitig. Eine
 *    Animation darf nie darüber entscheiden, ob etwas lesbar ist.
 *  - Bei "prefers-reduced-motion: reduce" entfällt die Hülle ganz, damit gar
 *    kein hoher Leerraum entsteht.
 */

/** Anfang und Ende des Bereichs, in dem die Schritte wechseln. Davor und danach hält der Abschnitt kurz. */
const BAND_START = 0.08;
const BAND_ENDE = 0.86;

export interface ScrollAbschnitt {
  huelleRef: RefObject<HTMLDivElement>;
  buehneRef: RefObject<HTMLDivElement>;
  /** 0 bis 1 innerhalb der Hülle. */
  fortschritt: number;
  /**
   * 0 bis 1 innerhalb des Bandes, in dem die Schritte wechseln.
   *
   * Wer etwas stufenlos mitlaufen lässt — einen Leuchtpunkt auf einem Ring,
   * eine Kurve, die aufgeht — braucht genau diesen Wert und nicht
   * `fortschritt`. Nur so treffen Punkt und Schrittwechsel aufeinander:
   * `aktiv` ist der abgerundete Wert von `bandFortschritt * Schrittzahl`.
   */
  bandFortschritt: number;
  /** Index des aktiven Schritts. */
  aktiv: number;
  /** Falsch heißt: alles gleichzeitig und voll sichtbar zeigen. */
  gesteuert: boolean;
  /** Der Nutzer wünscht reduzierte Bewegung. */
  ruhig: boolean;
}

/** Liest den Wunsch nach reduzierter Bewegung, ohne bei fehlendem matchMedia zu stolpern. */
function ruhigeBewegung(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useScrollAbschnitt(anzahlSchritte: number): ScrollAbschnitt {
  const huelleRef = useRef<HTMLDivElement>(null);
  const buehneRef = useRef<HTMLDivElement>(null);
  // Standard: fertig und sichtbar. Nur eine gelungene Messung dimmt etwas ab.
  const [fortschritt, setFortschritt] = useState(1);
  const [gesteuert, setGesteuert] = useState(false);
  const [ruhig, setRuhig] = useState(ruhigeBewegung);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const abfrage = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pruefen = () => setRuhig(abfrage.matches);
    pruefen();
    abfrage.addEventListener?.("change", pruefen);
    return () => abfrage.removeEventListener?.("change", pruefen);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (ruhig) {
      setGesteuert(false);
      setFortschritt(1);
      return;
    }
    let frame = 0;

    const messen = () => {
      frame = 0;
      const huelle = huelleRef.current;
      const buehne = buehneRef.current;
      if (!huelle || !buehne) return;
      const weg = huelle.offsetHeight - buehne.offsetHeight;
      if (weg <= 0) {
        setGesteuert(false);
        setFortschritt(1);
        return;
      }
      const anteil = (buehne.getBoundingClientRect().top - huelle.getBoundingClientRect().top) / weg;
      setGesteuert(true);
      // Auf Zweihundertstel gerundet: feiner sieht niemand, spart aber Neuzeichnen.
      setFortschritt(Math.round(Math.max(0, Math.min(1, anteil)) * 200) / 200);
    };

    const planen = () => {
      if (!frame) frame = window.requestAnimationFrame(messen);
    };

    messen();
    // Capture erfasst auch den scrollbaren Bereich der internen Vorschau.
    window.addEventListener("scroll", planen, { passive: true, capture: true });
    window.addEventListener("resize", planen);
    const beobachter = typeof ResizeObserver !== "undefined" ? new ResizeObserver(planen) : null;
    if (huelleRef.current) beobachter?.observe(huelleRef.current);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", planen, true);
      window.removeEventListener("resize", planen);
      beobachter?.disconnect();
    };
  }, [ruhig]);

  const roh = (fortschritt - BAND_START) / (BAND_ENDE - BAND_START);
  const bandFortschritt = Math.max(0, Math.min(1, roh));
  const aktiv = Math.max(
    0,
    Math.min(anzahlSchritte - 1, Math.floor(bandFortschritt * anzahlSchritte)),
  );

  return { huelleRef, buehneRef, fortschritt, bandFortschritt, aktiv, gesteuert, ruhig };
}
