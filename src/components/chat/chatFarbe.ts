/**
 * Die Kreisfarbe hinter den Initialen.
 *
 * Sie stand bis zur Herausloesung des Verlaufsbausteins nur in `Chat.tsx`.
 * Weil jetzt zwei Stellen dieselben Kreise zeichnen, die Chatseite und der
 * Reiter "Kommunikation" im Kundenprofil, gehoert die Berechnung in eine
 * gemeinsame Datei. Zwei Kopien wuerden sonst irgendwann verschiedene Farben
 * fuer denselben Namen ergeben.
 */
const COLORS = ["bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500", "bg-teal-500", "bg-indigo-500", "bg-pink-500", "bg-amber-500", "bg-rose-500", "bg-emerald-500", "bg-red-500", "bg-yellow-500"];

export function colorForName(name: string): string {
  let hash = 0;
  for (const c of name) hash = ((hash << 5) - hash + c.charCodeAt(0)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}
