import { useEffect, type RefObject } from "react";

/** Ab dieser Breite steht die Eingabemaske fest (wie in investmentrechner.css). */
const AB_BREITE = 881;
/** Luft zwischen Maske und unterem Fensterrand. */
const ABSTAND_UNTEN = 16;

/**
 * Die fixierte Eingabemaske reicht genau bis zum unteren Fensterrand
 * (Christian, 19.10.2026).
 *
 * Vorher galt eine feste Höhe `100dvh - 7rem`. Seit Kopfleiste und Banner
 * über dem Inhalt schweben (Liquid Glass), stimmte die Schätzung nicht mehr,
 * und das Ende jedes Abschnitts lag unter dem Fensterrand, etwa „Sonstige
 * Kaufnebenkosten“. Jetzt wird gemessen, wo die Maske oben steht, und die
 * Höhe daraus berechnet, bei jedem Scrollen und jeder Größenänderung.
 */
export function useMaskeBisUnten(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    let rahmen = 0;
    const messen = () => {
      rahmen = 0;
      if (window.innerWidth < AB_BREITE) {
        el.style.maxHeight = "";
        return;
      }
      const oben = Math.max(0, el.getBoundingClientRect().top);
      el.style.maxHeight = `${Math.max(200, window.innerHeight - oben - ABSTAND_UNTEN)}px`;
    };
    const planen = () => {
      if (!rahmen) rahmen = window.requestAnimationFrame(messen);
    };
    messen();
    // `capture`, weil im CRM nicht das Fenster scrollt, sondern `main`.
    window.addEventListener("scroll", planen, { capture: true, passive: true });
    window.addEventListener("resize", planen);
    return () => {
      window.removeEventListener("scroll", planen, { capture: true } as EventListenerOptions);
      window.removeEventListener("resize", planen);
      if (rahmen) window.cancelAnimationFrame(rahmen);
      el.style.maxHeight = "";
    };
  }, [ref]);
}
