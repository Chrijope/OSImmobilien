/**
 * Die HR-Managerin für den Ansprechpartner-Kasten in Bewerbermails laden.
 *
 * Gegenstück zu `zustaendiger-ansprechpartner.ts`: Dort steht der Betreuer
 * eines Kunden, hier die Person, die eine Bewerbung tatsächlich bearbeitet.
 * Ein Bewerber, der auf eine Absage oder eine Terminfrage antwortet, soll
 * nicht bei einem Sammelpostfach landen.
 *
 * Ermittelt wird über die **Rolle**, nicht über einen Namen. Wer die Rolle
 * `hr` trägt, steht unter den Mails. Wechselt die Person, wechselt der Kasten
 * mit, ohne dass jemand Code anfasst. Christian hat darauf schon einmal
 * bestanden: Die Inhalte kommen aus dem HR-Profil und werden nicht doppelt
 * gepflegt.
 */

import { avatarUrlFuerMail } from './avatar-signieren.ts'
import { berufsbezeichnung } from './berufsbezeichnung.ts'

type Datenbank = {
  from: (tabelle: string) => {
    select: (spalten: string) => any
  }
}

export interface Ansprechpartner {
  name?: string
  rolle?: string
  telefon?: string
  email?: string
  bildUrl?: string
}

/**
 * Die Bezeichnung unter dem Namen.
 *
 * Sie steht jetzt in `berufsbezeichnung.ts`, zusammen mit allen anderen
 * Bezeichnungen, und wird hier nur weitergereicht. Der Name bleibt, damit die
 * bisherigen Aufrufer unveraendert bleiben.
 */
export const HR_ROLLENBEZEICHNUNG = berufsbezeichnung('hr')

/**
 * Der Schlüssel in `app_config`, unter dem die feste Wahl steht.
 *
 * Tragen mehrere Personen die Rolle `hr`, war bisher willkürlich, wer unter
 * den Mails steht: die mit der kleinsten Kennung. Am 21.09.2026 waren es zwei,
 * und Christian wollte ausdrücklich eine bestimmte von beiden.
 *
 * Der Eintrag hält genau das fest, und zwar über die **Kennung** der Person und
 * nicht über ihren Namen. Zwei Konten mit demselben Namen gab es hier schon,
 * und drei Stellen im Programm haben deshalb einmal die falsche Person
 * gefunden.
 *
 * Fehlt der Eintrag oder zeigt er auf ein Profil ohne Namen, gilt weiter die
 * Rolle. Das Verhalten bleibt damit für alle bestehen, die ihn nie setzen.
 *
 * Erwartete Form: `{"userId": "<Kennung>"}`
 */
export const HR_ANSPRECHPARTNER_SCHLUESSEL = 'bewerber_ansprechpartner'

/**
 * Liefert die HR-Managerin, oder undefined.
 *
 * Bewusst undefined statt eines Platzhalters: Die Vorlage fällt dann auf die
 * allgemeine Adresse zurück. Ein erfundener Name unter einer Mail wäre
 * schlimmer als gar keiner.
 *
 * Wirft nie. Eine Mail, die wegen der Signatur nicht hinausgeht, wäre ein
 * schlechter Tausch.
 *
 * Tragen mehrere Personen die Rolle, gewinnt die mit der kleinsten user_id.
 * Das ist willkürlich, aber stabil: Derselbe Bewerber bekommt bei jeder Mail
 * denselben Namen zu sehen, und das ist wichtiger als die Frage, wer von
 * beiden es ist.
 */
