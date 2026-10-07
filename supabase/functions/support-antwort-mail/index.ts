import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import { sendeVorlage } from '../_shared/transactional-versand.ts'
import {
  hatSupportAntwort,
  istNurKunde,
  istSupportRolle,
  supportMailSchluessel,
  supportTicketAdresse,
} from '../_shared/support-antwort.ts'

/**
 * Mail "Du hast eine Antwort vom Support" an den Ersteller eines Tickets.
 *
 * Christian am 28.09.2026: Antworten im Helpdesk sollen beim Ersteller
 * sichtbar ankommen. Glocke und Status setzt die Datenbankfunktion
 * `support_ticket_nachricht_anhaengen` bzw. `support_ticket_antwort_melden`.
 * Der Browser ruft danach diese Function auf, denn gerendert wird eine Mail
 * nur hier in Deno.
 *
 * WER DARF AUFRUFEN
 *
 * Nur Administrator, Inhaber und Backoffice. Sonst koennte jeder Angemeldete
 * beliebigen Erstellern Mails schicken lassen.
 *
 * HOECHSTENS EINE MAIL JE TICKET IN 15 MINUTEN
 *
 * Die Bremse sitzt in der Datenbank: `support_ticket_mail_beanspruchen`
 * setzt die Marke nur, wenn die letzte Mail 15 Minuten oder laenger her ist,
 * in einer einzigen Aenderung. Wer die Marke bekommt, verschickt.
 *
 * WOHER DIE ADRESSE KOMMT
 *
 * Ausschliesslich ueber die Kennung `support_tickets.benutzer_id`, aus
 * `profiles`, ersatzweise aus dem Anmeldekonto. Die im Ticket gespeicherte
 * Adresse ist aus dem Namen zusammengebaut und wird nie benutzt.
 *
 * Ohne den Antworttext, nur Betreff und Knopf zum Ticket.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const BASIS = (Deno.env.get('APP_BASE_URL') || 'https://portal.more.immo').trim().replace(/\/+$/, '')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function antwort(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function funktionFehlt(fehler: { code?: string; message?: string } | null): boolean {
  const code = String(fehler?.code || '')
  return code === 'PGRST202' || code === '42883' || /could not find the function/i.test(String(fehler?.message || ''))
}

// deno-lint-ignore no-explicit-any
async function rollenVon(db: any, userId: string): Promise<string[]> {
  const { data, error } = await db.from('user_roles').select('role').eq('user_id', userId)
  if (error) throw error
  return ((data || []) as Array<{ role: unknown }>).map((r) => String(r.role))
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return antwort({ error: 'Nicht angemeldet' }, 401)
  const alsNutzer = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await alsNutzer.auth.getUser()
  if (!user) return antwort({ error: 'Nicht angemeldet' }, 401)

  const { ticketId } = await req.json().catch(() => ({} as { ticketId?: unknown }))
  if (typeof ticketId !== 'string' || !ticketId.trim()) {
    return antwort({ error: 'ticketId fehlt' }, 400)
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY)

  try {
    if (!istSupportRolle(await rollenVon(db, user.id))) {
      return antwort({ error: 'Nur der Support darf Antworten melden' }, 403)
    }

    const { data: ticket, error: lesefehler } = await db
      .from('support_tickets')
      .select('id, betreff, benutzer_id, meta')
      .eq('id', ticketId)
      .maybeSingle()
    if (lesefehler) throw lesefehler
    if (!ticket) return antwort({ ok: false, grund: 'ticket_nicht_gefunden' }, 404)

    const meta = (ticket.meta && typeof ticket.meta === 'object') ? ticket.meta as Record<string, any> : {}
    const empfaengerId = ticket.benutzer_id as string | null
    if (!empfaengerId) return antwort({ ok: true, mail: false, grund: 'ohne_ersteller' })
    if (empfaengerId === user.id) return antwort({ ok: true, mail: false, grund: 'eigenes_ticket' })
    if (!hatSupportAntwort(meta.nachrichten)) return antwort({ ok: true, mail: false, grund: 'keine_antwort' })
    if (istNurKunde(await rollenVon(db, empfaengerId))) {
      return antwort({ ok: true, mail: false, grund: 'kein_interner_empfaenger' })
    }

    const { data: beansprucht, error: bremsfehler } = await db.rpc('support_ticket_mail_beanspruchen', {
      p_ticket_id: ticket.id,
    })
    if (bremsfehler) {
      if (funktionFehlt(bremsfehler)) return antwort({ ok: true, mail: false, grund: 'migration_fehlt' })
      throw bremsfehler
    }
    if (!beansprucht) return antwort({ ok: true, mail: false, grund: 'bremse' })

    const { data: profil } = await db.from('profiles').select('name, email').eq('id', empfaengerId).maybeSingle()
    let adresse = String(profil?.email || '').trim()
    if (!adresse) {
      const { data: konto } = await db.auth.admin.getUserById(empfaengerId)
      adresse = String(konto?.user?.email || '').trim()
    }
    if (!adresse) return antwort({ ok: true, mail: false, grund: 'ohne_adresse' })

    const ergebnis = await sendeVorlage(db, {
      templateName: 'support-antwort',
      recipientEmail: adresse,
      idempotencyKey: supportMailSchluessel(ticket.id, String(beansprucht)),
      templateData: {
        empfaengerName: String(profil?.name || '').trim(),
        ticketNummer: meta.nummer ?? '',
        betreff: String(ticket.betreff || ''),
        ticketUrl: supportTicketAdresse(BASIS, ticket.id),
      },
      metadata: { ticket_id: ticket.id, empfaenger_id: empfaengerId, art: 'support_antwort' },
    })

    // Nach aussen keine Adresse, nur das Ergebnis.
    console.log('support-antwort-mail:', JSON.stringify({ ticketId: ticket.id, ok: ergebnis.ok, grund: ergebnis.grund }))
    if (!ergebnis.ok) return antwort({ ok: false, mail: false, grund: ergebnis.grund || 'versand_fehlgeschlagen' }, 502)
    return antwort({ ok: true, mail: true })
  } catch (e) {
    console.error('[support-antwort-mail]', e)
    return antwort({ error: (e as Error).message || 'Fehler' }, 500)
  }
})
