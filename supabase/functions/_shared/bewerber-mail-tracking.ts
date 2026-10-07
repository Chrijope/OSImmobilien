/**
 * Linkzählung für die Bewerbermails, Serverseite.
 *
 * Bis zum 26.09.2026 trug jede Bewerbermail ein Zählpixel. Das ist entfallen:
 * Nach Einschätzung der Rechtsprüfung braucht ein Öffnungspixel eine
 * Einwilligung (§ 25 TDDDG). Gezählt wird seitdem nur noch, ob der Bewerber
 * den persönlichen Link aus der Mail aufruft. Wie das geht, steht in
 * `mail-zaehlung.ts`.
 *
 * Die Tabelle bleibt dieselbe: `bewerber_mail_tracking`, eine Zeile je
 * verschickter Mail, ihr Token ist die Zählmarke am Link.
 *
 * Die Namen der Mailarten stehen bewusst doppelt, hier und in
 * `src/lib/bewerberMailTracking.ts`. Deno erreicht `src` nicht, und dieselbe
 * Begründung steht bereits an der Rollenliste in `send-bewerber-kennenlernen`.
 */

import { mitZaehlmarke } from './mail-zaehlung.ts'

export const MAIL_KENNENLERNEN = 'kennenlernen_einladung'
export const MAIL_ERINNERUNG_1 = 'kennenlernen_erinnerung_1'
export const MAIL_ERINNERUNG_2 = 'kennenlernen_erinnerung_2'
export const MAIL_ERINNERUNG_3 = 'kennenlernen_erinnerung_3'

/** Nur `from(...).insert(...)` wird gebraucht, und zwar lose genug für jede Clientfassung. */
type Schreiber = {
  from: (tabelle: string) => {
    insert: (werte: Record<string, unknown>) => {
      // PromiseLike, nicht Promise: Der Supabase-Builder ist nur „thenable",
      // ein echtes Promise mit catch/finally liefert er nicht.
      select: (spalten: string) => { single: () => PromiseLike<{ data: any; error: any }> }
    }
  }
}

/**
 * Einen Trackingeintrag anlegen und den Link mit Zählmarke zurückgeben.
 *
 * **Immer best effort.** Der Eintrag muss vor dem Versand entstehen, denn sein
 * Token gehört an den Link. Scheitert er, geht die Mail mit dem nackten Link
 * hinaus und niemand merkt etwas davon außer dem Protokoll.
 */
export async function linkMitZaehlung(
  admin: Schreiber,
  bewerberId: string,
  art: string,
  link: string,
): Promise<string> {
  try {
    const { data, error } = await admin
      .from('bewerber_mail_tracking')
      .insert({ bewerber_id: bewerberId, kind: art, tracked: true })
      .select('token')
      .single()
    if (error || !data?.token) throw error || new Error('kein Token')
    return mitZaehlmarke(link, String(data.token))
  } catch (e) {
    console.warn('[bewerbermail] Tracking nicht angelegt, Versand ohne Zählmarke:', art, e)
    return link
  }
}

/** Nur `rpc(...)` wird gebraucht, lose genug für jede Clientfassung. */
type Rufer = {
  rpc: (name: string, argumente: Record<string, unknown>) => PromiseLike<{ error: any }>
}

/**
 * Die Öffnung aus dem ausgefüllten Kennenlernbogen ableiten.
 *
 * Wer den Bogen abgeschickt hat, hat die Mail zwangsläufig geöffnet: Der Link
 * steht ausschließlich dort. Ohne diesen Vermerk bleibt der Umschlag
 * in der Bewerberliste deshalb grau, obwohl der Bogen vorliegt, und das ist
 * die eine Fehlanzeige, die sich sicher ausschließen lässt.
 *
 * Die Arbeit macht `mark_bewerber_mail_opened_aus_bogen` in der Datenbank:
 * Sie rührt eine bereits gemessene Öffnung nicht an, vermerkt sonst an der
 * jüngsten Kennenlernmail und legt nur dann eine Zeile an, wenn es gar keine
 * gibt (die Mails vor dem 15.09.2026 trugen noch kein Zählpixel). Der Grund
 * steht daneben in `opened_source`, damit „abgeleitet" und „wirklich gemessen"
 * unterscheidbar bleiben.
 *
 * **Immer best effort.** Ist die Migration vom 15.09.2026 in Supabase noch
 * nicht gelaufen, fehlt die Funktion, der Aufruf scheitert und es bleibt beim
 * grauen Umschlag. Der abgeschickte Bogen ist davon nicht berührt, er ist zu
 * diesem Zeitpunkt längst gespeichert.
 */
export async function oeffnungAusBogen(
  admin: Rufer,
  bewerberId: string,
  eingereichtAm: string,
  mailGesendetAm?: string | null,
): Promise<void> {
  try {
    const { error } = await admin.rpc('mark_bewerber_mail_opened_aus_bogen', {
      _bewerbung_id: bewerberId,
      _zeitpunkt: eingereichtAm,
      _gesendet_am: mailGesendetAm || null,
    })
    if (error) throw error
  } catch (e) {
    console.warn('[bewerbermail] Öffnung aus dem Bogen nicht vermerkt:', e)
  }
}
