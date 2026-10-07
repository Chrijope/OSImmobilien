/**
 * Darf der Nutzer in Einstellungen, Bereich Marketing, eine Meta-Pixel-ID
 * oder ein Conversions-API-Token setzen?
 *
 * Nur die Anzeige. Massgeblich ist die Pruefung auf dem Server
 * (supabase/functions/_shared/meta-pixel-freigabe.ts): Die Pixel-ID steht in
 * user_settings, und die schreibt der Partner selbst. Entfernen ist immer
 * erlaubt, dafuer gibt es hier keine Bedingung.
 */

export const META_PIXEL_OHNE_ANLAGE_4_HINWEIS =
  "Ein eigenes Meta Pixel ist mit dem Vertragsstand ab Oktober 2026 (Anlage 4) möglich. Sprich uns an.";

export function darfMetaPixelSetzen(e: {
  istAdmin: boolean;
  /** Antwort des Servers; null, solange sie fehlt oder nicht zu bekommen war. */
  serverErlaubt: boolean | null;
  gespeichertePixelId: string;
  tokenHinterlegt: boolean;
}): boolean {
  if (e.istAdmin) return true;
  if (e.serverErlaubt !== null) return e.serverErlaubt;
  // Ohne Antwort nur, wer schon etwas hinterlegt hat: Dann galt die Sperre
  // ohnehin nicht (Bestandsschutz), und ein Neuer bleibt gesperrt.
  return e.gespeichertePixelId.trim() !== "" || e.tokenHinterlegt;
}
