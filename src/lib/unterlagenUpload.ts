import { supabase } from "@/integrations/supabase/client";

/**
 * Laedt eine Datei in den Bucket "unterlagen", robust gegen frische Seiten
 * und rotierte Anmelde-Token.
 *
 * Gleiche Technik wie beim Vertrags-Upload (uploadVertragPdf): Erst die
 * Auth-Session hydrieren, dann hochladen, und bei einem Fehlschlag nach
 * kurzer Wartezeit genau einmal transparent wiederholen. Ohne das schlug
 * der erste Upload nach laengerer Inaktivitaet gern mit einer
 * Fehlermeldung fehl (gemeldet am 01.09. beim Personalausweis im
 * Bonitaetscheck).
 */
export async function ladeUnterlagenDateiHoch(pfad: string, datei: File | Blob): Promise<void> {
  try { await supabase.auth.getSession(); } catch { /* Upload versucht es trotzdem */ }
  const einmal = async () => {
    const { error } = await supabase.storage.from("unterlagen").upload(pfad, datei, { upsert: true });
    if (error) throw new Error(error.message || "Upload fehlgeschlagen");
  };
  try {
    await einmal();
  } catch (e) {
    console.warn("[unterlagenUpload] erster Versuch fehlgeschlagen, retry in 400 ms:", (e as Error)?.message);
    await new Promise((r) => setTimeout(r, 400));
    try { await supabase.auth.getSession(); } catch { /* Upload versucht es trotzdem */ }
    await einmal();
  }
}
