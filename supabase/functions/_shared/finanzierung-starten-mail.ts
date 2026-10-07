/**
 * Was in der Mail „Finanzierung starten" steht, soweit es sich rechnen laesst.
 *
 * Der Wortlaut und der Kaufpreis liegen hier und nicht in der Vorlage, weil
 * Vitest nur unterhalb von `src` sucht und die Vorlage selbst wegen ihrer
 * `npm:`-Importe dort nicht ladbar ist. Genau wie bei `bewerber-eingangsmail`
 * und `bewerber-kennenlernen-ueberblick`: die Werte stehen bei der Edge
 * Function, geprueft werden sie in einem Test unter `src`.
 */

/** Der Betreff, den der Finanzierungspartner im Postfach sieht. */
export function finanzierungBetreff(kundeName?: string): string {
  const name = (kundeName || '').trim()
  return name ? `Finanzierung starten: ${name}` : 'Eine neue Finanzierung kann starten'
}

/**
 * Was in der Zeile „Kaufpreis" steht, wenn keiner hinterlegt ist.
 *
 * Die Zeile faellt bewusst nicht weg. Ohne den Preis kann der
 * Finanzierungspartner nicht anfangen, und eine fehlende Zeile sieht genauso
 * aus wie eine vergessene: Er wuesste nicht, ob der Preis fehlt oder nur die
 * Mail unvollstaendig ist. So steht dort eine Aufforderung, keine Null.
 */
export const KAUFPREIS_UNBEKANNT = 'noch nicht hinterlegt, bitte beim Vertriebspartner erfragen'

/** Ein Investment, so weit es fuer den Kaufpreis gebraucht wird. */
export interface InvestmentKaufpreisQuelle {
  /** Die Spalte `investments.kaufpreis`, eine Abschrift des Meta-Werts. */
  kaufpreis?: number | string | null
  meta?: Record<string, unknown> | null
}

function zahl(wert: unknown): number {
  const n = Number(wert)
  return isFinite(n) && n > 0 ? n : 0
}

/**
 * Der Kaufpreis eines Investments, aus derselben Quelle wie in der Anwendung.
 *
 * Die Reihenfolge ist die von `kaufpreisAusMeta` in `src/lib/investmentsStore.ts`
 * und `vorhandeneObjektDaten` in `src/lib/objektDatenPflicht.ts`. Der Preis
 * haengt am Investment, nicht am Kontakt: Ein Kunde kann mehrere Investments
 * haben, jedes mit eigenem Objekt und eigenem Preis. `kontakte.kaufpreis` ist
 * nur eine Rueckfallebene fuer Altdaten und hat in dieser Mail nichts zu
 * suchen, weil hier genau ein Investment gemeint ist.
 *
 * Die Spalte `investments.kaufpreis` steht am Ende. Sie wird beim Speichern aus
 * dem Meta abgeleitet und kann deshalb hinterherhinken; sie hilft nur bei
 * Datensaetzen, deren Meta den Preis nicht mehr fuehrt.
 */
export function investmentKaufpreis(inv?: InvestmentKaufpreisQuelle | null): number {
  if (!inv) return 0
  const meta = (inv.meta || {}) as Record<string, any>
  const kandidaten: unknown[] = [
    meta.kaufpreis,
    meta.rvVirtualWohnung?.kaufpreis,
    meta.wohnungSnapshot?.kaufpreis,
    meta.wohnungSnapshot?.vkGesamt,
    meta.wohnungSnapshot?.vk_gesamt,
    meta.objektSnapshot?.kaufpreis,
    inv.kaufpreis,
  ]
  for (const k of kandidaten) {
    const n = zahl(k)
    if (n > 0) return n
  }
  return 0
}

/** Deutsche Schreibweise mit Tausenderpunkt und Euro: „132.000 €". */
export function kaufpreisText(betrag?: number | null): string {
  const n = zahl(betrag)
  if (n <= 0) return ''
  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(Math.round(n))} €`
}

/** Der fertige Wert fuer die Zeile „Kaufpreis" in der Mail. */
export function kaufpreisFuerMail(inv?: InvestmentKaufpreisQuelle | null): string {
  return kaufpreisText(investmentKaufpreis(inv)) || KAUFPREIS_UNBEKANNT
}
