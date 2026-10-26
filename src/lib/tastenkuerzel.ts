/**
 * Tastenkürzel des CRM (A8, 26.10.2026), an einer Stelle.
 *
 * Regeln:
 *   - Einfache Tasten (?, N, T, Pfeile) greifen nie, während jemand in ein
 *     Feld tippt, und nie mit Strg, Alt oder Cmd, damit sie keinem
 *     Browserkürzel in die Quere kommen.
 *   - ⌘ ↵ (Strg ↵) speichert in einem offenen Dialog, auch aus einem Feld
 *     heraus; das ist der Sinn des Kürzels.
 *   - ⌘ K (Strg K) setzt den Fokus in die Suche, siehe GlobaleSuche.
 */

/** Tippt der Nutzer gerade in ein Feld? Dann bleiben einfache Tasten Text. */
export function istEingabeZiel(ziel: EventTarget | null): boolean {
  if (!(ziel instanceof HTMLElement)) return false;
  if (ziel.isContentEditable) return true;
  const tag = ziel.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const typ = (ziel as HTMLInputElement).type;
    return !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"].includes(typ);
  }
  return ziel.getAttribute("role") === "combobox" || ziel.getAttribute("role") === "textbox";
}

/** Läuft der Rechner unter macOS oder iOS? Dann ⌘, sonst Strg. */
export function istApple(plattform: string = typeof navigator !== "undefined" ? navigator.platform || navigator.userAgent : ""): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(plattform);
}

export type KuerzelAktion = "uebersicht" | "neuer-kontakt" | "neue-aufgabe" | "dialog-speichern" | null;

/** Welche Aktion löst dieser Tastendruck aus? Rein, damit es sich prüfen lässt. */
export function kuerzelFuer(e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "target">, imDialog: boolean): KuerzelAktion {
  if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key === "Enter") return imDialog ? "dialog-speichern" : null;
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (istEingabeZiel(e.target)) return null;
  // In einem offenen Dialog gehören die einfachen Tasten dem Dialog.
  if (imDialog) return null;
  if (e.key === "?") return "uebersicht";
  if (e.key === "n" || e.key === "N") return e.shiftKey ? null : "neuer-kontakt";
  if (e.key === "t" || e.key === "T") return e.shiftKey ? null : "neue-aufgabe";
  return null;
}

export interface KuerzelEintrag {
  tasten: string[];
  was: string;
}

export function kuerzelListe(apple = istApple()): KuerzelEintrag[] {
  const mod = apple ? "⌘" : "Strg";
  return [
    { tasten: [mod, "K"], was: "Suche öffnen" },
    { tasten: ["?"], was: "Diese Übersicht" },
    { tasten: ["N"], was: "Neuen Kontakt anlegen" },
    { tasten: ["T"], was: "Aufgabe im Kundenprofil anlegen" },
    { tasten: [mod, "↵"], was: "Im Dialog speichern" },
    { tasten: ["↑", "↓"], was: "In Listen bewegen" },
    { tasten: ["↵"], was: "Ausgewählte Zeile öffnen" },
  ];
}

/** Ereignis an das Kundenprofil: „Aufgabe anlegen“ öffnen. */
export const KUERZEL_AUFGABE = "kuerzel:neue-aufgabe";
