/**
 * Finanzierungspartner am Investment wählen und benachrichtigen.
 *
 * Entscheidung des Inhabers vom 16.10.2026: Die Kundenunterlagen gehen nicht
 * als Anhang hinaus. Personalausweis und Gehaltsnachweise unverschlüsselt per
 * Mail wären das größere Risiko. Die Mail trägt nur einen Link ins CRM, dort
 * lädt der Partner nach der Anmeldung alles als ZIP herunter.
 *
 * Reine Logik ohne Importe mit Netzwerk: Browser (Karte im Kundenprofil),
 * Edge Function `finanzierung-partner-benachrichtigen` und Vitest unter `src`
 * nehmen dieselben Regeln.
 */

/** Die Vorlage in `transactional-email-templates`. */
export const FINANZIERUNG_MELDUNG_VORLAGE = 'finanzierung-starten'

/** Rolle, deren Nutzer als Finanzierungspartner wählbar sind. */
export const FINANZIERUNGSPARTNER_ROLLE = 'finanzierungspartner'

/**
 * Wer bei Finanzierern einreichen darf (Christian, 27.10.2026): admin,
 * inhaber, vertriebsleiter, backoffice. Vertriebspartner nicht mehr. Der
 * Finanzierungspartner selbst sieht die Karte nur lesend.
 */
export const FINANZIERUNG_MELDEN_ROLLEN: readonly string[] = Object.freeze([
  'admin', 'inhaber', 'vertriebsleiter', 'backoffice',
])

/** Browser: darf die aktive Rolle grundsätzlich wählen und benachrichtigen? */
export function darfFinanzierungspartnerMelden(rolle: string | null | undefined): boolean {
  return !!rolle && FINANZIERUNG_MELDEN_ROLLEN.includes(rolle)
}

/** Server: trägt jemand eine dieser Rollen? Nimmt die rohe Liste aus `user_roles`. */
export function hatMeldeRolle(rollen: unknown): boolean {
  if (!Array.isArray(rollen)) return false
  return rollen.some((r) => typeof r === 'string' && FINANZIERUNG_MELDEN_ROLLEN.includes(r.trim()))
}

/** Eine Liste von Kennungen aus beliebiger Eingabe: nur Text, ohne Leerwerte, ohne Doppelte. */
export function kennungenLesen(wert: unknown): string[] {
  if (!Array.isArray(wert)) return []
  const gesehen = new Set<string>()
  for (const w of wert) {
    if (typeof w !== 'string') continue
    const id = w.trim()
    if (id) gesehen.add(id)
  }
  return [...gesehen]
}

export interface PartnerProfil {
  id: string
  name?: string | null
  email?: string | null
}

export interface PartnerEmpfaenger {
  id: string
  name: string
  email: string
}

/**
 * Wer die Mail bekommt.
 *
 * Nur gewählte Kennungen, die wirklich die Rolle Finanzierungspartner tragen.
 * Eine fremde Kennung in der Anfrage (etwa ein Kunde) fällt still heraus,
 * sonst ließe sich über diese Function jede Adresse im Haus anschreiben.
 * Ohne Mailadresse wird übersprungen und benannt.
 */
export function partnerEmpfaenger(
  gewaehlt: string[],
  partnerKennungen: Iterable<string>,
  profile: PartnerProfil[],
): { empfaenger: PartnerEmpfaenger[]; uebersprungen: Array<{ id: string; grund: string }> } {
  const erlaubt = new Set(partnerKennungen)
  const nachId = new Map(profile.map((p) => [p.id, p]))
  const empfaenger: PartnerEmpfaenger[] = []
  const uebersprungen: Array<{ id: string; grund: string }> = []
  for (const id of kennungenLesen(gewaehlt)) {
    if (!erlaubt.has(id)) {
      uebersprungen.push({ id, grund: 'kein Finanzierungspartner' })
      continue
    }
    const p = nachId.get(id)
    const email = (p?.email || '').trim()
    if (!email) {
      uebersprungen.push({ id, grund: 'keine Mailadresse hinterlegt' })
      continue
    }
    empfaenger.push({ id, name: (p?.name || '').trim(), email })
  }
  return { empfaenger, uebersprungen }
}

