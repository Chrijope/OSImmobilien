// Public Edge Function: returns a downloadable .ics calendar file
// built from query parameters. Used by transactional emails so recipients
// can add an appointment to any calendar (Apple, Outlook, Google import).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function esc(s: string): string {
  return (s || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

function fmtIcsDate(iso: string): string {
  // YYYYMMDDTHHmmssZ
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const url = new URL(req.url)
  // Kundensprache (Etappe 2): Der Aufrufer haengt lang=en an, wenn der Kunde
  // Englisch spricht. Das betrifft nur die festen Rueckfalltexte und den
  // Dateinamen; Titel und Beschreibung kommen fertig aus dem Link.
  const englisch = url.searchParams.get('lang') === 'en'
  const title = url.searchParams.get('title') || (englisch ? 'Appointment' : 'Termin')
  const start = url.searchParams.get('start') || ''
  const end = url.searchParams.get('end') || ''
  const location = url.searchParams.get('loc') || ''
  const description = url.searchParams.get('desc') || ''
  const orgName = url.searchParams.get('org') || 'MOREImmo'
  const orgEmail = url.searchParams.get('orgEmail') || 'noreply@more.immo'
  const attendee = url.searchParams.get('att') || ''
  const uid = url.searchParams.get('uid') || `${Date.now()}@more.immo`
  // Wird ein Termin verschoben, geht dieselbe UID mit neuer Zeit hinaus. Ohne
  // hoehere SEQUENCE behandeln Apple Kalender und Outlook das als Wiederholung
  // und lassen den alten Eintrag stehen. Der Aufrufer schickt deshalb eine
  // Zahl mit, die mit jeder Aenderung steigt. Ohne Angabe bleibt es bei 0, so
  // wie es alle bisherigen Aufrufstellen erwarten.
  const seqRoh = Number(url.searchParams.get('seq') || '0')
  const sequence = Number.isFinite(seqRoh) && seqRoh > 0 ? Math.floor(seqRoh) : 0

  const dtStart = fmtIcsDate(start)
  const dtEnd = fmtIcsDate(end || new Date(new Date(start).getTime() + 30 * 60000).toISOString())
  if (!dtStart) {
    return new Response('Invalid start date', { status: 400, headers: corsHeaders })
  }

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MOREImmo//Closing//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${esc(uid)}`,
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${fmtIcsDate(new Date().toISOString())}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${esc(title)}`,
    `DESCRIPTION:${esc(description)}`,
    `LOCATION:${esc(location)}`,
    `ORGANIZER;CN=${esc(orgName)}:mailto:${esc(orgEmail)}`,
    attendee ? `ATTENDEE;CN=${esc(attendee)};RSVP=TRUE:mailto:${esc(attendee)}` : '',
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean)

  return new Response(lines.join('\r\n'), {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${englisch ? 'appointment.ics' : 'termin.ics'}"`,
      'Cache-Control': 'no-store',
    },
  })
})