import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import { sendeVorlage } from '../_shared/transactional-versand.ts'

/**
 * Den Finanzierungspartner per Mail rufen, wenn die Bonität freigegeben ist.
 *
 * Glocke und Aufgabe setzt das CRM selbst, die Mail läuft hier, damit sie
 * auch dann hinausgeht, wenn der Browser die Seite gleich danach verlässt.
 *
 * Seit die Bonitätsunterlagen hinter der Reservierung liegen, ist ihre
 * Freigabe der Startschuss für die Finanzierung. Vorher erfuhr der
 * Finanzierungspartner erst viel später, dass etwas für ihn anliegt.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const BASIS = (Deno.env.get('APP_BASE_URL') || 'https://portal.more.immo').replace(/\/+$/, '')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Nicht angemeldet' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  const alsNutzer = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await alsNutzer.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Nicht angemeldet' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY)
  const { kontaktId, investmentId, kundeName } = await req.json().catch(() => ({}))
  if (!kontaktId) {
    return new Response(JSON.stringify({ error: 'kontaktId fehlt' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  /*
   * Alle Finanzierungspartner, nicht nur einer.
   *
   * Heute ist das Stefan Kurz allein. Wird jemand ergaenzt, bekommt er die
   * Meldung ohne weiteres Zutun, und niemand muss daran denken, hier einen
   * Namen nachzutragen.
   */
  const { data: rollen } = await db
    .from('user_roles').select('user_id').eq('role', 'finanzierungspartner')
  const ids = (rollen || []).map((r: { user_id: string }) => r.user_id)
  if (ids.length === 0) {
    console.warn('Keine Finanzierungspartner hinterlegt, keine Mail versendet')
    return new Response(JSON.stringify({ versendet: 0, grund: 'kein Finanzierungspartner hinterlegt' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const { data: profile } = await db.from('profiles').select('id, name, email').in('id', ids)
  const bericht = { versendet: 0, fehler: [] as string[] }

  for (const p of (profile || []) as Array<{ name?: string; email?: string }>) {
    if (!p.email?.trim()) {
      bericht.fehler.push(`${p.name || 'Unbekannt'}: keine Mailadresse hinterlegt`)
      continue
    }
    const ergebnis = await sendeVorlage(db, {
      templateName: 'bonitaet-freigabe',
      recipientEmail: p.email,
      // Genau einmal je Kontakt, auch wenn die Function zweimal gerufen wird.
      idempotencyKey: `bonitaet-freigabe-${kontaktId}-${p.email}`,
      templateData: {
        name: p.name || '',
        kundeName: kundeName || 'Ein Kunde',
        // Der Reiter "finanzierungen" existierte nie und landete still auf der
        // Uebersicht. Seit Welle 2 heisst er "investments", das gemeinte
        // Investment steht in `?investment=`.
        link: `${BASIS}/kunden/${kontaktId}?tab=investments${investmentId ? `&investment=${investmentId}` : ''}`,
      },
      metadata: { kontakt_id: kontaktId, art: 'bonitaet_freigabe' },
    })
    if (ergebnis.ok) bericht.versendet++
    else bericht.fehler.push(`${p.email}: ${ergebnis.grund}`)
  }

  console.log('bonitaet-freigabe-mail:', JSON.stringify(bericht))
  // Nach aussen nur Zahlen, keine Mailadressen.
  return new Response(JSON.stringify({ versendet: bericht.versendet, fehler: bericht.fehler.length }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
