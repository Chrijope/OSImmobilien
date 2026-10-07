/**
 * Eine Mail ueber send-transactional-email verschicken und die Antwort auch
 * wirklich auswerten.
 *
 * Der Grund fuer diese Datei: `supabase.functions.invoke` meldet nur dann
 * einen Fehler, wenn die aufgerufene Function einen Status ab 400 liefert.
 * send-transactional-email antwortet aber in zwei Faellen mit Status 200 und
 * `{ success: false, reason: 'email_suppressed' }`, naemlich wenn die Adresse
 * auf der Sperrliste steht oder ihr Abmeldetoken bereits verbraucht ist.
 *
 * Fuer den Aufrufer sah das bisher wie ein gelungener Versand aus. Beim
 * Vertriebspartner hiess das: Er stand auf der Sperrliste, bekam nie eine
 * Meldung, und im Log stand trotzdem Erfolg. Wer nichts erwartet, vermisst
 * auch nichts, und deshalb waere das monatelang niemandem aufgefallen.
 *
 * Hier wird die Antwort ausgewertet und der Fehlschlag benannt, damit die
 * aufrufende Function ihn vermerken kann.
 */

export interface VersandAuftrag {
  templateName: string
  recipientEmail: string
  /** Verhindert doppelten Versand in der Warteschlange. */
  idempotencyKey: string
  templateData: Record<string, unknown>
  metadata?: Record<string, unknown>
  /** Dateianhaenge, etwa ein erzeugtes PDF. Wird unveraendert durchgereicht. */
  attachments?: Array<{ filename: string; content: string; type?: string }>
  /** Antwortadresse, wenn Antworten nicht bei noreply@ landen sollen. */
  replyTo?: string
  /**
   * Die Kundensprache, wenn der Aufrufer sie schon kennt ("de" oder "en").
   * Ohne Angabe ermittelt send-transactional-email sie selbst ueber
   * `kontaktId` bzw. die Empfaengeradresse. Wirkt nur bei Kundenvorlagen.
   */
  sprache?: string
  /** Der Kontakt, dessen Sprache gilt. Reicht meist statt `sprache`. */
  kontaktId?: string | null
}

export interface VersandErgebnis {
  ok: boolean
  /** Kurz und ohne Innereien, geeignet fuer ein Feld in der Datenbank. */
  grund?: string
}

/** Aus dem technischen Grund einen Satz machen, den man im CRM lesen kann. */
function lesbar(grund: string): string {
  if (grund === 'email_suppressed') return 'Adresse steht auf der Sperrliste'
  return grund
}

/**
 * Der Typ des Supabase-Clients haengt an einer npm-Angabe, die hier nichts zu
 * suchen hat. Gebraucht wird davon nur `functions.invoke`, und zwar so lose,
 * dass jede Fassung des Clients dazu passt.
 */
type Mailversender = {
  functions: { invoke: (name: string, args: any) => Promise<{ data: any; error: any }> }
}

export async function sendeVorlage(
  supabase: Mailversender,
  auftrag: VersandAuftrag,
): Promise<VersandErgebnis> {
  try {
    const { data, error } = await supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName: auftrag.templateName,
        recipientEmail: auftrag.recipientEmail,
        idempotencyKey: auftrag.idempotencyKey,
        templateData: auftrag.templateData,
        ...(auftrag.metadata ? { metadata: auftrag.metadata } : {}),
        ...(auftrag.attachments ? { attachments: auftrag.attachments } : {}),
        ...(auftrag.replyTo ? { replyTo: auftrag.replyTo } : {}),
        ...(auftrag.sprache ? { sprache: auftrag.sprache } : {}),
        ...(auftrag.kontaktId ? { kontaktId: auftrag.kontaktId } : {}),
      },
    })
    if (error) {
      // Die generische Meldung von supabase-js ("Failed to send a request to
      // the Edge Function") verschweigt die Ursache. Die steckt in context.
      const ursache = (error as { context?: unknown }).context
      // Der englische Satz von supabase-js landete bis zum 27.09.2026 so im
      // Toast („Edge Function returned a non-2xx status code: HTTP 401“).
      // Fuer 401 steht jetzt da, was gemeint ist.
      if (ursache && typeof ursache === 'object' && (ursache as { status?: unknown }).status === 401) {
        return { ok: false, grund: 'Der Mailversand hat den Absender nicht als angemeldet erkannt (HTTP 401)' }
      }
      const detail = ursache instanceof Error
        ? ursache.message
        : (ursache && typeof ursache === 'object' && 'status' in ursache)
          ? `HTTP ${String((ursache as { status?: unknown }).status)}`
          : ''
      return { ok: false, grund: [error.message || 'Versand fehlgeschlagen', detail].filter(Boolean).join(': ') }
    }

    const antwort = data as { success?: boolean; reason?: string } | null
    // Nur ein ausdrueckliches `false` gilt als Fehlschlag. Fehlt das Feld,
    // etwa weil die Antwort anders aussieht als erwartet, wird der Versand
    // nicht grundlos als gescheitert gemeldet.
    if (antwort && antwort.success === false) {
      return { ok: false, grund: lesbar(String(antwort.reason || 'nicht zugestellt')) }
    }
    return { ok: true }
  } catch (fehler) {
    return { ok: false, grund: fehler instanceof Error ? fehler.message : 'Versand fehlgeschlagen' }
  }
}
