/**
 * Die Unterzeile über der Reservierungsvereinbarung.
 *
 * Befund vom 24.09.2026: Dort stand „Reservierung für Otto Hans – Espanstraße
 * 5 - Nürnberg“, also zwei Gedankenstriche in einem Text, den Nutzer sehen.
 * Der erste kam aus dieser Zeile selbst, der zweite aus dem Objekttitel, wie
 * ihn Investagon liefert („Straße - Ort“). Beides wird hier zu Kommas.
 *
 * Nur die Kopfzeile der Seite. Der Vertragstext selbst bleibt unberührt.
 */
export function reservierungUntertitel(kundeName?: string | null, objektTitel?: string | null): string {
  const name = (kundeName || "").trim();
  if (!name) return "Neue Reservierung erstellen";
  const objekt = (objektTitel || "").replace(/\s+[-–—]\s+/g, ", ").trim();
  return objekt ? `Reservierung für ${name}, ${objekt}` : `Reservierung für ${name}`;
}
