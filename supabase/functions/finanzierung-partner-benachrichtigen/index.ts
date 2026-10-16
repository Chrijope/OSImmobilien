import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import { sendeVorlage } from '../_shared/transactional-versand.ts'
import { pruefeKontaktZugriff } from '../_shared/kontakt-signatur-zugriff.ts'
import { datumDeutsch } from '../_shared/reservierung-unterschrieben-meldung.ts'
import { kaufpreisFuerMail } from '../_shared/finanzierung-starten-mail.ts'
import {
  FINANZIERUNG_MELDUNG_VORLAGE,
  FINANZIERUNGSPARTNER_ROLLE,
  finanzierungPfad,
  hatMeldeRolle,
  kennungenLesen,
  meldungenZusammenfuehren,
  objektMitEinheit,
  partnerEmpfaenger,
  partnerMailDaten,
  type PartnerMeldung,
} from '../_shared/finanzierung-partner-benachrichtigen.ts'

/**
 * Die gewählten Finanzierungspartner eines Investments per Mail und Glocke
 * benachrichtigen, sobald die Reservierung unterschrieben ist.
 *
 * Keine Anhänge mit Kundendaten (Entscheidung des Inhabers vom 16.10.2026):
 * Die Mail trägt nur den Link ins CRM, dort liegen die Unterlagen nach der
 * Anmeldung als ZIP bereit.
 *
 * Erneut senden ist erlaubt. Jeder Aufruf ist ein eigener Versand, deshalb
 * enthält der Schlüssel gegen Doppelversand den Zeitpunkt.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const BASIS = (Deno.env.get('APP_BASE_URL') || 'https://osimmobilien.netlify.app').replace(/\/+$/, '')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function antwort(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return antwort({ error: 'Nur POST' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return antwort({ error: 'Nicht angemeldet' }, 401)
  const alsNutzer = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await alsNutzer.auth.getUser()
  if (!user) return antwort({ error: 'Nicht angemeldet' }, 401)

  const db = createClient(SUPABASE_URL, SERVICE_KEY)
  const body = await req.json().catch(() => ({})) as { investmentId?: unknown; partnerIds?: unknown }
  const investmentId = typeof body.investmentId === 'string' ? body.investmentId.trim() : ''
  if (!investmentId) return antwort({ error: 'investmentId fehlt' }, 400)

  // Interne Rolle mit Bearbeitungsrecht, aus der Datenbank, nie aus der Anfrage.
  const { data: eigeneRollen, error: rollenFehler } = await db.from('user_roles').select('role').eq('user_id', user.id)
  if (rollenFehler) return antwort({ error: 'Rollen nicht ladbar' }, 500)
  if (!hatMeldeRolle((eigeneRollen || []).map((r: { role: string }) => r.role))) {
    return antwort({ error: 'Keine Berechtigung' }, 403)
  }

  const { data: inv, error: invFehler } = await db
    .from('investments').select('id, kunde_id, objekt, wohnung, kaufpreis, meta').eq('id', investmentId).maybeSingle()
  if (invFehler) return antwort({ error: 'Investment nicht ladbar' }, 500)
  if (!inv) return antwort({ error: 'Investment nicht gefunden' }, 404)

  // Darf der Aufrufer für diesen Kunden handeln? Vertriebspartner nur beim eigenen.
  const { erlaubt, kontakt } = await pruefeKontaktZugriff(
    db as unknown as Parameters<typeof pruefeKontaktZugriff>[0],
    alsNutzer as unknown as Parameters<typeof pruefeKontaktZugriff>[1],
    inv.kunde_id as string,
    user.id,
    null,
    { ohneKunde: true },
  )
  if (!erlaubt || !kontakt) return antwort({ error: 'Keine Berechtigung' }, 403)

  const meta = (inv.meta || {}) as Record<string, any>
  if (meta.rvSigned !== true) return antwort({ error: 'Die Reservierung ist noch nicht unterschrieben.' }, 409)

  // Die Auswahl aus der Anfrage, sonst die gespeicherte. Die Anfrage gewinnt,
  // damit ein gerade erst gesetzter Haken nicht auf das Speichern warten muss.
  const gewaehlt = kennungenLesen(body.partnerIds).length > 0
    ? kennungenLesen(body.partnerIds)
    : kennungenLesen(meta.finanzierungspartnerIds)
  if (gewaehlt.length === 0) return antwort({ error: 'Kein Finanzierungspartner gewählt' }, 400)

  const { data: partnerRollen } = await db
    .from('user_roles').select('user_id').eq('role', FINANZIERUNGSPARTNER_ROLLE).in('user_id', gewaehlt)
  const { data: profile } = await db.from('profiles').select('id, name, email').in('id', gewaehlt)
  const { empfaenger, uebersprungen } = partnerEmpfaenger(
    gewaehlt,
    (partnerRollen || []).map((r: { user_id: string }) => r.user_id),
    profile || [],
  )

  // Objekt und Einheit: zuerst am Investment, sonst aus den Stammdaten.
  let objektTitel = String(meta.objektTitel || inv.objekt || '').trim()
  let weNr = String(meta.weNr || inv.wohnung || '').trim()
  if (!objektTitel && meta.objektId) {
    const { data: o } = await db.from('objekte').select('titel').eq('id', meta.objektId).maybeSingle()
    objektTitel = String(o?.titel || '').trim()
  }
  if (!weNr && meta.wohnungId) {
    const { data: w } = await db.from('wohnungen').select('we_nr').eq('id', meta.wohnungId).maybeSingle()
    weNr = String(w?.we_nr || '').trim()
  }

  const kundeName = `${kontakt.vorname || ''} ${kontakt.nachname || ''}`.trim()
  const pfad = finanzierungPfad(inv.kunde_id as string, investmentId)
  const jetzt = new Date().toISOString()
  const ergebnisse: Array<{ userId: string; name: string; ok: boolean; grund?: string }> = []
  const neu: PartnerMeldung[] = []

  for (const e of empfaenger) {
    const versand = await sendeVorlage(db, {
      templateName: FINANZIERUNG_MELDUNG_VORLAGE,
      recipientEmail: e.email,
      idempotencyKey: `finanzierung-partner-${investmentId}-${e.id}-${jetzt}`,
      templateData: partnerMailDaten({
        partnerName: e.name,
        kundeName,
        objekt: objektMitEinheit(objektTitel, weNr),
        kaufpreis: kaufpreisFuerMail(inv),
        unterschriebenAm: datumDeutsch(meta.rvVertragsdatum || meta.rvSignedAt),
        link: `${BASIS}${pfad}`,
      }),
      metadata: { kontakt_id: inv.kunde_id, investment_id: investmentId, art: 'finanzierung_partner' },
    })
    ergebnisse.push({ userId: e.id, name: e.name, ok: versand.ok, ...(versand.ok ? {} : { grund: versand.grund }) })
    if (versand.ok) neu.push({ userId: e.id, am: jetzt })

    // Die Glocke geht auch dann, wenn die Mail scheitert: Sie ist der Weg im CRM.
    const { error: glockeFehler } = await db.from('benachrichtigungen').insert({
      benutzer_id: e.id,
      titel: 'Finanzierung kann starten',
      nachricht: `${kundeName || 'Ein Kunde'}: Die Reservierung ist unterschrieben. Kunden- und Objektunterlagen liegen im Abschnitt Finanzierung als ZIP bereit.`,
      link: pfad,
      gelesen: false,
    })
    if (glockeFehler) console.error('finanzierung-partner-benachrichtigen: Glocke', glockeFehler.message)
  }
  for (const u of uebersprungen) ergebnisse.push({ userId: u.id, name: '', ok: false, grund: u.grund })

  let meldungen = meldungenZusammenfuehren(meta.finanzierungPartnerMeldungen, [])
  if (neu.length > 0) {
    // Frisch lesen, damit eine Änderung seit dem Laden oben nicht verloren geht.
    const { data: frisch } = await db.from('investments').select('meta').eq('id', investmentId).maybeSingle()
    const aktuell = (frisch?.meta || meta) as Record<string, unknown>
    meldungen = meldungenZusammenfuehren(aktuell.finanzierungPartnerMeldungen, neu)
    const { error: schreibFehler } = await db
      .from('investments').update({ meta: { ...aktuell, finanzierungPartnerMeldungen: meldungen } }).eq('id', investmentId)
    if (schreibFehler) console.error('finanzierung-partner-benachrichtigen: Vermerk', schreibFehler.message)
  }

  // Ins Protokoll ohne Mailadressen.
  console.log('finanzierung-partner-benachrichtigen:', JSON.stringify({
    investmentId, versendet: neu.length, fehler: ergebnisse.filter((e) => !e.ok).length,
  }))
  return antwort({ ergebnisse, meldungen })
})
