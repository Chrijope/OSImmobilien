/**
 * Der Wortlaut rund um die Rechnung über das Lead-Paket: die Mail „Rechnung
 * über das Lead-Paket erstellen" (Vorlage `vertrag-unterschrieben-rechnung`),
 * die HR-Glocke dazu und die Folgemail „Zahlung für das Lead-Paket
 * eingegangen" (Vorlage `rechnung-bezahlt-nutzer-anlegen`).
 *
 * ## Wann was hinausgeht
 *
 * Seit dem 23.09.2026 nur noch, wenn der Vertrag des Bewerbers ein Lead-Paket
 * enthält. Eine Onboardinggebühr erhebt der heutige Vertrag nicht mehr
 * (§ 2 Absatz 2), abzurechnen ist nur noch das Lead-Paket.
 *
 *   - Rechnungsmail und HR-Glocke: sobald der Vertrag vollständig
 *     unterschrieben ist. Ausgelöst in `finalize-vertrag` (digitale
 *     Gegenzeichnung) und im `VertragsTab` (Hochladen des PDFs).
 *   - Folgemail: wenn im `RechnungsTab` die Zahlung bestätigt wird und der
 *     Bewerber dadurch aus „Rechnung" nach „Nutzer anlegen" rückt.
 *
 * Die Regel, ob ein Lead-Paket gebucht ist, und der Statusweg stehen in
 * `./lead-paket.ts`. Hier steht nur, was daraus als Text wird.
 *
 * ## Der Betrag
 *
 * Er steht an keiner Stelle im Text, sondern kommt aus `leadPaket.betrag`,
 * also aus demselben Feld, aus dem der Vertrag den Paketpreis druckt. Ein
 * individuell vereinbarter Betrag erscheint damit so, wie er unterschrieben
 * wurde. Der Listenpreis selbst steht als `LEAD_PAKET_PREIS` in
 * `src/lib/lizenzPakete.ts`.
 *
 * ## Warum das hier steht und nicht in den Vorlagen
 *
 * Die Vorlagen laden React über einen `npm:`-Spezifizierer und sind für
 * Vitest damit unerreichbar. Dieses Modul lässt sich aus Deno, aus dem
 * Frontend und aus dem Test lesen, geprüft wird es in
 * `src/lib/leadPaketRechnungMail.test.ts`.
 */

import { formatiereLeadPaketBetrag, gebuchtesLeadPaket, type GebuchtesLeadPaket } from './lead-paket.ts'

// ─── Rechnungsmail: Wortlaut ───

export const LEAD_PAKET_RECHNUNG_AUGENBRAUE = 'Rechnung über das Lead-Paket'
export const LEAD_PAKET_RECHNUNG_TITEL = 'Vertrag unterschrieben'
export const LEAD_PAKET_RECHNUNG_ANZEIGENAME =
  'Vertrag unterschrieben, Rechnung über das Lead-Paket erstellen'
/** Überschrift des Blocks mit dem Betrag. */
export const LEAD_PAKET_RECHNUNG_BLOCK = 'Lead-Paket-Gebühr'
export const LEAD_PAKET_RECHNUNG_ZEILE_BETRAG = 'Lead-Paket-Gebühr netto'
export const LEAD_PAKET_RECHNUNG_ZEILE_LEADS = 'Leads'
export const LEAD_PAKET_RECHNUNG_SCHRITTE: readonly string[] = [
  'Rechnung über das Lead-Paket in Lexware erstellen und versenden',
  'Nach Zahlungseingang im Bewerberprofil unter Rechnung als bezahlt markieren, danach wird der Nutzer-Account angelegt',
]

export function leadPaketRechnungBetreff(bewerberName?: string): string {
  return bewerberName
    ? `${bewerberName} hat unterschrieben, Rechnung über das Lead-Paket erstellen`
    : 'Vertrag unterschrieben, Rechnung über das Lead-Paket erstellen'
}

export function leadPaketRechnungVorschau(wer: string): string {
  return `${wer} hat den Handelsvertretervertrag mit Lead-Paket unterschrieben.`
}

export function leadPaketRechnungText(wer: string): string {
  return (
    `${wer} hat den Handelsvertretervertrag und alle Anlagen vollständig unterschrieben. ` +
    'Bitte erstelle die Rechnung über das Lead-Paket in Lexware.'
  )
}

export function leadPaketRechnungLeads(anzahl: number): string {
  return `${anzahl} qualifizierte Leads`
}

// ─── HR-Glocke zur Rechnung ───

/**
 * Titel der Glocke an HR, wenn der Vertrag mit Lead-Paket vollständig
 * unterschrieben ist. Ohne Lead-Paket gibt es diese Glocke nicht.
 */
export const LEAD_PAKET_RECHNUNG_GLOCKE_TITEL =
  'Vertrag unterschrieben, Rechnung über das Lead-Paket erstellen'

/** Der Satz über das Paket, den beide Glocken tragen, etwa „Lead-Paket: 2.500 € netto für 20 qualifizierte Leads." */
export function leadPaketGlockeZeile(roh: unknown): string {
  const paket = gebuchtesLeadPaket(roh)
  if (!paket) return ''
  return `Lead-Paket: ${formatiereLeadPaketBetrag(paket.betrag)} netto für ${leadPaketRechnungLeads(paket.anzahl)}.`
}

// ─── Meldung nach dem Hochladen des unterschriebenen Vertrags ───

