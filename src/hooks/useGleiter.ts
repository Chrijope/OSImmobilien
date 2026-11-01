import * as React from "react";

/*
 * Misst das gewählte Element in einer Leiste und schreibt Lage und Größe als
 * CSS-Variablen (--tab-x, --tab-y, --tab-w, --tab-h, --tab-r) an die Leiste.
 * Die gleitende Fläche selbst steht in `styles/bewegung.css` (01.11.2026).
 * Ist nichts Sichtbares gewählt, fehlt `data-gleiter`, und jedes Element
 * zeigt seine eigene Markierung wie bisher.
 */
export function useGleiter(
  leiste: React.RefObject<HTMLElement>,
  aktiv: boolean,
  auswahl: string,
  merkmale: string[],
) {
  React.useLayoutEffect(() => {
    const el = leiste.current;
    if (!el || !aktiv || typeof ResizeObserver === "undefined") return;
    const setzen = () => {
      const treffer = el.querySelectorAll<HTMLElement>(auswahl);
      const ziel = treffer[treffer.length - 1];
      const l = el.getBoundingClientRect();
      const t = ziel?.getBoundingClientRect();
      if (!ziel || !t || t.width === 0) {
        el.removeAttribute("data-gleiter");
        return;
      }
      el.style.setProperty("--tab-x", `${t.left - l.left + el.scrollLeft - el.clientLeft}px`);
      el.style.setProperty("--tab-y", `${t.top - l.top + el.scrollTop - el.clientTop}px`);
      el.style.setProperty("--tab-w", `${t.width}px`);
      el.style.setProperty("--tab-h", `${t.height}px`);
      if (!el.hasAttribute("data-gleiter")) el.style.setProperty("--tab-r", getComputedStyle(ziel).borderRadius);
      el.setAttribute("data-gleiter", "");
    };
    setzen();
    const mo = new MutationObserver(setzen);
    mo.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: merkmale });
    const ro = new ResizeObserver(setzen);
    ro.observe(el);
    return () => {
      mo.disconnect();
      ro.disconnect();
    };
    // Auswahl und Merkmale sind feste Texte je Aufrufer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leiste, aktiv]);
}
