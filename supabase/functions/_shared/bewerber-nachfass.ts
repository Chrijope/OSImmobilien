/**
 * Wortlaut und Regeln der einmaligen Nachfass-Mail an alle Bewerber im Eingang.
 *
 * Die Vorlage selbst (`transactional-email-templates/bewerber-nachfass-eingang.tsx`)
 * importiert React über einen npm:-Spezifizierer und ist damit für Vitest
 * unerreichbar. Wortlaut, Empfängerauswahl und die Prüfung der Abmeldung
 * liegen deshalb hier in einer reinen TypeScript-Datei, die beide Welten
 * lesen können: die Functions in Deno, das CRM für die Vorschau im Dialog und
 * der Test in `src/lib/bewerberNachfassMail.test.ts`.
 *
 * Freigegeben von Christian am 02.09.2026 (Konzept Nachfass-Mail Eingang).
 */

// ── Der Absageweg ────────────────────────────────────────────────────────
//
// Die Texte der ersten Sammelmail standen hier. Sie fuehrte zur
// Terminbuchung und wurde am 12.09.2026 durch die Sammelmail zum
// Kennenlernen ersetzt, die weiter unten steht. Geblieben ist der
// Absageweg: Er gehoert zu beiden.

/** Die Nebenhandlung: ein ruhiger Textlink, kein zweiter Knopf. */
export const NACHFASS_KEIN_INTERESSE = 'Ich habe kein Interesse mehr'
export const NACHFASS_KEIN_INTERESSE_HINWEIS = 'Dann melden wir uns nicht mehr.'

/**
 * Die öffentliche Seite hinter dem Textlink. Sie ändert beim Öffnen nichts,
 * erst der Knopf darauf schickt das Token an `bewerber-kein-interesse`.
 * Mail-Scanner öffnen Links vorab, deshalb darf ein GET keine Wirkung haben.
 */
export const KEIN_INTERESSE_BASIS_URL = 'https://osimmobilien.netlify.app/bewerbung/kein-interesse'

export function keinInteresseLink(token: string): string {
  return `${KEIN_INTERESSE_BASIS_URL}/${token}`
}

/** "Hallo Max," oder, ohne Vornamen, "Hallo,". Wie in der Eingangsmail. */
export function nachfassAnrede(bewerberName?: string | null): string {
  const vorname = (bewerberName || '').trim().split(/\s+/)[0]
  return vorname ? `Hallo ${vorname},` : 'Hallo,'
}

/**
 * Die Mail als reiner Text, Absatz für Absatz, für die Vorschau im
 * Versand-Dialog des CRM. Derselbe Wortlaut wie in der Vorlage, damit HR vor
 * dem Klick genau das liest, was hinausgeht.
 */
export function nachfassMailAlsText(bewerberName?: string | null): string[] {
  return [
    nachfassAnrede(bewerberName),
    KL_NACHFASS_DANKE,
    KL_NACHFASS_INHALT,
    ...KL_NACHFASS_PUNKTE.map((punkt) => `\u2022 ${punkt}`),
    `[${KL_NACHFASS_KNOPF}]  ${KL_NACHFASS_KNOPF_HINWEIS}`,
    KL_NACHFASS_DANACH,
    `${KL_NACHFASS_ABSAGE_TITEL} ${KL_NACHFASS_ABSAGE}`,
    `[${NACHFASS_KEIN_INTERESSE}]  ${NACHFASS_KEIN_INTERESSE_HINWEIS}`,
    KL_NACHFASS_SCHLUSS,
  ]
}

// ── Empfängerauswahl ─────────────────────────────────────────────────────

/** Was die Auswahl von einer Zeile aus `bewerbungen` braucht. */
export interface NachfassKandidat {
  id: string
  vorname?: string | null
  nachname?: string | null
  email?: string | null
  status?: string | null
  meta?: Record<string, unknown> | null
}

