import type { MouseEvent } from "react";

// Klicks auf diese Elemente gehören dem Element selbst, nicht der Zeile.
// Sonst öffnet etwa das Markieren zur Rückgabe an die Zentrale das Profil,
// oder ein Strg+Klick auf den Namenslink öffnet zwei Tabs.
const EIGENE_KLICKS = "a, button, input, textarea, select, label, [role='checkbox'], [role='button'], [role='menuitem']";

/**
 * Klick auf eine klickbare Tabellenzeile, für `onClick` und `onAuxClick`.
 * Normaler Klick oder Tippen: im selben Tab. Strg/Cmd+Klick oder Mittelklick:
 * neuer Tab, wie bei einem echten Link.
 */
export function zeilenKlick(e: MouseEvent<HTMLElement>, url: string, navigate: (to: string) => void) {
  const zeile = e.currentTarget;
  const ziel = e.target as Element;
  // React reicht Klicks aus Portalen (Tooltip, Dialog) an die Zeile weiter,
  // obwohl sie im DOM woanders liegen. Die sollen nichts öffnen.
  if (!(ziel instanceof Element) || !zeile.contains(ziel)) return;
  const eigenes = ziel.closest(EIGENE_KLICKS);
  if (eigenes && zeile.contains(eigenes)) return;

  if (e.type === "auxclick") {
    // auxclick kommt auch für die rechte Taste, die gehört dem Kontextmenü.
    if (e.button === 1) window.open(url, "_blank", "noopener");
    return;
  }
  if (e.metaKey || e.ctrlKey) {
    window.open(url, "_blank", "noopener");
    return;
  }
  navigate(url);
}
