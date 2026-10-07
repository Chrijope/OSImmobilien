/**
 * Den zuständigen Vertriebspartner eines Kontakts für die Mailsignatur laden.
 *
 * Anlass: Otto Hans bekam die Selbstauskunft zur Unterschrift, und darunter
 * stand "MOREImmo Team, Ihr Ansprechpartner bei MOREImmo, office@more.immo".
 * Betreut wird er von Christian Peetz. Für den Kunden sieht eine Mail von
 * einem Sammelpostfach nach Massenversand aus, und auf Rückfragen antwortet
 * niemand persönlich.
 *
 * Die Mailvorlagen können einen Ansprechpartner bereits darstellen, er wurde
 * ihnen nur nie übergeben. Diese Datei schließt genau diese Lücke, damit es
 * nicht jede Function auf eigene Weise löst.
 */

import { avatarUrlFuerMail } from './avatar-signieren.ts'

// Der Parameter ist bewusst `any`: Der echte Supabase-Client trägt tief
// verschachtelte Generics (Database-Schema), und TypeScript bricht mit
// TS2589 ("Type instantiation is excessively deep") ab, sobald es ihn gegen
// eine strukturierte Schnittstelle prüft. Aufrufer können daher `supabase`
// direkt übergeben, ohne ihn erst auf `any` casten zu müssen.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Datenbank = any

export interface Ansprechpartner {
  name?: string
  rolle?: string
  telefon?: string
  email?: string
  /** Profilbild. Fehlt es, zeigt die Vorlage die Initialen. */
  bildUrl?: string
}

/**
 * Liefert den Betreuer, oder undefined.
 *
 * Bewusst undefined statt eines Platzhalters: Die Vorlage fällt dann auf die
 * allgemeine Adresse zurück, und das ist richtig so. Ein erfundener Name unter
 * einer Mail wäre schlimmer als gar keiner.
 *
 * Wirft nie. Eine Mail, die wegen der Signatur nicht hinausgeht, wäre ein
 * schlechter Tausch.
 */
export async function zustaendigerAnsprechpartner(
  db: Datenbank,
  kontaktId: string | null | undefined,
): Promise<Ansprechpartner | undefined> {
  if (!kontaktId) return undefined
  try {
    const { data: kontakt } = await db
      .from('kontakte').select('zustaendig_id').eq('id', kontaktId).maybeSingle()
    const betreuerId = (kontakt as { zustaendig_id?: string } | null)?.zustaendig_id
    if (!betreuerId) return undefined

    const { data: profil } = await db
      .from('profiles').select('name, email, telefon, avatar_url').eq('id', betreuerId).maybeSingle()
    const p = profil as {
      name?: string; email?: string; telefon?: string; avatar_url?: string
    } | null
    if (!p?.name?.trim()) return undefined

    // Die gespeicherte Adresse ist öffentlich und läuft nicht ab, siehe
    // avatar-signieren.ts. Fehlt sie, zeigt die Vorlage die Initialen.
    const bildUrl = avatarUrlFuerMail(p.avatar_url)

    return {
      name: p.name.trim(),
      // Neutral ohne Anrede: Dieser Helfer unterschreibt sowohl die Du-Mails
      // (Geburtstag, Unterlagen, Bewertung) als auch die formellen Bankmails
      // (Selbstauskunft, Reservierung), und die Profile kennen kein Geschlecht.
      rolle: 'Persönlicher Ansprechpartner bei MOREImmo',
      // Leere Felder weglassen, damit die Vorlage auf die allgemeine Angabe
      // zurückfällt, statt eine leere Zeile zu zeigen.
      ...(p.telefon?.trim() ? { telefon: p.telefon.trim() } : {}),
      ...(p.email?.trim() ? { email: p.email.trim() } : {}),
      ...(bildUrl ? { bildUrl } : {}),
    }
  } catch (fehler) {
    console.error('Zustaendigen Ansprechpartner nicht geladen:', fehler)
    return undefined
  }
}
