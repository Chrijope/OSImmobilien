import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { TEMPLATES, folgtKundensprache } from '../_shared/transactional-email-templates/registry.ts'
import { ansprechpartnerErgaenzen } from '../_shared/ansprechpartner.ts'
import { hrAnsprechpartner, type Ansprechpartner as HrPerson } from '../_shared/hr-ansprechpartner.ts'
import { bewerberAbsender, istBewerbermail } from '../_shared/bewerber-absender.ts'
import { ermittleMailSprache } from '../_shared/mail-sprache-ermitteln.ts'
import {
  TEAM_ABSENDER,
  absenderName,
  antwortAdresse,
  zustaendigenPartnerLaden,
  type ZustaendigerPartner,
} from '../_shared/zustaendiger-absender.ts'
import { istDienstAnfrage } from '../_shared/objekt-texte-sammel.ts'
import { checkEdgeRateLimit } from '../_shared/edge-rate-limit.ts'
import {
  EXTERNE_VORLAGEN,
  MAIL_BREMSE,
  TEAM_POSTFAECHER,
  ermittleAufrufer,
  normalisiereAdresse,
  pruefeMailZugang,
  type MailAufrufer,
} from '../_shared/mail-zugang.ts'

// Configuration baked in at scaffold time
const SITE_NAME = "OS Immobilien"
const SENDER_DOMAIN = "notify.os-immobilien.com"
const FROM_DOMAIN = "osimmobilien.netlify.app"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

// Generate a cryptographically random 32-byte hex token
function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Vorlagen, die es nicht mehr gibt. Beide Bestaetigungsmails an Leads, bei der
// Zuweisung an einen Partner und beim Eingang ueber die Microseite, sind am
// 26.09.2026 auf Christians Wunsch entfallen. Fragt ein alter Aufrufer sie noch
// an, bekommt er eine klare Antwort statt der langen Liste aller Vorlagen, und
// es geht nichts raus. Nur hier duerfen die beiden Namen noch stehen, das
// prueft src/lib/leadBestaetigungEntfallen.test.ts.
//
// Ebenso die drei alten Mails an nicht erreichte Leads, eine bei jedem
// verpassten Anruf. Seit dem 26.09.2026 gibt es stattdessen genau drei, nach
// dem 1., 4. und 10. Anruf (nicht-erreicht-mail-1 bis -3). Ein noch offener
// alter Browser-Tab darf dem Lead nicht weiter bei jedem Versuch schreiben.
// Geprueft in src/lib/nichtErreichtMails.test.ts.
//
// Ebenso die Erinnerung an Tag 8 aus der Kette des Kennenlernbogens, entfallen
// am 26.09.2026. Es bleiben Einladung, Tag 3 und Tag 11. Ein Zeitplan mit
// altem Stand darf sie nicht mehr verschicken. Geprueft in
// src/lib/kennenlernenTag8Entfallen.test.ts.
const ENTFALLENE_VORLAGEN = new Set([
  'meta-lead-bestaetigung',
  'microseite-lead-bestaetigung',
  'setter-nicht-erreicht',
  'vp-nicht-erreicht',
  'lead-nicht-erreicht',
  'bewerber-kennenlernen-erinnerung-2',
])

// Wer aufrufen darf, entscheidet die Function selbst (Befund HB-003, siehe
// _shared/mail-zugang.ts). Die JWT-Pruefung am Gateway allein reicht nicht:
// Sie laesst den oeffentlichen anon-Schluessel durch.

// Wie an den anderen Stellen dieser Function (`supabase as never`): der
// Client-Typ haengt an der npm-Fassung und passt nicht zu einem festen Typ.
// deno-lint-ignore no-explicit-any
type Db = any