/** Der Link ins CRM: Investment geöffnet, Abschnitt Finanzierung angesprungen. */
export function finanzierungPfad(kontaktId: string, investmentId: string): string {
  return `/kunden/${encodeURIComponent(kontaktId)}?tab=investments&investment=${encodeURIComponent(investmentId)}#finanzierung`
}

/** „Breitscheidstraße 18, WE 12“; ohne Einheit nur das Objekt. */
export function objektMitEinheit(objektTitel?: string | null, weNr?: string | number | null): string {
  const titel = String(objektTitel ?? '').trim()
  const nr = String(weNr ?? '').replace(/^WE\s*/i, '').trim()
  if (!titel) return nr ? `WE ${nr}` : ''
  if (!nr || titel.includes(`WE ${nr}`)) return titel
  return `${titel}, WE ${nr}`
}

/** Die Felder für die Vorlage `finanzierung-starten`. */
export function partnerMailDaten(args: {
  partnerName?: string
  kundeName?: string
  objekt?: string
  kaufpreis: string
  unterschriebenAm?: string
  /** Angebot erbeten bis, deutsches Datum. */
  fristBis?: string
  link: string
}): Record<string, string> {
  return {
    ...(args.partnerName ? { finanzierungspartnerName: args.partnerName } : {}),
    kundeName: (args.kundeName || '').trim() || 'Ein Kunde',
    ...(args.objekt ? { objektTitel: args.objekt } : {}),
    kaufpreis: args.kaufpreis,
    ...(args.unterschriebenAm ? { unterschriebenAm: args.unterschriebenAm } : {}),
    ...(args.fristBis ? { fristBis: args.fristBis } : {}),
    link: args.link,
  }
}

export interface PartnerMeldung {
  userId: string
  /** ISO-Zeitpunkt des letzten erfolgreichen Versands. */
  am: string
}

/** `meta.finanzierungPartnerMeldungen` lesen, Unbrauchbares fällt weg. */
export function meldungenLesen(wert: unknown): PartnerMeldung[] {
  if (!Array.isArray(wert)) return []
  return wert.filter((m): m is PartnerMeldung =>
    !!m && typeof m === 'object'
    && typeof (m as PartnerMeldung).userId === 'string'
    && typeof (m as PartnerMeldung).am === 'string')
}

/** Neue Meldungen eintragen; je Partner zählt nur die letzte. */
export function meldungenZusammenfuehren(alt: unknown, neu: PartnerMeldung[]): PartnerMeldung[] {
  const nachId = new Map(meldungenLesen(alt).map((m) => [m.userId, m]))
  for (const m of neu) nachId.set(m.userId, m)
  return [...nachId.values()]
}

/** Status, in denen eine Einreichung erledigt ist. Neu senden belebt sie wieder. */
export const EINREICHUNG_ERLEDIGT: readonly string[] = Object.freeze(['abgelehnt', 'abgesagt', 'zurueckgezogen'])

/** Werktage fuer ein Angebot (Christian, 27.10.2026: 5 Werktage). */
export const ANGEBOT_FRIST_WERKTAGE = 5

/**
 * Datum `werktage` Werktage nach `start`, als JJJJ-MM-TT. Samstag und Sonntag
 * zaehlen nicht; Feiertage bewusst nicht, die Frist ist eine Erinnerung,
 * keine Rechtsfrist.
 */
export function fristInWerktagen(start: Date, werktage = ANGEBOT_FRIST_WERKTAGE): string {
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))
  let rest = werktage
  while (rest > 0) {
    d.setUTCDate(d.getUTCDate() + 1)
    const tag = d.getUTCDay()
    if (tag !== 0 && tag !== 6) rest--
  }
  return d.toISOString().slice(0, 10)
}
