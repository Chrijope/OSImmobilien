import { useEffect, useState } from "react";

/**
 * Hat der Nutzer im Betriebssystem „Bewegung reduzieren" eingeschaltet?
 *
 * Im CSS steht diese Regel schon an vielen Stellen (`prefers-reduced-motion`
 * in `index.css` und den Stildateien). Wo eine Bewegung aber nicht von einer
 * Animation kommt, sondern von einem Zeitgeber in JavaScript, hilft CSS nicht:
 * Ein Bild, das alle drei Sekunden ausgetauscht wird, bewegt sich auch ohne
 * Animation. Dieser Hook schaltet solche Zeitgeber ab.
 *
 * Die Einstellung kann sich im laufenden Betrieb ändern, deshalb wird auf die
 * Medienabfrage gehört und beim Verlassen wieder abgeräumt.
 */
export function useReduzierteBewegung(): boolean {
  const [reduziert, setReduziert] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const abfrage = window.matchMedia("(prefers-reduced-motion: reduce)");
    const beiAenderung = () => setReduziert(abfrage.matches);
    beiAenderung();
    // Ältere Safari-Fassungen kennen nur addListener.
    if (abfrage.addEventListener) {
      abfrage.addEventListener("change", beiAenderung);
      return () => abfrage.removeEventListener("change", beiAenderung);
    }
    abfrage.addListener?.(beiAenderung);
    return () => abfrage.removeListener?.(beiAenderung);
  }, []);

  return reduziert;
}