export type NachfassAusschlussGrund =
  | 'keine Mailadresse'
  | 'Mail schon erhalten'
  /* Nur bei der Sammelmail zum Kennenlernen: Wer seine Antworten schon
     geschickt hat, braucht keine Aufforderung mehr. */
  | 'Kennenlernen schon abgeschickt'
  /* Die Adresse steht in `suppressed_emails`. Ein Versand an sie geschieht
     nicht: `send-transactional-email` haelt ihn zurueck. Das ist kein
     Ausschluss wie die anderen, sondern eine Sackgasse, die ein Mensch
     aufloesen muss, durch einen Anruf oder durch das Schliessen des Falls. */
  | 'Adresse gesperrt'
  /* Tippgeber aus der Stellenanzeige (`meta.tippgeber`). Sie bekommen keinen
     Kennenlernbogen, das Team ruft sie an (Christian, 24.09.2026). */
  | 'Tippgeber, wird angerufen'
  /* Leads von der Seite „Partner werden“ (`meta.partnerWerden`). Christian am
     30.09.2026: neuer Lead, keine Automatik. Das Team ruft an. */
  | 'Partner werden, wird angerufen'

export interface NachfassAusschluss {
  id: string
  name: string
  grund: NachfassAusschlussGrund
  /** Bei "Mail schon erhalten": der Zeitpunkt aus meta.nachfassMailAm. */
  am?: string
}

export interface NachfassAuswahl {
  empfaenger: NachfassKandidat[]
  ausgeschlossen: NachfassAusschluss[]
}

/** Der Anzeigename, mit Rückfall auf die Adresse, damit die Liste nie leer wirkt. */
export function kandidatName(k: NachfassKandidat): string {
  const name = `${k.vorname || ''} ${k.nachname || ''}`.trim()
  return name || (k.email || '').trim() || 'Ohne Namen'
}

function istBewerberZeile(k: NachfassKandidat): boolean {
  const art = k.meta?._type
  return art === undefined || art === null || art === 'bewerber'
}

function hatMailadresse(k: NachfassKandidat): boolean {
  const mail = (k.email || '').trim()
  return mail.includes('@') && !mail.startsWith('@') && !mail.endsWith('@')
}

/**
 * Eine Mailadresse so schreiben, dass zwei Schreibweisen derselben Adresse
 * gleich aussehen: ohne Leerzeichen am Rand, komplett klein.
 *
 * `suppressed_emails` wird beim Eintragen kleingeschrieben, aber nicht
 * getrimmt, und in `bewerbungen` steht, was jemand eingetippt hat. Ein
 * Vergleich ohne diese Normalisierung uebersieht genau die Faelle, um die es
 * geht.
 */
export function normalisiereMail(mail?: string | null): string {
  return (mail || '').trim().toLowerCase()
}


/** So viele Mails gehen gleichzeitig hinaus, der Rest wartet auf das nächste Paket. */
export const NACHFASS_PAKETGROESSE = 10

export function inPakete<T>(liste: T[], groesse = NACHFASS_PAKETGROESSE): T[][] {
  const schritt = Math.max(1, Math.floor(groesse))
  const pakete: T[][] = []
  for (let i = 0; i < liste.length; i += schritt) pakete.push(liste.slice(i, i + schritt))
  return pakete
}


// ── Die Abmeldung ────────────────────────────────────────────────────────

/** 32 Byte Zufall als Hex, wie die Datenbank ihn erzeugt. */
export const ABMELDE_TOKEN_MUSTER = /^[0-9a-f]{64}$/

/** Mehr Zeichen nimmt weder das Feld auf der Seite noch die Function an. */
export const ABMELDE_GRUND_MAX = 500

export interface KeinInteresseAnfrage {
  token: string
  grund: string
}

export type KeinInteressePruefung =
  | { ok: true; anfrage: KeinInteresseAnfrage }
  /** `bot` heißt: Honigtopf gefüllt. Die Function antwortet freundlich und tut nichts. */
  | { ok: false; fehler: string; bot?: boolean }

/**
 * Prüft, was die öffentliche Seite an `bewerber-kein-interesse` schickt.
 *
 * Bewusst streng beim Token und nachsichtig beim Grund: Ein Token, das nicht
 * aus 64 Hex-Zeichen besteht, kann nicht aus unserer Datenbank stammen und
 * muss gar nicht erst nachgeschlagen werden. Der Grund wird beschnitten und
 * gekürzt, nie abgewiesen, denn er ist freiwillig.
 */
