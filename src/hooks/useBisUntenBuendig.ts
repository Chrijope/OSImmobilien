import { useLayoutEffect, useRef, useState } from "react";

/**
 * Höhe, mit der ein Bereich genau dort endet, wo die Seitenleiste unten
 * aufhört (01.11.2026, Kalender). Gemessen wird beim Laden und bei jeder
 * Größenänderung; unter 1024 px Breite (Seitenleiste eingeklappt) null, dann
 * fließt der Inhalt wie gewohnt. `abstandUnten` gleicht den Innenabstand des
 * Hauptbereichs aus, damit nichts scrollt.
 */
export function useBisUntenBuendig<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [mass, setMass] = useState<{ hoehe: number; abstandUnten: number } | null>(null);

  useLayoutEffect(() => {
    const messen = () => {
      const el = ref.current;
      if (!el || window.innerWidth < 1024) return setMass(null);
      const haupt = el.closest("main");
      const leiste = document.querySelector('[data-sidebar="sidebar"]');
      const unten = leiste ? Math.max(0, window.innerHeight - leiste.getBoundingClientRect().bottom) : 12;
      const polster = haupt ? parseFloat(getComputedStyle(haupt).paddingBottom) || 0 : 0;
      // Lage im Fenster, als wäre der Hauptbereich ganz oben gescrollt.
      const oben = el.getBoundingClientRect().top + (haupt?.scrollTop ?? 0);
      const hoehe = Math.max(420, Math.round(window.innerHeight - oben - unten));
      setMass({ hoehe, abstandUnten: Math.round(unten - polster) });
    };
    messen();
    window.addEventListener("resize", messen);
    return () => window.removeEventListener("resize", messen);
  }, []);

  return { ref, mass };
}
