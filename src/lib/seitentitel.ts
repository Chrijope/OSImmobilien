import { useEffect } from "react";

/**
 * Titel des Browsertabs fuer die oeffentlichen Seiten.
 *
 * In `index.html` steht "MOREImmo CRM". Das ist der Name eures internen
 * Werkzeugs und hat auf einer Seite, die ein Kunde sieht, nichts zu suchen.
 * Wer einen Termin bucht oder im Warteraum sitzt, hat oft mehrere Tabs offen
 * und findet den richtigen ueber diesen Titel wieder.
 *
 * Beim Verlassen der Seite wird der vorherige Titel wiederhergestellt, damit
 * das CRM nach einem Wechsel nicht "Ihr Termin" heisst.
 */
export function useSeitentitel(titel: string | null | undefined): void {
  useEffect(() => {
    if (!titel) return;
    const vorher = document.title;
    document.title = titel;
    return () => { document.title = vorher; };
  }, [titel]);
}

/** Einheitliche Schreibweise, damit nicht jede Seite ihre eigene erfindet. */
export function oeffentlicherTitel(bereich: string, zusatz?: string | null): string {
  const teile = [zusatz?.trim(), bereich, "MOREImmo"].filter(Boolean);
  return teile.join(" · ");
}
