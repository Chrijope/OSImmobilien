/**
 * Die interne Meldung „Reservierung unterschrieben“ mit Download der PDF.
 *
 * Auftrag Christians vom 24.09.2026: Sobald ein Kunde die
 * Reservierungsvereinbarung unterschrieben hat, geht eine Mail an den
 * zuständigen Vertriebspartner, an Christian Peetz und an Christian Kurz. Sie
 * verweist auf die unterschriebene Vereinbarung und bietet sie per Knopf zum
 * Herunterladen an.
 *
 * WANN: Erst wenn die PDF abgelegt ist. Die PDF entsteht nur im Browser des
 * Kunden und kommt in einem zweiten Aufruf von `finalize-reservierung`
 * (`pdfBase64`). Erst danach gibt es etwas herunterzuladen. Bleibt dieser
 * zweite Aufruf aus, etwa weil der Kunde die Seite sofort schließt, holt der
 * tägliche Lauf `send-reservierung-eskalation` die Meldung nach, dann mit
 * dem Hinweis, dass die PDF noch fehlt. Das Merkmal dafür setzt
 * `finalize-reservierung` mit der letzten Unterschrift:
 * `rvUnterschriebenMeldungOffen`. Ältere Reservierungen tragen es nicht und
 * werden deshalb nie nachträglich gemeldet.
 *
 * GENAU EINMAL: Der Riegel ist `rvUnterschriebenGemeldetAm` am Investment.
 * Zusätzlich trägt jede Mail einen festen Idempotenzschlüssel je Empfänger,
 * damit auch zwei gleichzeitige Aufrufe keine zweite Mail erzeugen.
 *
 * WER: Der Partner über die Kennung am Kontakt (`zustaendig_id`), der Name
 * nur als Rückfall und nur bei genau einem Treffer. Die Geschäftsführung über
 * `app_config`, Schlüssel `reservierung_unterschrieben_empfaenger`, niemals
 * über eine Namenssuche: Es gibt zwei Profile mit dem Namen Christian Peetz.
 *
 * DOWNLOAD: Eine signierte Adresse auf die Datei im nicht öffentlichen Bucket
 * `unterlagen`, sieben Tage gültig. Danach bleibt der Weg über das
 * Kundenprofil im CRM, dort liegt die PDF im Kundenordner. Warum nicht als
 * Anhang: siehe `RV_PDF_LINK_GUELTIG_TAGE`.
 *
 * WHATSAPP-GRUPPE: Nur die Mail an die Geschäftsführung trägt den Abschnitt
 * „Nächster Schritt: WhatsApp-Gruppe eröffnen“ zum Start in die Finanzierung
 * (Auftrag Christians vom 28.09.2026). Genannt werden der Partner und der
 * Finanzierer mit Name und Telefon aus dem Profil. Eine Zuordnung des
 * Finanzierers je Kunde gibt es nicht, maßgeblich ist die Rolle
 * `finanzierungspartner`, wie bei `bonitaet-freigabe-mail`. Fehlt ein Wert,
 * steht dort ein Hinweis; der Versand hängt nie daran.
 *
 * Diese Datei kennt weder Deno noch die Supabase-Bibliothek, damit Vitest sie
 * prüfen kann. Der Client wird nur so lose beschrieben, wie er gebraucht wird.
 */

import { findeBeraterNachName } from './berater-namensabgleich.ts'
import { sendeVorlage } from './transactional-versand.ts'

/** Der Schlüssel in `app_config` mit den festen Empfängern. */
export const RV_MELDUNG_EMPFAENGER_SCHLUESSEL = 'reservierung_unterschrieben_empfaenger'

/**
 * Wie lange der Knopf in der Mail trägt.
 *
 * Sieben Tage, danach führt der zweite Link ins CRM mit Anmeldung. Die Datei
 * enthält Namen, Anschrift und Unterschriften der Käufer. Eine Adresse ohne
 * Ablauf wäre ein Schlüssel, der mit jeder weitergeleiteten Mail mitreist.
 * Bewusst auch kein Anhang: Die Mail geht an bis zu drei Postfächer, und die
 * Vereinbarung liegt ohnehin im Kundenordner, wo die Rechte des CRM gelten.
 */
export const RV_PDF_LINK_GUELTIG_TAGE = 7

/** Die Vorlage, bereits registriert und im gemeinsamen Layout. */
export const RV_MELDUNG_VORLAGE = 'reservierung-unterschrieben'

