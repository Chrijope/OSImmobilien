import { createClient } from 'npm:@supabase/supabase-js@2'
import { zustaendigerAnsprechpartner } from '../_shared/zustaendiger-ansprechpartner.ts'
import { automatikSchutz } from '../_shared/automatik-schutz.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

function isTodayMatch(dateStr: string): boolean {
  if (!dateStr) return false
  const now = new Date()
  const todayDay = now.getDate()
  const todayMonth = now.getMonth() + 1

  if (dateStr.includes('.')) {
    const parts = dateStr.split('.')
    if (parts.length < 2) return false
    return parseInt(parts[0], 10) === todayDay && parseInt(parts[1], 10) === todayMonth
  }
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-')
    if (parts.length < 3) return false
    return parseInt(parts[2], 10) === todayDay && parseInt(parts[1], 10) === todayMonth
  }
  return false
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Nur die Automatik darf hier hinein. Siehe _shared/automatik-schutz.ts;
  // ohne hinterlegtes Geheimwort laesst der Schutz im Uebergang noch durch.
  const abgewiesen = automatikSchutz(req, 'send-birthday-emails', corsHeaders)
  if (abgewiesen) return abgewiesen

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Missing env' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Get all profiles with birthdays
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, name, email, geburtstag')
    .not('geburtstag', 'is', null)

  if (profileError) {
    console.error('Failed to load profiles', profileError)
    return new Response(JSON.stringify({ error: 'Failed to load profiles' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Get roles to exclude "kunde"
  const { data: roles } = await supabase
    .from('user_roles')
    .select('user_id, role')

  const roleMap = new Map<string, string>()
  ;(roles || []).forEach((r: any) => roleMap.set(r.user_id, r.role))

  const today = new Date().toISOString().split('T')[0]
  let sent = 0

  for (const profile of profiles || []) {
    if (!isTodayMatch(profile.geburtstag || '')) continue

    const role = roleMap.get(profile.id) || 'kunde'
    if (!profile.email) continue

    // Choose template based on role
    const templateName = role === 'kunde' ? 'birthday-customer' : 'birthday-greeting'
    const idempotencyKey = `birthday-${profile.id}-${today}`

    let templateData: Record<string, any> = {
      name: profile.name?.split(' ')[0] || profile.name,
    }
    if (role === 'kunde' && profile.email) {
      const { data: kontakt } = await supabase
        .from('kontakte')
        .select('id, anrede, nachname, vorname')
        .ilike('email', profile.email)
        .maybeSingle()
      if (kontakt) {
        // Zustaendigen Partner als Unterschrift mitgeben, sonst gratuliert
        // der Platzhalter "OS Immobilien Team".
        const berater = await zustaendigerAnsprechpartner(supabase, kontakt.id)
        templateData = {
          name: kontakt.vorname || templateData.name,
          anrede: kontakt.anrede || undefined,
          nachname: kontakt.nachname || undefined,
          ...(berater ? { berater } : {}),
        }
      }
    }

    try {
      await supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName,
          recipientEmail: profile.email,
          idempotencyKey,
          templateData,
        },
      })
      sent++
      console.log(`Birthday email (${templateName}) sent to`, profile.email)
    } catch (e) {
      console.error('Failed to send birthday email', { email: profile.email, error: e })
    }
  }

  // ── Kunden und fortgeschrittene Kontakte ohne Portalkonto ───────────────
  //
  // Bis hier deckt die Function nur registrierte Nutzer ab, also Profile mit
  // Konto. Kunden, deren Portal noch nicht freigeschaltet ist, haben kein
  // Profil und gingen leer aus, obwohl ihr Geburtsdatum im Kontakt gepflegt
  // ist.
  //
  // Die Regel, von Christian am 02.08.2026 festgelegt: Geburtstagsmails
  // bekommen alle Kontakte mit Status "kunde", und zusätzlich alle, deren
  // Pipeline mindestens bei der Selbstauskunft steht. Dort wird das
  // Geburtsdatum erhoben, ab da kennt das Haus den Geburtstag. Frühe Leads,
  // Verlorene, Archivierte und der Papierkorb bekommen keine. Wer schon ein
  // Konto hat, wurde oben behandelt und wird über die Mailadresse
  // ausgelassen, sonst kämen zwei Mails an.
  //
  // Die Liste entspricht PIPELINE_STUFEN in src/lib/pipelineStufen.ts ab der
  // Stufe "selbstauskunft". Der Bestandskunden-Import steht mit drin, das
  // sind fertige Kunden.
  const STUFEN_AB_SELBSTAUSKUNFT = new Set([
    'selbstauskunft',
    'bonitaetsunterlagen',
    'objektauswahl',
    'follow_up_objekt',
    'reservierung',
    'finanzierung',
    'notar',
    'faelligkeit',
    'abrechnung',
    'abgeschlossen',
    'bestandsimport',
  ])

  const profilEmails = new Set(
    (profiles || [])
      .map((p: any) => (p.email || '').trim().toLowerCase())
      .filter(Boolean),
  )

  const { data: kunden, error: kundenError } = await supabase
    .from('kontakte')
    .select('id, anrede, vorname, nachname, email, status, geloescht, meta')

  if (kundenError) {
    console.error('Failed to load kontakte', kundenError)
  }

  for (const kunde of kunden || []) {
    if (kunde.geloescht) continue // Papierkorb
    if (kunde.status === 'verloren' || kunde.status === 'inaktiv') continue
    const stufe = String(kunde.meta?.pipelineStufe || '')
    if (kunde.status !== 'kunde' && !STUFEN_AB_SELBSTAUSKUNFT.has(stufe)) continue
    const email = (kunde.email || '').trim()
    if (!email) continue
    if (profilEmails.has(email.toLowerCase())) continue // hat ein Konto
    if (!isTodayMatch(kunde.meta?.geburtsdatum || '')) continue

    try {
      // Zustaendigen Partner als Unterschrift mitgeben, sonst gratuliert der
      // Platzhalter "OS Immobilien Team".
      const berater = await zustaendigerAnsprechpartner(supabase, kunde.id)
      await supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'birthday-customer',
          recipientEmail: email,
          idempotencyKey: `birthday-kontakt-${kunde.id}-${today}`,
          kontaktId: kunde.id,
          templateData: {
            name: kunde.vorname || kunde.meta?.vorname || 'Kunde',
            anrede: kunde.anrede || undefined,
            nachname: kunde.nachname || undefined,
            ...(berater ? { berater } : {}),
          },
        },
      })
      sent++
      console.log('Birthday email (birthday-customer, ohne Konto) sent to', email)
    } catch (e) {
      console.error('Failed to send birthday email (kontakt)', { email, error: e })
    }
  }

  return new Response(JSON.stringify({ success: true, sent }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
