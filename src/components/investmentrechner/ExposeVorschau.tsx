import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/** Breite einer A4-Seite in Bildpunkten bei 96 dpi (210 mm). */
const A4_BREITE_PX = 794;

/**
 * Rahmen, der das Exposé wie eine echte Druckvorschau anzeigt.
 *
 * Ohne diesen Rahmen schrumpft nur die Seitenbreite mit dem Fenster, während
 * Schriftgrößen und Innenabstände in Millimetern und rem unverändert bleiben.
 * In einem schmalen Fenster laufen dadurch die Beschriftungen aus den
 * Kennzahlkarten heraus und überdecken die Nachbarkarte. Deshalb wird die
 * Seite immer in voller A4-Breite aufgebaut und als Ganzes verkleinert. Die
 * Vorschau zeigt damit exakt das, was später auf dem Papier steht.
 *
 * Verkleinert wird über `zoom`, nicht über `transform`: `zoom` verändert den
 * tatsächlichen Platzbedarf, deshalb bleibt die Höhe des Bereichs richtig und
 * es entsteht kein Leerraum unter dem Dokument.
 */
export function ExposeVorschau({ children }: { children: ReactNode }) {
  const rahmen = useRef<HTMLDivElement>(null);
  const [faktor, setFaktor] = useState(1);

  useEffect(() => {
    const element = rahmen.current;
    if (!element) return;
    const messen = () => {
      // Der Rahmen selbst wird nie gezoomt, seine Breite ist deshalb stabil
      // und die Messung kann sich nicht selbst aufschaukeln.
      const breite = element.clientWidth;
      if (breite > 0) setFaktor(Math.min(1, breite / A4_BREITE_PX));
    };
    messen();
    const beobachter = new ResizeObserver(messen);
    beobachter.observe(element);
    return () => beobachter.disconnect();
  }, []);

  return (
    <div className="expose-scale" ref={rahmen} style={{ "--expose-zoom": faktor } as CSSProperties}>
      {children}
    </div>
  );
}