const CRM_BASIS = 'https://osimmobilien.netlify.app'

const UUID_MUSTER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAIL_MUSTER = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// deno-lint-ignore no-explicit-any
type Datenbank = any
/** Das Investment-Meta ist frei geformtes JSON, gelesen wird es so lose wie in finalize-reservierung. */
// deno-lint-ignore no-explicit-any
type Meta = Record<string, any>

export interface Empfaenger {
  email: string
  name?: string
  art: 'partner' | 'geschaeftsfuehrung'
}

/** Was in `app_config` steht, zerlegt in Kennungen und Adressen. */
export interface KonfigEintraege {
  kennungen: string[]
  adressen: string[]
  /** Einträge, die weder Kennung noch Adresse sind. Nur fürs Protokoll. */
  ungueltig: string[]
}

/**
 * Den Wert aus `app_config` lesen.
 *
 * Erwartet wird eine Liste. Jeder Eintrag ist entweder die Kennung eines
 * Nutzers (dann gilt die Adresse aus seinem Profil) oder eine Mailadresse.
 * Die Kennung ist der bevorzugte Weg, weil sie eine Person eindeutig trifft.
 * Die Adresse ist für ein Postfach ohne eigenes Konto gedacht.
 */
export function konfigLesen(wert: unknown): KonfigEintraege {
  const ergebnis: KonfigEintraege = { kennungen: [], adressen: [], ungueltig: [] }
  if (!Array.isArray(wert)) return ergebnis
  for (const roh of wert) {
    const eintrag = typeof roh === 'string' ? roh.trim() : ''
    if (!eintrag) continue
    if (UUID_MUSTER.test(eintrag)) ergebnis.kennungen.push(eintrag.toLowerCase())
    else if (MAIL_MUSTER.test(eintrag)) ergebnis.adressen.push(eintrag.toLowerCase())
    else ergebnis.ungueltig.push(eintrag)
  }
  return ergebnis
}

/**
 * Partner zuerst, dann die Geschäftsführung, jede Adresse nur einmal.
 *
 * Ist der Partner selbst einer der festen Empfänger, bekommt er genau eine
 * Mail, und zwar in seiner Rolle als Partner.
 */
export function empfaengerZusammenstellen(
  partner: { email?: string | null; name?: string | null } | null | undefined,
  feste: Array<{ email?: string | null; name?: string | null }>,
): Empfaenger[] {
  const liste: Empfaenger[] = []
  const gesehen = new Set<string>()
  const aufnehmen = (p: { email?: string | null; name?: string | null } | null | undefined, art: Empfaenger['art']) => {
    const email = (p?.email || '').trim()
    if (!email || !MAIL_MUSTER.test(email)) return
    const schluessel = email.toLowerCase()
    if (gesehen.has(schluessel)) return
    gesehen.add(schluessel)
    const name = (p?.name || '').trim()
    liste.push({ email, art, ...(name ? { name } : {}) })
  }
  aufnehmen(partner, 'partner')
  for (const f of feste) aufnehmen(f, 'geschaeftsfuehrung')
  return liste
}

/**
 * Fester Schlüssel je Unterschrift und Adresse, gegen doppelten Versand.
 *
 * Der Zeitpunkt der Unterschrift gehört dazu: Wird am selben Investment
 * später eine neue Vereinbarung unterschrieben, ist das eine neue Meldung.
 */
export function meldungIdempotenzSchluessel(investmentId: string, unterschriebenAm: string | null | undefined, email: string): string {
  return `rv-unterschrieben-${investmentId}-${unterschriebenAm || 'ohne-datum'}-${email.trim().toLowerCase()}`
}

