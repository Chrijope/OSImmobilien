/**
 * Die Sprache einer Kundenmail, ermittelt auf dem Server.
 *
 * Plan Kundensprache, Etappe 2. Aufgerufen von send-transactional-email für
 * jede Vorlage, die an Kunden geht und Englisch kann. Die eigentliche Regel
 * steht in `kunden-sprache.ts` (Etappe 0); hier kommt nur dazu, was eine Mail
 * zusätzlich braucht: Herr oder Frau für die förmliche englische Anrede der
 * Gruppe F („Dear Mr Mustermann,“).
 *
 * Reihenfolge:
 *   1. die Sprache, die der Aufrufer mitgibt,
 *   2. der Kontakt, dessen Kennung im Aufruf oder in den Metadaten steht,
 *   3. die Empfängeradresse (etwa Sperr- und Anmeldemails ohne Kontakt).
 * Nichts gefunden oder Abfrage gescheitert: Deutsch.
 *
 * Eine Sprache je Kontakt (Entscheidung 11): Person 2 und Begleitpersonen
 * bekommen die Sprache des Kontakts. Die Anrede dagegen gilt nur für den,
 * dessen Adresse die Mail bekommt. Geht sie an eine andere Adresse, bleibt
 * sie leer und die Vorlage grüßt mit dem Namen, den der Aufrufer schickt.
 *
 * Reine Datei ohne Deno-Importe, getestet in `src/lib/mailSprache.test.ts`.
 */
import { kundenSprache, normalisiereSprache, spracheAusMeta, type Sprache } from './kunden-sprache.ts'

// deno-lint-ignore no-explicit-any
type AbfrageClient = { from: (tabelle: string) => any }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface MailSpracheSuche {
  sprache?: unknown
  kontaktId?: string | null
  /** Die Adresse, an die die Mail geht. */
  empfaenger?: string | null
}

export interface MailSpracheErgebnis {
  sprache: Sprache
  /** "Herr" oder "Frau", nur wenn die Mail an den Kontakt selbst geht. */
  anrede?: string
}

function klein(wert: unknown): string {
  return typeof wert === 'string' ? wert.trim().toLowerCase() : ''
}

/** Aus "Sehr geehrter Herr" oder "herr" wird "Herr". Alles andere entfällt. */
function saubereAnrede(wert: unknown): string | undefined {
  const t = klein(wert)
  if (t.includes('frau')) return 'Frau'
  if (t.includes('herr')) return 'Herr'
  return undefined
}

export async function ermittleMailSprache(
  admin: AbfrageClient,
  suche: MailSpracheSuche,
): Promise<MailSpracheErgebnis> {
  const mitgegeben = normalisiereSprache(suche.sprache)
  const empfaenger = klein(suche.empfaenger)
  const kontaktId = typeof suche.kontaktId === 'string' ? suche.kontaktId.trim() : ''

  if (UUID.test(kontaktId)) {
    try {
      const { data, error } = await admin
        .from('kontakte')
        .select('meta, anrede, email')
        .eq('id', kontaktId)
        .maybeSingle()
      if (!error && data) {
        const meta = (data.meta && typeof data.meta === 'object' ? data.meta : {}) as Record<string, unknown>
        let anrede: string | undefined
        if (empfaenger && klein(data.email) === empfaenger) anrede = saubereAnrede(data.anrede)
        else {
          const p2 = meta.person2 as Record<string, unknown> | undefined
          if (p2 && empfaenger && klein(p2.email) === empfaenger) anrede = saubereAnrede(p2.anrede)
        }
        return { sprache: mitgegeben ?? spracheAusMeta(data.meta), ...(anrede ? { anrede } : {}) }
      }
    } catch (fehler) {
      console.warn('ermittleMailSprache: Kontakt nicht lesbar', fehler)
    }
  }

  if (mitgegeben) return { sprache: mitgegeben }
  // Der Rückweg über die Adresse. Mehrdeutig oder unbekannt ist Deutsch.
  return { sprache: await kundenSprache(admin, { email: suche.empfaenger ?? null }) }
}