export function pruefeKeinInteresseAnfrage(body: unknown): KeinInteressePruefung {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>

  const hp = typeof b.hp === 'string' ? b.hp : ''
  if (hp.length > 0) return { ok: false, fehler: 'Honigtopf', bot: true }

  const token = typeof b.token === 'string' ? b.token.trim().toLowerCase() : ''
  if (!ABMELDE_TOKEN_MUSTER.test(token)) return { ok: false, fehler: 'Link unbekannt' }

  const grundRoh = typeof b.grund === 'string' ? b.grund : ''
  const grund = grundRoh.replace(/\s+/g, ' ').trim().slice(0, ABMELDE_GRUND_MAX)

  return { ok: true, anfrage: { token, grund } }
}

/** Wie lange ein Abmelde-Token gilt. Muss zum Default von expires_at in der Migration passen. */
export const ABMELDE_TOKEN_GUELTIG_TAGE = 90

/**
 * Ist das Token abgelaufen? Ohne Ablaufdatum (Altzeile, Testattrappe) gilt es
 * als gültig, ein unlesbares Datum dagegen als abgelaufen: Im Zweifel lieber
 * die Hinweisseite als eine Abmeldung über einen kaputten Datensatz.
 */
export function abmeldungAbgelaufen(expiresAt: string | null | undefined, jetzt: Date = new Date()): boolean {
  if (expiresAt === null || expiresAt === undefined || expiresAt === '') return false
  const ablauf = new Date(expiresAt).getTime()
  if (Number.isNaN(ablauf)) return true
  return ablauf < jetzt.getTime()
}

/** Der Wert, den auch die Absage aus dem Erstgespräch schreibt (useErstgespraechAbschluss.ts). */
export const KEIN_INTERESSE_STATUS = 'KeinInteresse'

/** Steht als absageGrund in der Akte, damit die vorhandene Absage-Anzeige greift. */
export const SELBST_ABGEMELDET_ABSAGEGRUND = 'Selbst abgemeldet per Mail'

/** Der Autor des Verlaufseintrags. Kein Mitarbeiter hat das geschrieben. */
export const ABMELDUNG_AUTOR = 'Bewerber per Mail'

/**
 * Aus welchen Stufen die Abmeldung den Status auf "Kein Interesse" setzt.
 *
 * Die Mail geht nur an Bewerber im Eingang, aber zwischen Versand und Klick
 * können Tage liegen. Wer inzwischen einen Vertrag unterschrieben hat oder
 * schon aktiv ist, wird durch einen Klick in einer alten Mail nicht wieder
 * ausgetragen. Dort bleibt der Status stehen, HR bekommt trotzdem Glocke und
 * Verlaufseintrag und entscheidet selbst.
 */
const ABMELDBARE_STUFEN = new Set([
  'Eingang', 'Erstgespraech', 'Closing', 'FollowUp', 'Bedenkzeit', 'Paketwahl',
])

/**
 * Liefert den neuen Status oder null, wenn der Status stehen bleiben soll.
 * Bei "KeinInteresse" ist nichts zu tun, der zweite Klick ist damit
 * gleichbedeutend mit dem ersten.
 */
export function zielStatusNachAbmeldung(status: string | null | undefined): string | null {
  const s = (status || '').trim()
  if (s === KEIN_INTERESSE_STATUS) return null
  return ABMELDBARE_STUFEN.has(s) ? KEIN_INTERESSE_STATUS : null
}

/** Der Text im notizenLog der Akte. */
export function abmeldungsNotiz(grund: string, statusGeaendert: boolean, alterStatus?: string | null): string {
  const kern = 'Hat sich per Mail abgemeldet.'
  const grundTeil = grund.trim() ? ` Grund: ${grund.trim()}` : ''
  const statusTeil = statusGeaendert
    ? ''
    : ` Der Status blieb auf ${alterStatus || 'dem bisherigen Wert'}, bitte prüfen.`
  return `${kern}${grundTeil}${statusTeil}`
}