/** „30.09.2026“ aus einem ISO-Zeitpunkt, in deutscher Zeit. */
export function datumDeutsch(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined
  const d = new Date(iso)
  if (isNaN(d.getTime())) return undefined
  return d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Eine Person mit Name und Telefon, wie sie im Profil steht. */
export interface Kontaktperson {
  name?: string | null
  telefon?: string | null
}

/** Wer in der WhatsApp-Gruppe fehlt, wird so genannt. */
export const FINANZIERER_FEHLT = 'Finanzierer noch nicht zugeordnet'
export const PARTNER_FEHLT = 'Vertriebspartner nicht zugeordnet'

/** „Paula Partner, 0171 2345678“; ohne Nummer mit Hinweis, ohne Namen nur die Nummer. */
function personZeile(p: Kontaktperson): string {
  const name = (p.name || '').trim()
  const telefon = (p.telefon || '').trim()
  return [name, telefon || 'Telefon nicht hinterlegt'].filter(Boolean).join(', ')
}

/** Die beiden Zeilen für den Abschnitt „WhatsApp-Gruppe eröffnen“. */
export function whatsappGruppe(
  partner: Kontaktperson | null | undefined,
  finanzierer: Kontaktperson[],
): { vertriebspartner: string; finanzierer: string } {
  const hatWert = (p: Kontaktperson | null | undefined) => Boolean((p?.name || '').trim() || (p?.telefon || '').trim())
  const fp = finanzierer.filter(hatWert)
  return {
    vertriebspartner: partner && hatWert(partner) ? personZeile(partner) : PARTNER_FEHLT,
    finanzierer: fp.length > 0 ? fp.map(personZeile).join('; ') : FINANZIERER_FEHLT,
  }
}

/**
 * Die Daten für die Vorlage, ohne jeden Datenbankzugriff.
 *
 * `empfaengerName` steht in der Anrede, die Vorlage nimmt davon den Vornamen.
 * Fehlt er, grüßt die Mail mit „Hallo,“.
 */
export function meldungDaten(args: {
  empfaengerName?: string
  kundeName: string
  kontaktId: string
  meta: Meta
  pdfUrl?: string | null
  jetzt?: Date
  /** Nur für die Geschäftsführung gesetzt. */
  whatsapp?: { vertriebspartner: string; finanzierer: string }
}): Record<string, unknown> {
  const { empfaengerName, kundeName, kontaktId, meta } = args
  const rvData = (meta.rvData ?? {}) as Meta
  const objektTitel = String(meta.objektTitel || meta.objekt || '').trim()
  const jetzt = args.jetzt ?? new Date()
  const gueltigBis = new Date(jetzt.getTime() + RV_PDF_LINK_GUELTIG_TAGE * 86_400_000)
  const unterschriebenAm = datumDeutsch(meta.rvVertragsdatum || meta.rvSignedAt)
  return {
    ...(empfaengerName ? { vpName: empfaengerName } : {}),
    kundeName: kundeName || 'Ein Kunde',
    kundeLink: `${CRM_BASIS}/kunden/${kontaktId}`,
    ...(objektTitel ? { objektTitel } : {}),
    ...(unterschriebenAm ? { unterschriebenAm } : {}),
    ...(args.pdfUrl ? { pdfUrl: args.pdfUrl, pdfGueltigBis: datumDeutsch(gueltigBis.toISOString()) } : { pdfFehlt: true }),
    ...(meta.rvEinheitVergeben ? { einheitVergeben: true } : {}),
    ...(rvData.gesamtobjekt === true ? { gesamtobjekt: true } : {}),
    ...(meta.rvReservierungAb && !meta.rvEinheitVergeben ? { reservierungAb: datumDeutsch(meta.rvReservierungAb) } : {}),
    ...(args.whatsapp && !meta.rvEinheitVergeben
      ? { whatsappVertriebspartner: args.whatsapp.vertriebspartner, whatsappFinanzierer: args.whatsapp.finanzierer }
      : {}),
  }
}

/**
 * Der zuständige Partner des Kontakts, oder null.
 *
 * Zuerst die Kennung `zustaendig_id`. Der Freitext `berater` gilt nur, wenn
 * die Kennung fehlt, und nur bei genau einem Profil mit diesem Namen; bei
 * zwei gleichnamigen Profilen wäre der Treffer geraten.
 */
export async function zustaendigerPartner(
  db: Datenbank,
  kontaktId: string,
): Promise<{ id: string; email: string | null; name: string | null; telefon: string | null } | null> {
  try {
    const { data: kontakt } = await db
      .from('kontakte').select('zustaendig_id, berater').eq('id', kontaktId).maybeSingle()
    let id: string | null = (kontakt?.zustaendig_id as string | null) || null
    if (!id && kontakt?.berater) {
      const { data: profile } = await db.from('profiles').select('id, name')
      const treffer = findeBeraterNachName(kontakt.berater as string, (profile ?? []) as Array<{ id: string; name: string | null }>)
      if (treffer.art === 'eindeutig') id = treffer.id
    }
    if (!id) return null
    const { data: profil } = await db.from('profiles').select('id, email, name, telefon').eq('id', id).maybeSingle()
    return profil ? { id: profil.id, email: profil.email ?? null, name: profil.name ?? null, telefon: profil.telefon ?? null } : null
  } catch (fehler) {
    console.error('Reservierungsmeldung: Partner nicht ermittelt', fehler)
    return null
  }
}

/**
 * Die festen Empfänger aus `app_config`.
 *
 * Kein Rückfall auf eine Adresse im Code und keiner auf alle Administratoren.
 * Fehlt der Eintrag, gehen die Mails nur an den Partner, und der Grund steht
 * im Rückgabewert.
 */
export async function festeEmpfaenger(
  db: Datenbank,
): Promise<{ empfaenger: Array<{ email: string; name?: string }>; hinweise: string[] }> {
  const hinweise: string[] = []
  try {
    const { data, error } = await db
      .from('app_config').select('wert').eq('schluessel', RV_MELDUNG_EMPFAENGER_SCHLUESSEL).maybeSingle()
    if (error) {
      return { empfaenger: [], hinweise: [`app_config nicht lesbar: ${error.message}`] }
    }
    if (!data) {
      return { empfaenger: [], hinweise: [`app_config ohne Eintrag "${RV_MELDUNG_EMPFAENGER_SCHLUESSEL}", Geschäftsführung nicht benachrichtigt`] }
    }
    const eintraege = konfigLesen(data.wert)
    if (eintraege.ungueltig.length > 0) hinweise.push(`${eintraege.ungueltig.length} ungültige Einträge in "${RV_MELDUNG_EMPFAENGER_SCHLUESSEL}" übersprungen`)

    const empfaenger: Array<{ email: string; name?: string }> = eintraege.adressen.map((email) => ({ email }))
    for (const kennung of eintraege.kennungen) {
      const { data: profil } = await db.from('profiles').select('email, name').eq('id', kennung).maybeSingle()
      if (profil?.email) empfaenger.push({ email: profil.email, ...(profil.name ? { name: profil.name } : {}) })
      else hinweise.push(`Profil ${kennung} ohne Mailadresse`)
    }
    if (empfaenger.length === 0) hinweise.push(`"${RV_MELDUNG_EMPFAENGER_SCHLUESSEL}" ist leer, Geschäftsführung nicht benachrichtigt`)
    return { empfaenger, hinweise }
  } catch (fehler) {
    return { empfaenger: [], hinweise: [`app_config: ${fehler instanceof Error ? fehler.message : String(fehler)}`] }
  }
}

/** Alle Finanzierungspartner mit Name und Telefon, oder eine leere Liste. Wirft nie. */
export async function finanzierungspartner(db: Datenbank): Promise<Kontaktperson[]> {
  try {
    const { data: rollen } = await db.from('user_roles').select('user_id').eq('role', 'finanzierungspartner')
    const ids = ((rollen ?? []) as Array<{ user_id?: string | null }>).map((r) => r.user_id).filter(Boolean)
    if (ids.length === 0) return []
    const { data: profile } = await db.from('profiles').select('name, telefon').in('id', ids)
    return ((profile ?? []) as Kontaktperson[]).map((p) => ({ name: p.name ?? null, telefon: p.telefon ?? null }))
  } catch (fehler) {
    console.error('Reservierungsmeldung: Finanzierer nicht ermittelt', fehler)
    return []
  }
}

/** Die signierte Adresse zur PDF, oder null. Wirft nie. */
export async function pdfLink(db: Datenbank, pfad: string | null | undefined): Promise<string | null> {
  if (!pfad) return null
  try {
    const dateiname = pfad.split('/').pop() || 'Reservierungsvereinbarung.pdf'
    const { data, error } = await db.storage
      .from('unterlagen')
      .createSignedUrl(pfad, RV_PDF_LINK_GUELTIG_TAGE * 86_400, { download: dateiname })
    if (error || !data?.signedUrl) {
      console.error('Reservierungsmeldung: PDF-Link nicht erzeugt', error)
      return null
    }
    return data.signedUrl as string
  } catch (fehler) {
    console.error('Reservierungsmeldung: PDF-Link nicht erzeugt', fehler)
    return null
  }
}

export interface MeldungErgebnis {
  /** Nichts getan, weil schon gemeldet. */
  bereitsGemeldet: boolean
  versendet: string[]
  fehler: string[]
  hinweise: string[]
  ohnePartner: boolean
  mitPdf: boolean
  /** Die Felder, die der Aufrufer ins Investment-Meta schreibt. */
  metaPatch: Record<string, unknown>
}

/**
 * Die Meldung verschicken. Schreibt selbst nichts ins Investment, der
 * Aufrufer führt `metaPatch` mit seinem Meta zusammen und schreibt einmal.
 *
 * Wirft nie. Eine Meldung, die nicht hinausgeht, darf die Unterschrift nicht
 * ungeschehen machen; was schiefging, steht im Ergebnis.
 */
export async function meldeUnterschriebeneReservierung(
  db: Datenbank,
  args: { investmentId: string; kontaktId: string; meta: Meta; kundeName: string },
): Promise<MeldungErgebnis> {
  const { investmentId, kontaktId, meta, kundeName } = args
  const ergebnis: MeldungErgebnis = {
    bereitsGemeldet: false, versendet: [], fehler: [], hinweise: [], ohnePartner: false, mitPdf: false, metaPatch: {},
  }
  if (meta.rvUnterschriebenGemeldetAm) {
    ergebnis.bereitsGemeldet = true
    return ergebnis
  }
  /*
   * Einheit bei der Unterschrift schon vergeben: Es gibt keine Reservierung,
   * also auch keine Meldung (Entscheidung Christians vom 24.09.2026). Der
   * Partner erfährt es über die Glocke. Als erledigt vermerken, damit der
   * tägliche Lauf die Meldung nicht nachholt.
   */
  if (meta.rvEinheitVergeben) {
    ergebnis.hinweise.push('Einheit schon vergeben, keine Meldung')
    ergebnis.metaPatch = { rvUnterschriebenMeldungOffen: false }
    return ergebnis
  }

  try {
    const partner = await zustaendigerPartner(db, kontaktId)
    if (!partner?.email) {
      ergebnis.ohnePartner = true
      ergebnis.hinweise.push('kein zuständiger Partner mit Mailadresse, nur an die Geschäftsführung')
    }
    const feste = await festeEmpfaenger(db)
    ergebnis.hinweise.push(...feste.hinweise)
    const empfaenger = empfaengerZusammenstellen(partner, feste.empfaenger)

    const url = await pdfLink(db, meta.rvPdfPath as string | undefined)
    ergebnis.mitPdf = Boolean(url)
    if (!url) ergebnis.hinweise.push('PDF liegt noch nicht vor, Meldung ohne Download')

    if (empfaenger.length === 0) {
      ergebnis.fehler.push('kein Empfänger für die Meldung')
      return ergebnis
    }

    // Ist der Partner selbst Geschäftsführer, zählt seine Mail als Leitungsmail.
    const leitung = new Set(feste.empfaenger.map((f) => f.email.trim().toLowerCase()))
    const whatsapp = whatsappGruppe(partner, await finanzierungspartner(db))

    for (const e of empfaenger) {
      const versand = await sendeVorlage(db, {
        templateName: RV_MELDUNG_VORLAGE,
        recipientEmail: e.email,
        idempotencyKey: meldungIdempotenzSchluessel(investmentId, meta.rvSignedAt as string | undefined, e.email),
        templateData: meldungDaten({
          empfaengerName: e.name, kundeName, kontaktId, meta, pdfUrl: url,
          ...(leitung.has(e.email.toLowerCase()) ? { whatsapp } : {}),
        }),
        metadata: { kontakt_id: kontaktId, investment_id: investmentId, empfaenger_art: e.art },
      })
      if (versand.ok) ergebnis.versendet.push(e.email)
      else ergebnis.fehler.push(`Mail an ${e.email}: ${versand.grund || 'Versand fehlgeschlagen'}`)
    }
  } catch (fehler) {
    ergebnis.fehler.push(fehler instanceof Error ? fehler.message : String(fehler))
  }

  /*
   * Gilt als gemeldet, sobald mindestens eine Mail hinausging. Einzelne
   * Fehlschläge stehen im Vermerk und im Protokoll. Ging gar nichts hinaus,
   * bleibt `rvUnterschriebenMeldungOffen` stehen, und der tägliche Lauf
   * versucht es erneut.
   */
  if (ergebnis.versendet.length > 0) {
    ergebnis.metaPatch = {
      rvUnterschriebenGemeldetAm: new Date().toISOString(),
      rvUnterschriebenGemeldetAn: ergebnis.versendet,
      rvUnterschriebenMeldungOffen: false,
      rvUnterschriebenMeldungFehler: ergebnis.fehler.length > 0 ? ergebnis.fehler : null,
    }
  } else {
    ergebnis.metaPatch = { rvUnterschriebenMeldungFehler: ergebnis.fehler }
  }
  return ergebnis
}
