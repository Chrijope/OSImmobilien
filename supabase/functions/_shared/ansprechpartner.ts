/**
 * Wer unter einer Mail steht, und mit welcher Adresse.
 *
 * Anmeldeadresse und Geschaeftsadresse sind zwei verschiedene Dinge. Angemeldet
 * wird oft mit einer privaten oder aelteren Adresse, in der Mail an den Kunden
 * soll aber die Adresse stehen, die in den Einstellungen unter Profil
 * hinterlegt ist. Bisher schrieben mehrere Aufrufer schlicht die Anmeldeadresse
 * in die Vorlage, und der Kunde bekam sie zu sehen.
 *
 * Deshalb wird der Ansprechpartner nicht mehr dem Aufrufer geglaubt, sondern
 * hier gegen die Datenbank aufgeloest, an genau einer Stelle. Reihenfolge der
 * Hinweise:
 *
 *   1. beraterUserId, wenn der Aufrufer sie mitschickt
 *   2. der Name aus ansprechpartnerName oder berater.name
 *   3. der angemeldete Nutzer aus dem JWT des Aufrufs
 *
 * Ergaenzt wird nur, was die Vorlage auch anzeigen kann: Vorlagen ohne
 * berater-Feld bleiben unangetastet, damit interne Meldungen nicht ploetzlich
 * von der Person unterschrieben sind, die sie ausgeloest hat.
 */

import { avatarUrlFuerMail } from './avatar-signieren.ts'
import { berufsbezeichnung, istRollenkennung } from './berufsbezeichnung.ts'

export interface Ansprechpartner {
  name?: string
  rolle?: string
  telefon?: string
  email?: string
  /**
   * Profilbild aus den Einstellungen, oeffentliche und dauerhafte Adresse.
   * Fehlt es, zeigt die Vorlage die Initialen. Siehe avatar-signieren.ts.
   */
  bildUrl?: string
}

function sauber(wert: unknown): string {
  return typeof wert === 'string' ? wert.trim() : ''
}

/**
 * Die Nutzer-ID aus dem JWT des Aufrufs.
 *
 * Nur die Nutzlast wird gelesen, nicht geprueft: das Gateway hat den Token
 * bereits geprueft, bevor die Funktion ueberhaupt lief. Service-Role-Aufrufe
 * (Cronjobs, Datenbank-Trigger) gehoeren zu keinem Menschen und liefern
 * deshalb nichts.
 */
export function nutzerAusJwt(authHeader: string | null): string | null {
  const token = sauber(authHeader).replace(/^Bearer\s+/i, '')
  if (!token || token.split('.').length !== 3) return null
  try {
    const teil = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const nutzlast = JSON.parse(atob(teil.padEnd(Math.ceil(teil.length / 4) * 4, '=')))
    if (nutzlast?.role === 'service_role') return null
    const sub = sauber(nutzlast?.sub)
    return sub || null
  } catch {
    return null
  }
}