/** Titel und Text der Glocke an die HR-Rolle. */
export function abmeldungsGlocke(
  name: string,
  grund: string,
  statusGeaendert: boolean,
  alterStatus?: string | null,
): { titel: string; nachricht: string } {
  const wer = name.trim() || 'Ein Bewerber'
  const grundTeil = grund.trim() ? ` Grund: ${grund.trim()}` : ''
  const statusTeil = statusGeaendert
    ? ' Der Status steht jetzt auf Kein Interesse.'
    : ` Der Status blieb auf ${alterStatus || 'dem bisherigen Wert'}, bitte prüfen.`
  return {
    titel: 'Bewerber hat sich abgemeldet',
    nachricht: `${wer} hat über die Nachfass-Mail mitgeteilt, kein Interesse mehr zu haben.${grundTeil}${statusTeil}`,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Die zweite Sammelmail: das Kennenlernen
//
// Die erste Sammelmail (oben) führte zur Terminbuchung. Diese hier führt zum
// Kennenlernbogen, und das ist der ganze Unterschied. Sie erwähnt bewusst
// nicht, dass sich etwas geändert hat: Für den Bewerber ist das keine
// Information, sondern eine Entschuldigung, die er nicht verlangt hat. Er
// erfährt nur, was ihn erwartet und warum es sich lohnt.
// ═══════════════════════════════════════════════════════════════════════════

export const KL_NACHFASS_BETREFF = 'Kurze Nachfrage zu deiner Bewerbung bei OS Immobilien'

export const KL_NACHFASS_AUGENBRAUE = 'Deine Bewerbung'

export const KL_NACHFASS_TITEL = 'Lern uns kennen, bevor wir sprechen'

export const KL_NACHFASS_VORSCHAU =
  'In unserem Kennenlernen erfährst du alles über die Zusammenarbeit, bevor du dich entscheidest.'

/** Der erste Absatz: Dank und der Grund für diese Mail, in zwei Sätzen. */
export const KL_NACHFASS_DANKE =
  'vielen Dank, dass du dich bei uns wegen einer möglichen vertrieblichen ' +
  'Zusammenarbeit gemeldet hast. Damit du weißt, worauf du dich einlässt, ' +
  'haben wir ein Kennenlernen zum Durchklicken gebaut.'

/** Die Überleitung zur Liste. */
export const KL_NACHFASS_INHALT =
  'Darin steht alles, was du über uns wissen musst, bevor du dich entscheidest:'

/**
 * Was der Bogen abdeckt.
 *
 * Die ersten vier Punkte sind wortgleich mit `KENNENLERNEN_PUNKTE` aus
 * `bewerber-kennenlernen-mail.ts`, also mit dem, was der Bogen wirklich
 * enthält. Der fünfte kam auf Christians Wunsch dazu.
 *
 * Konkrete Provisionssätze stehen hier bewusst nicht. Eine Zahl in einer
 * Sammelmail ist eine Zusage, für die der Vertriebspartnervertrag geradestehen
 * muss. Im Bogen selbst steht sie, dort ist der richtige Ort.
 */
export const KL_NACHFASS_PUNKTE = [
  'wer wir sind und für wen wir arbeiten',
  'mit welchen Immobilien wir arbeiten, und warum du sie auf keinem Portal findest',
  'wie eine Abwicklung bei uns läuft und was du dafür ab dem ersten Tag bekommst',
  'unter welchen Rahmenbedingungen die Zusammenarbeit steht',
  // Seit 26.09.2026 ohne "verdienst" und "Provision": Solche Wörter
  // zählen bei Spamfiltern zu den Geldversprechen. Siehe bewerberMailTexte.test.ts.
  'wie die Vergütung aufgebaut ist, und wie lange es bis zur ersten Abrechnung dauert',
] as const

export const KL_NACHFASS_KNOPF = 'Kennenlernen öffnen'
export const KL_NACHFASS_KNOPF_HINWEIS = 'Du kannst zwischendurch aufhören, dein Zwischenstand bleibt'

/** Was nach dem Absenden passiert. Kein Versprechen ohne Frist. */
export const KL_NACHFASS_DANACH =
  'Zwischendurch stellen wir dir ein paar Fragen, damit wir im Gespräch nicht ' +
  'bei null anfangen. Wenn du am Ende Interesse an einer Zusammenarbeit hast, ' +
  'schickst du uns deine Antworten. Wir melden uns dann zeitnah bei dir wegen ' +
  'eines möglichen Kennenlernens.'

/**
 * Die Einladung zur Absage.
 *
 * Sie steht bewusst gleichrangig neben dem Hauptknopf und nicht kleingedruckt
 * darunter. Eine ehrliche Absage ist für das Haus mehr wert als ein Bewerber,
 * der im Eingang liegen bleibt und dreimal erinnert wird.
 */
export const KL_NACHFASS_ABSAGE_TITEL = 'Und wenn es sich erledigt hat:'
export const KL_NACHFASS_ABSAGE =
  'Sag uns das bitte kurz. Das ist keine Absage, die dir jemand übelnimmt, und ' +
  'für uns ist es eine echte Hilfe. Dann hören wir auf zu schreiben.'

export const KL_NACHFASS_SCHLUSS =
  'Ganz gleich, wie du dich entscheidest: Danke, dass du dich bei uns gemeldet hast.'

/** Der Verlaufseintrag in der Bewerberakte. */
export const KL_NACHFASS_VERLAUFSTEXT = 'Sammelmail zum Kennenlernen gesendet'

/**
 * Das Meta-Feld eines Bewerbers nach der Sammelmail zum Kennenlernen.
 *
 * Gesetzt werden genau zwei Dinge: der Merker `klNachfassMailAm` und der
 * Verlaufseintrag. Alles andere bleibt, wie es war, ausdrücklich auch
 * `meta.kennenlernen`.
 *
 * **Warum die Kette nicht mehr neu startet.** Bis zum 26.09.2026 setzte die
 * Function an dieser Stelle `meta.kennenlernen.gesendetAm` auf den Tag der
 * Sammelmail. Das ist der Anker der Erinnerungskette, und die Erinnerungen
 * liefen danach ein zweites Mal, gerechnet ab der Sammelmail. Daneben stand
 * `stufe: 0`, das niemand las (der Zähler heißt `erinnerungStufe`). Christian
 * hat den Neustart abgestellt: Die Sammelmail ist eine einzelne Mail, was
 * schon verschickt ist, bleibt verschickt, und es gibt keine neue Runde.
 *
 * Damit Sammelmail und Erinnerung nicht am selben Tag ankommen, genügt der
 * Merker: Die Kette liest ihn über `juengsteNachfassMail` in
 * `kennenlernen-erinnerungen.ts` und ruht einen Tag.
 *
 * **Wer nie eingeladen war**, hat keinen Anker und bekommt deshalb auch
 * durch die Sammelmail keine Kette. Das ist gewollt: Auch die erste Runde
 * wäre eine neue Runde, und an ihrem Ende stünde nach elf Tagen der
 * automatische Wechsel auf „Kein Interesse", ausgelöst von einer Mail, die
 * als einzelne Nachfrage gedacht war. Solche Bewerber bleiben im Eingang, bis
 * sie ihren Bogen abschicken, sich abmelden oder ein Mensch entscheidet.
 */
export function metaNachNachfass(
  meta: Record<string, unknown> | null | undefined,
  jetztIso: string,
  verlaufsEintrag: Record<string, unknown>,
): Record<string, unknown> {
  const basis = meta && typeof meta === 'object' ? meta : {}
  const notizenLog = Array.isArray(basis.notizenLog) ? basis.notizenLog : []
  return {
    ...basis,
    klNachfassMailAm: jetztIso,
    notizenLog: [verlaufsEintrag, ...notizenLog],
  }
}


/**
 * Wer die Sammelmail zum Kennenlernen bekommt.
 *
 * Drei Bedingungen:
 *
 *   1. Status ist "Eingang". Wer weiter ist, ist nicht mehr im Eingang.
 *   2. Der Kennenlernbogen ist nicht eingereicht.
 *   3. Eine Mailadresse muss da sein.
 *
 * **Der Vorab-Bogen schliesst seit dem 12.09.2026 nicht mehr aus.** Bis
 * dahin galt er als erledigt, und die erste Welle ging deshalb nur an 36 von
 * 166 Bewerbern im Eingang. Christian hat das an diesem Tag ausdruecklich
 * geaendert: Der frühere Vorab-Bogen ist ein anderer Bogen mit anderen
 * Fragen, und wer ihn ausgefuellt hat, hat das Kennenlernen trotzdem noch
 * nicht gesehen. Wer beide Boegen ausgefuellt hat, faellt weiterhin unter
 * Bedingung 2 heraus.
 *
 * Anders als bei der ersten Sammelmail gibt es hier KEINEN Riegel "schon
 * einmal bekommen". Diese Mail ist eine zweite Welle, und der Riegel der
 * ersten wuerde sie vollstaendig blockieren. Stattdessen traegt jeder Versand
 * `meta.klNachfassMailAm`; wer schon eine hat, kommt in die Liste der
 * Ausgeschlossenen und wird im Dialog genannt, damit HR sieht, dass die Mail
 * kein zweites Mal hinausgeht.
 *
 * Der Bogenstand kommt als Menge von Bewerber-Kennungen herein, weil er aus
 * einer zweiten Tabelle stammt. Die Funktion selbst liest nichts.
 */
export function waehleKennenlernNachfassEmpfaenger(
  kandidaten: NachfassKandidat[],
  bogenEingereicht: Set<string>,
  /**
   * Die gesperrten Adressen aus `suppressed_emails`, normalisiert.
   *
   * Leer gelassen verhaelt sich die Auswahl wie vorher. Sie liest selbst
   * nichts; die Menge kommt wie der Bogenstand aus dem Aufrufer.
   */
  gesperrteAdressen: Set<string> = new Set(),
): NachfassAuswahl {
  const empfaenger: NachfassKandidat[] = []
  const ausgeschlossen: NachfassAusschluss[] = []

  for (const k of kandidaten) {
    if (!istBewerberZeile(k)) continue
    if ((k.status || '') !== 'Eingang') continue

    /*
     * Tippgeber zuerst: Sie stehen im Eingang wie alle anderen, aber eine
     * Mail mit Kennenlernbogen wuerde ihnen einen Weg zeigen, den sie nicht
     * gehen. Das Kennzeichen setzt allein `submit-bewerbung`.
     */
    if (k.meta?.tippgeber === true) {
      ausgeschlossen.push({ id: k.id, name: kandidatName(k), grund: 'Tippgeber, wird angerufen' })
      continue
    }
    if (k.meta?.partnerWerden) {
      ausgeschlossen.push({ id: k.id, name: kandidatName(k), grund: 'Partner werden, wird angerufen' })
      continue
    }

    if (bogenEingereicht.has(k.id)) {
      ausgeschlossen.push({ id: k.id, name: kandidatName(k), grund: 'Kennenlernen schon abgeschickt' })
      continue
    }
    const schonAm = k.meta?.klNachfassMailAm
    if (typeof schonAm === 'string' && schonAm.trim()) {
      ausgeschlossen.push({ id: k.id, name: kandidatName(k), grund: 'Mail schon erhalten', am: schonAm })
      continue
    }
    if (!hatMailadresse(k)) {
      ausgeschlossen.push({ id: k.id, name: kandidatName(k), grund: 'keine Mailadresse' })
      continue
    }
    /*
     * Die Sperrliste steht bewusst als Letztes, nach „Mail schon erhalten".
     * Wer die Mail schon hat, ist ohnehin kein Empfaenger mehr; die Sperre
     * waere dort nur eine zweite Begruendung fuer dieselbe Entscheidung.
     * Ein Versand an eine gesperrte Adresse geschieht nicht, deshalb gehoert
     * dieser Bewerber auch nicht in die Empfaengerliste: Er saehe aus wie
     * erledigt, und in Wahrheit hat ihn nie jemand erreicht.
     */
    if (gesperrteAdressen.has(normalisiereMail(k.email))) {
      ausgeschlossen.push({ id: k.id, name: kandidatName(k), grund: 'Adresse gesperrt' })
      continue
    }
    empfaenger.push(k)
  }

  return { empfaenger, ausgeschlossen }
}
