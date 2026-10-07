/**
 * Linkzählung für Bewerbermails, ohne Deno und ohne Netz.
 *
 * Seit dem 26.09.2026 tragen Bewerbermails kein Zählpixel mehr. Nach
 * Einschätzung der Rechtsprüfung braucht ein Öffnungspixel eine Einwilligung
 * (§ 25 TDDDG). Gezählt wird stattdessen, ob der Bewerber den persönlichen
 * Link aus der Mail aufruft. Dafür hängt an diesem Link eine Zählmarke, das
 * Token der Zeile in `bewerber_mail_tracking`. Die Seite hinter dem Link
 * meldet die Marke an `track-bewerber-mail` (`mode=click`), und die Datenbank
 * setzt `clicked_at`.
 *
 * Der Link bleibt dabei auf portal.more.immo. Eine Weiterleitung über die
 * Supabase-Adresse wäre der andere Weg, aber dann stünde in jeder Mail ein
 * fremder Knopf, und genau den haben wir am 26.09.2026 aus den Bewerbermails
 * genommen.
 *
 * Steht hier und nicht in `bewerber-mail-tracking.ts`, weil auch der Browser
 * (`src/lib/bewerberMailTracking.ts`) und Vitest es lesen. Dort gibt es kein
 * `Deno`.
 */

/** Der Name des Adressparameters mit der Zählmarke. */
export const ZAEHL_PARAMETER = 'm'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Ist das eine gültige Zählmarke? Die Tokens sind uuids. */
export function istZaehlmarke(wert: string | null | undefined): wert is string {
  return !!wert && UUID.test(wert)
}

/** Den Link mit angehängter Zählmarke. Ohne gültige Marke bleibt er, wie er ist. */
export function mitZaehlmarke(link: string, token: string | null | undefined): string {
  if (!link || !istZaehlmarke(token)) return link
  try {
    const u = new URL(link)
    u.searchParams.set(ZAEHL_PARAMETER, token)
    return u.toString()
  } catch {
    return link
  }
}

/** Die Lovable-Projektkennung, für die Vorschau unter lovable.app. */
const LOVABLE_PROJEKT = 'cd62347b-9ef0-43fe-a989-4d4a53a8c4ef'
const LOVABLE_VORSCHAU = new RegExp(
  `^(?:[a-z0-9-]+--)?${LOVABLE_PROJEKT}\\.(?:lovable\\.app|lovableproject\\.com)$`,
)

/**
 * Darf `track-bewerber-mail` auf dieses Ziel weiterleiten?
 *
 * Nur auf eigene Adressen. Ohne diese Liste wäre die Function ein offener
 * Umleiter: Jeder könnte einen Link auf unsere Supabase-Adresse bauen, der
 * auf eine fremde Seite springt, und ihn mit unserem Namen verschicken.
 *
 * Erlaubt sind more.immo samt Unterdomains (also auch portal.more.immo), die
 * Lovable-Vorschau genau dieses Projekts und der Dateispeicher des eigenen
 * Supabase-Projekts (dort liegt das PDF des Startfahrplans).
 */
export function istEigenesWeiterleitungsziel(ziel: string, supabaseUrl?: string): boolean {
  let u: URL
  try {
    u = new URL(ziel)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' || u.username || u.password) return false
  const host = u.hostname.toLowerCase()
  if (host === 'more.immo' || host.endsWith('.more.immo')) return true
  if (LOVABLE_VORSCHAU.test(host)) return true
  if (supabaseUrl) {
    try {
      const eigen = new URL(supabaseUrl).hostname.toLowerCase()
      if (host === eigen && u.pathname.startsWith('/storage/v1/object/')) return true
    } catch {
      // Keine gültige Projektadresse, dann gilt der Speicher eben nicht.
    }
  }
  return false
}
