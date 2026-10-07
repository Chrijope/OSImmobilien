import type { Json } from "@/integrations/supabase/types";
import { meetingZeitISO } from "./meetingZeit";
import { supabase } from '@/integrations/supabase/client';
import { cacheReload } from './dataCache';
import { uebertrageInKalender, type AktivitaetEntry } from './aktivitaetenStore';
import { raumUrl, type Videoraum } from './videoraumStore';
import type { NeueAufgabe } from './aufgabenStore';

export interface MeetingKommunikation {
  empfaenger: { name: string; email: string }[];
  modus: "video" | "vor_ort" | "telefon";
  treffpunkt?: string;
}

/** One request, one transaction. Stable ID makes a retry safe after a lost response. */
export async function speichereMeeting(
  id: string,
  aktivitaet: Omit<AktivitaetEntry, 'id' | 'datum'>,
  aufgabe: NeueAufgabe,
  raum?: { token: string; art: string; gastgeber: unknown; hinweis?: string | null },
  kommunikation?: MeetingKommunikation,
): Promise<string> {
  meetingZeitISO(aktivitaet.faelligAm || "", aktivitaet.uhrzeit || "");
  const link = raum ? raumUrl(raum.token) : aktivitaet.zoomLink || '';
  // Funktion noch nicht in den erzeugten Typen enthalten, daher ungetypter Aufruf.
  const { error } = await (supabase as any).rpc('meeting_anlegen', {
    _id: id,
    _daten: { ...aktivitaet, zoomLink: link, aufgabe, raum, kommunikation } as unknown as Json,
  });
  if (error) throw error;
  await Promise.all([cacheReload('aktivitaeten'), cacheReload('aufgaben')]);
  uebertrageInKalender({ ...aktivitaet, zoomLink: link, id, datum: new Date().toISOString() });
  return link;
}

export async function entferneMeetingRaum(id: Videoraum['id']): Promise<void> {
  const { error } = await (supabase as any).rpc('meeting_raum_entfernen', { _raum_id: id });
  if (error) throw error;
  await Promise.all([cacheReload('aktivitaeten'), cacheReload('aufgaben')]);
}