export async function hrAnsprechpartner(db: Datenbank): Promise<Ansprechpartner | undefined> {
  try {
    /*
      Zuerst die ausdrückliche Wahl, dann die Rolle.

      Sie steht vorn, weil sie eine Entscheidung ist und die Rolle nur eine
      Näherung. Schlägt sie fehl, etwa weil das Profil gelöscht wurde, läuft
      die Reihenfolge darunter weiter, statt dass gar niemand unter der Mail
      steht.
    */
    const gewaehlt = await festgelegteKennung(db)
    if (gewaehlt) {
      const person = await ausProfil(db, gewaehlt)
      if (person) return person
    }

    // user_roles hat KEINE Spalte created_at (Migration 20260313125047).
    // Die fruehere Sortierung danach liess die ganze Abfrage mit einem
    // Spaltenfehler scheitern, und jede Bewerbermail fiel still auf die
    // allgemeine Unterschrift zurueck. Sortiert wird jetzt nach user_id:
    // fachlich willkuerlich, aber stabil, derselbe Bewerber sieht bei jeder
    // Mail denselben Namen.
    const { data: rollen } = await db
      .from('user_roles')
      .select('user_id')
      .eq('role', 'hr')
      .order('user_id', { ascending: true })

    const ids = ((rollen ?? []) as Array<{ user_id?: string }>)
      .map((r) => r.user_id)
      .filter(Boolean) as string[]
    if (ids.length === 0) return undefined

    for (const id of ids) {
      const person = await ausProfil(db, id)
      if (person) return person
    }
    return undefined
  } catch (fehler) {
    console.error('HR-Ansprechpartner nicht geladen:', fehler)
    return undefined
  }
}

/**
 * Sieht aus wie eine Kennung?
 *
 * Am 21.09.2026 stand in der Einstellung der Platzhalter aus meiner Anleitung
 * statt einer echten Kennung. Die Abfrage danach scheiterte dann an der
 * Spaltenart, der Fehler riss die ganze Aufloesung mit, und **auch die Rolle**
 * wurde nicht mehr geprueft. Aus einem Tippfehler in einer Einstellung wurde
 * so ein stiller Ausfall der Unterschrift unter allen Bewerbermails.
 *
 * Deshalb wird die Form vorher geprueft. Was keine Kennung ist, wird
 * uebersprungen, und die Rolle greift wie vorher.
 */
function sieht_aus_wie_kennung(wert: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(wert)
}

/** Die festgelegte Kennung aus `app_config`, falls eine gueltige hinterlegt ist. */
async function festgelegteKennung(db: Datenbank): Promise<string | null> {
  try {
    const { data } = await db
      .from('app_config')
      .select('wert')
      .eq('schluessel', HR_ANSPRECHPARTNER_SCHLUESSEL)
      .maybeSingle()
    const wert = (data as { wert?: { userId?: unknown } } | null)?.wert
    const kennung = typeof wert?.userId === 'string' ? wert.userId.trim() : ''
    if (!kennung) return null
    if (!sieht_aus_wie_kennung(kennung)) {
      console.error('HR-Ansprechpartner: eingetragener Wert ist keine Kennung, es gilt die Rolle')
      return null
    }
    return kennung
  } catch {
    // Fehlt die Tabelle oder die Zeile, gilt schlicht die Rolle. Eine Mail,
    // die wegen der Unterschrift nicht hinausgeht, waere ein schlechter Tausch.
    return null
  }
}

/**
 * Ein Profil zur Kennung, fertig für den Kasten am Fuß der Mail.
 *
 * Faengt selbst ab: Ein Fehler beim Nachschlagen einer einzelnen Kennung darf
 * die uebrigen Kandidaten nicht mitreissen.
 */
async function ausProfil(db: Datenbank, id: string): Promise<Ansprechpartner | undefined> {
  try {
  const { data: profil } = await db
    .from('profiles')
    .select('name, email, telefon, avatar_url')
    .eq('id', id)
    .maybeSingle()
  const p = profil as {
    name?: string; email?: string; telefon?: string; avatar_url?: string
  } | null
  if (!p?.name?.trim()) return undefined

  // Die gespeicherte Adresse ist öffentlich und läuft nicht ab, siehe
  // avatar-signieren.ts. Fehlt sie, zeigt die Vorlage die Initialen.
  const bildUrl = avatarUrlFuerMail(p.avatar_url)

  return {
    name: p.name.trim(),
    rolle: HR_ROLLENBEZEICHNUNG,
    // Leere Felder weglassen, damit die Vorlage auf die allgemeine Angabe
    // zurückfällt, statt eine leere Zeile zu zeigen.
    ...(p.telefon?.trim() ? { telefon: p.telefon.trim() } : {}),
    ...(p.email?.trim() ? { email: p.email.trim() } : {}),
    ...(bildUrl ? { bildUrl } : {}),
  }
  } catch (fehler) {
    console.error('HR-Ansprechpartner: Profil nicht lesbar', id, fehler)
    return undefined
  }
}
