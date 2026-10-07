import { useEffect, useState } from "react";

/**
 * Zuschnitt einer klebenden Bühne, gemeinsam für die scrollgesteuerten
 * Abschnitte der Microseite.
 *
 * Zwei Zuschnitte reichen hier nicht. Eine Bühne ist genau eine Bildschirmhöhe
 * hoch, und was an Beschriftung neben eine Grafik passt, hängt an der Breite:
 *
 *   gross   ab 1024 px   zweispaltig, links die Liste, rechts die Grafik
 *   tablet  640–1023 px  einspaltig, keine Liste, dafür eine Textkarte
 *   schmal  unter 640 px wie tablet, aber ohne Schrift in der Grafik
 *
 * `niedrig` ist kein Breiten-, sondern ein Höhenmaß und fängt vor allem das
 * iPad quer ab (1024 × 768): Dort greift die grosse, zweispaltige Fassung,
 * aber in 768 Pixel Höhe passt sie nur mit kleineren Abständen und Schriften.
 *
 * Bewusst über matchMedia statt über Tailwind-Klassen: Ring und Zeitachse
 * stehen genau einmal im Markup. Zwei Fassungen per `hidden`/`sm:block` wären
 * zwei SVG im Baum — doppelt vorgelesen und doppelt gezeichnet.
 */
export interface BuehnenZuschnitt {
  /** Ab 1024 px: zweispaltig mit Liste. */
  gross: boolean;
  /** Ab 1280 px. Dort ist Platz fuer den Satz je Schritt, darunter nicht. */
  weit: boolean;
  /** Unter 640 px: die Grafik trägt keine Schrift mehr. */
  schmal: boolean;
  /** Bildschirm flacher als 820 px, etwa das iPad quer. */
  niedrig: boolean;
}

/** Ausgangswert: die grosse Fassung. Die erste Messung korrigiert sie sofort. */
const ANFANG: BuehnenZuschnitt = { gross: true, weit: false, schmal: false, niedrig: false };

export function useBuehnenZuschnitt(): BuehnenZuschnitt {
  const [zuschnitt, setZuschnitt] = useState<BuehnenZuschnitt>(ANFANG);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const gross = window.matchMedia("(min-width: 1024px)");
    const weit = window.matchMedia("(min-width: 1280px)");
    const schmal = window.matchMedia("(max-width: 639px)");
    const niedrig = window.matchMedia("(max-height: 819px)");
    const abfragen = [gross, weit, schmal, niedrig];
    const pruefen = () =>
      setZuschnitt({ gross: gross.matches, weit: weit.matches, schmal: schmal.matches, niedrig: niedrig.matches });
    pruefen();
    abfragen.forEach((a) => a.addEventListener?.("change", pruefen));
    return () => abfragen.forEach((a) => a.removeEventListener?.("change", pruefen));
  }, []);

  return zuschnitt;
}
