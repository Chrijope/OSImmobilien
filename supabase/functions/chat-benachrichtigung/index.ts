import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import { sendeVorlage } from '../_shared/transactional-versand.ts'
import {
  chatEmpfaengerErmitteln,
  chatMailDaten,
  chatMailSchluessel,
  chatZiel,
  chatZielAdresse,
  erwaehnteIds,
  glockenZeile,
  type GlockenZeile,
} from '../_shared/chat-empfaenger.ts'

/**
 * Glocke und Mail bei einer Chatnachricht, fuer jeden Empfaenger im CRM.
 *
 * Christian am 25.09.2026: Bei jeder Chatnachricht bekommt der Partner eine
 * Glocke und immer eine Mail mit einem Knopf direkt in den Chat. Das gilt fuer
 * Nachrichten aus dem Kundenportal und fuer interne Chats.
 *
 * WARUM HIER UND NICHT IM BROWSER
 *
 * Bis heute schrieb der Browser des Absenders die Mail. Schrieb ein Kunde,
 * suchte sein Browser die Adresse des Partners in `profiles_public`. Die
 * Zeilensicherheit zeigt einem Kunden dort nur sein eigenes Profil, die Liste
 * war also leer, es gab keinen Fehler und keinen Eintrag im Versandprotokoll.
 * Die Mail an den Partner ist so nie hinausgegangen. Hier liest der Dienst die
 * Empfaenger ueber ihre Kennungen in `chat_teilnehmer` und die Adressen aus
 * `profiles`, nie ueber Namen.
 *
 * WER DARF AUFRUFEN
 *
 * Nur der Absender der Nachricht, und nur fuer seine eigene Nachricht. Sonst
 * koennte jeder Angemeldete beliebigen Chatteilnehmern Mails schicken lassen.
 *
 * EINMAL JE NACHRICHT
 *
 * Die Nachricht bekommt beim ersten Aufruf die Marke `benachrichtigt_am` in
 * ihr `meta`, und zwar nur, wenn sie noch keine traegt. Wer diese Marke setzt,
 * benachrichtigt; jeder weitere Aufruf fuer dieselbe Nachricht tut nichts. Die
 * Mail traegt zusaetzlich einen Schluessel je Nachricht und Empfaenger, den
 * der Versand kein zweites Mal annimmt.
 *
 * Kunden bekommen hier nichts. Ihre Glocke und Mail laufen weiterhin aus dem
 * CRM, in ihrer Sprache und mit dem Link ins Kundenportal.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const BASIS = (Deno.env.get('APP_BASE_URL') || 'https://osimmobilien.netlify.app').trim().replace(/\/+$/, '')

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

type Zeile = Record<string, any>

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return antwort({ error: 'Nicht angemeldet' }, 401)
  const alsNutzer = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await alsNutzer.auth.getUser()
  if (!user) return antwort({ error: 'Nicht angemeldet' }, 401)

  const { nachrichtId } = await req.json().catch(() => ({} as { nachrichtId?: unknown }))
  if (typeof nachrichtId !== 'string' || !nachrichtId.trim()) {
    return antwort({ error: 'nachrichtId fehlt' }, 400)
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY)

  try {
    const { data: nachricht, error: lesefehler } = await db
      .from('chat_nachrichten')
      .select('id, chat_id, absender_id, inhalt, meta')
      .eq('id', nachrichtId)
      .maybeSingle()
    if (lesefehler) throw lesefehler
    if (!nachricht) return antwort({ ok: false, grund: 'nachricht_nicht_gefunden' }, 404)
    if (nachricht.absender_id !== user.id) {
      return antwort({ error: 'Nur der Absender darf zu seiner Nachricht benachrichtigen' }, 403)
    }

    const meta: Zeile = (nachricht.meta && typeof nachricht.meta === 'object') ? nachricht.meta : {}
    // "Hat den Chat verlassen" und aehnliche Systemzeilen sind keine Nachricht.
    if (meta.isSystem) return antwort({ ok: true, grund: 'systemmeldung' })
    if (meta.benachrichtigt_am) return antwort({ ok: true, grund: 'bereits_benachrichtigt' })

    // Die Marke setzen, aber nur, wenn noch keine da ist. Liefert die
    // Aenderung keine Zeile, war ein anderer Aufruf schneller.
    const { data: beansprucht, error: markenfehler } = await db
      .from('chat_nachrichten')
      .update({ meta: { ...meta, benachrichtigt_am: new Date().toISOString() } })
      .eq('id', nachricht.id)
      .is('meta->>benachrichtigt_am', null)
      .select('id')
    if (markenfehler) throw markenfehler
    if (!beansprucht || beansprucht.length === 0) {
      return antwort({ ok: true, grund: 'bereits_benachrichtigt' })
    }

    const [{ data: chat }, { data: teilnehmer }] = await Promise.all([
      db.from('chat_gruppen').select('id, name, typ').eq('id', nachricht.chat_id).maybeSingle(),
      db.from('chat_teilnehmer').select('benutzer_id, meta').eq('chat_id', nachricht.chat_id),
    ])
    const teilnehmerZeilen = (teilnehmer || []) as Zeile[]
    const teilnehmerIds = teilnehmerZeilen.map((t) => t.benutzer_id as string).filter(Boolean)
    const alleIds = [...new Set([...teilnehmerIds, user.id])]

    const [{ data: rollen }, { data: profile }] = await Promise.all([
      db.from('user_roles').select('user_id, role').in('user_id', alleIds),
      db.from('profiles').select('id, name, email').in('id', alleIds),
    ])

    const rollenJeNutzer = new Map<string, string[]>()
    for (const r of (rollen || []) as Zeile[]) {
      const liste = rollenJeNutzer.get(r.user_id) || []
      liste.push(String(r.role))
      rollenJeNutzer.set(r.user_id, liste)
    }
    const profilJeNutzer = new Map<string, Zeile>()
    for (const p of (profile || []) as Zeile[]) profilJeNutzer.set(p.id, p)

    // Alle bekannten Namen je Teilnehmer, fuer die Erwaehnung und die Anrede.
    const namenJeNutzer = new Map<string, string[]>()
    for (const t of teilnehmerZeilen) {
      const namen = [t.meta?.name, profilJeNutzer.get(t.benutzer_id)?.name]
        .map((n) => String(n || '').trim())
        .filter((n) => n && n !== 'Nutzer')
      namenJeNutzer.set(t.benutzer_id, namen)
    }

    const empfaenger = chatEmpfaengerErmitteln(user.id, teilnehmerIds, rollenJeNutzer)
    if (empfaenger.length === 0) return antwort({ ok: true, glocken: 0, mails: 0 })

    const absenderName = String(meta.senderName || '').trim() ||
      String(profilJeNutzer.get(user.id)?.name || '').trim() ||
      (namenJeNutzer.get(user.id) || [])[0] || ''
    const chatName = String(chat?.name || '').replace(/\s*\(Intern\)\s*$/i, '').trim()
    const text = String(nachricht.inhalt || '')
    const erwaehnt = erwaehnteIds(text, namenJeNutzer)

    const glocken: GlockenZeile[] = empfaenger.map((e) => glockenZeile({
      empfaenger: e,
      chatId: nachricht.chat_id,
      chatName,
      nachrichtId: nachricht.id,
      absenderId: user.id,
      absenderName,
      empfaengerName: (namenJeNutzer.get(e.id) || [])[0] || '',
      text,
      erwaehnt: erwaehnt.has(e.id),
    }))

    const fehler: string[] = []
    // Jede Glockenzeile loest ueber den Trigger `benachrichtigungen_web_push`
    // auch die Push-Meldung auf dem Geraet des Empfaengers aus.
    const { error: glockenfehler } = await db.from('benachrichtigungen').insert(glocken)
    if (glockenfehler) fehler.push(`Glocke: ${glockenfehler.message}`)

    let mails = 0
    let ohneAdresse = 0
    await Promise.all(empfaenger.map(async (e) => {
      const adresse = String(profilJeNutzer.get(e.id)?.email || '').trim()
      if (!adresse) { ohneAdresse++; return }
      const ergebnis = await sendeVorlage(db, {
        templateName: 'chat-nachricht',
        recipientEmail: adresse,
        idempotencyKey: chatMailSchluessel(nachricht.id, e.id),
        templateData: chatMailDaten({
          empfaengerName: String(profilJeNutzer.get(e.id)?.name || '').trim() || (namenJeNutzer.get(e.id) || [])[0] || '',
          absenderName,
          chatName,
          text,
          // Der Knopf „Zum Chat“: direkt in genau diesen Chat.
          portalUrl: chatZielAdresse(BASIS, chatZiel(nachricht.chat_id, e)),
        }),
        metadata: { chat_id: nachricht.chat_id, nachricht_id: nachricht.id, empfaenger_id: e.id, art: 'chat_nachricht' },
      })
      if (ergebnis.ok) mails++
      else fehler.push(`Mail an ${e.id}: ${ergebnis.grund}`)
    }))

    const bericht = { glocken: glockenfehler ? 0 : glocken.length, mails, ohneAdresse, fehler: fehler.length }
    console.log('chat-benachrichtigung:', JSON.stringify({ nachrichtId: nachricht.id, ...bericht, details: fehler }))
    // Nach aussen nur Zahlen, keine Adressen.
    return antwort({ ok: true, ...bericht })
  } catch (e) {
    console.error('[chat-benachrichtigung]', e)
    return antwort({ error: (e as Error).message || 'Fehler' }, 500)
  }
})
