/**
 * Welche Speicherordner (`<kontaktId>/…`) gehören beim DSGVO-Löschen zu
 * einem Kontakt?
 *
 * Beim Zusammenführen von Duplikaten (Migration 20260926230000) verschiebt
 * die Edge Function kontakte-zusammenfuehren-dateien die Dateien des neueren
 * in die Ordner des älteren (seit 26.09.2026). Klappt das nicht ganz, oder
 * lief die Zusammenführung vorher, bleiben Dateien im Ordner des neueren,
 * ihre Zeilen hängen aber am älteren. Deshalb bleibt diese Regel bestehen:
 *
 *   - Der aufgelöste Kontakt (meta.zusammengefuehrtIn gesetzt) besitzt keine
 *     Ordner mehr. Sonst löschte die DSGVO-Löschung der leeren Hülle die
 *     Dateien des behaltenen Kontakts.
 *   - Der behaltene Kontakt besitzt zusätzlich die Ordner aller Kontakte, die
 *     in ihn zusammengeführt wurden (meta.zusammenfuehrungen[].ausKontaktId).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function dsgvoOrdnerFuerKontakt(kontaktId: string, meta: unknown): string[] {
  const m = (meta && typeof meta === "object" ? meta : {}) as Record<string, any>;
  if (typeof m.zusammengefuehrtIn === "string" && m.zusammengefuehrtIn) return [];
  const aus = Array.isArray(m.zusammenfuehrungen)
    ? m.zusammenfuehrungen.map((z: any) => z?.ausKontaktId).filter((id: unknown): id is string => typeof id === "string" && UUID.test(id))
    : [];
  return [...new Set([kontaktId, ...aus])];
}
