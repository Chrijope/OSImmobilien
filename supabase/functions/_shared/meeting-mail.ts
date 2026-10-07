import { kundenSprache } from './kunden-sprache.ts'

// Structural boundary keeps the shared logic testable in the browser project
// without importing Deno's npm: module specifiers into TypeScript's web build.
type MeetingMailClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
  from(table: string): { select(columns: string): { eq(column: string, value: string): {
    maybeSingle(): PromiseLike<{ data: { email?: string } | null; error: unknown }>;
  } } };
  functions: { invoke(name: string, args: { body: unknown }): PromiseLike<{
    data: { success?: boolean; suppressed?: boolean; error?: unknown } | null; error: unknown;
  }> };
}

export interface MeetingMailJob {
  id: string; meeting_id: string; kontakt_id: string; benutzer_id: string;
  revision: number; art: 'aenderung' | 'absage'; email: string; lease_id: string;
  daten: { name?: string; titel: string; datum: string; uhrzeit: string; dauer: number; start: string;
    alteZeit?: string; zugangUrl?: string; modus?: string; treffpunkt?: string; beraterName?: string; icsUid: string }
}
const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
// RFC 5545 folding counts UTF-8 octets, not JavaScript characters.
function fold(line: string): string {
  let result = '', bytes = 0
  for (const c of line) {
    const n = new TextEncoder().encode(c).length
    if (bytes + n > 75) { result += '\r\n '; bytes = 1 }
    result += c; bytes += n
  }
  return result
}
/**
 * Die festen Texte der Kalenderdatei in der Kundensprache (Etappe 2). Der
 * Titel ist der Terminname aus dem CRM und bleibt, wie er gepflegt ist.
 */
const KALENDER_TEXTE = {
  de: { vorOrt: 'Vor Ort', telefon: 'Telefontermin', online: 'Online', aktualisiert: 'termin-aktualisiert.ics', absage: 'termin-absage.ics' },
  en: { vorOrt: 'In person', telefon: 'Phone call', online: 'Online', aktualisiert: 'appointment-updated.ics', absage: 'appointment-cancelled.ics' },
} as const

export function meetingKalender(j: MeetingMailJob, organizerEmail: string, now = new Date(), sprache: 'de' | 'en' = 'de'): string {
  const t = KALENDER_TEXTE[sprache === 'en' ? 'en' : 'de']
  const d = j.daten, start = new Date(d.start), end = new Date(start.getTime() + d.dauer * 60000)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) throw new Error('Ungültige Terminzeit')
  const email = (s: string) => s.replace(/[\r\n";,:]/g, '')
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OS Immobilien//Closing//DE', 'CALSCALE:GREGORIAN',
    `METHOD:${j.art === 'absage' ? 'CANCEL' : 'REQUEST'}`, 'BEGIN:VEVENT', `UID:${escape(d.icsUid)}`,
    `SEQUENCE:${j.revision}`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(d.titel)}`, `LOCATION:${escape(d.modus === 'vor_ort' ? d.treffpunkt || t.vorOrt : d.modus === 'telefon' ? t.telefon : d.zugangUrl || t.online)}`,
    `ORGANIZER:mailto:${email(organizerEmail || 'noreply@os-immobilien.com')}`, `ATTENDEE:mailto:${email(j.email)}`,
    `STATUS:${j.art === 'absage' ? 'CANCELLED' : 'CONFIRMED'}`, 'END:VEVENT', 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n'
}
export function meetingMailAuftrag(j: MeetingMailJob, organizerEmail: string, sprache: 'de' | 'en' = 'de') {
  const t = KALENDER_TEXTE[sprache === 'en' ? 'en' : 'de']
  const d = j.daten, ics = meetingKalender(j, organizerEmail, new Date(), sprache)
  const bytes = new TextEncoder().encode(ics)
  const content = btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''))
  return {
    templateName: 'meeting-aenderung', recipientEmail: j.email, idempotencyKey: `meeting-status-${j.id}`,
    templateData: { name: d.name, titel: d.titel, datum: d.datum, uhrzeit: d.uhrzeit, dauer: d.dauer,
      abgesagt: j.art === 'absage', alteZeit: d.alteZeit, modus: d.modus, treffpunkt: d.treffpunkt,
      zugangUrl: j.art === 'absage' ? undefined : d.zugangUrl,
      beraterUserId: j.benutzer_id, berater: {} },
    // Dieselbe Sprache fuer Mail und Kalenderdatei, deshalb ausdruecklich mitgegeben.
    sprache, kontaktId: j.kontakt_id,
    metadata: { kontaktId: j.kontakt_id, quelle: 'meeting-aenderung', meetingId: j.meeting_id },
    attachments: [{ filename: j.art === 'absage' ? t.absage : t.aktualisiert, content, type: `text/calendar; method=${j.art === 'absage' ? 'CANCEL' : 'REQUEST'}; charset=UTF-8` }],
  }
}

/** Called by the existing scheduled Lovable email worker, never by a guest. */
export async function verarbeiteMeetingMails(supabase: MeetingMailClient): Promise<void> {
  const { data, error } = await supabase.rpc('meeting_mail_claim')
  if (error) { console.error('[meeting-mail] Aufträge nicht verfügbar', error); return }
  for (const j of (data || []) as MeetingMailJob[]) {
    let erfolg = false, fehler: string | null = null
    try {
      const { data: profil, error: profilFehler } = await supabase.from('profiles').select('email').eq('id', j.benutzer_id).maybeSingle()
      if (profilFehler) throw new Error('Ansprechpartner nicht verfügbar')
      // Kundensprache aus dem Profil; ohne Treffer oder bei Fehler Deutsch.
      const sprache = await kundenSprache(supabase as never, { kontaktId: j.kontakt_id })
      const result = await supabase.functions.invoke('send-transactional-email', { body: meetingMailAuftrag(j, profil?.email || '', sprache) })
      erfolg = !result.error && result.data?.success === true && !result.data?.suppressed && !result.data?.error
      if (!erfolg) fehler = 'Der Versanddienst hat die Nachricht nicht angenommen'
    } catch { fehler = 'Die Nachricht konnte nicht vorbereitet oder übergeben werden' }
    const fertig = await supabase.rpc('meeting_mail_fertig', { _id: j.id, _lease: j.lease_id, _erfolg: erfolg, _fehler: fehler })
    if (fertig.error) console.error('[meeting-mail] Ergebnis konnte nicht gespeichert werden', fertig.error)
  }
}