/**
 * Was der Toast im `VertragsTab` nach dem Hochladen sagt, je nachdem, wohin
 * der Statusweg aus `./lead-paket.ts` den Bewerber geschoben hat. `null`
 * heißt: Er war schon weiter oder ist ausgeschieden und bleibt stehen.
 */
export function meldungNachVertragUpload(neueStufe: 'Rechnung' | 'Nutzer_anlegen' | null): string {
  if (neueStufe === 'Rechnung') return 'Status auf Rechnung gesetzt, HR wurde informiert.'
  if (neueStufe === 'Nutzer_anlegen') {
    return 'Kein Lead-Paket im Vertrag, der Bewerber steht jetzt direkt in Nutzer anlegen.'
  }
  return 'Der Status bleibt unverändert.'
}

// ─── Rechnungsmail: Daten für die Vorlage ───

export interface LeadPaketRechnungEingabe {
  bewerberName: string
  bewerberEmail?: string
  bewerberTelefon?: string
  rechnungsAdresse?: string
  privatAdresse?: string
  ort?: string
  /** Der Rohwert aus `meta.leadPaket` beziehungsweise `Bewerber.leadPaket`. */
  leadPaket: unknown
  /** Zeitpunkt der Unterschrift, bereits lesbar formatiert. */
  signedAt: string
  bewerberLink: string
}

export interface LeadPaketRechnungDaten {
  bewerberName: string
  bewerberEmail: string
  bewerberTelefon: string
  rechnungsAdresse: string
  privatAdresse: string
  ort: string
  leadPaketBetragFormatiert: string
  leadAnzahl: number
  signedAt: string
  bewerberLink: string
}

/**
 * Die `templateData` für die Rechnungsmail, oder `null`, wenn der Vertrag
 * kein Lead-Paket enthält. `null` heißt: nicht verschicken.
 */
export function leadPaketRechnungDaten(e: LeadPaketRechnungEingabe): LeadPaketRechnungDaten | null {
  const paket = gebuchtesLeadPaket(e.leadPaket)
  if (!paket) return null
  return {
    bewerberName: e.bewerberName,
    bewerberEmail: e.bewerberEmail || '',
    bewerberTelefon: e.bewerberTelefon || '',
    rechnungsAdresse: e.rechnungsAdresse || '',
    privatAdresse: e.privatAdresse || '',
    ort: e.ort || '',
    leadPaketBetragFormatiert: formatiereLeadPaketBetrag(paket.betrag),
    leadAnzahl: paket.anzahl,
    signedAt: e.signedAt,
    bewerberLink: e.bewerberLink,
  }
}

// ─── Folgemail „Zahlung eingegangen" ───

export const LEAD_PAKET_BEZAHLT_AUGENBRAUE = 'Zum Handeln'
export const LEAD_PAKET_BEZAHLT_TITEL = 'Die Zahlung für das Lead-Paket ist eingegangen'
export const LEAD_PAKET_BEZAHLT_ANZEIGENAME = 'Lead-Paket bezahlt, Nutzer anlegen'
export const LEAD_PAKET_BEZAHLT_BLOCK = 'Der Vorgang'

export function leadPaketBezahltBetreff(bewerberName?: string): string {
  return bewerberName
    ? `${bewerberName}: Lead-Paket bezahlt, Nutzer anlegen`
    : 'Lead-Paket bezahlt, Nutzer anlegen'
}

export function leadPaketBezahltVorschau(bewerberName?: string): string {
  return bewerberName
    ? `${bewerberName} hat das Lead-Paket bezahlt, Nutzer anlegen`
    : 'Eine Zahlung für ein Lead-Paket ist eingegangen'
}

/** Der Absatz nach „Hallo Christian,". Beginnt klein, weil er an die Anrede anschließt. */
export function leadPaketBezahltText(bewerberName?: string): string {
  return (
    `die Zahlung für das Lead-Paket von ${bewerberName || 'einem Bewerber'} ist eingegangen. ` +
    'Bitte lege den Zugang an und ordne die Karrierestufe zu, damit der Start nicht am Konto hängt.'
  )
}

export interface LeadPaketBezahltEingabe {
  bewerberName: string
  leadPaket: unknown
  karriereStufe?: string
  bewerberLink: string
}

export interface LeadPaketBezahltDaten {
  bewerberName: string
  leadPaketBetragFormatiert: string
  leadAnzahl: number
  karriereStufe: string
  bewerberLink: string
}

/** Die `templateData` für die Folgemail, oder `null` ohne Lead-Paket. */
export function leadPaketBezahltDaten(e: LeadPaketBezahltEingabe): LeadPaketBezahltDaten | null {
  const paket = gebuchtesLeadPaket(e.leadPaket)
  if (!paket) return null
  return {
    bewerberName: e.bewerberName,
    leadPaketBetragFormatiert: formatiereLeadPaketBetrag(paket.betrag),
    leadAnzahl: paket.anzahl,
    karriereStufe: e.karriereStufe || '',
    bewerberLink: e.bewerberLink,
  }
}

/**
 * Beispielpaket nur für die Mail-Vorschau. Der Test hält es an
 * `LEAD_PAKET_PREIS` und `LEAD_PAKET_ANZAHL` aus `src/lib/lizenzPakete.ts`
 * fest, damit die Vorschau nicht mit dem Listenpreis auseinanderläuft.
 */
export const VORSCHAU_LEAD_PAKET: GebuchtesLeadPaket = { betrag: 2500, anzahl: 20 }
