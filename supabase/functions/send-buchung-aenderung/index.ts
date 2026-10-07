import { createClient } from 'npm:@supabase/supabase-js@2'
import { checkEdgeRateLimit, clientIp } from '../_shared/edge-rate-limit.ts'
import { ladeBuchungKontext, zeitSatz } from '../_shared/buchung-kontext.ts'
import { sendeVorlage } from '../_shared/transactional-versand.ts'
import { zustaendigOderLeitung } from '../_shared/glocke-zustaendiger.ts'

/**
 * send-buchung-aenderung
 *
 * Was passiert, nachdem der Kunde seinen Termin abgesagt oder verschoben hat.
 *
 * Bis hierher: nichts. Der Kunde sah auf der Verwaltungsseite einen gruenen
 * Kasten und hatte danach nichts mehr in der Hand, nach einer Verschiebung
 * sogar zwei widersprechende Staende: die alte Bestaetigungsmail und einen
 * Kalendereintrag auf der alten Zeit. Der Vertriebspartner erfuhr gar nichts.
 * Er sass moeglicherweise um zehn im Videoraum und wartete auf jemanden, der
 * zwei Tage vorher abgesagt hatte.
 *
 * Ab jetzt gehen hinaus:
 *
 *   nach einer Absage       eine kurze Bestaetigung an den Kunden, dazu Mail
 *                           und Glocke an den Vertriebspartner
 *   nach einer Verschiebung eine vollstaendige neue Bestaetigung an den Kunden
 *                           mit Videoraum und neuer Kalenderdatei, dazu Mail
 *                           und Glocke an den Vertriebspartner
 *
 * ── Warum die Sperre je Vorgang greift und nicht je Buchung ──
 *
 * Gegen doppelten Versand merkt sich `buchungen.meta`, was schon hinausging.
 * Bisher gab es dafuer genau eine Marke, `bestaetigung_at`, und die galt fuer
 * die ganze Buchung. Nach der Erstbestaetigung war damit alles gesperrt: Eine
 * Absage haette nichts ausgeloest, und ein Kunde, der dreimal verschiebt,
 * haette nach der ersten Mail nie wieder etwas gehoert.
 *
 * Deshalb hat jeder Vorgang seine eigene Marke:
 *
 *   `bestaetigung_at`  die Erstbestaetigung, gesetzt von
 *                      send-buchung-bestaetigung
 *   `absage_at`        die Absage. Sie kann nur einmal eintreten, eine
 *                      abgesagte Buchung laesst sich nicht erneut absagen.
 *   `mail_stand`       die Startzeit, die der Kunde per Mail kennt, in
 *                      Millisekunden seit 1970.
 *
 * Der Kniff steckt in `mail_stand`: Die Verschiebung wird nicht einmal
 * gesperrt, sondern je Zielzeit. Verschiebt der Kunde zum vierten Mal, steht
 * dort eine andere Zahl als die neue Startzeit, und es geht wieder eine Mail
 * hinaus. Ruft dagegen jemand denselben Aufruf zweimal ab, stimmen die Zahlen
 * ueberein und es passiert nichts.
 *
 * Belegt wird die Marke mit einem bedingten UPDATE, also mit derselben Zahl
 * als Bedingung, die vorher gelesen wurde. In Postgres ist das atomar: Zwei
 * gleichzeitige Aufrufe finden nur einmal die Bedingung erfuellt, der zweite
 * bekommt keine Zeile zurueck und sendet nichts.
 *
 * Uebergeben wird ausschliesslich der Absagetoken, niemals Adressen oder Namen
 * aus dem Browser. Alles Weitere steht in der Datenbank. `verify_jwt = false`,
 * denn der Kunde hat kein Konto; das Geheimnis ist der Token selbst.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function antwort(koerper: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(koerper), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return antwort({ error: 'Missing env' }, 500)
  }

  const basisAdresse = (Deno.env.get('APP_BASE_URL') || 'https://portal.more.immo').trim()

  // Ohne Anmeldung erreichbar, deshalb eine Ratenbremse je Absender.
  const bremse = await checkEdgeRateLimit({
    scope: 'buchung-aenderung',
    key: clientIp(req),
    perHour: 30,
    perDay: 200,
  })
  if (bremse.exceeded) {
    return new Response(
      JSON.stringify({ error: 'rate_limited', message: 'Zu viele Anfragen. Bitte später erneut versuchen.' }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Retry-After': String(bremse.retryAfterSeconds ?? 3600),
        },
      },
    )
  }

  let absageToken = ''
  try {
    const koerper = await req.json()
    absageToken = String(koerper?.absageToken || koerper?.absage_token || '').trim()
  } catch {
    return antwort({ error: 'Ungueltiger Koerper' }, 400)
  }

  if (!/^[0-9a-f]{32,128}$/i.test(absageToken)) {
    return antwort({ error: 'Kein gueltiger Token' }, 400)
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  try {
    const { data: buchung, error: buchungFehler } = await supabase
      .from('buchungen')
      .select('*')
      .eq('absage_token', absageToken)
      .maybeSingle()

    if (buchungFehler) {
      // Die Meldung aus Postgres bleibt im Log, sie nennt Tabellen- und
      // Spaltennamen und gehoert nicht in eine oeffentliche Antwort.
      console.error('[buchung-aenderung] Buchung nicht ladbar', buchungFehler)
      return antwort({ error: 'Die Buchung liess sich nicht laden' }, 500)
    }
    if (!buchung) {
      // Kein Hinweis darauf, ob der Token falsch oder die Buchung fort ist.
      return antwort({ ok: true, gesendet: false, grund: 'nichts zu senden' })
    }

    const meta = (buchung.meta || {}) as Record<string, unknown>
    const startZahl = new Date(String(buchung.start_at)).getTime()
    if (!Number.isFinite(startZahl)) {
      console.error('[buchung-aenderung] Buchung ohne brauchbare Startzeit', buchung.id)
      return antwort({ ok: true, gesendet: false, grund: 'keine Startzeit' })
    }
    const stand = String(startZahl)
    const alterStand = meta.mail_stand == null ? null : String(meta.mail_stand)

    // ── Welcher Vorgang ist das? ──
    //
    // Abgeleitet aus dem Zustand der Buchung, nicht aus einer Angabe des
    // Aufrufers. Wer den Aufruf nachbaut, soll nicht entscheiden koennen,
    // welche Mail hinausgeht.
    type Vorgang = 'absage' | 'verschoben' | null
    let vorgang: Vorgang = null
    if (buchung.status === 'abgesagt') {
      vorgang = meta.absage_at ? null : 'absage'
    } else if (buchung.status === 'offen') {
      // Gleicher Stand heisst: Der Kunde kennt diese Zeit bereits, entweder aus
      // der Erstbestaetigung oder aus einer frueheren Verschiebungsmail.
      vorgang = alterStand === stand ? null : 'verschoben'
    }

    if (!vorgang) {
      return antwort({ ok: true, gesendet: false, grund: 'nichts zu senden' })
    }

    // ── Platz belegen, bevor gesendet wird ──
    //
    // Der Vermerk entsteht VOR dem Versand und bleibt auch bei einem Fehlschlag
    // stehen. Sonst ginge bei einem dauerhaften Fehler bei jedem Aufruf erneut
    // eine Mail hinaus.
    const jetzt = new Date().toISOString()
    const neuesMeta =
      vorgang === 'absage'
        ? { ...meta, absage_at: jetzt, aenderung_fehler: null }
        : { ...meta, mail_stand: stand, verschoben_at: jetzt, aenderung_fehler: null }

    const schluessel = `${vorgang}:${buchung.id}:${stand}`
    const { data: claim, error: claimFehler } = await supabase.rpc('buchung_mail_claim', { _schluessel: schluessel })
    if (claimFehler) return antwort({ error: 'Versandsicherung nicht verfügbar' }, 503)
    if (claim === 'fertig') return antwort({ ok: true, gesendet: false, grund: 'bereits gesendet' })
    if (claim !== 'frei') return antwort({ error: 'Versand wird bereits bearbeitet' }, 409)

    // ── Alles zusammentragen ──
    //
    // Beim Verschieben geht dieselbe Kalender-UID mit neuer Zeit hinaus. Ohne
    // hoehere SEQUENCE lassen Apple Kalender und Outlook den alten Eintrag
    // stehen. Die Sekunden seit 1970 steigen mit jedem Versand und passen in
    // die 32 Bit, die der Standard dafuer vorsieht.
    const k = await ladeBuchungKontext(supabase, buchung, {
      supabaseUrl,
      basisAdresse,
      icsSequenz: vorgang === 'verschoben' ? Math.floor(Date.now() / 1000) : undefined,
    })

    // "Termin" ist der Notnagel, wenn weder Bezeichnung noch Terminart
    // gepflegt sind. Als Ueberschrift taugt er nicht.
    const anlass = k.titel.toLowerCase() === 'termin' ? undefined : k.titel

    // Die Zeit, die der Kunde bisher kannte. Sie steht nur in `mail_stand`:
    // Die Buchung selbst traegt bereits die neue Zeit, die alte ist dort fort.
    const alteZeit =
      alterStand && alterStand !== stand ? zeitSatz(new Date(Number(alterStand)), k.zone) : undefined

    const grund = String(buchung.absage_grund || '').trim()
    const fehler: string[] = []

    // Die Begleitperson der Buchung, sofern eine angegeben wurde. Sie hat die
    // Bestaetigung bekommen und muss deshalb auch von Absage und Verschiebung
    // erfahren, mit derselben Vorlage wie der Kunde und eigener Anrede.
    const begleitung = (buchung.begleitung || null) as { name?: string; email?: string } | null
    const begleitungEmail = String(begleitung?.email || '').trim()
    const begleitungTeile = String(begleitung?.name || '').trim().split(/\s+/).filter(Boolean)
    const begleitungVorname = begleitungTeile[0] || ''
    const begleitungNachname = begleitungTeile.slice(1).join(' ')

    if (vorgang === 'absage') {
      // ── A) Absage an den Kunden ──
      if (k.kundeEmail) {
        const ergebnis = await sendeVorlage(supabase, {
          templateName: 'buchung-absage',
          recipientEmail: k.kundeEmail,
          idempotencyKey: `buchung-absage-${buchung.id}`,
          templateData: {
            anrede: k.anrede,
            vorname: k.vorname,
            nachname: k.nachname,
            terminDatum: k.terminDatum,
            terminUhrzeit: k.terminUhrzeit,
            terminTitel: anlass,
            neuBuchenUrl: k.neuBuchenUrl || undefined,
            beraterUserId: buchung.mitarbeiter_id,
            berater: {},
          },
          // Kalenderdatei und Mail in derselben Kundensprache.
          sprache: k.sprache,
          metadata: { kontaktId: buchung.kontakt_id, quelle: 'buchungslink' },
        })
        if (!ergebnis.ok) fehler.push(`kunde: ${ergebnis.grund}`)
      } else {
        fehler.push('kunde: keine Adresse')
      }

      // ── A2) Absage an die Begleitperson ──
      if (begleitungEmail) {
        const ergebnis = await sendeVorlage(supabase, {
          templateName: 'buchung-absage',
          recipientEmail: begleitungEmail,
          idempotencyKey: `buchung-absage-begleitung-${buchung.id}`,
          templateData: {
            anrede: '',
            vorname: begleitungVorname,
            nachname: begleitungNachname,
            terminDatum: k.terminDatum,
            terminUhrzeit: k.terminUhrzeit,
            terminTitel: anlass,
            neuBuchenUrl: k.neuBuchenUrl || undefined,
            beraterUserId: buchung.mitarbeiter_id,
            berater: {},
          },
          // Kalenderdatei und Mail in derselben Kundensprache.
          sprache: k.sprache,
          metadata: { kontaktId: buchung.kontakt_id, quelle: 'buchungslink' },
        })
        if (!ergebnis.ok) fehler.push(`begleitung: ${ergebnis.grund}`)
      }

      // ── B) Absage an den Vertriebspartner ──
      if (k.partnerEmail) {
        const ergebnis = await sendeVorlage(supabase, {
          templateName: 'buchung-absage-partner',
          recipientEmail: k.partnerEmail,
          idempotencyKey: `buchung-absage-partner-${buchung.id}`,
          templateData: {
            kundeName: k.kundeName,
            kundeEmail: k.kundeEmail,
            kundeTelefon: k.kundeTelefon || undefined,
            grund: grund || undefined,
            terminDatum: k.terminDatum,
            terminUhrzeit: k.terminUhrzeit,
            terminDauer: k.dauer,
            terminTitel: anlass,
            kundeUrl: k.kundeUrl,
          },
          metadata: { kontaktId: buchung.kontakt_id, quelle: 'buchungslink' },
        })
        if (!ergebnis.ok) fehler.push(`partner: ${ergebnis.grund}`)
      } else {
        fehler.push('partner: keine Adresse')
      }
    } else {
      // ── A) Neue Bestaetigung an den Kunden ──
      if (k.kundeEmail) {
        const ergebnis = await sendeVorlage(supabase, {
          templateName: 'buchung-verschoben',
          recipientEmail: k.kundeEmail,
          idempotencyKey: `buchung-verschoben-${buchung.id}-${stand}`,
          templateData: {
            anrede: k.anrede,
            vorname: k.vorname,
            nachname: k.nachname,
            terminDatum: k.terminDatum,
            terminUhrzeit: k.terminUhrzeit,
            terminDauer: k.dauer,
            terminTitel: anlass,
            alteZeit,
            zugangUrl: k.zugangUrl || undefined,
            icsUrl: k.icsUrl,
            googleCalendarUrl: k.googleCalendarUrl,
            verwaltenUrl: k.verwaltenUrl,
            beraterUserId: buchung.mitarbeiter_id,
            berater: {},
          },
          // Kalenderdatei und Mail in derselben Kundensprache.
          sprache: k.sprache,
          metadata: { kontaktId: buchung.kontakt_id, quelle: 'buchungslink' },
        })
        if (!ergebnis.ok) fehler.push(`kunde: ${ergebnis.grund}`)
      } else {
        fehler.push('kunde: keine Adresse')
      }

      // ── A2) Neue Bestaetigung an die Begleitperson ──
      if (begleitungEmail) {
        const ergebnis = await sendeVorlage(supabase, {
          templateName: 'buchung-verschoben',
          recipientEmail: begleitungEmail,
          // Je Zielzeit ein eigener Schluessel, wie beim Kunden: Wer erneut
          // verschiebt, bekommt wieder eine Mail, ein doppelter Aufruf nicht.
          idempotencyKey: `buchung-verschoben-begleitung-${buchung.id}-${stand}`,
          templateData: {
            anrede: '',
            vorname: begleitungVorname,
            nachname: begleitungNachname,
            terminDatum: k.terminDatum,
            terminUhrzeit: k.terminUhrzeit,
            terminDauer: k.dauer,
            terminTitel: anlass,
            alteZeit,
            zugangUrl: k.zugangUrl || undefined,
            icsUrl: k.icsUrl,
            googleCalendarUrl: k.googleCalendarUrl,
            verwaltenUrl: k.verwaltenUrl,
            beraterUserId: buchung.mitarbeiter_id,
            berater: {},
          },
          // Kalenderdatei und Mail in derselben Kundensprache.
          sprache: k.sprache,
          metadata: { kontaktId: buchung.kontakt_id, quelle: 'buchungslink' },
        })
        if (!ergebnis.ok) fehler.push(`begleitung: ${ergebnis.grund}`)
      }

      // ── B) Neue Zeit an den Vertriebspartner ──
      if (k.partnerEmail) {
        const ergebnis = await sendeVorlage(supabase, {
          templateName: 'buchung-verschoben-partner',
          recipientEmail: k.partnerEmail,
          idempotencyKey: `buchung-verschoben-partner-${buchung.id}-${stand}`,
          templateData: {
            kundeName: k.kundeName,
            kundeEmail: k.kundeEmail,
            kundeTelefon: k.kundeTelefon || undefined,
            terminDatum: k.terminDatum,
            terminUhrzeit: k.terminUhrzeit,
            terminDauer: k.dauer,
            terminTitel: anlass,
            alteZeit,
            kundeUrl: k.kundeUrl,
            zugangUrl: k.zugangUrl || undefined,
          },
          metadata: { kontaktId: buchung.kontakt_id, quelle: 'buchungslink' },
        })
        if (!ergebnis.ok) fehler.push(`partner: ${ergebnis.grund}`)
      } else {
        fehler.push('partner: keine Adresse')
      }
    }

    // ── Die Glocke im CRM ──
    //
    // Wer seine Mails nur einmal am Tag liest, soll die Aenderung wenigstens
    // beim naechsten Blick ins CRM sehen.
    try {
      const wann = k.terminDatum && k.terminUhrzeit ? `${k.terminDatum} um ${k.terminUhrzeit} Uhr` : 'seinen Termin'
      const wer = k.kundeName || 'Ein Interessent'
      // Regel vom 29.09.2026: Mit Kontakt bekommt die Glocke der aktuelle
      // Zustaendige, ohne ihn die Leitung, nicht der Kalenderbesitzer. Ohne
      // Kontakt (Bewerber, intern) oder bei geloeschtem Kontakt bleibt es beim
      // Kalenderbesitzer, dann ohne Link aufs Kundenprofil.
      const zuKontakt = buchung.kontakt_id ? await zustaendigOderLeitung(supabase, buchung.kontakt_id) : null
      const empfaenger: string[] = zuKontakt ?? (buchung.mitarbeiter_id ? [buchung.mitarbeiter_id] : [])
      const { error: glockeFehler } = await supabase.from('benachrichtigungen').insert(empfaenger.map((uid) => ({
        benutzer_id: uid,
        titel: vorgang === 'absage' ? 'Termin abgesagt' : 'Termin verschoben',
        nachricht:
          vorgang === 'absage'
            ? `${wer} hat den Termin abgesagt: ${wann}.` + (grund ? ` Grund: ${grund.slice(0, 200)}` : '')
            : `${wer} hat den Termin verschoben. Neu: ${wann}.` +
              (alteZeit ? ` Bisher: ${alteZeit}.` : ''),
        link: zuKontakt ? `/kunden/${buchung.kontakt_id}` : '/termine',
        gelesen: false,
      })))
      // Die Postgres-Meldung kann Tabellen- und Spaltennamen nennen. Sie
      // gehoert ins Log, nicht in eine Antwort, die nach aussen geht.
      if (glockeFehler) {
        console.error('[buchung-aenderung] Glocke fehlgeschlagen', glockeFehler)
        fehler.push('glocke: konnte nicht angelegt werden')
      }
    } catch (f) {
      console.error('[buchung-aenderung] Glocke fehlgeschlagen', f)
      fehler.push('glocke: konnte nicht angelegt werden')
    }

    // Was schiefging, bleibt an der Buchung vermerkt, statt es durch ein
    // erneutes Senden zu verdecken. Besonders der Fall, dass die Adresse des
    // Vertriebspartners auf der Sperrliste steht: Die Mail wird dann still
    // verworfen, und ohne diesen Vermerk faellt es niemandem auf.
    await supabase.rpc('buchung_mail_meta_setzen', { _id: buchung.id, _patch: {
      ...(fehler.length === 0 ? (vorgang === 'absage' ? { absage_at: jetzt } : { mail_stand: stand, verschoben_at: jetzt }) : {}),
      aenderung_fehler: fehler.length ? `${vorgang}: ${fehler.join(' | ')}`.slice(0, 500) : null,
    } })
    await supabase.rpc('buchung_mail_fertig', { _schluessel: schluessel, _erfolg: fehler.length === 0 })

    return antwort({ ok: true, vorgang, gesendet: fehler.length === 0, fehler })
  } catch (f) {
    console.error('[buchung-aenderung] unerwarteter Fehler', f)
    return antwort({ error: 'Unerwarteter Fehler' }, 500)
  }
})
