/**
 * Darf noch an die Selbstauskunft erinnert werden?
 *
 * Anlass: Die geplanten Erinnerungen wurden bisher nur uebersprungen, wenn
 * `investments.meta.saSigned` gesetzt war. Alles andere lief weiter. Ein Kunde,
 * der als verloren markiert wurde, bekam trotzdem noch zwei Mails, und wer die
 * Selbstauskunft im Gespraech mit dem Berater ausgefuellt hatte, wurde
 * aufgefordert, sie endlich auszufuellen.
 *
 * Eine Erinnerung an jemanden, der laengst fertig ist oder gar kein Kunde mehr
 * ist, richtet mehr Schaden an als eine ausgebliebene Erinnerung. Deshalb
 * pruefen wir hier breit und brechen im Zweifel ab.
 *
 * Die Datei liegt in `_shared`, weil sowohl der Verarbeiter der Warteschlange
 * als auch spaetere Dienste dieselbe Antwort brauchen.
 */

/** Nur der Teil des Supabase-Clients, der hier gebraucht wird. */
type Datenbank = {
  from: (tabelle: string) => {
    select: (spalten: string) => {
      eq: (feld: string, wert: unknown) => {
        maybeSingle: () => Promise<{ data: unknown; error: unknown }>
      }
    }
  }
}

/**
 * Stufen, ab denen eine Erinnerung an die Selbstauskunft nicht mehr passt.
 *
 * Zwei Gruppen: Stufen nach der Unterschrift, denn dort ist die Selbstauskunft
 * erledigt, und Sonderzustaende, in denen ueberhaupt keine Mail mehr an den
 * Kunden gehen soll. Bewusst als ausdrueckliche Liste statt als Rangvergleich,
 * damit eine neue Stufe nicht stillschweigend das Verhalten aendert.
 */
const STUFEN_OHNE_ERINNERUNG = new Set<string>([
  'objektauswahl', 'follow_up_objekt', 'reservierung', 'bonitaetsunterlagen',
  'finanzierung', 'notar', 'faelligkeit', 'abrechnung', 'abgeschlossen',
  'archiviert', 'verloren', 'vermoegensaufbau',
])

export interface StoppErgebnis {
  /** Soll die geplante Erinnerung unterbleiben? */
  stoppen: boolean
  /** Kurzer Grund, geeignet fuer das Feld `error` der Warteschlange. */
  grund?: string
}

/**
 * Entscheidet, ob eine geplante Selbstauskunft-Erinnerung noch hinausgehen darf.
 *
 * Wirft nie. Kann etwas nicht geprueft werden, laufen wir weiter, statt die
 * ganze Kaskade an einer misslungenen Abfrage aufzuhaengen.
 */
export async function saErinnerungStoppen(
  db: Datenbank,
  investmentId: string | null | undefined,
  kontaktId: string | null | undefined,
): Promise<StoppErgebnis> {
  try {
    if (investmentId) {
      const { data } = await db
        .from('investments').select('meta, status').eq('id', investmentId).maybeSingle()
      const zeile = data as { meta?: Record<string, unknown> | null; status?: string | null } | null
      const meta = (zeile?.meta ?? {}) as Record<string, unknown>

      if (meta.saSigned === true) return { stoppen: true, grund: 'Selbstauskunft unterschrieben' }
      // Ein hinterlegtes PDF heisst: sie ist ausgefuellt. Das reicht schon,
      // die Unterschrift ist dann nur noch eine Formsache und laeuft ueber
      // einen eigenen Erinnerungsweg.
      if (meta.saPdfFilename) return { stoppen: true, grund: 'Selbstauskunft ausgefuellt' }
      // Liegt sie bereits zur Unterschrift beim Kunden, waere die Bitte, sie
      // endlich auszufuellen, schlicht falsch.
      if (meta.saSignaturePending === true) return { stoppen: true, grund: 'Selbstauskunft wartet auf Unterschrift' }

      const stufe = String(meta.pipelineStufe ?? '')
      if (STUFEN_OHNE_ERINNERUNG.has(stufe)) return { stoppen: true, grund: `Investment steht auf "${stufe}"` }
      if (zeile?.status === 'verloren' || zeile?.status === 'abgeschlossen') {
        return { stoppen: true, grund: `Investment ist ${zeile.status}` }
      }
    }

    if (kontaktId) {
      const { data } = await db
        .from('kontakte').select('status, archiviert, geloescht, meta').eq('id', kontaktId).maybeSingle()
      const k = data as {
        status?: string | null; archiviert?: boolean | null; geloescht?: boolean | null
        meta?: Record<string, unknown> | null
      } | null

      if (k?.geloescht) return { stoppen: true, grund: 'Kontakt geloescht' }
      if (k?.archiviert) return { stoppen: true, grund: 'Kontakt archiviert' }
      if (k?.status === 'verloren') return { stoppen: true, grund: 'Kunde als verloren markiert' }

      const stufe = String((k?.meta ?? {}).pipelineStufe ?? '')
      if (STUFEN_OHNE_ERINNERUNG.has(stufe)) return { stoppen: true, grund: `Kunde steht auf "${stufe}"` }
    }

    return { stoppen: false }
  } catch (fehler) {
    console.error('Stopp-Pruefung fuer SA-Erinnerung fehlgeschlagen:', fehler)
    return { stoppen: false }
  }
}

/**
 * Den Token aus einer Ausfuell-Adresse ziehen.
 *
 * Die geplante Erinnerung fuehrt nur die fertige Adresse `.../sa/<token>` mit
 * sich, nicht den Token selbst. Fuer den Zaehlpixel wird er aber gebraucht.
 */
export function tokenAusFillUrl(fillUrl: string | null | undefined): string | null {
  if (!fillUrl) return null
  const treffer = String(fillUrl).match(/\/sa\/([a-zA-Z0-9_-]+)/)
  return treffer ? treffer[1] : null
}
