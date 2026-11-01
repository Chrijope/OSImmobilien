import { useLayoutEffect, useRef, type RefObject } from "react";

/*
 * Listen mit Kontinuität (01.11.2026): Kommt ein Eintrag dazu oder ändert
 * sich die Reihenfolge, rücken die anderen weich an ihren neuen Platz, statt
 * zu springen; neue Einträge blenden ein. Gemessen wird nach jedem Zeichnen
 * (FLIP), bewegt wird nur `translate`. Ohne Web Animations oder mit
 * „Bewegung reduzieren“ passiert nichts.
 */
export function useWeichNachruecken(liste: RefObject<HTMLElement>, auswahl: string) {
  const vorher = useRef<Map<string, number> | null>(null);

  useLayoutEffect(() => {
    const el = liste.current;
    if (!el) return;
    const ruhig = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const jetzt = new Map<string, number>();
    const eintraege = Array.from(el.querySelectorAll<HTMLElement>(auswahl));
    // offsetTop statt Bildschirmlage: Scrollen zählt nicht als Bewegung.
    for (const e of eintraege) jetzt.set(e.id, e.offsetTop);
    const alt = vorher.current;
    vorher.current = jetzt;
    if (!alt || ruhig) return;
    for (const e of eintraege) {
      if (typeof e.animate !== "function") return;
      const war = alt.get(e.id);
      const ist = jetzt.get(e.id)!;
      if (war === undefined) {
        e.animate([{ opacity: 0, translate: "0 -6px" }, { opacity: 1, translate: "0 0" }], { duration: 280, easing: "cubic-bezier(0.25, 0.1, 0.25, 1)" });
      } else if (Math.abs(war - ist) > 1) {
        e.animate([{ translate: `0 ${war - ist}px` }, { translate: "0 0" }], { duration: 320, easing: "cubic-bezier(0.25, 0.1, 0.25, 1)" });
      }
    }
  });
}
