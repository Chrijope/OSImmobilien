/**
 * Die Anredezeile der Kundenmails: "Hallo Martina,".
 *
 * Seit dem 15.09.2026 duzt das ganze Haus. Die Vorlagen bekommen den Namen
 * aber in sehr verschiedener Form: mal nur den Vornamen (document-reminder),
 * mal "Vorname Nachname" (die meisten Aufrufer), mal "Herr Mustermann" aus
 * aelteren Datenstaenden. Eine Du-Anrede mit Nachnamen ("Hallo Mustermann,")
 * waere peinlich, deshalb entscheidet diese eine Stelle fuer alle, was als
 * Vorname gilt.
 *
 * Vorher hatten vier Vorlagen je einen eigenen Anrede-Helfer, der aus Anrede
 * und Nachname "Guten Tag Herr Mustermann," baute. Die sind hier aufgegangen.
 */

/**
 * Woerter, die vor dem eigentlichen Namen stehen koennen und selbst keiner
 * sind. Klein verglichen, damit "HERR" und "Herr" gleich behandelt werden.
 */
const VORANGESTELLT = new Set(['herr', 'herrn', 'frau', 'hr.', 'fr.', 'dr.', 'prof.'])

/**
 * Der Vorname aus einem beliebig gelieferten Namen, oder ''.
 *
 *   "Max Mustermann"       -> "Max"
 *   "Max"                  -> "Max"       (ein Wort ohne Anrede ist der Vorname)
 *   "Herr Max Mustermann"  -> "Max"
 *   "Herr Mustermann"      -> ""          (nur der Nachname bekannt)
 *   "Dr. Mustermann"       -> ""
 *   "", undefined          -> ""
 *
 * Ein einzelnes Wort ohne Anrede laesst sich nicht vom Nachnamen unterscheiden.
 * Wer nur den Nachnamen hat, uebergibt deshalb besser gar nichts.
 */
export function vornameAus(name?: string | null): string {
  const teile = String(name || '').trim().split(/\s+/).filter(Boolean)
  let uebersprungen = 0
  while (teile.length > 0 && VORANGESTELLT.has(teile[0].toLowerCase())) {
    teile.shift()
    uebersprungen++
  }
  if (teile.length === 0) return ''
  // Nach "Herr" oder "Dr." ist ein einzelnes Wort der Nachname.
  if (teile.length === 1 && uebersprungen > 0) return ''
  return teile[0]
}

/**
 * "Hallo Max," oder, wenn kein Vorname bekannt ist, "Hallo,".
 *
 * Englisch (Plan Kundensprache, Entscheidung 10): "Hello Max," bzw. "Hello,".
 */
export function hallo(name?: string | null, sprache?: unknown): string {
  const vorname = vornameAus(name)
  if (sprache === 'en') return vorname ? `Hello ${vorname},` : 'Hello,'
  return vorname ? `Hallo ${vorname},` : 'Hallo,'
}

/**
 * Die foermliche Anrede der Gruppe F (Vertraege, Datenschutz, Selbstauskunft,
 * Notar), die im Deutschen siezt.
 *
 *   Deutsch:  "Guten Tag Herr Mustermann," bzw. "Guten Tag,"
 *             (der Name kommt, wie ihn der Aufrufer schickt)
 *   Englisch: "Dear Mr Mustermann,", "Dear Ms Brandl,", "Dear Dr Berger,"
 *             ohne erkennbare Anrede "Dear Max Mustermann,"
 *             ohne Namen "Dear Sir or Madam,"
 *
 * Die Aufrufer schicken den Namen mal als "Herr Mustermann", mal als
 * "Max Mustermann". Fuer den zweiten Fall reicht `anrede` ("Herr"/"Frau"
 * aus `kontakte.anrede`) nach, send-transactional-email legt sie als
 * `kundeAnrede` in die Felder, wenn die Mail an den Kontakt selbst geht.
 * Britisch ohne Punkt: "Mr", "Ms", "Dr".
 */
export function foermlich(name?: string | null, sprache?: unknown, anrede?: string | null): string {
  const roh = String(name || '').trim()
  if (sprache !== 'en') return roh ? `Guten Tag ${roh},` : 'Guten Tag,'

  const teile = roh.split(/\s+/).filter(Boolean)
  let geschlecht = ''
  let doktor = false
  while (teile.length > 0 && VORANGESTELLT.has(teile[0].toLowerCase())) {
    const wort = teile.shift()!.toLowerCase()
    if (wort === 'herr' || wort === 'herrn' || wort === 'hr.') geschlecht = 'Mr'
    else if (wort === 'frau' || wort === 'fr.') geschlecht = 'Ms'
    else if (wort === 'dr.' || wort === 'prof.') doktor = true
  }
  if (!geschlecht) {
    const a = String(anrede || '').toLowerCase()
    if (a.includes('frau')) geschlecht = 'Ms'
    else if (a.includes('herr')) geschlecht = 'Mr'
  }
  if (teile.length === 0) return 'Dear Sir or Madam,'
  const nachname = teile[teile.length - 1]
  if (doktor) return `Dear Dr ${nachname},`
  if (geschlecht) return `Dear ${geschlecht} ${nachname},`
  return `Dear ${teile.join(' ')},`
}