/** Profil und Einstellungen zu einer Nutzer-ID oder einem Namen. */
async function ladeAnsprechpartner(
  supabase: any,
  hinweis: { userId?: string | null; name?: string | null },
): Promise<Ansprechpartner | null> {
  let profil: any = null

  const userId = sauber(hinweis.userId)
  if (userId) {
    const { data } = await supabase
      .from('profiles')
      .select('id, name, email, telefon, avatar_url')
      .eq('id', userId)
      .maybeSingle()
    profil = data || null
  }

  const name = sauber(hinweis.name)
  if (!profil && name) {
    // Nur bei genau einem Treffer verwenden. Zwei Nutzer mit demselben Namen
    // waeren sonst ein stiller Fehlgriff.
    const { data } = await supabase
      .from('profiles')
      .select('id, name, email, telefon, avatar_url')
      .eq('name', name)
      .limit(2)
    if (Array.isArray(data) && data.length === 1) profil = data[0]
  }

  if (!profil) return null

  let position = ''
  let telefonAusEinstellungen = ''
  try {
    const { data } = await supabase
      .from('user_settings')
      .select('einstellungen')
      .eq('user_id', profil.id)
      .maybeSingle()
    const p = (data?.einstellungen as Record<string, any> | undefined)?.profil
    position = sauber(p?.position)
    telefonAusEinstellungen = sauber(p?.telefon)
  } catch {
    // Einstellungen sind Beiwerk, das Profil traegt die Mail auch allein.
  }

  // Die Berufsbezeichnung kommt aus der Nutzerrolle, siehe
  // berufsbezeichnung.ts. Faellt die Abfrage aus, bleibt das Positionsfeld,
  // aber auch dann nur, wenn dort eine echte Angabe steht und nicht bloss
  // eine Rollenkennung wie "Admin".
  let rollenListe: string[] = []
  try {
    const { data: rollen } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', profil.id)
    rollenListe = ((rollen ?? []) as Array<{ role?: string }>)
      .map((r) => sauber(r.role))
      .filter(Boolean)
  } catch {
    // dann eben nur die Position
  }
  const anzeigeRolle = berufsbezeichnung(rollenListe, position)

  const adresse = sauber(profil.email)
  if (!adresse && !sauber(profil.name)) return null

  return {
    name: sauber(profil.name) || undefined,
    // Kein Rueckfall mehr auf das rohe Positionsfeld: Dort steht bei vielen
    // Nutzern noch die maschinell eingetragene Rollenkennung, und genau die
    // soll der Kunde nicht lesen. Lieber keine Zeile als "Admin".
    rolle: anzeigeRolle || undefined,
    telefon: telefonAusEinstellungen || sauber(profil.telefon) || undefined,
    email: adresse || undefined,
    // Die gespeicherte Adresse ist oeffentlich und laeuft nicht ab, siehe
    // avatar-signieren.ts. Fehlt sie, zeigt die Vorlage die Initialen.
    bildUrl: avatarUrlFuerMail(profil.avatar_url),
  }
}

/**
 * Ergaenzt die Daten einer Vorlage um den aufgeloesten Ansprechpartner.
 *
 * Gibt immer ein verwendbares Objekt zurueck, auch wenn nichts gefunden wurde:
 * eine Mail scheitert nicht daran, dass ein Profil fehlt.
 */
