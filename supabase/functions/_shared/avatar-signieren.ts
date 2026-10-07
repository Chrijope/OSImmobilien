/**
 * Die Bildadresse eines Ansprechpartners für den Mailversand bestimmen.
 *
 * Der Dateiname sagt "signieren", das stimmt seit dem 21.09.2026 nicht mehr,
 * und genau darum geht es hier. Die Vorgeschichte gehört dazu, sonst baut sie
 * jemand zurück:
 *
 * Bis zum 06.09.2026 stand in der Mail die gespeicherte Adresse aus
 * `profiles.avatar_url`. Der Signaturkreis blieb leer, und die Vermutung war,
 * der Bucket `avatars` sei privat und das Mailprogramm komme deshalb nicht an
 * das Bild. Daraufhin wurde die Adresse für die Mail signiert, mit einem Jahr
 * Laufzeit.
 *
 * Die Vermutung war falsch. Der Bucket ist öffentlich, und zwar seit der
 * Migration 20260601143536, die ihn ausdrücklich auf `public = true` setzt und
 * `anon` das Lesen erlaubt. Dieselbe falsche Vermutung steht schon einmal
 * dokumentiert in `src/lib/storage.ts`, sie hat dort bereits eine Fehlersuche
 * in die Irre geführt.
 *
 * Die Signatur hat also nichts geschützt, was nicht ohnehin offen war, dafür
 * aber ein Ablaufdatum in die Mail geschrieben. Eine Mail liegt im Postfach
 * und wird Monate später wieder hervorgeholt, weitergeleitet oder als Beleg
 * aufbewahrt. Nach Ablauf lädt das Bild nicht mehr, und im Kreis steht nur
 * noch das Namenskürzel. Genau dieses "das Bild war doch da" entsteht so.
 *
 * Deshalb geht jetzt die öffentliche Adresse in die Mail, unverändert und
 * ohne Ablaufdatum. Der angehängte Zeitstempel `?t=...` bleibt dabei stehen:
 * Er ist die Bremse gegen den Bildzwischenspeicher von Gmail. Lädt jemand ein
 * neues Profilbild hoch, ändert sich die Adresse, und neue Mails zeigen das
 * neue Bild.
 *
 * Bleibt der Rückfall: Lädt das Bild aus irgendeinem Grund nicht, zeigt das
 * Mailprogramm den Alternativtext des `<img>`, und das sind die Initialen
 * (siehe `_layout.tsx`, Funktion `Unterschrift`). Ein leerer Kreis entsteht
 * dadurch nicht mehr.
 *
 * Wer den Bucket wieder auf privat stellen will, muss vorher hier eine andere
 * Lösung bauen, sonst verschwinden die Bilder aus allen Mails. Der Wächter in
 * `src/lib/avatarSignieren.test.ts` schlägt in dem Fall an.
 */

/** Der Bucket, in dem die Profilbilder liegen. */
export const AVATAR_BUCKET = 'avatars'

/**
 * Die veröffentlichte Adresse, von der jedes Bild in einer Mail kommt.
 *
 * Fest und nie aus dem Browser des Absenders: Die Lovable-Vorschau ist ohne
 * Anmeldung nicht erreichbar, ein Bild von dort lädt beim Kunden nie.
 * Gegenstück im Browser ist `src/lib/oeffentlicheBasis.ts`.
 */
export const MAIL_BASIS = 'https://portal.more.immo'

/**
 * Das Logo jeder Mail. PNG, weil viele Mailprogramme kein SVG zeigen; die
 * Datei liegt unter `public/moreimmo-logo-mail.png`. Warum diese Fassung,
 * steht bei `MARKE.logo` in `transactional-email-templates/_layout.tsx`.
 */
export const MAIL_LOGO_URL = `${MAIL_BASIS}/moreimmo-logo-mail.png`

/** Hosts der Lovable-Vorschau, hinter einer Anmeldesperre. */
const VORSCHAU_HOST = /(^|\.)(lovable\.app|lovableproject\.com)$/i

