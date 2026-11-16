/**
 * Finanzierungsanfrage zur Unterschrift (Christian, 16.11.2026).
 *
 * Im Investment, Bereich Finanzierung, wird die Finanzierungsanfrage aus der
 * unterschriebenen Selbstauskunft gefüllt und den Käufern zur Unterschrift
 * geschickt, jedem mit eigenem Link. Nach der letzten Unterschrift setzt
 * `finalize-finanzierungsanfrage` alle Unterschriften auf Seite 6 und legt das
 * PDF im Kundenordner ab.
 *
 * Dieses Modul nutzen die Edge Functions und der Browser (Vorschau nach der
 * eigenen Unterschrift). Es importiert deshalb nichts; pdf-lib reicht der
 * Aufrufer als geladenes Dokument herein.
 */

export const FA_META_SCHLUESSEL = 'finanzierungsanfrage'
export const FA_PERSON_TYPEN = ['finanzierungsanfrage_p1', 'finanzierungsanfrage_p2'] as const
export type FaPersonTyp = typeof FA_PERSON_TYPEN[number]
export type FaPerson = 'p1' | 'p2'

export function istFaPersonTyp(wert: unknown): wert is FaPersonTyp {
  return typeof wert === 'string' && (FA_PERSON_TYPEN as readonly string[]).includes(wert)
}

export function faPerson(personTyp: FaPersonTyp): FaPerson {
  return personTyp === 'finanzierungsanfrage_p2' ? 'p2' : 'p1'
}

/** Stand in `investments.meta.finanzierungsanfrage`; schreibt nur der Server. */
export interface FaStand {
  status: 'gesendet' | 'unterschrieben'
  /** Kennung des Versands; jede neue Sendung überholt die vorige. */
  runde: string
  gesendetAm: string
  /** `meta.saSignedAt` beim Versand. Weicht es heute ab, gibt es eine neuere Selbstauskunft. */
  saSignedAt?: string | null
  entwurfPfad: string
  personen: Partial<Record<FaPerson, { name: string; email: string; status: 'offen' | 'unterschrieben'; unterschriebenAm?: string; versandOk?: boolean }>>
  pdfPath?: string
  unterschriebenAm?: string
}

/** Was die Unterschriftsanfrage in `sa_data` mitführt. */
export interface FaAnfrageDaten {
  runde: string
  /** Die Selbstauskunft zum Zeitpunkt des Versands, für die Vorschau beim Kunden. */
  sa: Record<string, unknown>
  objekt: Record<string, unknown> | null
  ort: string
}

/** Lesen ohne Vertrauen in die Form: Was nicht passt, gilt als kein Stand. */
export function faStandLesen(wert: unknown): FaStand | null {
  if (!wert || typeof wert !== 'object') return null
  const s = wert as Record<string, unknown>
  if ((s.status !== 'gesendet' && s.status !== 'unterschrieben') || typeof s.runde !== 'string') return null
  return wert as FaStand
}

/** Alle erwarteten Personen haben unterschrieben? */
export function faAlleUnterschrieben(stand: Pick<FaStand, 'personen'>): boolean {
  const personen = Object.values(stand.personen || {})
  return personen.length > 0 && personen.every((p) => p?.status === 'unterschrieben')
}

/** „data:image/png;base64,…“ → Bytes. Null bei allem anderen. */
export function pngAusDataUrl(dataUrl: unknown): Uint8Array | null {
  if (typeof dataUrl !== 'string') return null
  const treffer = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim())
  if (!treffer) return null
  try {
    const bin = atob(treffer[1])
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

/*
 * Lage der Unterschriftszeile auf Seite 6 der Vorlage (A4, Punkte, Ursprung
 * unten links), gemessen am 16.11.2026: Linie bei y = 277, darunter „Ort,
 * Datum“ ab x = 45, „Unterschrift Antragsteller/in 1“ ab x = 205, „… 2“ ab
 * x = 375. Ändert sich die Vorlage, müssen diese Werte mit.
 */
const SEITE = 5
const LINIE_Y = 277
const ORT_X = 45
const UNTERSCHRIFT_X: Record<FaPerson, number> = { p1: 212, p2: 382 }
const UNTERSCHRIFT_B = 150
const UNTERSCHRIFT_H = 48

/** Die Teile von pdf-lib, die hier gebraucht werden. */
interface PdfSeite {
  drawImage(bild: unknown, o: { x: number; y: number; width: number; height: number }): void
  drawText(text: string, o: { x: number; y: number; size: number; font: unknown }): void
}
interface PdfBild { width: number; height: number }
export interface PdfDokument {
  getPages(): PdfSeite[]
  embedPng(bytes: Uint8Array): Promise<PdfBild>
  embedFont(name: string): Promise<unknown>
}

/**
 * Ort, Datum und die Unterschriften auf Seite 6 setzen. Fehlt eine
 * Unterschrift, bleibt ihr Feld frei (Vorschau nach der eigenen Unterschrift).
 */
export async function faUnterschriftenSetzen(
  doc: PdfDokument,
  angaben: { ort: string; datum: string; unterschriften: Partial<Record<FaPerson, string>> },
): Promise<void> {
  const seite = doc.getPages()[SEITE]
  if (!seite) throw new Error('Seite 6 fehlt in der Vorlage')
  const font = await doc.embedFont('Helvetica')
  const zeile = [angaben.ort.trim(), angaben.datum].filter(Boolean).join(', ')
  if (zeile) seite.drawText(zeile, { x: ORT_X, y: LINIE_Y + 5, size: 10, font })
  for (const person of ['p1', 'p2'] as const) {
    const bytes = pngAusDataUrl(angaben.unterschriften[person])
    if (!bytes) continue
    const bild = await doc.embedPng(bytes)
    // Seitenverhältnis halten, in das Feld über der Linie einpassen.
    const faktor = Math.min(UNTERSCHRIFT_B / bild.width, UNTERSCHRIFT_H / bild.height)
    seite.drawImage(bild, { x: UNTERSCHRIFT_X[person], y: LINIE_Y + 2, width: bild.width * faktor, height: bild.height * faktor })
  }
}

/** Datum wie auf dem Formular, deutsche Zeit. */
export function faDatum(wann: Date | string = new Date()): string {
  const d = typeof wann === 'string' ? new Date(wann) : wann
  return d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
}
