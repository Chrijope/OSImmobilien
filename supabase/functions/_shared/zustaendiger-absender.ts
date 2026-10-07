/**
 * Der zuständige Partner als Absender einer Kundenmail.
 *
 * Für die drei Mails an einen nicht erreichten Lead (26.09.2026): Die Mail
 * kommt vom Partner, der in `kontakte.zustaendig_id` steht, auch wenn eine
 * Setterin oder jemand anderes den Anruf protokolliert hat. Sein Name steht im
 * Absender, eine Antwort landet bei ihm, er unterschreibt.
 *
 * Der Partner wird hier selbst aus der Datenbank gelesen und nicht dem
 * Aufrufer geglaubt. Zwei Gründe: Der Zwischenspeicher im Browser kann eine
 * frische Umverteilung verpasst haben, und der Absendername soll nie aus
 * Angaben des Aufrufers stammen, sonst könnte jeder mit dem öffentlichen
 * Schlüssel eine Mail unter beliebigem Namen verschicken.
 *
 * Über die Kennung, nie über den Namen: Es gab schon zwei Konten mit
 * demselben Namen.
 *
 * Ohne importierte Bibliotheken, damit Vitest die reinen Teile prüfen kann.
 */

/**
 * Rückfall, wenn niemand zuständig ist. Dann unterschreibt das Haus und nicht,
 * wer zufällig geklickt hat. office@ liest das Büro. Dieselben Werte stehen im
 * Browser in src/lib/nichtErreichtMails.ts.
 */
export const TEAM_ABSENDER = { name: 'OS Immobilien Team', email: 'os@os-immobilien.com' } as const

export interface ZustaendigerPartner {
  id: string
  name: string
  email: string
  buchungslink: string
}

function sauber(wert: unknown): string {
  return typeof wert === 'string' ? wert.trim() : ''
}

const EINFACHE_ADRESSE = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/

/**
 * Der Anzeigename im Absender: "Christian Peetz | OS Immobilien".
 *
 * Zeichen, die im Kopf einer Mail eine Bedeutung haben (spitze Klammern,
 * Anführungszeichen, Komma, Semikolon, Zeilenumbruch), fliegen raus. Ohne
 * Partner: "OS Immobilien Team". Der Strich statt "von" passt in beiden Sprachen.
 */
export function absenderName(partner: { name?: string } | null | undefined): string {
  const name = sauber(partner?.name)
    .replace(/[<>"(),;:\\\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
  return name ? `${name} | OS Immobilien` : TEAM_ABSENDER.name
}

/** Die Antwortadresse: die des Partners, sonst office@. */
export function antwortAdresse(partner: { email?: string } | null | undefined): string {
  const adresse = sauber(partner?.email)
  return EINFACHE_ADRESSE.test(adresse) ? adresse : TEAM_ABSENDER.email
}

/**
 * Liest `zustaendig_id` des Kontakts und das Profil dazu.
 *
 * Gibt `null` zurück, wenn niemand zuständig ist. Wirft, wenn die Abfrage
 * scheitert, damit der Aufrufer zwischen "niemand zuständig" und "nicht
 * nachsehbar" unterscheiden kann.
 */
export async function zustaendigenPartnerLaden(
  supabase: any,
  kontaktId: string,
): Promise<ZustaendigerPartner | null> {
  const { data: kontakt, error } = await supabase
    .from('kontakte')
    .select('zustaendig_id')
    .eq('id', kontaktId)
    .maybeSingle()
  if (error) throw error
  const partnerId = sauber(kontakt?.zustaendig_id)
  if (!partnerId) return null

  const { data: profil, error: profilFehler } = await supabase
    .from('profiles')
    .select('id, name, email, buchungslink')
    .eq('id', partnerId)
    .maybeSingle()
  if (profilFehler) throw profilFehler
  // Zuständig, aber ohne Profil: die Kennung reicht für die Unterschrift
  // nicht, dann lieber das Haus als ein leerer Name.
  if (!profil) return null
  return {
    id: partnerId,
    name: sauber(profil.name),
    email: sauber(profil.email),
    buchungslink: sauber(profil.buchungslink),
  }
}
