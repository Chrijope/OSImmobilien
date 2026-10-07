const zeitgeber = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/**
 * Das Element, an dem die Kontur zu sehen ist.
 *
 * Manche Sprungziele sind nur eine Hülle um eine Karte, etwa die
 * Objektauswahl (`card-objektauswahl-<id>`). Die Kontur liegt innen
 * (`outline-offset: -2px`, siehe `kundenprofil.css`). Im Liquid Glass ist
 * jede Karte `position: relative` mit Glasfilter (`design-liquid.css`) und
 * wird damit über die Kontur der Hülle gezeichnet: Statt Orange sah man bis
 * zum 27.09.2026 nur die graue Glasfläche. Deshalb bekommt in dem Fall die
 * erste Karte in der Hülle die Kontur.
 */
function sichtbaresZiel(element: HTMLElement): HTMLElement {
  if (element.getAttribute("data-ui") === "card") return element;
  const karte = Array.from(element.children).find((kind) => kind.getAttribute("data-ui") === "card");
  return karte instanceof HTMLElement ? karte : element;
}

function entferneMarkierung(element: HTMLElement) {
  clearTimeout(zeitgeber.get(element));
  zeitgeber.delete(element);
  element.removeAttribute("data-profil-sprungziel");
}

/**
 * Eigene Kontur, unabhängig von den Schatten und Rahmen der jeweiligen Karte.
 *
 * Es ist immer nur ein Kasten markiert: Eine neue Markierung nimmt jede
 * andere zurück. `bleibend` nutzt die Abschnittsleiste des Investments
 * (05.10.2026): Dort bleibt der Rahmen stehen, bis ein anderer Abschnitt
 * angeklickt wird. Alle übrigen Sprünge blenden ihn nach 2,5 Sekunden aus.
 */
export function markiereProfilAbschnitt(sprungziel: HTMLElement, { bleibend = false }: { bleibend?: boolean } = {}) {
  const element = sichtbaresZiel(sprungziel);
  document.querySelectorAll<HTMLElement>("[data-profil-sprungziel]").forEach((alt) => {
    if (alt !== element) entferneMarkierung(alt);
  });
  clearTimeout(zeitgeber.get(element));
  zeitgeber.delete(element);
  element.setAttribute("data-profil-sprungziel", "aktiv");
  if (bleibend) return;
  zeitgeber.set(element, setTimeout(() => {
    element.removeAttribute("data-profil-sprungziel");
    zeitgeber.delete(element);
  }, 2500));
}
