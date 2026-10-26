import { useCallback, type KeyboardEvent } from "react";
import { istEingabeZiel } from "@/lib/tastenkuerzel";

/*
 * ↑ ↓ ↵ in Listen (A8, 26.10.2026), wie in einer Liste unter macOS.
 *
 * Zeilen tragen `data-listenzeile`. Nur die erste ist per Tab erreichbar
 * (`tabIndex` 0, die übrigen -1), damit die Liste ein einziger Tab-Halt ist.
 * Pfeile bewegen den Fokus, ↵ öffnet die Zeile über ihren eigenen Klick, also
 * genau wie mit der Maus. In Feldern und Kästchen der Zeile greift nichts.
 */
export function useListenTastatur() {
  const onKeyDown = useCallback((e: KeyboardEvent<HTMLElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey || istEingabeZiel(e.target)) return;
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter") return;
    const zeilen = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-listenzeile]"));
    const aktuell = (e.target as HTMLElement).closest<HTMLElement>("[data-listenzeile]");
    const index = aktuell ? zeilen.indexOf(aktuell) : -1;
    if (e.key === "Enter") {
      // Nur, wenn die Zeile selbst den Fokus hat, nicht ein Knopf darin.
      if (aktuell && e.target === aktuell) {
        e.preventDefault();
        aktuell.click();
      }
      return;
    }
    const ziel = e.key === "ArrowDown" ? zeilen[Math.min(index + 1, zeilen.length - 1)] : zeilen[Math.max(index - 1, 0)];
    if (ziel) {
      e.preventDefault();
      ziel.focus();
    }
  }, []);
  return { onKeyDown };
}

/** Eigenschaften einer Listenzeile: die erste ist der Tab-Halt der Liste. */
export function listenzeile(index: number) {
  return { "data-listenzeile": "", tabIndex: index === 0 ? 0 : -1 } as const;
}