export async function ansprechpartnerErgaenzen(
  supabase: any,
  vorlage: { previewData?: Record<string, unknown> },
  daten: Record<string, any>,
  authHeader: string | null,
): Promise<Record<string, any>> {
  const vorhandener = (daten.berater && typeof daten.berater === 'object' ? daten.berater : {}) as Ansprechpartner
  const nameHinweis = sauber(vorhandener.name) || sauber(daten.ansprechpartnerName) || sauber(daten.beraterName)
  const idHinweis = sauber(daten.beraterUserId) || sauber(daten.ansprechpartnerId)

  // Ohne Namen und ohne ID: der Absender ist gemeint, sofern ein Mensch ihn
  // ausgeloest hat.
  const userId = idHinweis || (nameHinweis ? '' : nutzerAusJwt(authHeader) || '')

  // Das Bild, das der Aufrufer mitgeschickt hat, bleibt unveraendert stehen.
  // Frueher wurde es hier fuer die Mail signiert; das hat ihm ein Ablaufdatum
  // gegeben und es nach einem Jahr aus der archivierten Mail verschwinden
  // lassen. Warum das weg ist, steht in avatar-signieren.ts.
  const vorhandenesBild = avatarUrlFuerMail(vorhandener.bildUrl)
  const bildGeaendert = daten.berater && typeof daten.berater === 'object' && vorhandener.bildUrl !== vorhandenesBild

  // Sicherheitsnetz fuer die beiden Abbruchstellen weiter unten: Findet sich
  // kein Profil, bleiben die Angaben des Aufrufers stehen. Eine Rollenkennung
  // wie "Admin" darf auch dann nicht in der Mail landen, denn sie ist eine
  // Berechtigung und keine Berufsbezeichnung.
  const rolleMitgeschickt = istRollenkennung(vorhandener.rolle)
  const positionMitgeschickt = istRollenkennung(daten.beraterPosition)
  const grunddaten: Record<string, any> =
    bildGeaendert || rolleMitgeschickt || positionMitgeschickt
      ? {
          ...daten,
          ...(positionMitgeschickt ? { beraterPosition: undefined } : {}),
          ...(daten.berater && typeof daten.berater === 'object'
            ? {
                berater: {
                  ...vorhandener,
                  bildUrl: vorhandenesBild,
                  ...(rolleMitgeschickt ? { rolle: undefined } : {}),
                },
              }
            : {}),
        }
      : daten

  if (!userId && !nameHinweis) return grunddaten

  let gefunden: Ansprechpartner | null = null
  try {
    gefunden = await ladeAnsprechpartner(supabase, { userId, name: nameHinweis })
  } catch (fehler) {
    console.error('Ansprechpartner konnte nicht aufgeloest werden', fehler)
  }
  if (!gefunden) return grunddaten

  // Nur Vorlagen ergaenzen, die einen Ansprechpartner ueberhaupt zeigen. Das
  // erkennt man daran, dass ihre Vorschaudaten das Feld fuehren.
  const zeigtBerater =
    Object.prototype.hasOwnProperty.call(vorlage.previewData || {}, 'berater') ||
    Object.prototype.hasOwnProperty.call(daten, 'berater')

  const ergaenzt: Record<string, any> = { ...grunddaten }

  // Was der Aufrufer als Bezeichnung mitschickt, ist oft das Positionsfeld
  // und damit eine Rollenkennung. Sie darf auch dann nicht durchrutschen,
  // wenn die Zuordnung fuer diese Rolle nichts hergibt.
  const mitgeschickteRolle = istRollenkennung(vorhandener.rolle) ? '' : sauber(vorhandener.rolle)

  if (zeigtBerater) {
    ergaenzt.berater = {
      ...vorhandener,
      name: gefunden.name || vorhandener.name,
      rolle: gefunden.rolle || mitgeschickteRolle || undefined,
      telefon: gefunden.telefon || vorhandener.telefon,
      // Die Adresse aus den Einstellungen gewinnt immer gegen das, was der
      // Aufrufer mitgeschickt hat. Genau darum geht es hier.
      email: gefunden.email || vorhandener.email,
      bildUrl: gefunden.bildUrl || vorhandenesBild,
    }
  }

  // Aeltere Vorlagen lesen die Rolle aus dem flachen Feld. Ohne diese Zeilen
  // stuende dort weiter der Wert des Aufrufers, etwa "Admin" aus dem
  // Positionsfeld des Profils. Gibt die Zuordnung nichts her, wird das Feld
  // ausdruecklich geleert statt stehen gelassen.
  if (zeigtBerater || Object.prototype.hasOwnProperty.call(daten, 'beraterPosition')) {
    const flach = gefunden.rolle || mitgeschickteRolle
    if (flach) ergaenzt.beraterPosition = flach
    else if (istRollenkennung(daten.beraterPosition)) ergaenzt.beraterPosition = undefined
  }

  if (gefunden.email) {
    // Aeltere Vorlagen lesen die flachen Felder.
    if (Object.prototype.hasOwnProperty.call(daten, 'ansprechpartnerEmail') || zeigtBerater) {
      ergaenzt.ansprechpartnerEmail = gefunden.email
    }
  }
  if (gefunden.name && Object.prototype.hasOwnProperty.call(daten, 'ansprechpartnerName')) {
    ergaenzt.ansprechpartnerName = daten.ansprechpartnerName || gefunden.name
  }

  return ergaenzt
}
