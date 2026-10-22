import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

/**
 * Höhe vom oberen Rand eines Elements bis zum unteren Browserrand, für Seiten
 * mit fester Knopfleiste unten (Selbstauskunft, 22.10.2026).
 *
 * Im CRM liegt die Seite im scrollenden `main` des Seitenrahmens, mit
 * Kopfleiste darüber und Innenabstand. `100dvh` war dort zu hoch (die Leiste
 * rutschte unter den Rand), Prozentangaben scheiterten an den Zwischenebenen.
 * Gemessen passt es immer: Höhe bis zum Fensterrand, und der untere
 * Innenabstand des Rahmens wird mit einem negativen Außenabstand überbrückt,
 * damit die Leiste bündig am Rand sitzt und nichts scrollt.
 *
 * ponytail: gemessen bei Anlage und Fenstergröße; ändert sich die Höhe der
 * Kopfleiste später (Banner ein- oder ausgeblendet), erst beim nächsten
 * Größenwechsel. Bei Bedarf einen ResizeObserver auf den Kopfbereich setzen.
 */
export function useHoeheBisFensterrand(ref: RefObject<HTMLElement>): CSSProperties | undefined {
  const [masse, setMasse] = useState<CSSProperties>();
  useLayoutEffect(() => {
    const messen = () => {
      const el = ref.current;
      if (!el) return;
      const rahmen = el.closest("main");
      const oben = el.getBoundingClientRect().top + (rahmen?.scrollTop ?? 0);
      const untenAbstand = rahmen ? parseFloat(getComputedStyle(rahmen).paddingBottom) || 0 : 0;
      const hoehe = Math.max(320, Math.floor(window.innerHeight - oben));
      setMasse({ height: hoehe, marginBottom: -untenAbstand });
    };
    messen();
    // Banner über der Seite laden manchmal etwas später nach.
    const spaeter = window.setTimeout(messen, 400);
    window.addEventListener("resize", messen);
    return () => {
      window.clearTimeout(spaeter);
      window.removeEventListener("resize", messen);
    };
  }, [ref]);
  return masse;
}
