import { useEffect, useState } from "react";
import { EXPOSE_ABSCHNITTE, abschnittAnker, type ExposeAbschnittId } from "@/lib/exposeInhalt";

/**
 * Welcher Abschnitt gerade im Bild ist: der unterste Abschnitt, dessen
 * Beginn über der oberen Fensterhälfte liegt. Ein IntersectionObserver wäre
 * eleganter, meldet aber bei elf unterschiedlich hohen Abschnitten
 * mehrere zugleich; die Scroll-Position ist eindeutig.
 */
export function useAktiverAbschnitt(): ExposeAbschnittId {
  const [aktiv, setAktiv] = useState<ExposeAbschnittId>("start");
  useEffect(() => {
    let angefordert = false;
    const messen = () => {
      angefordert = false;
      const schwelle = window.innerHeight * 0.4;
      let treffer: ExposeAbschnittId = "start";
      for (const a of EXPOSE_ABSCHNITTE) {
        const el = document.getElementById(abschnittAnker(a.id));
        if (!el) continue;
        const r = el.getBoundingClientRect();
        // Ein Abschnitt ohne Ausdehnung ist nicht gezeichnet und zählt nicht.
        if (r.height === 0) continue;
        if (r.top <= schwelle) treffer = a.id;
      }
      setAktiv(treffer);
    };
    const onScroll = () => {
      if (angefordert) return;
      angefordert = true;
      window.requestAnimationFrame(messen);
    };
    messen();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);
  return aktiv;
}

/** Zum Abschnitt springen, sanft; der Abstand zur Kopfzeile kommt über scroll-mt am Abschnitt. */
export function springeZuAbschnitt(id: ExposeAbschnittId) {
  const el = document.getElementById(abschnittAnker(id));
  if (!el) return;
  if (typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior: "smooth", block: "start" });
}
