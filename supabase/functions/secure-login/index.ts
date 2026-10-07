import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0'
import { checkEdgeRateLimit, clientIp } from '../_shared/edge-rate-limit.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const MAX_ATTEMPTS = 5
const WINDOW_MINUTES = 15
const LOCKOUT_MINUTES = 15

/**
 * Antwort fuer einen Kunden, dessen Portal gesperrt ist (Function
 * kundenportal-sperre). Die Anmeldeseite zeigt dazu einen ruhigen Hinweis.
 */
function zugangGesperrtAntwort(): Response {
  return new Response(JSON.stringify({
    error: 'zugang_gesperrt',
    message: 'Dein Zugang ist gerade gesperrt. Bitte wende dich an deinen Ansprechpartner.',
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json().catch(() => ({}))
    const email = (body?.email ?? '').toString().trim().toLowerCase()
    const password = (body?.password ?? '').toString()

    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'E-Mail und Passwort erforderlich' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
              || req.headers.get('cf-connecting-ip')
              || null

    // 0) Edge-Rate-Limit (Brute-Force-Schutz auf IP+Email-Ebene, bevor Auth angefragt wird)
    const rlKey = `${clientIp(req)}|${email}`
    const rl = await checkEdgeRateLimit({ scope: 'secure-login', key: rlKey, perHour: 20, perDay: 100 })
    if (rl.exceeded) {
      return new Response(JSON.stringify({
        error: 'rate_limited',
        message: 'Zu viele Anmeldeversuche. Bitte später erneut versuchen.',
        retry_after_seconds: rl.retryAfterSeconds,
      }), {
        status: 429,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Retry-After': String(rl.retryAfterSeconds ?? 3600),
        },
      })
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

    // 1) Lockout-Check
    const { data: lockData } = await admin.rpc('check_auth_lockout', { _email: email })
    if (lockData?.locked) {
      const retry = Number(lockData.retry_after_seconds ?? 0)
      return new Response(JSON.stringify({
        error: 'account_locked',
        message: `Zu viele Fehlversuche. Bitte warte ${Math.ceil(retry / 60)} Minute(n) und versuche es erneut.`,
        retry_after_seconds: retry,
        locked_until: lockData.locked_until,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 2) Sign-In versuchen (anon Client, damit echte Auth-Logik greift)
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
    const { data: signInData, error: signInError } = await userClient.auth.signInWithPassword({ email, password })

    // Gesperrtes Konto: Die Function kundenportal-sperre sperrt die Anmeldung
    // eines Kunden, dessen Portal gesperrt wurde (`ban_duration`). Supabase
    // meldet das als `user_banned`. Das ist kein Fehlversuch: Am Passwort
    // liegt es nicht, und fuenf Versuche wuerden sonst eine Lockout-Mail an
    // alle Admins ausloesen. Der Browser zeigt dazu einen ruhigen Hinweis.
    const gesperrt = (signInError as { code?: string } | null)?.code === 'user_banned'
      || /banned/i.test(signInError?.message ?? '')
    if (gesperrt) return zugangGesperrtAntwort()

    if (signInError || !signInData?.session) {
      // 3a) Fehlversuch registrieren
      const { data: rec } = await admin.rpc('record_auth_attempt', {
        _email: email,
        _success: false,
        _ip: ip,
        _max_attempts: MAX_ATTEMPTS,
        _window_minutes: WINDOW_MINUTES,
        _lockout_minutes: LOCKOUT_MINUTES,
      })

      // E-Mails + Benachrichtigungen wenn gerade gesperrt
      if (rec?.just_locked) {
        try {
          // Profil suchen (falls Account existiert)
          const { data: profile } = await admin
            .from('profiles')
            .select('id, name, email')
            .ilike('email', email)
            .maybeSingle()

          const payload = {
            templateName: 'account-lockout',
            recipientEmail: profile?.email || email,
            templateData: {
              name: profile?.name?.split(' ')[0] || '',
              email,
              ip: ip || 'Unbekannt',
              zeitpunkt: fmtTime(new Date().toISOString()),
              locked_until: fmtTime(rec.locked_until),
              lockout_count: rec.lockout_count ?? 1,
              max_attempts: MAX_ATTEMPTS,
            },
            idempotencyKey: `account-lockout-${email}-${rec.locked_until}`,
          }

          // Mail an den Account-Inhaber (falls Profil existiert)
          if (profile?.email) {
            await admin.functions.invoke('send-transactional-email', { body: payload })
          }

          // Admins/Inhaber benachrichtigen
          const { data: adminRoles } = await admin
            .from('user_roles')
            .select('user_id')
            .in('role', ['admin', 'inhaber'])
          const adminIds = (adminRoles ?? []).map((r: any) => r.user_id)

          if (adminIds.length > 0) {
            // In-App
            const notifs = adminIds.map((uid: string) => ({
              benutzer_id: uid,
              titel: 'Account-Lockout ausgelöst',
              nachricht: `Account "${email}" wurde nach ${MAX_ATTEMPTS} Fehlversuchen für ${LOCKOUT_MINUTES} Min. gesperrt (IP: ${ip || 'unbekannt'}).`,
              link: '/session-anomalien',
            }))
            await admin.from('benachrichtigungen').insert(notifs)

            // E-Mail an Admins
            const { data: adminProfiles } = await admin
              .from('profiles')
              .select('email')
              .in('id', adminIds)
            for (const p of (adminProfiles ?? [])) {
              if (!p?.email) continue
              await admin.functions.invoke('send-transactional-email', {
                body: {
                  ...payload,
                  recipientEmail: p.email,
                  templateData: { ...payload.templateData, adminAlert: true, targetEmail: email },
                  idempotencyKey: `account-lockout-admin-${email}-${rec.locked_until}-${p.email}`,
                },
              })
            }
          }

          // Audit-Log
          await admin.from('audit_log').insert({
            action: 'account_lockout',
            entity: 'auth_lockouts',
            entity_id: email,
            meta: { email, ip, locked_until: rec.locked_until, lockout_count: rec.lockout_count },
          })
        } catch (e) {
          console.error('lockout notification failed:', e)
        }
      }

      return new Response(JSON.stringify({
        error: 'invalid_credentials',
        message: signInError?.message?.includes('Email not confirmed')
          ? 'Bitte bestätige zuerst deine E-Mail-Adresse.'
          : 'Ungültige Anmeldedaten.',
        remaining_attempts: rec?.remaining ?? null,
        just_locked: !!rec?.just_locked,
        locked_until: rec?.locked_until ?? null,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 3b) Erfolg → Zähler zurücksetzen
    await admin.rpc('record_auth_attempt', {
      _email: email,
      _success: true,
      _ip: ip,
      _max_attempts: MAX_ATTEMPTS,
      _window_minutes: WINDOW_MINUTES,
      _lockout_minutes: LOCKOUT_MINUTES,
    })

    // Portal gesperrt, Anmeldung aber noch offen: etwa wenn die Anmeldesperre
    // beim Sperren nicht durchging oder der Bestand aus der Migration vom
    // 23.09.2026 kommt. Dann gibt es keine Sitzung, die eben erzeugte wird
    // gleich wieder beendet. Fehlt die Migration, fehlt die Funktion; dann
    // bleibt es beim bisherigen Ablauf und das Portal zeigt den Hinweis.
    const { data: portalGesperrt, error: sperrFehler } = await admin.rpc('kunde_portal_gesperrt', {
      _user_id: signInData.user.id,
    })
    if (!sperrFehler && portalGesperrt === true) {
      const { error: abmeldeFehler } = await admin.auth.admin.signOut(signInData.session.access_token)
      if (abmeldeFehler) console.error('secure-login: Sitzung eines gesperrten Kunden nicht beendet', abmeldeFehler)
      return zugangGesperrtAntwort()
    }

    return new Response(JSON.stringify({
      session: signInData.session,
      user: signInData.user,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    console.error('secure-login error:', e)
    return new Response(JSON.stringify({ error: 'internal_error', message: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})