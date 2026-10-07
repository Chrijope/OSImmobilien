import { useEffect, useRef } from "react";
import { istLiquidGlas } from "@/lib/designSchalter";

/**
 * Kopfleiste und Banner des CRM-Geruests, zusammengefasst.
 *
 * Ohne Liquid Glass hat dieser Kasten keine eigene Form: `contents` laesst ihn
 * aus dem Layout verschwinden, Kopfleiste und Banner stehen als einzelne
 * Zeilen ueber dem Inhalt.
 *
 * Mit Liquid Glass (`styles/design-liquid.css`) schwebt der Kasten ueber dem
 * Inhalt, und der Inhalt laeuft darunter durch. Damit oben nichts verdeckt
 * wird, braucht der Inhaltsbereich die Unterkante des Kastens als Zahl. Die
 * steht als `--lg-kopf-unterkante` an der Spalte darueber. Gemessen statt
 * gerechnet, aus demselben Grund wie in `LeistenBereich.tsx`: Die Banner sind
 * mal da und mal nicht, und ihre Hoehe haengt am Text.
 */
export function Kopfbereich({ children }: { children: React.ReactNode }) {
  const kasten = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = kasten.current;
    const spalte = el?.parentElement;
    // Heute gibt es nichts zu messen: Der Kasten hat keine eigene Box.
    if (!el || !spalte || !istLiquidGlas()) return;

    const schreibe = () => {
      spalte.style.setProperty("--lg-kopf-unterkante", `${el.offsetTop + el.offsetHeight}px`);
    };
    schreibe();

    const beobachter =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schreibe);
    beobachter?.observe(el);

    return () => {
      beobachter?.disconnect();
      spalte.style.removeProperty("--lg-kopf-unterkante");
    };
  }, []);

  return (
    <div ref={kasten} data-lg="kopfbereich" className="contents">
      {children}
    </div>
  );
}
