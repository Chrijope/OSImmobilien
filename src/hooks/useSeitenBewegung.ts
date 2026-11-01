import { useEffect, useRef, useState } from "react";

/*
 * Bewegung im CRM-Rahmen wie bei Apple (01.11.2026):
 *  - Seitenwechsel: der Inhalt blendet weich ein und hebt sich um 6px,
 *    Kopfleiste und Seitenleiste bleiben stehen.
 *  - Scrollen: Ab 4px setzt die Spalte `data-gescrollt`; die Kopfleiste wird
 *    dann einen kräftigeren Schatten (`styles/bewegung.css`).
 * Ohne Web Animations oder mit „Bewegung reduzieren“ wechselt die Seite ohne Einblenden.
 */
export function useSeitenBewegung(pfad: string) {
  // Als Zustand statt Ref: Der Rahmen erscheint erst nach dem Laden, die
  // Effekte sollen dann laufen und nicht erst beim nächsten Seitenwechsel.
  const [spalte, setSpalte] = useState<HTMLDivElement | null>(null);
  const [haupt, setHaupt] = useState<HTMLElement | null>(null);
  const ersterPfad = useRef<string | null>(null);

  useEffect(() => {
    const el = haupt;
    if (!el) return;
    if (ersterPfad.current === null) {
      ersterPfad.current = pfad;
      return;
    }
    const ruhig = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (ruhig || typeof el.animate !== "function") return;
    // Nur Deckkraft und `translate`: Danach bleibt nichts am Element hängen.
    el.animate(
      [
        { opacity: 0, translate: "0 6px" },
        { opacity: 1, translate: "0 0" },
      ],
      { duration: 280, easing: "cubic-bezier(0.25, 0.1, 0.25, 1)" },
    );
  }, [pfad, haupt]);

  useEffect(() => {
    const el = haupt;
    const s = spalte;
    if (!el || !s) return;
    const pruefen = () => s.toggleAttribute("data-gescrollt", el.scrollTop > 4);
    pruefen();
    el.addEventListener("scroll", pruefen, { passive: true });
    return () => el.removeEventListener("scroll", pruefen);
  }, [pfad, haupt, spalte]);

  return { spalteRef: setSpalte, hauptRef: setHaupt };
}
