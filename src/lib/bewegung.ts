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
