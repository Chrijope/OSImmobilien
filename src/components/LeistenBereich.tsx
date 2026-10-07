import { useEffect, useRef } from "react";

/**
 * Der Streifenbereich ganz oben und seine gemessene Hoehe.
 *
 * Hier hinein gehoert alles, was ueber dem CRM steht und den Inhalt nach unten
 * schiebt: die Videoraumleiste eines minimierten Gespraechs und der Hinweis auf
 * eine neue Fassung. Beide sind mal da und mal nicht, und die Videoraumleiste
 * aendert ihre Hoehe auch noch, je nachdem ob die Videos aufgeklappt sind.
 *
 * Warum gemessen und nicht gerechnet: Christian hat am 18.09.2026 im Videoraum
 * auf „Kleiner" geklickt und gesehen, dass die Kopfzeile nach unten rutscht,
 * die Seitenleiste aber oben stehen bleibt. Beide standen dadurch versetzt
 * zueinander. Die Ursache steht in `components/ui/sidebar.tsx`: Die sichtbare
 * Seitenleiste haengt auf `fixed inset-y-0` am Fensterrand. Sie liegt gar nicht
 * im Fluss und kann deshalb von nichts geschoben werden.
 *
 * Also braucht sie die Hoehe als Zahl. Die steht hier als CSS-Eigenschaft
 * `--leisten-hoehe` am Dokument, und `index.css` setzt die Seitenleiste
 * entsprechend tiefer an. Gemessen statt gerechnet, weil eine Summe aus
 * Klassennamen schon heute falsch waere: Die Wurzelschrift steht auf 90
 * Prozent, aus `h-11` werden dadurch keine 44 Pixel, sondern rund 38,5. Genau
 * an solchen Summen laufen zwei Stellen auseinander.
 *
 * Steht nichts oben, ist die Hoehe null und alles ist wie vorher.
 */
export function LeistenBereich({ children }: { children: React.ReactNode }) {
  const kasten = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = kasten.current;
    if (!el) return;

    const schreibe = () => {
      const hoehe = el.getBoundingClientRect().height;
      document.documentElement.style.setProperty("--leisten-hoehe", `${hoehe}px`);
    };

    schreibe();

    /*
     * `ResizeObserver` statt eines Ereignisses: Die Leiste waechst und
     * schrumpft aus sich heraus, etwa wenn die Videos aufgeklappt werden, und
     * dafuer gibt es kein Ereignis, auf das man hoeren koennte. Aeltere
     * Browser ohne die Schnittstelle behalten den einmal geschriebenen Wert,
     * das ist schlechter als mitwachsend, aber besser als nichts.
     */
    const beobachter =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schreibe);
    beobachter?.observe(el);

    /*
     * Das Abraeumen gilt in jedem Fall, auch ohne Beobachter. Bliebe die
     * Eigenschaft stehen, stuende die Seitenleiste weiter tiefer, obwohl oben
     * laengst nichts mehr ist.
     */
    return () => {
      beobachter?.disconnect();
      document.documentElement.style.removeProperty("--leisten-hoehe");
    };
  }, []);

  return (
    <div ref={kasten} className="shrink-0">
      {children}
    </div>
  );
}
