import type React from "react";
/*
 * Kleine Bewegungen per Web Animations (01.11.2026).
 *
 * wegGleiten: Eine erledigte Zeile gleitet zur Seite weg und klappt zusammen, damit die
 * Liste darunter weich nachrückt statt zu springen (01.11.2026). Ohne Web
 * Animations oder mit „Bewegung reduzieren“ kehrt es sofort zurück.
 */
export async function wegGleiten(el: HTMLElement | null): Promise<void> {
  if (!el || typeof el.animate !== "function") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const hoehe = el.getBoundingClientRect().height;
  try {
    await el.animate(
      [
        { opacity: 1, translate: "0 0", height: `${hoehe}px`, overflow: "hidden" },
        { opacity: 0, translate: "32px 0", height: `${hoehe}px`, overflow: "hidden", offset: 0.55 },
        { opacity: 0, translate: "32px 0", height: "0px", paddingTop: "0px", paddingBottom: "0px", borderWidth: "0px", marginTop: "0px", overflow: "hidden" },
      ],
      { duration: 360, easing: "cubic-bezier(0.25, 0.1, 0.25, 1)", fill: "forwards" },
    ).finished;
  } catch {
    // Abgebrochen, etwa weil die Zeile schon entfernt wurde: nichts zu tun.
  }
}

/** Ein abgelehnter Zug: Die Karte federt kurz, wie ein Nein am iPhone. */
export function zurueckFedern(el: HTMLElement | null): void {
  if (!el || typeof el.animate !== "function") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  el.animate(
    [{ translate: "0 0" }, { translate: "-8px 0" }, { translate: "6px 0" }, { translate: "-3px 0" }, { translate: "0 0" }],
    { duration: 420, easing: "cubic-bezier(0.25, 0.1, 0.25, 1)" },
  );
}

/**
 * Beim Greifen hebt sich die Karte: Das Ziehbild ist eine Kopie mit großem
 * Schatten und leicht vergrößert, statt der flachen Kopie des Browsers.
 */
export function angehobenesZiehbild(e: React.DragEvent<HTMLElement>): void {
  const karte = e.currentTarget;
  if (!e.dataTransfer || typeof e.dataTransfer.setDragImage !== "function") return;
  const r = karte.getBoundingClientRect();
  const kopie = karte.cloneNode(true) as HTMLElement;
  kopie.removeAttribute("data-gezogen");
  Object.assign(kopie.style, {
    position: "fixed",
    top: "-1000px",
    left: "-1000px",
    width: `${r.width}px`,
    pointerEvents: "none",
    background: "hsl(var(--card))",
    borderRadius: "12px",
    boxShadow: "0 18px 40px -12px rgba(18, 54, 42, .45), 0 4px 10px -4px rgba(18, 54, 42, .25)",
    scale: "1.03",
  });
  document.body.appendChild(kopie);
  e.dataTransfer.setDragImage(kopie, e.clientX - r.left, e.clientY - r.top);
  // Der Browser fotografiert das Bild sofort; danach wird die Kopie nicht mehr gebraucht.
  window.setTimeout(() => kopie.remove(), 0);
}
