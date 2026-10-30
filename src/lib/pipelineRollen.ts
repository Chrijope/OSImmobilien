/**
 * Mausrad und Trackpad im Pipeline-Board (30.10.2026, Christian: „nach
 * rechts geht, nach links nicht“). Waagerechte Bewegungen übernimmt das
 * Board selbst, statt sie dem Browser zu überlassen: Dort griff am Mac die
 * Zurück-Geste oder die Spalte unter dem Zeiger schluckte das Rad.
 * Ein senkrechtes Rad schiebt das Board, solange die Kartenliste unter dem
 * Zeiger in diese Richtung nicht mehr rollen kann.
 *
 * Gibt zurück, um wie viele Pixel das Board waagerecht wandert; 0 heißt,
 * der Browser rollt selbst (die Kartenliste senkrecht).
 */
export function waagerechtesRad(
  e: { deltaX: number; deltaY: number; deltaMode: number; shiftKey: boolean },
  liste: { scrollTop: number; scrollHeight: number; clientHeight: number } | null,
): number {
  // Manche Mäuse melden in Zeilen statt in Pixeln.
  const faktor = e.deltaMode === 1 ? 16 : 1;
  const dx = e.deltaX * faktor;
  const dy = e.deltaY * faktor;
  if (Math.abs(dx) > Math.abs(dy)) return dx;
  if (e.shiftKey) return dy;
  if (dy === 0) return 0;
  if (liste) {
    const kannRunter = liste.scrollTop + liste.clientHeight < liste.scrollHeight - 1;
    const kannHoch = liste.scrollTop > 0;
    if ((dy > 0 && kannRunter) || (dy < 0 && kannHoch)) return 0;
  }
  return dy;
}
