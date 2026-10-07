import { createClient } from 'npm:@supabase/supabase-js@2'
import { checkEdgeRateLimit, clientIp } from '../_shared/edge-rate-limit.ts'
import { ladeBuchungKontext } from '../_shared/buchung-kontext.ts'
import { sendeVorlage } from '../_shared/transactional-versand.ts'
import { zustaendigOderLeitung } from '../_shared/glocke-zustaendiger.ts'

/**
 * send-buchung-bestaetigung
 *
 * Wird unmittelbar nach einer erfolgreichen Buchung von der Buchungsseite
 * aufgerufen und verschickt zwei Mails:
 *
 *   A) an den Kunden die Bestaetigung, mit dem Link zum Videoraum als
 *      wichtigstem Teil, Kalenderdatei und dem Weg zum Absagen
 *   B) an den Vertriebspartner die Meldung, wer wann was gebucht hat
 *
 * Zusaetzlich bekommt der Vertriebspartner einen Eintrag in `benachrichtigungen`,
 * also die Glocke im CRM.
 *
 * Was danach kommt, also Absage und Verschiebung, steckt in
 * send-buchung-aenderung. Die beiden teilen sich die Datenbeschaffung in
 * _shared/buchung-kontext.ts.
 *
 * Uebergeben wird ausschliesslich der Absagetoken. Alles Weitere holt sich die
 * Function selbst aus der Datenbank. Namen oder E-Mail-Adressen aus dem Browser
 * anzunehmen waere ein Versandwerkzeug fuer Fremde: wer den Aufruf nachbaut,
 * koennte sonst beliebige Adressen anschreiben lassen.
 *
 * `verify_jwt = false`, denn der Buchende hat kein Konto. Das Geheimnis ist der
 * Absagetoken selbst, 64 Hexzeichen aus `buchung_token()`.
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

  // Die oeffentliche Adresse der Anwendung. Sie steht als Geheimnis, damit eine
  // andere Umgebung nicht auf das Portal zeigt.
  const basisAdresse = (Deno.env.get('APP_BASE_URL') || 'https://osimmobilien.netlify.app').trim()

  // Ohne Anmeldung erreichbar, also mit Ratenbremse. Ein einzelner Buchender
  // ruft diese Function genau einmal auf; wer sie in Serie aufruft, hat etwas
  // anderes vor. Der eigentliche Schutz gegen doppelten Versand ist der
  // Merkzettel weiter unten, die Bremse haelt schon die Last davor ab.
  const bremse = await checkEdgeRateLimit({
    scope: 'buchung-bestaetigung',
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

  // Der Token ist 64 Hexzeichen. Alles andere ist kein Versuch, der lohnt.
  if (!/^[0-9a-f]{32,128}$/i.test(absageToken)) {
    return antwort({ error: 'Kein gueltiger Token' }, 400)
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  try {
    // `*`, damit die Function auch dann laeuft, wenn eine der spaeteren
    // Buchungsmigrationen (videoraum_id, aktivitaet_id) noch nicht gelaufen ist.
    const { data: buchung, error: buchungFehler } = await supabase
      .from('buchungen')
      .select('*')
      .eq('absage_token', absageToken)
      .maybeSingle()

    if (buchungFehler) {
      // Die Meldung aus Postgres bleibt im Log. Sie nennt Tabellen- und
      // Spaltennamen und gehoert damit nicht in eine Antwort, die jeder ohne
      // Anmeldung abholen kann.
      console.error('[buchung-bestaetigung] Buchung nicht ladbar', buchungFehler)
      return antwort({ error: 'Die Buchung liess sich nicht laden' }, 500)
    }
    // Kein Hinweis darauf, ob der Token falsch oder der Termin abgesagt ist.
    if (!buchung || buchung.status !== 'offen') {
      return antwort({ ok: true, gesendet: false, grund: 'nichts zu senden' })
    }

    // ── Platz belegen, bevor gesendet wird ──
    //
    // Zweimal aufgerufen darf nicht zweimal senden. Die Erinnerungen nutzen
    // dafuer `termin_erinnerungen`; diese Function kann das nicht, weil dort
    // `aktivitaet_id` Pflicht und Fremdschluessel ist und eine Buchung ohne
    // Aktivitaet auskommen kann. Stattdessen dient `buchungen.meta` als
    // Merkzettel: Ein UPDATE mit Bedingung ist in Postgres atomar, der zweite
    // Aufruf findet die Bedingung nicht mehr erfuellt und bekommt keine Zeile
    // zurueck. Der Vermerk entsteht VOR dem Versand und bleibt auch bei einem
    // Fehlschlag stehen, sonst ginge bei einem dauerhaften Fehler bei jedem
    // Aufruf erneut eine Mail hinaus.
    //
    // `bestaetigung_at` gilt ausdruecklich nur fuer die Erstbestaetigung, also
    // fuer diesen einen Vorgang. Absage und Verschiebung haben eigene Marken,
    // siehe send-buchung-aenderung. Frueher sperrte diese eine Marke jeden
    // weiteren Versand zu derselben Buchung, weshalb nach einem Verschieben
    // nie wieder etwas hinausging.
    //
    // `mail_stand` haelt fest, welche Startzeit der Kunde per Mail kennt, als
    // Millisekunden seit 1970. Daran erkennt die Aenderungsfunktion, ob eine
    // Verschiebung dem Kunden schon mitgeteilt wurde.
    const jetzt = new Date().toISOString()
    const startZahl = new Date(String(buchung.start_at)).getTime()
    const stand = Number.isFinite(startZahl) ? String(startZahl) : null
    const schluessel = `bestaetigung:${buchung.id}`
    const { data: claim, error: claimFehler } = await supabase.rpc('buchung_mail_claim', { _schluessel: schluessel })
    if (claimFehler) return antwort({ error: 'Versandsicherung nicht verfügbar' }, 503)
    if (claim === 'fertig') return antwort({ ok: true, gesendet: false, grund: 'bereits gesendet' })
    if (claim !== 'frei') return antwort({ error: 'Versand wird bereits bearbeitet' }, 409)

    // ── Alles zusammentragen ──
    const k = await ladeBuchungKontext(supabase, buchung, { supabaseUrl, basisAdresse })

    // "Termin" ist der Notnagel, wenn weder Bezeichnung noch Terminart
    // gepflegt sind. Als Ueberschrift der Mail taugt er nicht, deshalb geht er
    // gar nicht erst hinaus; die Vorlage waehlt dann ihren eigenen Satz.
    const anlass = k.titel.toLowerCase() === 'termin' ? undefined : k.titel

    const fehler: string[] = []

    // Die Termindaten sind fuer Kunde und Begleitperson dieselben, nur die
    // Anrede unterscheidet sich.
    const terminDaten = {
      terminDatum: k.terminDatum,
      terminUhrzeit: k.terminUhrzeit,
      terminDauer: k.dauer,
      terminTitel: anlass,
      terminBeschreibung: k.beschreibung || undefined,
      zugangUrl: k.zugangUrl || undefined,
      icsUrl: k.icsUrl,
      googleCalendarUrl: k.googleCalendarUrl,
      verwaltenUrl: k.verwaltenUrl,
      // Name, Rolle und Erreichbarkeit loest send-transactional-email
      // zentral auf, siehe _shared/ansprechpartner.ts.
      beraterUserId: buchung.mitarbeiter_id,
      berater: {},
    }

    // ── A) Bestaetigung an den Kunden ──
    if (k.kundeEmail) {
      const ergebnis = await sendeVorlage(supabase, {
        templateName: 'buchung-bestaetigung',
        recipientEmail: k.kundeEmail,
        idempotencyKey: `buchung-bestaetigung-${buchung.id}`,
        templateData: {
          anrede: k.anrede,
          vorname: k.vorname,
          nachname: k.nachname,
          ...terminDaten,
        },
        // Kalenderdatei und Mail in derselben Kundensprache.
        sprache: k.sprache,
        metadata: { kontaktId: buchung.kontakt_id, quelle: 'buchungslink' },
      })
      if (!ergebnis.ok) fehler.push(`kunde: ${ergebnis.grund}`)
    } else {
      fehler.push('kunde: keine Adresse')
    }

    // ── A2) Dieselbe Bestaetigung an die Begleitperson ──
    //
    // Der Kunde kann bei der Buchung eine Begleitperson angeben, etwa den
    // Ehepartner. Sie bekommt dieselbe Mail mit dem Zugangslink, nur mit der
    // eigenen Anrede. Gegen doppelten Versand schuetzt derselbe Weg wie beim
    // Kunden: die Marke `bestaetigung_at` oben plus ein eigener
    // Idempotenzschluessel je Empfaenger in der Versand-Warteschlange.
    const begleitung = (buchung.begleitung || null) as { name?: string; email?: string } | null
    const begleitungEmail = String(begleitung?.email || '').trim()
    if (begleitungEmail) {
      const begleitungTeile = String(begleitung?.name || '').trim().split(/\s+/).filter(Boolean)
      const ergebnis = await sendeVorlage(supabase, {
        templateName: 'buchung-bestaetigung',
        recipientEmail: begleitungEmail,
        idempotencyKey: `buchung-bestaetigung-begleitung-${buchung.id}`,
        templateData: {
          anrede: '',
          vorname: begleitungTeile[0] || '',
          nachname: begleitungTeile.slice(1).join(' '),
          ...terminDaten,
        },
        // Kalenderdatei und Mail in derselben Kundensprache.
        sprache: k.sprache,
        metadata: { kontaktId: buchung.kontakt_id, quelle: 'buchungslink' },
      })
      if (!ergebnis.ok) fehler.push(`begleitung: ${ergebnis.grund}`)
    }

    // ── B) Meldung an den Vertriebspartner ──
    if (k.partnerEmail) {
      const ergebnis = await sendeVorlage(supabase, {
        templateName: 'buchung-benachrichtigung',
        recipientEmail: k.partnerEmail,
        idempotencyKey: `buchung-benachrichtigung-${buchung.id}`,
        templateData: {
          kundeName: k.kundeName,
          kundeEmail: k.kundeEmail,
          kundeTelefon: k.kundeTelefon || undefined,
          nachricht: k.nachricht || undefined,
          terminDatum: k.terminDatum,
          terminUhrzeit: k.terminUhrzeit,
          terminDauer: k.dauer,
          terminTitel: anlass,
          kundeNeu: k.kundeNeu,
          kundeUrl: k.kundeUrl,
          zugangUrl: k.zugangUrl || undefined,
        },
        metadata: { kontaktId: buchung.kontakt_id, quelle: 'buchungslink' },
      })
      if (!ergebnis.ok) fehler.push(`partner: ${ergebnis.grund}`)
    } else {
      fehler.push('partner: keine Adresse')
    }

    // ── Die Glocke im CRM ──
    //
    // Derselbe Weg, den process-scheduled-notifications nimmt: eine Zeile in
    // `benachrichtigungen`. Der Umweg ueber `scheduled_notifications` lohnt
    // hier nicht, die Meldung soll ja sofort erscheinen.
    try {
      const wann = k.terminDatum && k.terminUhrzeit ? `${k.terminDatum} um ${k.terminUhrzeit} Uhr` : 'einen Termin'
      // Wie in send-buchung-aenderung (Regel vom 29.09.2026): Mit Kontakt
      // bekommt die Glocke der aktuelle Zustaendige, ohne ihn die Leitung.
      // Ohne Kontakt oder bei geloeschtem Kontakt der Kalenderbesitzer.
      const zuKontakt = buchung.kontakt_id ? await zustaendigOderLeitung(supabase, buchung.kontakt_id) : null
      const empfaenger: string[] = zuKontakt ?? (buchung.mitarbeiter_id ? [buchung.mitarbeiter_id] : [])
      const { error: glockeFehler } = await supabase.from('benachrichtigungen').insert(empfaenger.map((uid) => ({
        benutzer_id: uid,
        titel: 'Neue Terminbuchung',
        nachricht:
          `${k.kundeName || 'Ein Interessent'} hat ${k.titel} gebucht: ${wann}.` +
          (k.kundeNeu ? ' Der Kontakt wurde dabei neu angelegt.' : ''),
        link: zuKontakt ? `/kunden/${buchung.kontakt_id}` : '/termine',
        gelesen: false,
      })))
      if (glockeFehler) fehler.push(`glocke: ${glockeFehler.message}`)
    } catch (f) {
      fehler.push(`glocke: ${f instanceof Error ? f.message : 'unbekannt'}`)
    }

    // Was schiefging, bleibt an der Buchung vermerkt, statt es durch ein
    // erneutes Senden zu verdecken.
    await supabase.rpc('buchung_mail_meta_setzen', { _id: buchung.id, _patch: {
      ...(fehler.length === 0 ? { bestaetigung_at: jetzt, mail_stand: stand } : {}),
      bestaetigung_fehler: fehler.length ? fehler.join(' | ').slice(0, 500) : null,
    } })
    await supabase.rpc('buchung_mail_fertig', { _schluessel: schluessel, _erfolg: fehler.length === 0 })

    return antwort({ ok: true, gesendet: fehler.length === 0, fehler })
  } catch (f) {
    console.error('[buchung-bestaetigung] unerwarteter Fehler', f)
    return antwort({ error: 'Unerwarteter Fehler' }, 500)
  }
})
