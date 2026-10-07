/**
 * Das Fensterlicht auf den Glaskarten.
 *
 * Eine Karte faengt an der Kante, die dem Mauszeiger am naechsten ist, ein
 * dezentes Licht. Mehr nicht: Die Neigung der Kacheln aus dem Muster und die
 * mitwandernde Zahl hat Christian am 23.09.2026 abgelehnt, sie kommen hier
 * bewusst nicht vor.
 *
 * Es kostet fast nichts:
 *   * Es gibt genau EINEN Beobachter am Dokument, nicht einen je Karte.
 *   * Geschrieben werden nur zwei CSS-Variablen an der einen Karte unter dem
 *     Zeiger, gebuendelt auf einen Bildaufbau (requestAnimationFrame).
 *   * Wie das Licht aussieht, steht in `styles/design-liquid.css`; hier wird
 *     nur gerechnet.
 *
 * Aus bleibt es bei Touch (kein Zeiger, der schwebt), bei "Bewegung
 * reduzieren" und ohne Liquid Glass.
 */

// Die Handbuch-Seite hat eigene Karten ohne `data-ui`, ihr Licht steht in
// `styles/handbuchSeiteLiquid.css`.
const KARTE = '[data-ui="card"], .hb .hb-karte';

export function starteGlasLicht(): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const feinerZeiger = window.matchMedia("(hover: hover) and (pointer: fine)");
  const wenigBewegung = window.matchMedia("(prefers-reduced-motion: reduce)");

  let aktiv: HTMLElement | null = null;
  let letztesEreignis: PointerEvent | null = null;
  let geplant = false;

  const erlaubt = () =>
    document.documentElement.dataset.glas === "liquid" && feinerZeiger.matches && !wenigBewegung.matches;

  const loslassen = (el: HTMLElement) => {
    el.style.removeProperty("--lx");
    el.style.removeProperty("--ly");
    el.removeAttribute("data-lg-nah");
  };

  const zeichne = () => {
    geplant = false;
    const e = letztesEreignis;
    if (!e) return;
    const ziel = e.target instanceof Element ? e.target.closest<HTMLElement>(KARTE) : null;

    if (aktiv && aktiv !== ziel) {
      loslassen(aktiv);
      aktiv = null;
    }
    if (!ziel || !erlaubt()) return;

    const r = ziel.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    // 0 bis 100 Prozent innerhalb der Karte.
    const x = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
    const y = Math.min(Math.max((e.clientY - r.top) / r.height, 0), 1);
    ziel.style.setProperty("--lx", `${(x * 100).toFixed(1)}%`);
    ziel.style.setProperty("--ly", `${(y * 100).toFixed(1)}%`);
    ziel.setAttribute("data-lg-nah", "");
    aktiv = ziel;
  };

  const beiBewegung = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    letztesEreignis = e;
    if (!geplant) {
      geplant = true;
      requestAnimationFrame(zeichne);
    }
  };

  const beimVerlassen = () => {
    if (aktiv) loslassen(aktiv);
    aktiv = null;
  };

  document.addEventListener("pointermove", beiBewegung, { passive: true });
  document.addEventListener("pointerleave", beimVerlassen);
  window.addEventListener("blur", beimVerlassen);

  return () => {
    document.removeEventListener("pointermove", beiBewegung);
    document.removeEventListener("pointerleave", beimVerlassen);
    window.removeEventListener("blur", beimVerlassen);
    beimVerlassen();
  };
}