/** Gehoert die Adresse dem angemeldeten Nutzer selbst? */
async function istEigeneAdresse(db: Db, aufrufer: { nutzerId: string; email: string }, adresse: string): Promise<boolean> {
  if (!adresse) return false
  if (adresse === aufrufer.email) return true
  const [tippgeber, kontakte] = await Promise.all([
    db.from('tippgeber').select('email').eq('benutzer_id', aufrufer.nutzerId),
    // Dieselbe Verknuepfung wie im Kundenportal (KundePortalLayout).
    db.from('kontakte').select('email, meta')
      .or(`meta->>authUserId.eq.${aufrufer.nutzerId},meta->person2->>authUserId.eq.${aufrufer.nutzerId}`),
  ])
  const adressen = [
    ...((tippgeber.data || []) as Array<{ email?: unknown }>).map((z) => z.email),
    ...((kontakte.data || []) as Array<{ email?: unknown; meta?: Record<string, unknown> | null }>)
      .flatMap((z) => [z.email, z.meta?.portalEmail, z.meta?.email]),
  ]
  return adressen.some((a) => normalisiereAdresse(a) === adresse)
}

/** Ist die Adresse ein Team-Postfach oder das Profil eines internen Nutzers? */
async function istTeamAdresse(db: Db, adresse: string): Promise<boolean> {
  if (!adresse) return false
  if (TEAM_POSTFAECHER.includes(adresse)) return true
  // ilike, weil Profile gemischte Schreibweise tragen; der genaue Vergleich
  // danach, weil `_` in ilike ein Platzhalter ist.
  const { data } = await db.from('profiles').select('id, email').ilike('email', adresse).limit(5)
  for (const profil of (data || []) as Array<{ id: string; email?: unknown }>) {
    if (normalisiereAdresse(profil.email) !== adresse) continue
    const { data: intern } = await db.rpc('is_internal_role', { _user_id: profil.id })
    if (intern === true) return true
  }
  return false
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required environment variables')
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Create Supabase client with service role (bypasses RLS)
  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const antwort = (status: number, inhalt: Record<string, unknown>) =>
    new Response(JSON.stringify(inhalt), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  // 0. Wer ruft auf? Nicht angemeldet: Schluss, bevor irgendetwas passiert.
  let aufrufer: MailAufrufer
  try {
    aufrufer = await ermittleAufrufer(req.headers.get('Authorization'), {
      /*
       * Bis zum 27.09.2026 zaehlte hier nur `Authorization: Bearer`. Mit einem
       * Schluessel im neuen Format schickt supabase-js ihn aber nur im Kopf
       * `apikey`, jede Systemmail von Function zu Function kam dann als
       * „anonym“ an und endete mit 401, etwa „Neuen Link senden“ zur
       * Selbstauskunft. Einzelheiten bei istDienstAnfrage.
       */
      istDienst: () => istDienstAnfrage(req.headers, supabaseServiceKey),
      nutzerAusToken: async (token) => {
        const { data, error } = await supabase.auth.getUser(token)
        return error || !data?.user ? null : { id: data.user.id, email: data.user.email ?? '' }
      },
      istIntern: async (nutzerId) => {
        const { data, error } = await supabase.rpc('is_internal_role', { _user_id: nutzerId })
        if (error) throw new Error(error.message)
        return data === true
      },
    })
  } catch (fehler) {
    console.error('Aufrufer nicht pruefbar, nichts versendet', fehler)
    return antwort(500, { error: 'Berechtigung konnte nicht geprueft werden' })
  }
  if (aufrufer.art === 'anonym') {
    // Nur ob die Koepfe da sind, nie ihr Inhalt. Das unterscheidet im
    // Protokoll einen Browser ohne Sitzung von einer Function mit falschem Kopf.
    console.warn('Aufruf ohne Anmeldung abgewiesen', {
      mitAuthorization: Boolean(req.headers.get('Authorization')),
      mitApikey: Boolean(req.headers.get('apikey')),
    })
    return antwort(401, { error: 'Anmeldung erforderlich' })
  }
  if (aufrufer.art !== 'dienst') {
    const bremse = await checkEdgeRateLimit({
      scope: `send-transactional-email-${aufrufer.art}`,
      key: `nutzer:${aufrufer.nutzerId}`,
      ...MAIL_BREMSE[aufrufer.art],
    })
    if (bremse.exceeded) {
      console.warn('Mengenbremse erreicht', { art: aufrufer.art, nutzerId: aufrufer.nutzerId })
      return antwort(429, { error: 'rate_limited' })
    }
  }

  // Parse request body
  let templateName: string
  let recipientEmail: string
  let idempotencyKey: string
  let messageId: string
  let templateData: Record<string, any> = {}
  let extraMetadata: Record<string, any> | null = null
  let attachments: any[] | null = null
  let replyTo: string | null = null
  // Kundensprache: ausdruecklich mitgegeben, oder der Kontakt, ueber den
  // sie sich ermitteln laesst. Siehe Schritt 3c.
  let spracheMitgegeben: unknown = undefined
  let kontaktIdMitgegeben: unknown = undefined
  try {
    const body = await req.json()
    templateName = body.templateName || body.template_name
    recipientEmail = body.recipientEmail || body.recipient_email
    messageId = crypto.randomUUID()
    idempotencyKey = body.idempotencyKey || body.idempotency_key || messageId
    if (body.templateData && typeof body.templateData === 'object') {
      templateData = body.templateData
    }
    if (body.metadata && typeof body.metadata === 'object') {
      extraMetadata = body.metadata
    }
    if (Array.isArray(body.attachments) && body.attachments.length > 0) {
      attachments = body.attachments
    }
    // Antwortadresse, etwa der Kunde hinter einer Anlage-V-Mail an dessen
    // Steuerberater. Ohne Angabe antwortet der Empfaenger an noreply@.
    if (typeof (body.replyTo || body.reply_to) === 'string') {
      replyTo = (body.replyTo || body.reply_to).trim() || null
    }
    spracheMitgegeben = body.sprache ?? body.lang ?? templateData.sprache
    kontaktIdMitgegeben =
      body.kontaktId ?? body.kontakt_id ??
      extraMetadata?.kontaktId ?? extraMetadata?.kontakt_id ??
      templateData.kontaktId ?? templateData.kontakt_id
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON in request body' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  if (!templateName) {
    return new Response(
      JSON.stringify({ error: 'templateName is required' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  if (ENTFALLENE_VORLAGEN.has(templateName)) {
    console.warn('Entfallene Vorlage angefragt, nichts versendet', { templateName })
    return new Response(
      JSON.stringify({
        error: `Vorlage '${templateName}' ist entfallen und wird nicht mehr versendet.`,
        entfallen: true,
      }),
      {
        status: 410,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // 1. Look up template from registry (early — needed to resolve recipient)
  const template = TEMPLATES[templateName]

  if (!template) {
    console.error('Template not found in registry', { templateName })
    return new Response(
      JSON.stringify({
        error: `Template '${templateName}' not found. Available: ${Object.keys(TEMPLATES).join(', ')}`,
      }),
      {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Resolve effective recipient: template-level `to` takes precedence over
  // the caller-provided recipientEmail. This allows notification templates
  // to always send to a fixed address (e.g., site owner from env var).
  const effectiveRecipient = template.to || recipientEmail

  if (!effectiveRecipient) {
    return new Response(
      JSON.stringify({
        error: 'recipientEmail is required (unless the template defines a fixed recipient)',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Nutzer ohne interne Rolle: nur freigegebene Vorlagen an freigegebene
  // Empfaenger, und ohne Anhaenge oder fremde Antwortadresse.
  if (aufrufer.art === 'extern') {
    const regel = EXTERNE_VORLAGEN[templateName]
    const adresse = normalisiereAdresse(effectiveRecipient)
    let empfaengerPasst = false
    try {
      if (regel === 'eigene') empfaengerPasst = await istEigeneAdresse(supabase, aufrufer, adresse)
      if (regel === 'team') empfaengerPasst = await istTeamAdresse(supabase, adresse)
    } catch (fehler) {
      console.error('Empfaenger nicht pruefbar, nichts versendet', { templateName, fehler })
    }
    const entscheidung = pruefeMailZugang(aufrufer, templateName, empfaengerPasst)
    if (!entscheidung.erlaubt) {
      console.warn('Versand abgewiesen', { templateName, nutzerId: aufrufer.nutzerId, grund: entscheidung.grund })
      return antwort(entscheidung.status, { error: entscheidung.grund })
    }
    attachments = null
    replyTo = null
  }

  /*
   * Pflichtmails: Vorgangsmails, ohne die ein laufender Vorgang stehen bleibt.
   *
   * Anlass: Ein einzelner Bounce von Yahoo hat die Adresse eines Kunden auf
   * die Sperrliste gesetzt, danach kam die Selbstauskunft nie mehr an und
   * niemand hat es gemerkt. Diese Mails gehen deshalb auch dann raus, wenn
   * die Adresse wegen eines Bounces oder einer Abmeldung gesperrt ist.
   *
   * Ausgenommen bleibt nur die Spam-Beschwerde: Wer uns als Spam gemeldet
   * hat, bekommt nichts mehr. Sonst leidet die Zustellbarkeit fuer alle
   * anderen Empfaenger, und rechtlich ist es ohnehin nicht haltbar.
   */
  const PFLICHTMAILS = new Set([
    'sa-invitation',
    // Antwort auf die eigene Anfrage des Kunden (offene Selbstauskunft, HB-009).
    'selbstauskunft-liegt-vor',
    'selbstauskunft-signatur',
    'selbstauskunft-pdf',
    'selbstauskunft-geaendert',
    'selbstauskunft-unterschrieben',
    'sa-abbrecher-reminder',
    'sa-reminder-1',
    'sa-reminder-2',
    'sa-reminder-3',
    'reservierung-signatur',
    'reservierung-unterschrieben',
    // Die Vertragskopie mit Widerrufsbelehrung nach der letzten Unterschrift
    // (§ 312f Abs. 2 BGB). Ohne sie beginnt die Widerrufsfrist nicht zu
    // laufen; ein alter Bounce darf sie nicht stumm blockieren.
    'reservierung-kopie',
    'vertrag-signatur',
    'aftersales-beratung-signatur',
    'activation-invite',
    'document-reminder',
    // Der Kunde schickt seine Anlage-V-Aufstellung an seinen Steuerberater.
    // Der Empfaenger ist kein Newsletter-Empfaenger: eine alte Abmeldung oder
    // ein Bounce darf diese ausdruecklich ausgeloeste Zustellung nicht stumm
    // blockieren. Nur die Spam-Beschwerde sperrt weiterhin (siehe oben).
    'anlage-v-aufstellung',
    // Zugangsdaten der neuen persoenlichen @os-immobilien.com-Adresse an die private
    // Bewerber-Adresse. Der Partner braucht diese Mail zwingend fuer den
    // Start; eine alte Abmeldung oder ein Bounce darf sie nicht stumm
    // blockieren. Nur die Spam-Beschwerde sperrt weiterhin (siehe oben).
    'bewerber-zugangsdaten',
  ])
  const istPflichtmail = PFLICHTMAILS.has(templateName)

  // 2. Check suppression list (fail-closed: if we can't verify, don't send)
  const { data: suppressed, error: suppressionError } = await supabase
    .from('suppressed_emails')
    .select('id, reason')
    .eq('email', effectiveRecipient.toLowerCase())
    .maybeSingle()

  if (suppressionError) {
    console.error('Suppression check failed — refusing to send', {
      error: suppressionError,
      effectiveRecipient,
    })
    return new Response(
      JSON.stringify({ error: 'Failed to verify suppression status' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Bei einer Pflichtmail zaehlt nur die Spam-Beschwerde als echte Sperre.
  const gesperrt = suppressed
    ? !istPflichtmail || suppressed.reason === 'complaint'
    : false

  if (suppressed && !gesperrt) {
    console.log('Sperrliste fuer Pflichtmail uebergangen', {
      templateName,
      reason: suppressed.reason,
    })
  }

  if (gesperrt) {
    // Log the suppressed attempt
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'suppressed',
      metadata: extraMetadata,
    })

    console.log('Email suppressed', { effectiveRecipient, templateName })
    return new Response(
      JSON.stringify({ success: false, reason: 'email_suppressed' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // 3. Get or create unsubscribe token (one token per email address)
  const normalizedEmail = effectiveRecipient.toLowerCase()
  let unsubscribeToken: string

  // Check for existing token for this email
  const { data: existingToken, error: tokenLookupError } = await supabase
    .from('email_unsubscribe_tokens')
    .select('token, used_at')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (tokenLookupError) {
    console.error('Token lookup failed', {
      error: tokenLookupError,
      email: normalizedEmail,
    })
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'failed',
      error_message: 'Failed to look up unsubscribe token',
      metadata: extraMetadata,
    })
    return new Response(
      JSON.stringify({ error: 'Failed to prepare email' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  if (existingToken && !existingToken.used_at) {
    // Reuse existing unused token
    unsubscribeToken = existingToken.token
  } else if (!existingToken) {
    // Create new token — upsert handles concurrent inserts gracefully
    unsubscribeToken = generateToken()
    const { error: tokenError } = await supabase
      .from('email_unsubscribe_tokens')
      .upsert(
        { token: unsubscribeToken, email: normalizedEmail },
        { onConflict: 'email', ignoreDuplicates: true }
      )

    if (tokenError) {
      console.error('Failed to create unsubscribe token', {
        error: tokenError,
      })
      await supabase.from('email_send_log').insert({
        message_id: messageId,
        template_name: templateName,
        recipient_email: effectiveRecipient,
        status: 'failed',
        error_message: 'Failed to create unsubscribe token',
        metadata: extraMetadata,
      })
      return new Response(
        JSON.stringify({ error: 'Failed to prepare email' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // If another request raced us, our upsert was silently ignored.
    // Re-read to get the actual stored token.
    const { data: storedToken, error: reReadError } = await supabase
      .from('email_unsubscribe_tokens')
      .select('token')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (reReadError || !storedToken) {
      console.error('Failed to read back unsubscribe token after upsert', {
        error: reReadError,
        email: normalizedEmail,
      })
      await supabase.from('email_send_log').insert({
        message_id: messageId,
        template_name: templateName,
        recipient_email: effectiveRecipient,
        status: 'failed',
        error_message: 'Failed to confirm unsubscribe token storage',
        metadata: extraMetadata,
      })
      return new Response(
        JSON.stringify({ error: 'Failed to prepare email' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
    unsubscribeToken = storedToken.token
  } else {
    // Token exists but is already used — email should have been caught by suppression check above.
    // Bei Pflichtmails wird der verbrauchte Abmeldelink bewusst ignoriert,
    // sonst blockiert eine alte Abmeldung den laufenden Vorgang.
    if (istPflichtmail) {
      unsubscribeToken = existingToken.token
    } else {
    console.warn('Unsubscribe token already used but email not suppressed', {
      email: normalizedEmail,
    })
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'suppressed',
      error_message:
        'Unsubscribe token used but email missing from suppressed list',
      metadata: extraMetadata,
    })
    return new Response(
      JSON.stringify({ success: false, reason: 'email_suppressed' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
    }
  }

  /*
   * 3b. Im Bewerberprozess steht immer die HR-Managerin unter der Mail.
   *
   * Christian am 21.09.2026: „der ansprechpartner am fuss der mail muss im
   * bewerber prozess immer auf sarah laufen nie auf christian kurz".
   *
   * Aufgeloest wird ueber die Rolle `hr`, nicht ueber einen Namen. Wechselt die
   * Person, wechselt der Kasten mit, ohne dass jemand Code anfasst. Ueber den
   * Namen zu suchen ist hier schon einmal schiefgegangen, weil zwei Konten
   * denselben Namen trugen.
   *
   * Nur ergaenzt, nie ueberschrieben: Mehrere Bewerber-Funktionen setzen den
   * Kasten bereits selbst, und die wissen es genauer als diese Stelle.
   *
   * Nur fuer `bewerber-*`. Die Vertragsmails gehoeren zu einem anderen
   * Abschnitt und siezen, dort entscheidet der Aufrufer.
   */
  //
  // Die Person wird fuer jede Bewerbermail hier frisch geladen, auch wenn der
  // Aufrufer schon einen Kasten mitschickt: Der Absender weiter unten (3b3)
  // darf nie aus Angaben des Aufrufers stammen.
  let hrFuerBewerber: HrPerson | undefined
  if (templateName.startsWith('bewerber-') || istBewerbermail(templateName)) {
    hrFuerBewerber = await hrAnsprechpartner(supabase as never)
    if (templateName.startsWith('bewerber-') && !templateData.hrKontakt && hrFuerBewerber?.name) {
      templateData = { ...templateData, hrKontakt: hrFuerBewerber }
    }
  }

  /*
   * 3b2. Absender ist der zustaendige Partner, nicht wer geklickt hat.
   *
   * Fuer Vorlagen mit `absender: 'zustaendiger-partner'`, derzeit die drei
   * Mails an nicht erreichte Leads. Der Partner kommt aus
   * `kontakte.zustaendig_id` des mitgegebenen Kontakts, hier frisch aus der
   * Datenbank gelesen. Was der Aufrufer als Ansprechpartner mitschickt, wird
   * verworfen: Sonst unterschriebe die Setterin, die den Anruf protokolliert
   * hat, oder ein Aufrufer mit dem oeffentlichen Schluessel koennte einen
   * beliebigen Namen in den Absender schreiben.
   *
   * Ist niemand zustaendig oder laesst es sich nicht nachsehen, schreibt das
   * OS Immobilien Team mit office@ als Antwortadresse. Eine Antwort an eine
   * Setterin, die den Lead danach nie wieder sieht, waere verloren.
   */
  let absenderAnzeige = SITE_NAME
  if (template.absender === 'zustaendiger-partner') {
    const kontaktId = typeof kontaktIdMitgegeben === 'string' ? kontaktIdMitgegeben.trim() : ''
    let partner: ZustaendigerPartner | null = null
    if (kontaktId) {
      try {
        partner = await zustaendigenPartnerLaden(supabase as never, kontaktId)
      } catch (fehler) {
        console.error('Zustaendiger Partner nicht lesbar, Mail geht vom Team', { templateName, fehler })
      }
    }
    const {
      berater: _berater,
      beraterUserId: _beraterUserId,
      ansprechpartnerId: _ansprechpartnerId,
      ansprechpartnerName: _ansprechpartnerName,
      ansprechpartnerEmail: _ansprechpartnerEmail,
      buchungsLink: _buchungsLink,
      ...ohneAnsprechpartner
    } = templateData
    templateData = partner
      ? {
          ...ohneAnsprechpartner,
          // Unterschrift mit Foto, Telefon und Adresse aus den Einstellungen
          // loest Schritt 4 ueber die Kennung auf, nie ueber den Namen.
          beraterUserId: partner.id,
          ...(partner.buchungslink ? { buchungsLink: partner.buchungslink } : {}),
        }
      : { ...ohneAnsprechpartner, berater: { ...TEAM_ABSENDER } }
    absenderAnzeige = absenderName(partner)
    replyTo = antwortAdresse(partner)
  }

  /*
   * 3b3. Mails an Bewerber kommen von der HR-Ansprechpartnerin.
   *
   * Seit dem 26.09.2026, gegen den Spamordner: "Sarah … | OS Immobilien" statt
   * "OS Immobilien", und eine Antwort landet bei ihr statt bei noreply@. Dieselbe
   * Person wie im Kasten unter der Mail (3b), ermittelt ueber die Kennung.
   * Ohne HR-Person: "OS Immobilien" mit office@ als Antwortadresse. Eine vom
   * Aufrufer ausdruecklich gesetzte Antwortadresse bleibt stehen.
   *
   * Interne Meldungen an HR (bewerber-neu-intern usw.) sind ausgenommen,
   * siehe BEWERBER_INTERNE_VORLAGEN. Geprueft in
   * src/lib/bewerberAbsender.test.ts.
   */
  if (istBewerbermail(templateName)) {
    const bewerberKopf = bewerberAbsender(hrFuerBewerber)
    absenderAnzeige = bewerberKopf.anzeige
    if (!replyTo) replyTo = bewerberKopf.antwortAn
  }

  /*
   * 3c. Die Sprache der Mail (Plan Kundensprache, Etappe 2).
   *
   * Nur Vorlagen, die an Kunden gehen und Englisch koennen, folgen der
   * Kundensprache. Alle anderen gehen deutsch hinaus, auch wenn der Aufrufer
   * etwas anderes schickt. Reihenfolge: mitgegebene Sprache, dann der
   * Kontakt (Kennung aus dem Aufruf oder den Metadaten), dann die
   * Empfaengeradresse. Findet sich nichts oder scheitert die Abfrage: Deutsch.
   * Eine Mail geht lieber deutsch hinaus als gar nicht.
   */
  let sprache: 'de' | 'en' = 'de'
  if (folgtKundensprache(templateName, template.sprachen)) {
    const ermittelt = await ermittleMailSprache(supabase as never, {
      sprache: spracheMitgegeben,
      kontaktId: typeof kontaktIdMitgegeben === 'string' ? kontaktIdMitgegeben : null,
      empfaenger: effectiveRecipient,
    })
    sprache = ermittelt.sprache
    // Die foermliche englische Anrede ("Dear Mr Mustermann,") braucht Herr
    // oder Frau. Viele Aufrufer schicken nur "Max Mustermann".
    if (ermittelt.anrede && !templateData.kundeAnrede) {
      templateData = { ...templateData, kundeAnrede: ermittelt.anrede }
    }
  }
  templateData = { ...templateData, sprache }
  // Im Versandprotokoll steht, in welcher Sprache die Mail hinausging.
  extraMetadata = { ...(extraMetadata || {}), sprache }

  // 4. Ansprechpartner aufloesen.
  //
  // Der Aufrufer schickt haeufig die Anmeldeadresse mit, der Kunde soll aber
  // die Adresse aus den Einstellungen sehen. Das wird hier zentral geradezogen,
  // damit es nicht an 35 Aufrufstellen einzeln richtig sein muss.
  templateData = await ansprechpartnerErgaenzen(
    supabase,
    template as { previewData?: Record<string, unknown> },
    templateData,
    req.headers.get('Authorization'),
  )

  // 5. Render React Email template to HTML and plain text
  const html = await renderAsync(
    React.createElement(template.component, templateData)
  )
  const plainText = await renderAsync(
    React.createElement(template.component, templateData),
    { plainText: true }
  )

  // Resolve subject — supports static string or dynamic function
  const resolvedSubject =
    typeof template.subject === 'function'
      ? template.subject(templateData)
      : template.subject

  // 6. Enqueue the pre-rendered email for async processing by the dispatcher.
  // The dispatcher (process-email-queue) handles sending, retries, and rate-limit backoff.

  // Log pending BEFORE enqueue so we have a record even if enqueue crashes
  await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: templateName,
    recipient_email: effectiveRecipient,
    status: 'pending',
    metadata: extraMetadata,
  })

  const { error: enqueueError } = await supabase.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      message_id: messageId,
      to: effectiveRecipient,
      from: `${absenderAnzeige} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject: resolvedSubject,
      html,
      text: plainText,
      purpose: 'transactional',
      label: templateName,
      idempotency_key: idempotencyKey,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
      ...(attachments ? { attachments } : {}),
      ...(replyTo ? { reply_to: replyTo } : {}),
    },
  })

  if (enqueueError) {
    console.error('Failed to enqueue email', {
      error: enqueueError,
      templateName,
      effectiveRecipient,
    })

    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'failed',
      error_message: 'Failed to enqueue email',
      metadata: extraMetadata,
    })

    return new Response(JSON.stringify({ error: 'Failed to enqueue email' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  console.log('Transactional email enqueued', { templateName, effectiveRecipient })

  return new Response(
    JSON.stringify({ success: true, queued: true }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  )
})