/**
 * Den Speicherpfad aus einer öffentlichen Avatar-Adresse zurückgewinnen.
 *
 * Gibt `null` zurück, wenn sich kein Pfad ableiten lässt. Das ist kein
 * Fehler, sondern die Aussage „das ist keine unserer Profilbildadressen":
 * ein anderer Bucket, eine fremde Quelle oder gar nichts.
 *
 * Gebraucht wird der Pfad nur noch zum Wiedererkennen, nicht mehr zum
 * Signieren. Die Funktion bleibt trotzdem, weil sie genau die Form
 * beschreibt, die `Einstellungen.tsx` in `profiles.avatar_url` ablegt, und
 * weil die Tests daran hängen.
 */
export function avatarSpeicherpfad(wert: string | null | undefined): string | null {
  const url = typeof wert === 'string' ? wert.trim() : ''
  if (!url) return null

  // Nur die öffentliche Form aus getPublicUrl. Die signierte Form heißt
  // `/object/sign/` und trifft diesen Ausdruck bewusst nicht.
  const treffer = url.match(/\/storage\/v1\/object\/public\/avatars\/(.+)$/)
  if (!treffer) return null

  const roh = treffer[1].split('?')[0].split('#')[0]
  if (!roh) return null

  // Der Zeitstempel `?t=...` hängt an der Adresse, nicht am Pfad. Er ist oben
  // schon abgeschnitten. Die Prozentzeichen aus der Adresse müssen dagegen
  // zurück in echte Zeichen.
  try {
    return decodeURIComponent(roh)
  } catch {
    return roh
  }
}

/**
 * Liefert die Adresse, die in die Mail gehört.
 *
 *   - leerer Wert            -> undefined, die Vorlage zeigt die Initialen
 *   - data: oder blob:       -> undefined (Gmail und Outlook.com entfernen
 *                               data:, blob: gibt es nur im Browser)
 *   - relativer Pfad         -> an MAIL_BASIS gehängt
 *   - Lovable-Vorschau       -> derselbe Pfad unter MAIL_BASIS
 *   - signierte Avatar-Form  -> die öffentliche Form ohne Ablaufdatum
 *   - unlesbare Adresse      -> undefined
 *   - sonst                  -> der Wert unverändert
 *
 * Unverändert heißt: dauerhaft gültig. Der Bucket ist öffentlich, die Adresse
 * läuft nicht ab, und das Bild steht auch in einer Mail noch im Kreis, die
 * jemand in zwei Jahren wieder aufmacht.
 *
 * Läuft zusätzlich im Layout selbst (`Unterschrift` in `_layout.tsx`), damit
 * auch flach hereingereichte Bilder wie `beraterBild` hier durchmüssen.
 *
 * Wirft nie. Eine Mail, die wegen eines Profilbildes nicht hinausgeht, wäre
 * ein schlechter Tausch.
 */
export function avatarUrlFuerMail(wert: string | null | undefined): string | undefined {
  const url = typeof wert === 'string' ? wert.trim() : ''
  if (!url || /^(data|blob):/i.test(url)) return undefined
  if (url.startsWith('//')) return `https:${url}`
  if (url.startsWith('/')) return `${MAIL_BASIS}${url}`

  let adresse: URL
  try {
    adresse = new URL(url)
  } catch {
    return undefined
  }
  if (VORSCHAU_HOST.test(adresse.hostname)) {
    return `${MAIL_BASIS}${adresse.pathname}${adresse.search}`
  }
  // Eine signierte Adresse läuft ab. Der Bucket ist öffentlich, also geht
  // dieselbe Datei auch ohne Token, und zwar dauerhaft.
  const signiert = adresse.pathname.match(/\/storage\/v1\/object\/sign\/avatars\/(.+)$/)
  if (signiert) return `${adresse.origin}/storage/v1/object/public/${AVATAR_BUCKET}/${signiert[1]}`
  return url
}
